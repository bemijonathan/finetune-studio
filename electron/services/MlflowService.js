const { EventEmitter } = require('events')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getMlflowDbPath, getArtifactsDir, getLogsDir } = require('../utils/paths.js')
const { waitForPort } = require('../utils/ports.js')

class MlflowService extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.status = 'stopped'
    this.port = 5000
  }

  setStatus(status) {
    this.status = status
    this.emit('status', status)
  }

  async start(pythonPath) {
    if (this.process) return
    this.setStatus('starting')

    const dbPath = getMlflowDbPath()
    const artifactsDir = getArtifactsDir()

    const args = [
      '-m', 'mlflow', 'server',
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--backend-store-uri', `sqlite:///${dbPath}`,
      '--default-artifact-root', artifactsDir,
    ]

    const logPath = path.join(getLogsDir(), 'mlflow.log')
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })

    this.process = spawn(pythonPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout.pipe(logStream)
    this.process.stderr.pipe(logStream)

    this.process.on('exit', (code) => {
      console.log(`MLflow exited with code ${code}`)
      this.process = null
      if (this.status !== 'stopped') {
        this.setStatus('error')
      }
    })

    try {
      await waitForPort(this.port, 30000)
      this.setStatus('healthy')
      console.log(`MLflow ready on port ${this.port}`)
    } catch (err) {
      console.error('MLflow failed to start:', err.message)
      this.setStatus('error')
      throw err
    }
  }

  async stop() {
    this.setStatus('stopped')
    if (this.process) {
      this.process.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (this.process) {
        this.process.kill('SIGKILL')
      }
      this.process = null
    }
  }
}

module.exports = { MlflowService }
