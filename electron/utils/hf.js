const https = require('https')

const HF_API = 'https://huggingface.co/api'

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(new Error(`Failed to parse response from ${url}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
  })
}

async function searchModels(query, opts = {}) {
  const { limit = 20 } = opts
  const params = new URLSearchParams({
    search: query,
    library: 'mlx',
    sort: 'downloads',
    direction: '-1',
    limit: String(limit),
  })

  const url = `${HF_API}/models?${params}`
  const results = await fetchJson(url)

  return results.map(m => ({
    id: m.modelId || m.id,
    name: (m.modelId || m.id).split('/').pop(),
    author: (m.modelId || m.id).split('/')[0],
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    lastModified: m.lastModified,
    pipeline_tag: m.pipeline_tag,
    tags: m.tags || [],
  }))
}

async function getModelInfo(modelId) {
  const url = `${HF_API}/models/${modelId}`
  const info = await fetchJson(url)

  // Estimate size from siblings
  let sizeBytes = 0
  if (info.siblings) {
    for (const file of info.siblings) {
      if (file.size) sizeBytes += file.size
    }
  }

  // Try to extract param count from tags or name
  let paramCount = null
  const paramMatch = modelId.match(/(\d+\.?\d*)[bB]/)
  if (paramMatch) {
    paramCount = parseFloat(paramMatch[1])
  }

  return {
    id: info.modelId || info.id,
    name: (info.modelId || info.id).split('/').pop(),
    author: (info.modelId || info.id).split('/')[0],
    downloads: info.downloads || 0,
    likes: info.likes || 0,
    pipeline_tag: info.pipeline_tag,
    tags: info.tags || [],
    lastModified: info.lastModified,
    sizeBytes,
    sizeGB: sizeBytes ? (sizeBytes / (1024 * 1024 * 1024)).toFixed(1) : null,
    paramCount,
    config: info.config || {},
  }
}

function estimateMemory(paramCount, quantization = '4bit') {
  if (!paramCount) return null
  // Rough estimates: params * bytes_per_param + overhead
  const bytesPerParam = quantization === '4bit' ? 0.5 : quantization === '8bit' ? 1 : 2
  const modelGB = (paramCount * 1e9 * bytesPerParam) / (1024 * 1024 * 1024)
  const overheadGB = 1.5 // LoRA overhead + working memory
  return Math.ceil((modelGB + overheadGB) * 10) / 10
}

module.exports = { searchModels, getModelInfo, estimateMemory }
