const { ipcMain } = require('electron')
const crypto = require('crypto')
const { readConfig } = require('./config.js')

function registerTrainingIpc(getTrainingService, getCloudTrainingService, getServiceManager) {
  ipcMain.handle('studio:start-training', async (_event, config) => {
    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`

    if (config.runtime === 'cloud') {
      const cts = getCloudTrainingService()
      const appConfig = readConfig()
      const apiKey = appConfig.togetherApiKey
      if (!apiKey) throw new Error('Together AI API key not set. Check Settings.')
      await cts.startJob(jobId, config, apiKey)
      return jobId
    }

    // Local training path (unchanged)
    const ts = getTrainingService()
    const sm = getServiceManager()
    const pythonPath = sm.pythonPath

    if (!pythonPath) {
      throw new Error('Python not found. Check Settings.')
    }

    ts.startJob(jobId, config, pythonPath)
    return jobId
  })

  ipcMain.handle('studio:stop-training', (_event, jobId) => {
    // Check cloud service first
    const cts = getCloudTrainingService()
    if (cts.getJob(jobId)) {
      return cts.stopJob(jobId)
    }
    return getTrainingService().stopJob(jobId)
  })

  ipcMain.handle('studio:list-jobs', () => {
    const local = getTrainingService().listJobs()
    const cloud = getCloudTrainingService().listJobs()
    return [...local, ...cloud].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
  })

  ipcMain.handle('studio:get-job', (_event, jobId) => {
    return getCloudTrainingService().getJob(jobId) || getTrainingService().getJob(jobId)
  })

  ipcMain.handle('studio:get-job-metrics', (_event, jobId) => {
    const cloudMetrics = getCloudTrainingService().getJobMetrics(jobId)
    if (cloudMetrics && cloudMetrics.length > 0) return cloudMetrics
    return getTrainingService().getJobMetrics(jobId)
  })

  ipcMain.handle('studio:get-job-log', (_event, jobId) => {
    return getCloudTrainingService().getJobLog(jobId) || getTrainingService().getJobLog(jobId)
  })
}

module.exports = { registerTrainingIpc }
