const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

class GpuDetector {
  constructor() {
    this.info = null
  }

  async detect() {
    if (this.info) return this.info

    try {
      // Get chip info
      const { stdout: spJson } = await execFileAsync('system_profiler', ['SPHardwareDataType', '-json'])
      const hw = JSON.parse(spJson)
      const hwInfo = hw.SPHardwareDataType?.[0] || {}
      const chipName = hwInfo.chip_type || hwInfo.machine_name || 'Unknown'

      // Get total memory
      const { stdout: memOut } = await execFileAsync('sysctl', ['-n', 'hw.memsize'])
      const memBytes = parseInt(memOut.trim())
      const memoryGB = Math.round(memBytes / (1024 * 1024 * 1024))

      // Get GPU core count
      const { stdout: gpuCores } = await execFileAsync('sysctl', ['-n', 'machdep.cpu.core_count']).catch(() => ({ stdout: '0' }))

      this.info = {
        chip: chipName,
        memoryGB,
        cores: parseInt(gpuCores) || 0,
        metal: true, // All Apple Silicon supports Metal
        platform: 'apple-silicon',
      }
    } catch (err) {
      console.error('GPU detection failed:', err.message)
      this.info = {
        chip: 'Unknown',
        memoryGB: 0,
        cores: 0,
        metal: false,
        platform: 'unknown',
        error: err.message,
      }
    }

    return this.info
  }

  async getMemoryPressure() {
    try {
      const { stdout } = await execFileAsync('memory_pressure')
      const match = stdout.match(/System-wide memory free percentage:\s+(\d+)%/)
      if (match) {
        return { freePercent: parseInt(match[1]) }
      }
    } catch {
      // Ignore
    }
    return { freePercent: null }
  }
}

module.exports = { GpuDetector }
