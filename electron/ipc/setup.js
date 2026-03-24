const { ipcMain, BrowserWindow } = require('electron')
const { checkSetup, setupEnvironment } = require('../utils/python.js')

function registerSetupIpc() {
  ipcMain.handle('studio:check-setup', async () => {
    return checkSetup()
  })

  ipcMain.handle('studio:run-setup', async () => {
    const win = BrowserWindow.getFocusedWindow()

    return new Promise((resolve, reject) => {
      setupEnvironment((progress) => {
        // Send progress to renderer
        if (win && !win.isDestroyed()) {
          win.webContents.send('studio:setup-progress', progress)
        }
      }).then(resolve).catch(err => reject(err))
    })
  })
}

module.exports = { registerSetupIpc }
