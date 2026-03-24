const { ipcMain } = require('electron')
const fs = require('fs')
const { getConfigPath } = require('../utils/paths.js')

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
  } catch {
    return { pythonPath: '', hfToken: '', togetherApiKey: '', ports: { mlflow: 5000 } }
  }
}

function writeConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}

function registerConfigIpc() {
  ipcMain.handle('studio:get-config', () => {
    return readConfig()
  })

  ipcMain.handle('studio:set-config', (_event, key, value) => {
    const config = readConfig()
    const keys = key.split('.')
    let obj = config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {}
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
    writeConfig(config)
    return config
  })
}

module.exports = { registerConfigIpc, readConfig }
