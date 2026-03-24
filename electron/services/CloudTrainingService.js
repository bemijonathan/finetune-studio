const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const { getJobsDir } = require('../utils/paths.js')

const TOGETHER_API = 'https://api.together.xyz'
const POLL_INTERVAL = 10000 // 10 seconds

class CloudTrainingService extends EventEmitter {
  constructor() {
    super()
    this.jobs = new Map() // jobId -> { togetherJobId, status, config, metrics, pollTimer, apiKey, ... }
  }

  async startJob(jobId, config, apiKey) {
    const jobsDir = getJobsDir()
    const jobDir = path.join(jobsDir, jobId)
    fs.mkdirSync(jobDir, { recursive: true })
    fs.mkdirSync(path.join(jobDir, 'adapter'), { recursive: true })

    const fullConfig = { ...config, runtime: 'cloud', provider: 'together' }
    fs.writeFileSync(path.join(jobDir, 'config.json'), JSON.stringify(fullConfig, null, 2))

    const logPath = path.join(jobDir, 'log.txt')
    const metricsPath = path.join(jobDir, 'metrics.jsonl')

    const jobState = {
      status: 'running',
      config: fullConfig,
      metrics: [],
      error: null,
      startTime: Date.now(),
      endTime: null,
      apiKey,
      togetherJobId: null,
      togetherFileId: null,
      lastEventIndex: 0,
      logPath,
      metricsPath,
    }
    this.jobs.set(jobId, jobState)

    this._log(jobId, `Starting cloud training job: ${jobId}`)
    this.emit('job-progress', { jobId, event: 'started', status: 'running' })

    try {
      // Upload dataset
      this._log(jobId, `Uploading dataset: ${config.dataset_path}`)
      this.emit('job-progress', { jobId, event: 'status', message: 'Uploading dataset to Together AI...' })
      const fileResult = await this._uploadDataset(config.dataset_path, apiKey)
      jobState.togetherFileId = fileResult.id
      this._log(jobId, `Dataset uploaded: ${fileResult.id}`)

      // Create fine-tune job
      this._log(jobId, `Creating fine-tune job for model: ${config.model_id}`)
      this.emit('job-progress', { jobId, event: 'status', message: 'Creating fine-tune job...' })
      const ftResult = await this._createFineTune({
        training_file: fileResult.id,
        model: config.model_id,
        n_epochs: config.epochs || 3,
        learning_rate: config.learning_rate || 1e-5,
        batch_size: config.batch_size || 'max',
        suffix: jobId.replace(/[^a-zA-Z0-9_-]/g, ''),
      }, apiKey)

      jobState.togetherJobId = ftResult.id
      this._log(jobId, `Fine-tune job created: ${ftResult.id}`)
      this._persistState(jobId)

      // Start polling
      this._startPolling(jobId)
    } catch (err) {
      jobState.status = 'failed'
      jobState.error = err.message
      jobState.endTime = Date.now()
      this._log(jobId, `Error: ${err.message}`)
      this._persistState(jobId)
      this.emit('job-complete', { jobId, status: 'failed', error: err.message })
    }

    return jobId
  }

