const { EventEmitter } = require('events')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const { waitForPort } = require('../utils/ports.js')
const { getScriptPath } = require('../utils/resources.js')

class InferenceService extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.currentModel = null
    this.port = 8321
    this.status = 'idle' // idle | loading | ready | error
    // Prevent unhandled 'error' event crashes
    this.on('error', () => {})
  }

  async loadModel(modelId, adapterPath, pythonPath) {
    // Stop any currently running model
    await this.unloadModel()

    this.status = 'loading'
    this.currentModel = { modelId, adapterPath }
    this.emit('status-change', { status: 'loading', modelId })

    const scriptPath = getScriptPath('serve_model.py')
    const args = [scriptPath, '--model', modelId, '--port', String(this.port)]
    if (adapterPath) {
      args.push('--adapter', adapterPath)
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HF_HOME: path.join(require('os').homedir(), '.cache', 'huggingface'),
        },
      })

      let buffer = ''
      let stderrBuffer = ''

      this.process.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.event === 'ready' || data.event === 'serving') {
              this.status = 'ready'
              this.emit('status-change', { status: 'ready', modelId })
              resolve({ port: this.port, modelId })
            } else if (data.event === 'error') {
              this.emit('model-error', data.message)
            }
            this.emit('output', data)
          } catch {
            // Non-JSON output
          }
        }
      })

      this.process.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
      })

      this.process.on('exit', (code) => {
        this.process = null
        if (this.status === 'loading') {
          this.status = 'error'
          const errMsg = stderrBuffer.trim() || `Inference server exited with code ${code}`
          this.emit('status-change', { status: 'error', modelId, error: errMsg })
          reject(new Error(errMsg))
        } else if (code !== 0 && code !== null) {
          this.status = 'error'
          const errMsg = stderrBuffer.trim() || `Inference server exited with code ${code}`
          this.emit('status-change', { status: 'error', modelId, error: errMsg })
          this.emit('model-error', errMsg)
        } else {
          this.status = 'idle'
          this.currentModel = null
          this.emit('status-change', { status: 'idle' })
        }
      })

      // Timeout after 120s
      setTimeout(() => {
        if (this.status === 'loading') {
          this.status = 'error'
          this.emit('status-change', { status: 'error', modelId })
          this.unloadModel()
          reject(new Error('Model loading timed out'))
        }
      }, 120000)
    })
  }

  async unloadModel() {
    if (this.process) {
      this.process.kill('SIGTERM')
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (this.process) this.process.kill('SIGKILL')
          resolve()
        }, 3000)
        if (this.process) {
          this.process.on('exit', () => { clearTimeout(timeout); resolve() })
        } else {
          clearTimeout(timeout)
          resolve()
        }
      })
      this.process = null
    }
    this.currentModel = null
    this.status = 'idle'
    this.emit('status-change', { status: 'idle' })
  }

  async chatCompletion(messages, { maxTokens = 512, temperature = 0.7, stream = false } = {}) {
    if (this.status !== 'ready') {
      throw new Error('No model loaded')
    }

    const body = JSON.stringify({
      messages,
      max_tokens: maxTokens,
      temperature,
      stream,
    })

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (stream) {
          // Return the response stream for the caller to consume
          resolve(res)
        } else {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch {
              reject(new Error('Invalid response from inference server'))
            }
          })
        }
      })

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  getStatus() {
    return {
      status: this.status,
      model: this.currentModel,
      port: this.port,
    }
  }
}

module.exports = { InferenceService }
