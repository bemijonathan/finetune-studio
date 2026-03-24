const { EventEmitter } = require('events')
const { MlflowService } = require('./MlflowService.js')
const { findPython } = require('../utils/python.js')
const { hasProject } = require('../utils/paths.js')

class ServiceManager extends EventEmitter {
  constructor() {
    super()
    this.services = {
      mlflow: new MlflowService(),
    }
    this.pythonPath = null

    // Forward status changes
    for (const [name, service] of Object.entries(this.services)) {
      service.on('status', () => this.emit('status-change', this.getStatuses()))
    }
  }

  getStatuses() {
    const statuses = {}
    for (const [name, service] of Object.entries(this.services)) {
      statuses[name] = service.status
    }
    statuses.pythonPath = this.pythonPath
    return statuses
  }

  async startAll() {
    if (!hasProject()) {
      this.emit('status-change', this.getStatuses())
      return
    }

    this.pythonPath = await findPython()
    if (!this.pythonPath) {
      console.error('Python 3.10+ not found')
      this.emit('status-change', this.getStatuses())
      return
    }
    console.log(`Found Python at ${this.pythonPath}`)

    // Start MLflow
    await this.services.mlflow.start(this.pythonPath).catch(err => console.error('MLflow error:', err.message))
  }

  async stopAll() {
    const stops = Object.values(this.services).map(s => s.stop())
    await Promise.allSettled(stops)
  }
}

module.exports = { ServiceManager }
