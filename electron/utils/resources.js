const { app } = require('electron')
const path = require('path')

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(__dirname, '../..', ...segments)
}

function getScriptPath(scriptName) {
  return getResourcePath('python', scriptName)
}

module.exports = { getResourcePath, getScriptPath }
