const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { getDatasetsDir } = require('../utils/paths.js')
const { findPython } = require('../utils/python.js')
const { getScriptPath } = require('../utils/resources.js')

const execFileAsync = promisify(execFile)

/** Parse JSONL or JSON array file into rows */
function parseDatasetFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').trim()
  if (!content) return []

  // JSON array
  if (content[0] === '[') {
    const data = JSON.parse(content)
    return Array.isArray(data) ? data.filter(r => r && typeof r === 'object') : []
  }

  // JSONL
  return content.split('\n')
    .map(line => { try { return JSON.parse(line.trim()) } catch { return null } })
    .filter(Boolean)
}

function registerDatasetsIpc() {
  ipcMain.handle('studio:upload-dataset', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: 'Datasets', extensions: ['jsonl', 'json'] },
        ],
        title: 'Select Dataset',
      })

      if (result.canceled || result.filePaths.length === 0) return null

      const srcPath = result.filePaths[0]
      const fileName = path.basename(srcPath)
      const datasetsDir = getDatasetsDir()

      if (!datasetsDir) return { error: 'No project open' }

      // Ensure datasets dir exists
      if (!fs.existsSync(datasetsDir)) fs.mkdirSync(datasetsDir, { recursive: true })

      const destPath = path.join(datasetsDir, fileName)
      fs.copyFileSync(srcPath, destPath)

      const stats = fs.statSync(destPath)
      return {
        path: destPath,
        name: fileName,
        size: stats.size,
      }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:detect-dataset-format', async (_event, filePath) => {
    const pythonPath = await findPython()
    if (!pythonPath) return { error: 'Python not found' }

    const scriptPath = getScriptPath('dataset_detect.py')

    try {
      const { stdout } = await execFileAsync(pythonPath, [scriptPath, '--file', filePath], {
        timeout: 30000,
      })
      return JSON.parse(stdout)
    } catch (err) {
      // execFile errors may have stdout with a JSON error message
      if (err.stdout) {
        try { return JSON.parse(err.stdout) } catch {}
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:convert-dataset', async (_event, filePath) => {
    // Convert alpaca format to chat format
    try {
      const rows = parseDatasetFile(filePath)

      const converted = rows.map(row => {
        const messages = []
        const instruction = row.instruction || ''
        const input = row.input || ''
        const output = row.output || ''

        const userContent = input ? `${instruction}\n\n${input}` : instruction
        messages.push({ role: 'user', content: userContent })
        messages.push({ role: 'assistant', content: output })
        return { messages }
      })

      // Write converted file
      const dir = path.dirname(filePath)
      const base = path.basename(filePath, path.extname(filePath))
      const convertedPath = path.join(dir, `${base}_chat.jsonl`)
      const out = converted.map(r => JSON.stringify(r)).join('\n') + '\n'
      fs.writeFileSync(convertedPath, out)

      return { path: convertedPath, name: path.basename(convertedPath), count: converted.length }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:convert-dataset-mapped', async (_event, filePath, mapping) => {
    try {
      const rows = parseDatasetFile(filePath)
      const { userCol, assistantCol, systemCol, useTemplate, template } = mapping

      const toStr = (val) => {
        if (val === null || val === undefined) return ''
        if (typeof val === 'object') return JSON.stringify(val)
        return String(val)
      }

      const converted = rows.map(row => {
        const messages = []

        if (systemCol && row[systemCol]) {
          messages.push({ role: 'system', content: toStr(row[systemCol]) })
        }

        let userContent
        if (useTemplate && template) {
          userContent = template.replace(/\{(\w+)\}/g, (_, key) => toStr(row[key]))
        } else {
          userContent = toStr(row[userCol])
        }
        if (userContent.trim()) {
          messages.push({ role: 'user', content: userContent.trim() })
        }

        const assistantContent = toStr(row[assistantCol])
        if (assistantContent.trim()) {
          messages.push({ role: 'assistant', content: assistantContent.trim() })
        }

        return { messages }
      })

      const dir = path.dirname(filePath)
      const base = path.basename(filePath, path.extname(filePath))
      const outPath = path.join(dir, `${base}_chat.jsonl`)
      const out = converted.map(r => JSON.stringify(r)).join('\n') + '\n'
      fs.writeFileSync(outPath, out)

      return { path: outPath, name: path.basename(outPath), count: converted.length }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:preview-dataset', async (_event, filePath, limit = 20) => {
    try {
      const rows = parseDatasetFile(filePath)
      return limit <= 0 ? rows : rows.slice(0, limit)
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('studio:list-datasets', () => {
    const datasetsDir = getDatasetsDir()
    if (!datasetsDir || !fs.existsSync(datasetsDir)) return []

    return fs.readdirSync(datasetsDir)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(datasetsDir, f)
        const stats = fs.statSync(fullPath)
        let rowCount = 0
        let columns = []
        let format = 'unknown'
        try {
          const rows = parseDatasetFile(fullPath)
          rowCount = rows.length
          if (rows.length > 0) {
            const sample = rows[0]
            columns = Object.keys(sample)
            if (sample.messages && Array.isArray(sample.messages)) format = 'chat'
            else if ('prompt' in sample && 'completion' in sample) format = 'completions'
            else if ('text' in sample) format = 'text'
          }
        } catch {}
        return {
          name: f,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          rowCount,
          columns,
          format,
        }
      })
  })

  ipcMain.handle('studio:save-dataset', async (_event, filePath, rows) => {
    try {
      const out = rows.map(r => JSON.stringify(r)).join('\n') + '\n'
      fs.writeFileSync(filePath, out)
      const stats = fs.statSync(filePath)
      return { path: filePath, name: path.basename(filePath), size: stats.size, count: rows.length }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:save-dataset-as', async (event, rows, suggestedName) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const datasetsDir = getDatasetsDir()
    if (!datasetsDir) return null

    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(datasetsDir, suggestedName || 'dataset.jsonl'),
      filters: [{ name: 'JSONL', extensions: ['jsonl'] }],
      title: 'Save Dataset As',
    })

    if (result.canceled || !result.filePath) return null

    try {
      const out = rows.map(r => JSON.stringify(r)).join('\n') + '\n'
      fs.writeFileSync(result.filePath, out)
      const stats = fs.statSync(result.filePath)
      return { path: result.filePath, name: path.basename(result.filePath), size: stats.size, count: rows.length }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:delete-dataset', async (_event, filePath) => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('studio:rename-dataset', async (_event, filePath, newName) => {
    try {
      const dir = path.dirname(filePath)
      const newPath = path.join(dir, newName)
      if (fs.existsSync(newPath)) return { error: 'A dataset with that name already exists.' }
      fs.renameSync(filePath, newPath)
      const stats = fs.statSync(newPath)
      return { path: newPath, name: newName, size: stats.size }
    } catch (err) {
      return { error: err.message }
    }
  })
}

module.exports = { registerDatasetsIpc }
