const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { getJobsDir, getModelsDir } = require('../utils/paths.js')
const { getScriptPath } = require('../utils/resources.js')

function registerInferenceIpc(getInferenceService, getServiceManager) {
  ipcMain.handle('studio:load-model-for-chat', async (_event, modelId, adapterPath) => {
    const is = getInferenceService()
    const sm = getServiceManager()
    const pythonPath = sm.pythonPath
    if (!pythonPath) throw new Error('Python not found')

    await is.loadModel(modelId, adapterPath, pythonPath)
    return is.getStatus()
  })

  ipcMain.handle('studio:unload-model', async () => {
    await getInferenceService().unloadModel()
  })

  ipcMain.handle('studio:chat-completion', async (_event, messages, opts) => {
    const result = await getInferenceService().chatCompletion(messages, opts)
    return result
  })

  ipcMain.handle('studio:chat-completion-stream', async (_event, messages, opts) => {
    const is = getInferenceService()
    const res = await is.chatCompletion(messages, { ...opts, stream: true })

    return new Promise((resolve, reject) => {
      let fullText = ''
      let buffer = ''

      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) fullText += content
          } catch {
            // skip
          }
        }
      })

      res.on('end', () => resolve({ content: fullText }))
      res.on('error', reject)
    })
  })

  ipcMain.handle('studio:get-inference-status', () => {
    return getInferenceService().getStatus()
  })

  // List completed models (jobs with adapters)
  ipcMain.handle('studio:list-models', () => {
    const jobsDir = getJobsDir()
    if (!jobsDir || !fs.existsSync(jobsDir)) return []

    const models = []
    const dirs = fs.readdirSync(jobsDir).filter(d =>
      fs.statSync(path.join(jobsDir, d)).isDirectory()
    )

    for (const dir of dirs) {
      const adapterDir = path.join(jobsDir, dir, 'adapter')
      const configPath = path.join(jobsDir, dir, 'config.json')
      const metricsPath = path.join(jobsDir, dir, 'metrics.jsonl')

      // Only include jobs with adapter output
      if (!fs.existsSync(adapterDir)) continue
      const adapterFiles = fs.readdirSync(adapterDir)
      if (adapterFiles.length === 0) continue

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

        let finalLoss = null
        if (fs.existsSync(metricsPath)) {
          const lines = fs.readFileSync(metricsPath, 'utf-8').trim().split('\n').filter(Boolean)
          for (let i = lines.length - 1; i >= 0; i--) {
            const m = JSON.parse(lines[i])
            if (m.event === 'step' && m.loss != null) {
              finalLoss = m.loss
              break
            }
          }
        }

        const stat = fs.statSync(adapterDir)

        models.push({
          jobId: dir,
          modelId: config.model_id,
          modelName: config.model_id?.split('/').pop() || dir,
          method: config.use_qlora ? 'QLoRA' : 'LoRA',
          loraRank: config.lora_rank,
          finalLoss,
          adapterPath: adapterDir,
          createdAt: stat.mtime.toISOString(),
        })
      } catch {
        // Skip unreadable
      }
    }

    return models.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  })

  // Export adapter — copy adapter dir to user-chosen location
  ipcMain.handle('studio:export-adapter', async (event, adapterPath) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const { filePaths } = await dialog.showOpenDialog(win, {
      title: 'Export Adapter To...',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!filePaths || filePaths.length === 0) return null

    const destDir = path.join(filePaths[0], 'adapter')
    fs.cpSync(adapterPath, destDir, { recursive: true })
    return destDir
  })

  // Merge model — fuse adapter into base model
  ipcMain.handle('studio:merge-model', async (_event, modelId, adapterPath) => {
    const sm = getServiceManager()
    const pythonPath = sm.pythonPath
    if (!pythonPath) throw new Error('Python not found')

    const win = BrowserWindow.fromWebContents(_event.sender) || BrowserWindow.getFocusedWindow()
    const { filePaths } = await dialog.showOpenDialog(win, {
      title: 'Save Merged Model To...',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!filePaths || filePaths.length === 0) return null

    const outputDir = path.join(filePaths[0], modelId.split('/').pop() + '-merged')
    const scriptPath = getScriptPath('export_merge.py')

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonPath, [
        scriptPath,
        '--model', modelId,
        '--adapter', adapterPath,
        '--output', outputDir,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HF_HOME: path.join(require('os').homedir(), '.cache', 'huggingface'),
        },
      })

      let result = null
      let buffer = ''
      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.event === 'complete') result = data
            if (data.event === 'error') reject(new Error(data.message))
          } catch { /* skip */ }
        }
      })

      proc.stderr.on('data', () => {})
      proc.on('exit', (code) => {
        if (code === 0 && result) resolve(result)
        else reject(new Error(`Merge failed with exit code ${code}`))
      })
    })
  })
}

module.exports = { registerInferenceIpc }
