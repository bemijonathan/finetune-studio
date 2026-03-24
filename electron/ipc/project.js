const { ipcMain, dialog, BrowserWindow } = require('electron')

function registerProjectIpc(getProjectManager) {
  ipcMain.handle('studio:open-project', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Open Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const pm = getProjectManager()
    await pm.openProject(result.filePaths[0])
    return pm.getProjectInfo()
  })

  ipcMain.handle('studio:open-project-path', async (_event, projectPath) => {
    const pm = getProjectManager()
    await pm.openProject(projectPath)
    return pm.getProjectInfo()
  })

  ipcMain.handle('studio:new-project', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Folder for New Project',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const pm = getProjectManager()
    await pm.openProject(result.filePaths[0])
    return pm.getProjectInfo()
  })

  ipcMain.handle('studio:get-project', () => {
    return getProjectManager()?.getProjectInfo() || null
  })

  ipcMain.handle('studio:get-recent-projects', () => {
    return getProjectManager()?.getRecentProjects() || []
  })
}

module.exports = { registerProjectIpc }