  async stopJob(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return

    if (job.pollTimer) {
      clearInterval(job.pollTimer)
      job.pollTimer = null
    }

    if (job.togetherJobId && job.status === 'running') {
      try {
        await this._togetherFetch('POST', `/v1/fine-tunes/${job.togetherJobId}/cancel`, job.apiKey)
        this._log(jobId, 'Job cancelled via API')
      } catch (err) {
        this._log(jobId, `Cancel API error: ${err.message}`)
      }
    }

    job.status = 'cancelled'
    job.endTime = Date.now()
    this._persistState(jobId)
    this.emit('job-complete', { jobId, status: 'cancelled' })
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
        lastMetric: job.metrics[job.metrics.length - 1] || null,
      }
    }

    // Try reading from disk
    return this._readJobFromDisk(jobId)
  }

  listJobs() {
    const jobsDir = getJobsDir()
    if (!jobsDir || !fs.existsSync(jobsDir)) return []

    const jobs = []
    const dirs = fs.readdirSync(jobsDir).filter(d => {
      const jobDir = path.join(jobsDir, d)
      return fs.statSync(jobDir).isDirectory() && fs.existsSync(path.join(jobDir, 'cloud_state.json'))
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
        const job = this._readJobFromDisk(jobId)
        if (job) jobs.push(job)
      }
    }

    return jobs
  }

  getJobMetrics(jobId) {
    const inMemory = this.jobs.get(jobId)
    if (inMemory) return inMemory.metrics

    const jobsDir = getJobsDir()
    const metricsPath = path.join(jobsDir, jobId, 'metrics.jsonl')
    if (!fs.existsSync(metricsPath)) return []

    try {
      return fs.readFileSync(metricsPath, 'utf-8')
        .trim().split('\n').filter(Boolean)
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

  resumePollingForActiveJobs(apiKey) {
    if (!apiKey) return

    const jobsDir = getJobsDir()
    if (!jobsDir || !fs.existsSync(jobsDir)) return

    const dirs = fs.readdirSync(jobsDir).filter(d => {
      const statePath = path.join(jobsDir, d, 'cloud_state.json')
      return fs.existsSync(statePath)
    })

    for (const dir of dirs) {
      const jobId = dir
      if (this.jobs.has(jobId)) continue

      try {
        const jobDir = path.join(jobsDir, jobId)
        const cloudState = JSON.parse(fs.readFileSync(path.join(jobDir, 'cloud_state.json'), 'utf-8'))

        if (cloudState.status !== 'running') continue

        const config = JSON.parse(fs.readFileSync(path.join(jobDir, 'config.json'), 'utf-8'))
        const metrics = []
        const metricsPath = path.join(jobDir, 'metrics.jsonl')
        if (fs.existsSync(metricsPath)) {
          const lines = fs.readFileSync(metricsPath, 'utf-8').trim().split('\n').filter(Boolean)
          for (const line of lines) {
            try { metrics.push(JSON.parse(line)) } catch {}
          }
        }

        const jobState = {
          status: 'running',
          config,
          metrics,
          error: null,
          startTime: cloudState.startTime || Date.now(),
          endTime: null,
          apiKey,
          togetherJobId: cloudState.togetherJobId,
          togetherFileId: cloudState.togetherFileId,
          lastEventIndex: cloudState.lastEventIndex || 0,
          logPath: path.join(jobDir, 'log.txt'),
          metricsPath,
        }
        this.jobs.set(jobId, jobState)
        this._startPolling(jobId)
        this._log(jobId, 'Resumed polling after app restart')
      } catch (err) {
        console.error(`Failed to resume cloud job ${jobId}:`, err.message)
      }
    }
  }

  // --- Internal methods ---

  _startPolling(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return

    // Do an immediate poll, then start interval
    this._pollOnce(jobId)
    job.pollTimer = setInterval(() => this._pollOnce(jobId), POLL_INTERVAL)
  }

  async _pollOnce(jobId) {
    const job = this.jobs.get(jobId)
    if (!job || !job.togetherJobId || job.status !== 'running') return

    try {
      // Get job status
      const ftJob = await this._togetherFetch('GET', `/v1/fine-tunes/${job.togetherJobId}`, job.apiKey)

      // Get events
      const eventsResult = await this._togetherFetch('GET', `/v1/fine-tunes/${job.togetherJobId}/events`, job.apiKey)
      const events = eventsResult.data || eventsResult || []

      // Process new events
      const newEvents = events.slice(job.lastEventIndex)
      for (const evt of newEvents) {
        const normalized = this._normalizeEvent(evt, job)
        if (normalized) {
          job.metrics.push(normalized)
          fs.appendFileSync(job.metricsPath, JSON.stringify(normalized) + '\n')
          this.emit('job-progress', { jobId, ...normalized })
        }
      }
      job.lastEventIndex = events.length

      // Check terminal states
      const status = ftJob.status || ftJob.fine_tune?.status
      if (status === 'completed' || status === 'succeeded') {
        this._onJobCompleted(jobId, ftJob)
      } else if (status === 'failed' || status === 'error') {
        this._onJobFailed(jobId, ftJob)
      } else if (status === 'cancelled') {
        this._onJobCancelled(jobId)
      }

      this._persistState(jobId)
    } catch (err) {
      this._log(jobId, `Poll error: ${err.message}`)
    }
  }

  _normalizeEvent(evt, job) {
    // Together events can have different shapes depending on the API version
    // Common: { type: 'metrics', step, train_loss, ... }
    // Or: { object: 'fine_tune_event', data: { step, train_loss, ... } }
    const data = evt.data || evt

    if (data.type === 'metrics' || data.train_loss !== undefined || data.loss !== undefined) {
      return {
        event: 'step',
        step: data.step || data.training_step || 0,
        total_steps: data.total_steps || job.config._totalSteps || 0,
        loss: data.train_loss ?? data.loss ?? null,
        lr: data.learning_rate || job.config.learning_rate || null,
      }
    }

    if (data.type === 'eval' || data.eval_loss !== undefined) {
      return {
        event: 'eval',
        step: data.step || data.training_step || 0,
        eval_loss: data.eval_loss ?? data.validation_loss ?? null,
      }
    }

    // Status messages
    if (data.message || data.type === 'status') {
      this._log(job.togetherJobId, data.message || JSON.stringify(data))
      return null
    }

    return null
  }

  _onJobCompleted(jobId, ftJob) {
    const job = this.jobs.get(jobId)
    if (!job) return

    if (job.pollTimer) {
      clearInterval(job.pollTimer)
      job.pollTimer = null
    }

    job.status = 'completed'
    job.endTime = Date.now()

    // Write cloud model reference
    const outputModel = ftJob.output_name || ftJob.fine_tuned_model || ftJob.model_output
    const adapterDir = path.join(getJobsDir(), jobId, 'adapter')
    fs.mkdirSync(adapterDir, { recursive: true })
    fs.writeFileSync(path.join(adapterDir, 'cloud_model.json'), JSON.stringify({
      provider: 'together',
      model_name: outputModel,
      fine_tune_id: job.togetherJobId,
      base_model: job.config.model_id,
    }, null, 2))

    this._log(jobId, `Training completed. Output model: ${outputModel}`)
    this._persistState(jobId)
    this.emit('job-progress', { jobId, event: 'complete', message: 'Training complete' })
    this.emit('job-complete', { jobId, status: 'completed' })
  }

  _onJobFailed(jobId, ftJob) {
    const job = this.jobs.get(jobId)
    if (!job) return

    if (job.pollTimer) {
      clearInterval(job.pollTimer)
      job.pollTimer = null
    }

    const errorMsg = ftJob.error || ftJob.message || 'Cloud training failed'
    job.status = 'failed'
    job.error = errorMsg
    job.endTime = Date.now()

    this._log(jobId, `Training failed: ${errorMsg}`)
    this._persistState(jobId)
    this.emit('job-complete', { jobId, status: 'failed', error: errorMsg })
  }

  _onJobCancelled(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return

    if (job.pollTimer) {
      clearInterval(job.pollTimer)
      job.pollTimer = null
    }

    job.status = 'cancelled'
    job.endTime = Date.now()

    this._log(jobId, 'Training cancelled')
    this._persistState(jobId)
    this.emit('job-complete', { jobId, status: 'cancelled' })
  }

  async _uploadDataset(datasetPath, apiKey) {
    const fileData = fs.readFileSync(datasetPath)
    const fileName = path.basename(datasetPath)

    // Build multipart form data manually for Node's fetch
    const boundary = `----FormBoundary${Date.now()}`
    const parts = []

    // Purpose field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nfine-tune\r\n`)

    // File field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/jsonl\r\n\r\n`)
    const header = Buffer.from(parts.join(''))
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, fileData, footer])

    const res = await fetch(`${TOGETHER_API}/v1/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Dataset upload failed (${res.status}): ${text}`)
    }

    return res.json()
  }

  async _createFineTune(params, apiKey) {
    return this._togetherFetch('POST', '/v1/fine-tunes', apiKey, params)
  }

  async _togetherFetch(method, endpoint, apiKey, body = null) {
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
    if (body) opts.body = JSON.stringify(body)

    const res = await fetch(`${TOGETHER_API}${endpoint}`, opts)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Together API error (${res.status}): ${text}`)
    }
    return res.json()
  }

  _persistState(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return

    const jobDir = path.join(getJobsDir(), jobId)
    const statePath = path.join(jobDir, 'cloud_state.json')

    try {
      fs.writeFileSync(statePath, JSON.stringify({
        togetherJobId: job.togetherJobId,
        togetherFileId: job.togetherFileId,
        status: job.status,
        lastEventIndex: job.lastEventIndex,
        startTime: job.startTime,
      }, null, 2))
    } catch (err) {
      console.error(`Failed to persist cloud state for ${jobId}:`, err.message)
    }
  }

  _readJobFromDisk(jobId) {
    const jobsDir = getJobsDir()
    if (!jobsDir) return null

    const jobDir = path.join(jobsDir, jobId)
    const configPath = path.join(jobDir, 'config.json')
    const statePath = path.join(jobDir, 'cloud_state.json')
    const metricsPath = path.join(jobDir, 'metrics.jsonl')

    if (!fs.existsSync(statePath)) return null

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const cloudState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))

      let metrics = []
      if (fs.existsSync(metricsPath)) {
        metrics = fs.readFileSync(metricsPath, 'utf-8')
          .trim().split('\n').filter(Boolean)
          .map(l => JSON.parse(l))
      }

      return {
        jobId,
        status: cloudState.status,
        config,
        metrics,
        lastMetric: metrics[metrics.length - 1] || null,
        error: null,
        startTime: cloudState.startTime,
      }
    } catch {
      return null
    }
  }

  _log(jobId, message) {
    const job = this.jobs.get(jobId)
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] ${message}\n`
    if (job?.logPath) {
      try { fs.appendFileSync(job.logPath, line) } catch {}
    }
    console.log(`[cloud:${jobId}] ${message}`)
  }
}

module.exports = { CloudTrainingService }
