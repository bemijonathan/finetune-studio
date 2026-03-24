const { ipcMain } = require('electron')
const { searchModels, getModelInfo } = require('../utils/hf.js')

function registerModelsIpc(gpuDetector) {
  ipcMain.handle('studio:search-models', async (_event, query, opts) => {
    try {
      return await searchModels(query, opts)
    } catch (err) {
      console.error('Model search failed:', err.message)
      return []
    }
  })

  ipcMain.handle('studio:get-model-info', async (_event, modelId) => {
    try {
      return await getModelInfo(modelId)
    } catch (err) {
      console.error('Model info failed:', err.message)
      return null
    }
  })

  ipcMain.handle('studio:get-gpu-info', async () => {
    try {
      return await gpuDetector.detect()
    } catch (err) {
      return { chip: 'Unknown', memoryGB: 0, metal: false, error: err.message }
    }
  })
}

module.exports = { registerModelsIpc }
