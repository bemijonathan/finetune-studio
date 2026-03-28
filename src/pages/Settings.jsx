import { useState, useEffect } from 'react'
import { useServices } from '../context/ServicesContext'

export default function Settings() {
  const { services } = useServices()
  const [config, setConfig] = useState(null)
  const [gpu, setGpu] = useState(null)

  useEffect(() => {
    window.studio?.getConfig().then(setConfig)
    window.studio?.getGpuInfo().then(setGpu)
  }, [])

  const updateKey = async (key, value) => {
    const updated = await window.studio?.setConfig(key, value)
    if (updated) setConfig(updated)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Configuration and environment.</div>
        </div>
      </div>

      <div className="section-title">Services</div>
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">PYTHON</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--teal)', marginTop: 4 }}>
            {services.pythonPath || 'Not found'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">MLFLOW</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: services.mlflow === 'healthy' ? 'var(--green)' : 'var(--text3)', marginTop: 4 }}>
            {services.mlflow} {services.mlflow === 'healthy' && '— http://127.0.0.1:5000'}
          </div>
        </div>
      </div>

      <div className="section-title">HuggingFace</div>
      <div className="stat-card" style={{ marginBottom: 20 }}>
        <div className="stat-label">ACCESS TOKEN</div>
        <input
          className="settings-input"
          type="password"
          placeholder="hf_..."
          value={config?.hfToken || ''}
          onChange={e => updateKey('hfToken', e.target.value)}
          style={{ marginTop: 8 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          Required for gated models (Llama, Gemma). Get one at huggingface.co/settings/tokens
        </div>
      </div>

      <div className="section-title">Together AI</div>
      <div className="stat-card" style={{ marginBottom: 20 }}>
        <div className="stat-label">API KEY</div>
        <input
          className="settings-input"
          type="password"
          placeholder="sk-..."
          value={config?.togetherApiKey || ''}
          onChange={e => updateKey('togetherApiKey', e.target.value)}
          style={{ marginTop: 8 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          Required for cloud training. Get one at api.together.xyz/settings/api-keys
        </div>
      </div>

      <div className="section-title">GPU</div>
      <div className="stat-card" style={{ marginBottom: 20 }}>
        {gpu ? (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
            <div style={{ color: 'var(--text)', marginBottom: 4 }}>{gpu.chip}</div>
            <div style={{ color: 'var(--text2)' }}>{gpu.memoryGB} GB unified memory</div>
            <div style={{ color: gpu.metal ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
              {gpu.metal ? 'Metal supported' : 'Metal not available'}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--text3)' }}>
            Detecting hardware...
          </div>
        )}
      </div>
    </>
  )
}
