const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { ServiceManager } = require('./services/ServiceManager.js')
const { ProjectManager } = require('./services/ProjectManager.js')
const { registerServicesIpc } = require('./ipc/services.js')
const { registerConfigIpc, readConfig } = require('./ipc/config.js')
const { registerProjectIpc } = require('./ipc/project.js')
const { registerModelsIpc } = require('./ipc/models.js')
const { registerTrainingIpc } = require('./ipc/training.js')
const { registerDatasetsIpc } = require('./ipc/datasets.js')
const { GpuDetector } = require('./services/GpuDetector.js')
const { TrainingService } = require('./services/TrainingService.js')
const { CloudTrainingService } = require('./services/CloudTrainingService.js')
const { InferenceService } = require('./services/InferenceService.js')
const { registerInferenceIpc } = require('./ipc/inference.js')
const { registerSetupIpc } = require('./ipc/setup.js')
const { ensureGlobalDir } = require('./utils/paths.js')

const isDev = !app.isPackaged

let mainWindow = null
let serviceManager = null
let projectManager = null
let gpuDetector = null
let trainingService = null
let inferenceService = null
let cloudTrainingService = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0c0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  ensureGlobalDir()

  serviceManager = new ServiceManager()
  projectManager = new ProjectManager(serviceManager)
  gpuDetector = new GpuDetector()
  trainingService = new TrainingService()
  cloudTrainingService = new CloudTrainingService()
  inferenceService = new InferenceService()

  // Register IPC handlers
  registerServicesIpc(() => serviceManager)
  registerConfigIpc()
  registerProjectIpc(() => projectManager)
  registerModelsIpc(gpuDetector)
  registerTrainingIpc(() => trainingService, () => cloudTrainingService, () => serviceManager)
  registerDatasetsIpc()
  registerInferenceIpc(() => inferenceService, () => serviceManager)
  registerSetupIpc()

  // Forward events to renderer
  trainingService.on('job-progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:job-progress', data)
    }
  })
  trainingService.on('job-complete', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:job-complete', data)
    }
  })
  cloudTrainingService.on('job-progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:job-progress', data)
    }
  })
  cloudTrainingService.on('job-complete', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:job-complete', data)
    }
  })
  serviceManager.on('status-change', (statuses) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:service-status', statuses)
    }
  })
  projectManager.on('project-changed', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:project-changed', info)
    }
  })

  createWindow()

  // Auto-open last project
  const recent = projectManager.getRecentProjects()
  if (recent.length > 0) {
    try {
      await projectManager.openProject(recent[0].path)
      // Resume polling for any active cloud training jobs
      const appConfig = readConfig()
      if (appConfig.togetherApiKey) {
        cloudTrainingService.resumePollingForActiveJobs(appConfig.togetherApiKey)
      }
    } catch (err) {
      console.log('Could not reopen last project:', err.message)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  if (inferenceService) {
    await inferenceService.unloadModel()
  }
  if (serviceManager) {
    await serviceManager.stopAll()
  }
})
