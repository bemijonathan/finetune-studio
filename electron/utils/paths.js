const path = require('path')
const fs = require('fs')
const os = require('os')

const GLOBAL_DIR = path.join(os.homedir(), '.finetune-studio')

let currentProjectDir = null

// --- Global path functions ---
function getGlobalDir() { return GLOBAL_DIR }
function getLogsDir() { return path.join(GLOBAL_DIR, 'logs') }
function getCacheDir() { return path.join(GLOBAL_DIR, 'cache') }
function getConfigPath() { return path.join(GLOBAL_DIR, 'config.json') }
function getRecentProjectsPath() { return path.join(GLOBAL_DIR, 'recent-projects.json') }

// --- Project state ---
function setProject(projectDir) { currentProjectDir = projectDir }
function hasProject() { return currentProjectDir !== null }
function getProjectDir() { return currentProjectDir }

function getProjectDataDir() {
  if (!currentProjectDir) return null
  return path.join(currentProjectDir, '.finetune-studio')
}

// --- Project-scoped path functions ---
function getMlflowDbPath() {
  return path.join(getProjectDataDir(), 'mlflow.db')
}

function getArtifactsDir() {
  return path.join(getProjectDataDir(), 'artifacts')
}

function getJobsDir() {
  return path.join(getProjectDataDir(), 'jobs')
}

function getModelsDir() {
  return path.join(getProjectDataDir(), 'models')
}

function getDatasetsDir() {
  if (!currentProjectDir) return null
  return path.join(currentProjectDir, 'datasets')
}

// --- Initialization ---
function ensureGlobalDir() {
  const dirs = [GLOBAL_DIR, getLogsDir(), getCacheDir()]
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

function ensureProjectDir(projectDir) {
  const dotDir = path.join(projectDir, '.finetune-studio')
  const dirs = [
    dotDir,
    path.join(dotDir, 'artifacts'),
    path.join(dotDir, 'jobs'),
    path.join(dotDir, 'models'),
    path.join(projectDir, 'datasets'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  // Create project.json if missing
  const metadataPath = path.join(dotDir, 'project.json')
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(metadataPath, JSON.stringify({
      name: path.basename(projectDir),
      created: new Date().toISOString(),
    }, null, 2))
  }

  // Gitignore inside .finetune-studio/
  const gitignorePath = path.join(dotDir, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n')
  }
}

module.exports = {
  getGlobalDir, getLogsDir, getCacheDir, getConfigPath, getRecentProjectsPath,
  setProject, hasProject, getProjectDir, getProjectDataDir,
  getMlflowDbPath, getArtifactsDir, getJobsDir, getModelsDir, getDatasetsDir,
  ensureGlobalDir, ensureProjectDir,
}
