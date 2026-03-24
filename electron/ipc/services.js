const { ipcMain, shell } = require('electron')

function registerServicesIpc(getServiceManager) {
  ipcMain.handle('studio:get-service-status', () => {
    const sm = getServiceManager()
    return sm ? sm.getStatuses() : {}
  })

  ipcMain.handle('studio:open-external', (_event, url) => {
    if (url && typeof url === 'string' && url.startsWith('http')) {
      shell.openExternal(url)
    }
  })
}

module.exports = { registerServicesIpc }
