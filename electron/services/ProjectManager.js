const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const {
  setProject, ensureProjectDir, getProjectDir,
  getRecentProjectsPath, getProjectDataDir,
} = require('../utils/paths.js')

class ProjectManager extends EventEmitter {
  constructor(serviceManager) {
    super()
    this.serviceManager = serviceManager
  }

  getRecentProjects() {
    try {
      const data = fs.readFileSync(getRecentProjectsPath(), 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  _updateRecentProjects(projectDir) {
    const recent = this.getRecentProjects()
    const name = path.basename(projectDir)
    const entry = { path: projectDir, name, lastOpened: new Date().toISOString() }

    const filtered = recent.filter(r => r.path !== projectDir)
    filtered.unshift(entry)
    const trimmed = filtered.slice(0, 10)
    fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(trimmed, null, 2))
  }

  async openProject(projectDir) {
    if (!fs.existsSync(projectDir)) {
      const recent = this.getRecentProjects().filter(r => r.path !== projectDir)
      fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(recent, null, 2))
      throw new Error(`Project folder not found: ${projectDir}`)
    }

    await this.serviceManager.stopAll()
    setProject(projectDir)
    ensureProjectDir(projectDir)
    this._updateRecentProjects(projectDir)

    // Emit project-changed immediately so UI updates without waiting for services
    this.emit('project-changed', this.getProjectInfo())

    // Start services in background — don't block project opening
    this.serviceManager.startAll().catch(err => {
      console.error('Service startup error:', err.message)
    })
  }

  getProjectInfo() {
    const dir = getProjectDir()
    if (!dir) return null
    try {
      const metadataPath = path.join(getProjectDataDir(), 'project.json')
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      return { path: dir, name: metadata.name, created: metadata.created }
    } catch {
      return { path: dir, name: path.basename(dir) }
    }
  }
}

module.exports = { ProjectManager }
