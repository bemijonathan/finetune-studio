const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('studio', {
  // Services
  getServiceStatus: () => ipcRenderer.invoke('studio:get-service-status'),
  onServiceStatus: (callback) => {
    const handler = (_event, statuses) => callback(statuses)
    ipcRenderer.on('studio:service-status', handler)
    return () => ipcRenderer.removeListener('studio:service-status', handler)
  },

  // Config
  getConfig: () => ipcRenderer.invoke('studio:get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('studio:set-config', key, value),

  // Models & GPU
  searchModels: (query, opts) => ipcRenderer.invoke('studio:search-models', query, opts),
  getModelInfo: (modelId) => ipcRenderer.invoke('studio:get-model-info', modelId),
  getGpuInfo: () => ipcRenderer.invoke('studio:get-gpu-info'),

  // Datasets
  uploadDataset: () => ipcRenderer.invoke('studio:upload-dataset'),
  detectDatasetFormat: (path) => ipcRenderer.invoke('studio:detect-dataset-format', path),
  previewDataset: (path, limit) => ipcRenderer.invoke('studio:preview-dataset', path, limit),
  listDatasets: () => ipcRenderer.invoke('studio:list-datasets'),
  convertDataset: (path) => ipcRenderer.invoke('studio:convert-dataset', path),
  convertDatasetMapped: (path, mapping) => ipcRenderer.invoke('studio:convert-dataset-mapped', path, mapping),
  saveDataset: (path, rows) => ipcRenderer.invoke('studio:save-dataset', path, rows),
  saveDatasetAs: (rows, suggestedName) => ipcRenderer.invoke('studio:save-dataset-as', rows, suggestedName),
  deleteDataset: (path) => ipcRenderer.invoke('studio:delete-dataset', path),
  renameDataset: (path, newName) => ipcRenderer.invoke('studio:rename-dataset', path, newName),

  // Training
  startTraining: (config) => ipcRenderer.invoke('studio:start-training', config),
  stopTraining: (jobId) => ipcRenderer.invoke('studio:stop-training', jobId),
  listJobs: () => ipcRenderer.invoke('studio:list-jobs'),
  getJob: (jobId) => ipcRenderer.invoke('studio:get-job', jobId),
  getJobMetrics: (jobId) => ipcRenderer.invoke('studio:get-job-metrics', jobId),
  getJobLog: (jobId) => ipcRenderer.invoke('studio:get-job-log', jobId),
  onJobProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('studio:job-progress', handler)
    return () => ipcRenderer.removeListener('studio:job-progress', handler)
  },
  onJobComplete: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('studio:job-complete', handler)
    return () => ipcRenderer.removeListener('studio:job-complete', handler)
  },

  // Inference
  loadModelForChat: (modelId, adapterPath) => ipcRenderer.invoke('studio:load-model-for-chat', modelId, adapterPath),
  unloadModel: () => ipcRenderer.invoke('studio:unload-model'),
  chatCompletion: (messages, opts) => ipcRenderer.invoke('studio:chat-completion', messages, opts),
  chatCompletionStream: (messages, opts) => ipcRenderer.invoke('studio:chat-completion-stream', messages, opts),
  getInferenceStatus: () => ipcRenderer.invoke('studio:get-inference-status'),
  listModels: () => ipcRenderer.invoke('studio:list-models'),
  exportAdapter: (adapterPath) => ipcRenderer.invoke('studio:export-adapter', adapterPath),
  mergeModel: (modelId, adapterPath) => ipcRenderer.invoke('studio:merge-model', modelId, adapterPath),

  // Setup
  getSetupStatus: () => ipcRenderer.invoke('studio:get-setup-status'),
  onSetupProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('studio:setup-progress', handler)
    return () => ipcRenderer.removeListener('studio:setup-progress', handler)
  },

  // Shell
  openExternal: (url) => ipcRenderer.invoke('studio:open-external', url),
})
