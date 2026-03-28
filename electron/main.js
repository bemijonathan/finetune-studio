const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const { ServiceManager } = require('./services/ServiceManager.js')
const { registerServicesIpc } = require('./ipc/services.js')
const { registerConfigIpc, readConfig } = require('./ipc/config.js')
const { registerModelsIpc } = require('./ipc/models.js')
const { registerTrainingIpc } = require('./ipc/training.js')
const { registerDatasetsIpc } = require('./ipc/datasets.js')
const { GpuDetector } = require('./services/GpuDetector.js')
const { TrainingService } = require('./services/TrainingService.js')
const { CloudTrainingService } = require('./services/CloudTrainingService.js')
const { InferenceService } = require('./services/InferenceService.js')
const { registerInferenceIpc } = require('./ipc/inference.js')
const { ensureGlobalDir } = require('./utils/paths.js')
const { checkSetup, setupEnvironment } = require('./utils/python.js')

const isDev = !app.isPackaged

let mainWindow = null
let serviceManager = null
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
  gpuDetector = new GpuDetector()
  trainingService = new TrainingService()
  cloudTrainingService = new CloudTrainingService()
  inferenceService = new InferenceService()

  // Register IPC handlers
  registerServicesIpc(() => serviceManager)
  registerConfigIpc()
  registerModelsIpc(gpuDetector)
  registerTrainingIpc(() => trainingService, () => cloudTrainingService, () => serviceManager)
  registerDatasetsIpc()
  registerInferenceIpc(() => inferenceService, () => serviceManager)

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

  // Setup status IPC
  ipcMain.handle('studio:get-setup-status', async () => {
    return checkSetup()
  })

  createWindow()

  // Auto-setup Python environment
  try {
    const status = await checkSetup()
    if (!status.ready) {
      const send = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('studio:setup-progress', data)
        }
      }
      send({ stage: 'checking', message: 'Setting up Python environment...' })
      await setupEnvironment(send)
    }
  } catch (err) {
    console.log('Auto-setup failed:', err.message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:setup-progress', {
        stage: 'error',
        message: err.message,
      })
    }
  }

  // Start services and resume cloud training
  await serviceManager.startAll()
  const appConfig = readConfig()
  if (appConfig.togetherApiKey) {
    cloudTrainingService.resumePollingForActiveJobs(appConfig.togetherApiKey)
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
