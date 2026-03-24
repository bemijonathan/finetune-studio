const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')

const execFileAsync = promisify(execFile)

const VENV_DIR = path.join(os.homedir(), '.finetune-studio', 'venv')
const VENV_PYTHON = path.join(VENV_DIR, 'bin', 'python')
const REQUIRED_PACKAGES = ['mlx', 'mlx_lm', 'mlflow', 'huggingface_hub']
const INSTALL_PACKAGES = ['mlx', 'mlx-lm', 'mlflow', 'huggingface_hub']

async function findPython() {
  // Prefer the app's own venv
  if (fs.existsSync(VENV_PYTHON)) {
    try {
      const { stdout } = await execFileAsync(VENV_PYTHON, ['--version'])
      if (stdout.includes('Python 3')) return VENV_PYTHON
    } catch {
      // Fall through
    }
  }

  // Fall back to system Python (but it likely won't have mlx)
  return findSystemPython()
}

async function findSystemPython() {
  // Common Python paths on macOS (Electron doesn't inherit shell PATH)
  // Prefer versioned binaries (3.13 > 3.12 > 3.11 > 3.10) — avoid 3.14+ (mlx compatibility)
  const knownPaths = [
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/opt/homebrew/bin/python3.10',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    path.join(os.homedir(), '.pyenv/shims/python3'),
    path.join(os.homedir(), 'miniconda3/bin/python3'),
    path.join(os.homedir(), 'anaconda3/bin/python3'),
  ]

  for (const p of knownPaths) {
    if (!fs.existsSync(p)) continue
    try {
      const { stdout } = await execFileAsync(p, ['--version'])
      const match = stdout.trim().match(/Python (\d+)\.(\d+)/)
      if (match) {
        const major = parseInt(match[1])
        const minor = parseInt(match[2])
        if (major >= 3 && minor >= 10) return p
      }
    } catch {
      // Try next
    }
  }

  // Fallback: try bare commands (works if dev script uses `unset ELECTRON_RUN_AS_NODE`)
  const candidates = ['python3', 'python']
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ['--version'])
      const match = stdout.trim().match(/Python (\d+)\.(\d+)/)
      if (match) {
        const major = parseInt(match[1])
        const minor = parseInt(match[2])
        if (major >= 3 && minor >= 10) {
          const { stdout: which } = await execFileAsync('which', [cmd])
          return which.trim()
        }
      }
    } catch {
      // Not found, try next
    }
  }
  return null
}

async function checkPackage(pythonPath, packageName) {
  try {
    await execFileAsync(pythonPath, ['-c', `import ${packageName}`])
    return true
  } catch {
    return false
  }
}

async function checkRequiredPackages(pythonPath) {
  const missing = []
  for (const pkg of REQUIRED_PACKAGES) {
    const installed = await checkPackage(pythonPath, pkg)
    if (!installed) missing.push(pkg)
  }
  return missing
}

async function checkSetup() {
  const venvExists = fs.existsSync(VENV_PYTHON)
  const systemPython = await findSystemPython()

  if (!venvExists) {
    return {
      ready: false,
      venvExists: false,
      systemPython,
      missingPackages: INSTALL_PACKAGES,
      message: systemPython
        ? 'Python venv not created yet. Click "Setup Environment" to install.'
        : 'No Python 3.10+ found. Install Python via Homebrew: brew install python@3.13',
    }
  }

  // Venv exists — check packages
  const missing = await checkRequiredPackages(VENV_PYTHON)
  if (missing.length > 0) {
    return {
      ready: false,
      venvExists: true,
      systemPython,
      pythonPath: VENV_PYTHON,
      missingPackages: missing,
      message: `Missing packages: ${missing.join(', ')}. Click "Setup Environment" to install.`,
    }
  }

  return {
    ready: true,
    venvExists: true,
    systemPython,
    pythonPath: VENV_PYTHON,
    missingPackages: [],
    message: 'Environment ready.',
  }
}

function setupEnvironment(onProgress) {
  return new Promise(async (resolve, reject) => {
    const systemPython = await findSystemPython()
    if (!systemPython) {
      return reject(new Error('No Python 3.10+ found. Install Python via Homebrew: brew install python@3.13'))
    }

    onProgress({ stage: 'venv', message: `Creating virtual environment with ${systemPython}...` })

    // Step 1: Create venv if needed
    if (!fs.existsSync(VENV_PYTHON)) {
      try {
        await execFileAsync(systemPython, ['-m', 'venv', VENV_DIR], { timeout: 60000 })
      } catch (err) {
        return reject(new Error(`Failed to create venv: ${err.message}`))
      }
    }

    onProgress({ stage: 'install', message: 'Installing packages (mlx, mlx-lm, mlflow, huggingface_hub)...' })

    // Step 2: Install packages via pip
    const pip = spawn(
      VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', ...INSTALL_PACKAGES],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let output = ''
    pip.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      const lines = text.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && (trimmed.startsWith('Downloading') || trimmed.startsWith('Installing') || trimmed.startsWith('Collecting') || trimmed.startsWith('Successfully'))) {
          onProgress({ stage: 'install', message: trimmed })
        }
      }
    })

    pip.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    pip.on('exit', (code) => {
      if (code === 0) {
        onProgress({ stage: 'done', message: 'Setup complete! All packages installed.' })
        resolve({ success: true })
      } else {
        reject(new Error(`pip install failed (exit code ${code}):\n${output.slice(-500)}`))
      }
    })

    pip.on('error', (err) => {
      reject(new Error(`Failed to run pip: ${err.message}`))
    })
  })
}

module.exports = { findPython, findSystemPython, checkPackage, checkRequiredPackages, checkSetup, setupEnvironment, VENV_PYTHON }
