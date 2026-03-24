const { EventEmitter } = require('events')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getJobsDir } = require('../utils/paths.js')
const { getScriptPath } = require('../utils/resources.js')

class TrainingService extends EventEmitter {
  constructor() {
    super()
    this.jobs = new Map() // jobId -> { process, status, config, metrics, error }
  }

  startJob(jobId, config, pythonPath) {
    const jobsDir = getJobsDir()
    const jobDir = path.join(jobsDir, jobId)
    fs.mkdirSync(jobDir, { recursive: true })

    const adapterDir = path.join(jobDir, 'adapter')
    fs.mkdirSync(adapterDir, { recursive: true })

    // Write config
    const fullConfig = {
      ...config,
      output_dir: adapterDir,
    }
    const configPath = path.join(jobDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2))

    // Metrics file
    const metricsPath = path.join(jobDir, 'metrics.jsonl')
    const logPath = path.join(jobDir, 'log.txt')
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })

    const scriptPath = getScriptPath('train_lora_mlx.py')

    const proc = spawn(pythonPath, [scriptPath, '--config', configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MLFLOW_TRACKING_URI: 'http://127.0.0.1:5000',
        HF_HOME: path.join(require('os').homedir(), '.cache', 'huggingface'),
      },
    })

    const jobState = {
      process: proc,
      status: 'running',
      config: fullConfig,
      metrics: [],
      error: null,
      startTime: Date.now(),
    }
    this.jobs.set(jobId, jobState)

    // Line-buffer stdout for JSON parsing
    let buffer = ''
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue
        logStream.write(line + '\n')

        try {
          const data = JSON.parse(line)

          // Capture error messages from the training script
          if (data.event === 'error') {
            jobState.error = data.message
          }

          // Store metric
          if (data.event === 'step' || data.event === 'eval') {
            jobState.metrics.push(data)
            fs.appendFileSync(metricsPath, JSON.stringify(data) + '\n')
          }

          this.emit('job-progress', { jobId, ...data })
        } catch {
          // Non-JSON line, just log it
          logStream.write(`[raw] ${line}\n`)
        }
      }
    })

    // Capture stderr for logging
    let stderrBuffer = ''
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      logStream.write(`[stderr] ${text}`)
      stderrBuffer += text
    })

    proc.on('exit', (code) => {
      logStream.end()
      jobState.process = null
      jobState.endTime = Date.now()

      if (code === 0) {
        jobState.status = 'completed'
        this.emit('job-complete', { jobId, status: 'completed' })
      } else if (jobState.status === 'cancelled') {
        this.emit('job-complete', { jobId, status: 'cancelled' })
      } else {
        jobState.status = 'failed'
        // Use captured error or last stderr lines as the error message
        if (!jobState.error && stderrBuffer.trim()) {
          const lines = stderrBuffer.trim().split('\n')
          jobState.error = lines.slice(-3).join('\n')
        }
        this.emit('job-complete', { jobId, status: 'failed', exitCode: code, error: jobState.error })
      }
    })

    this.emit('job-progress', { jobId, event: 'started', status: 'running' })
    return jobId
  }

  stopJob(jobId) {
    const job = this.jobs.get(jobId)
    if (!job || !job.process) return

    job.status = 'cancelled'
    job.process.kill('SIGTERM')
    setTimeout(() => {
      if (job.process) job.process.kill('SIGKILL')
    }, 3000)
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId)
    if (job) {
      return {
        jobId,
        status: job.status,
        config: job.config,
        metrics: job.metrics,
        error: job.error,
        startTime: job.startTime,
        endTime: job.endTime,
      }
    }

    // Try reading from disk
    const jobsDir = getJobsDir()
    if (!jobsDir) return null
    const jobDir = path.join(jobsDir, jobId)
    if (!fs.existsSync(jobDir)) return null

    return this._readJobFromDisk(jobId, jobDir)
  }

  _readJobFromDisk(jobId, jobDir) {
    const configPath = path.join(jobDir, 'config.json')
    const logPath = path.join(jobDir, 'log.txt')
    const metricsPath = path.join(jobDir, 'metrics.jsonl')

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      // Read metrics
      let metrics = []
      let lastMetric = null
      if (fs.existsSync(metricsPath)) {
        const lines = fs.readFileSync(metricsPath, 'utf-8').trim().split('\n').filter(Boolean)
        metrics = lines.map(l => JSON.parse(l))
        if (metrics.length > 0) lastMetric = metrics[metrics.length - 1]
      }

      // Determine status and extract error
      const adapterDir = path.join(jobDir, 'adapter')
      const hasAdapter = fs.existsSync(adapterDir) && fs.readdirSync(adapterDir).length > 0
      let status = hasAdapter ? 'completed' : 'failed'
      let error = null

      if (status === 'failed' && fs.existsSync(logPath)) {
        error = this._extractErrorFromLog(logPath)
      }

      return { jobId, status, config, metrics, lastMetric, error }
    } catch {
      return null
    }
  }

  _extractErrorFromLog(logPath) {
    try {
      const content = fs.readFileSync(logPath, 'utf-8')
      const lines = content.trim().split('\n')

      // Look for JSON error events first
      for (const line of lines) {
        try {
          const data = JSON.parse(line.replace(/^\[raw\]\s*/, ''))
          if (data.event === 'error') return data.message
        } catch { /* not JSON */ }
      }

      // Fall back to last stderr lines
      const stderrLines = lines.filter(l => l.startsWith('[stderr]')).map(l => l.replace('[stderr] ', ''))
      if (stderrLines.length > 0) {
        return stderrLines.slice(-3).join('\n')
      }

      return null
    } catch {
      return null
    }
  }

  listJobs() {
    // Combine in-memory jobs with jobs on disk
    const jobsDir = getJobsDir()
    if (!jobsDir || !fs.existsSync(jobsDir)) return []

    const jobs = []
    const dirs = fs.readdirSync(jobsDir).filter(d => {
      return fs.statSync(path.join(jobsDir, d)).isDirectory()
    })

    for (const dir of dirs) {
      const jobId = dir
      const inMemory = this.jobs.get(jobId)

      if (inMemory) {
        jobs.push({
          jobId,
          status: inMemory.status,
          config: inMemory.config,
          startTime: inMemory.startTime,
          endTime: inMemory.endTime,
          error: inMemory.error,
          lastMetric: inMemory.metrics[inMemory.metrics.length - 1] || null,
        })
      } else {
        const jobDir = path.join(jobsDir, dir)
        const job = this._readJobFromDisk(jobId, jobDir)
        if (job) jobs.push(job)
      }
    }

    return jobs.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
  }

  getJobMetrics(jobId) {
    // Try in-memory first
    const inMemory = this.jobs.get(jobId)
    if (inMemory) return inMemory.metrics

    // Read from disk
    const jobsDir = getJobsDir()
    const metricsPath = path.join(jobsDir, jobId, 'metrics.jsonl')
    if (!fs.existsSync(metricsPath)) return []

    try {
      return fs.readFileSync(metricsPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    } catch {
      return []
    }
  }

  getJobLog(jobId) {
    const jobsDir = getJobsDir()
    const logPath = path.join(jobsDir, jobId, 'log.txt')
    if (!fs.existsSync(logPath)) return null
    try {
      return fs.readFileSync(logPath, 'utf-8')
    } catch {
      return null
    }
  }
}

module.exports = { TrainingService }
