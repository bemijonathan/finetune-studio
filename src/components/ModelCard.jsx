import { useState } from 'react'

export default function ModelCard({ model, onChat }) {
  const [exporting, setExporting] = useState(false)
  const [merging, setMerging] = useState(false)
  const date = model.createdAt ? new Date(model.createdAt).toLocaleDateString() : '—'

  const handleExport = async () => {
    setExporting(true)
    try {
      const dest = await window.studio?.exportAdapter(model.adapterPath)
      if (dest) alert(`Adapter exported to ${dest}`)
    } catch (err) {
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleMerge = async () => {
    setMerging(true)
    try {
      const result = await window.studio?.mergeModel(model.modelId, model.adapterPath)
      if (result) alert(`Model merged to ${result.output_path}`)
    } catch (err) {
      alert('Merge failed: ' + err.message)
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="model-card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div className="model-name" style={{ flex: 1 }}>{model.modelName}</div>
        <span className={`method-badge ${model.method === 'QLoRA' ? 'teal' : 'blue'}`}>{model.method}</span>
      </div>

      <div className="model-meta" style={{ marginBottom: 4 }}>{model.modelId}</div>

      <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>
        {model.finalLoss != null && (
          <span style={{ color: 'var(--accent)' }}>loss: {model.finalLoss.toFixed(4)}</span>
        )}
        {model.loraRank && (
          <span style={{ color: 'var(--text3)' }}>rank: {model.loraRank}</span>
        )}
        <span style={{ color: 'var(--text3)' }}>{date}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => onChat(model)} style={{ padding: '6px 16px', fontSize: 12 }}>
          Chat
        </button>
        <button className="btn-secondary" onClick={handleExport} disabled={exporting} style={{ padding: '6px 12px', fontSize: 12 }}>
          {exporting ? 'Exporting...' : 'Export'}
        </button>
        <button className="btn-secondary" onClick={handleMerge} disabled={merging} style={{ padding: '6px 12px', fontSize: 12 }}>
          {merging ? 'Merging...' : 'Merge'}
        </button>
      </div>
    </div>
  )
}
