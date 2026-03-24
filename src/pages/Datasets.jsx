import { useState, useEffect } from 'react'
import DatasetEditor from '../components/DatasetEditor'
import ConvertDatasetModal from '../components/ConvertDatasetModal'

export default function Datasets() {
  const [datasets, setDatasets] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(null) // dataset to convert

  useEffect(() => { refreshList() }, [])

  const refreshList = async () => {
    setLoading(true)
    const list = await window.studio?.listDatasets()
    setDatasets(list || [])
    setLoading(false)
  }

  const handleUpload = async () => {
    const file = await window.studio?.uploadDataset()
    if (file && !file.error) refreshList()
  }

  const handleDelete = async (ds) => {
    if (!confirm(`Delete "${ds.name}"?`)) return
    await window.studio?.deleteDataset(ds.path)
    refreshList()
  }

  const handleConvert = async (ds) => {
    try {
      const rows = await window.studio?.previewDataset(ds.path, 10)
      if (rows && rows.length > 0) {
        setConverting({ ...ds, rows, columns: Object.keys(rows[0]) })
      }
    } catch (err) {
      console.error('Failed to load dataset for conversion:', err)
    }
  }

  if (editing) {
    return (
      <DatasetEditor
        dataset={editing}
        onClose={() => { setEditing(null); refreshList() }}
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Datasets</div>
          <div className="page-sub">Manage, clean, and transform your training data.</div>
        </div>
        <button className="btn-primary" onClick={handleUpload}>+ Import Dataset</button>
      </div>

      <FormatGuide />

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
      ) : datasets.length === 0 ? (
        <div className="empty-page">
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>☰</div>
          <div style={{ color: 'var(--text3)', marginBottom: 16 }}>No datasets yet</div>
          <button className="btn-primary" onClick={handleUpload}>Import a JSONL or JSON file</button>
        </div>
      ) : (
        <div className="model-grid">
          {datasets.map(ds => (
            <div key={ds.path} className="model-card" style={{ cursor: 'default' }}>
              <div className="model-name">{ds.name}</div>
              <div className="dataset-card-meta">
                <span>{ds.rowCount ?? '?'} rows</span>
                <span>{formatSize(ds.size)}</span>
                <span>{formatDate(ds.modified)}</span>
              </div>
              <DatasetFormatSummary format={ds.format} columns={ds.columns} />
              <div className="dataset-card-actions">
                <button className="btn-xs" onClick={() => setEditing(ds)}>Open Editor</button>
                {ds.format !== 'chat' && ds.format !== 'completions' && ds.format !== 'text' && (
                  <button className="btn-xs convert-btn" onClick={() => handleConvert(ds)}>Convert</button>
                )}
                <button className="btn-xs danger" onClick={() => handleDelete(ds)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {converting && (
        <ConvertDatasetModal
          rows={converting.rows}
          columns={converting.columns}
          datasetName={converting.name}
          onConvert={async (mapping) => {
            try {
              const result = await window.studio?.convertDatasetMapped(converting.path, mapping)
              if (result && !result.error) {
                setConverting(null)
                refreshList()
              } else if (result?.error) {
                alert('Conversion failed: ' + result.error)
              }
            } catch (err) {
              alert('Conversion failed: ' + err.message)
            }
          }}
          onCancel={() => setConverting(null)}
        />
      )}
    </>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const FORMAT_INFO = {
  chat: { label: 'Chat', color: '#4ecdc4', desc: 'messages: [{role, content}]' },
  completions: { label: 'Completions', color: '#ffe66d', desc: 'prompt + completion' },
  text: { label: 'Text', color: '#a8dadc', desc: 'text' },
  unknown: { label: 'Custom', color: '#888', desc: 'Unknown format' },
}

function DatasetFormatSummary({ format, columns }) {
  const info = FORMAT_INFO[format] || FORMAT_INFO.unknown
  const ready = format === 'chat' || format === 'completions' || format === 'text'
  return (
    <div className="dataset-format-summary">
      <span className="format-badge" style={{ background: info.color + '22', color: info.color, borderColor: info.color + '44' }}>
        {info.label}
      </span>
      <span className="format-cols">{(columns || []).join(', ')}</span>
      {!ready && <span className="format-warn">Needs conversion</span>}
    </div>
  )
}

function FormatGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div className="format-guide">
      <button className="format-guide-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Supported formats for fine-tuning
      </button>
      {open && (
        <div className="format-guide-body">
          <div className="format-guide-item">
            <span className="format-badge" style={{ background: '#4ecdc422', color: '#4ecdc4', borderColor: '#4ecdc444' }}>Chat</span>
            <code>{'{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'}</code>
          </div>
          <div className="format-guide-item">
            <span className="format-badge" style={{ background: '#ffe66d22', color: '#ffe66d', borderColor: '#ffe66d44' }}>Completions</span>
            <code>{'{"prompt": "...", "completion": "..."}'}</code>
          </div>
          <div className="format-guide-item">
            <span className="format-badge" style={{ background: '#a8dadc22', color: '#a8dadc', borderColor: '#a8dadc44' }}>Text</span>
            <code>{'{"text": "..."}'}</code>
          </div>
        </div>
      )}
    </div>
  )
}
