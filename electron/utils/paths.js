const path = require('path')
const fs = require('fs')
const os = require('os')

const GLOBAL_DIR = path.join(os.homedir(), '.finetune-studio')

// --- Global path functions ---
function getGlobalDir() { return GLOBAL_DIR }
function getLogsDir() { return path.join(GLOBAL_DIR, 'logs') }
function getCacheDir() { return path.join(GLOBAL_DIR, 'cache') }
function getConfigPath() { return path.join(GLOBAL_DIR, 'config.json') }

function getMlflowDbPath() {
  return path.join(GLOBAL_DIR, 'mlflow.db')
}

function getArtifactsDir() {
  return path.join(GLOBAL_DIR, 'artifacts')
}

function getJobsDir() {
  return path.join(GLOBAL_DIR, 'jobs')
}

function getModelsDir() {
  return path.join(GLOBAL_DIR, 'models')
}

function getDatasetsDir() {
  return path.join(GLOBAL_DIR, 'datasets')
}

// --- Initialization ---
function ensureGlobalDir() {
  const dirs = [GLOBAL_DIR, getLogsDir(), getCacheDir(), getArtifactsDir(), getJobsDir(), getModelsDir(), getDatasetsDir()]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      pythonPath: '',
      hfToken: '',
      ports: { mlflow: 5000 },
    }, null, 2))
  }
}

module.exports = {
  getGlobalDir, getLogsDir, getCacheDir, getConfigPath,
  getMlflowDbPath, getArtifactsDir, getJobsDir, getModelsDir, getDatasetsDir,
  ensureGlobalDir,
}
