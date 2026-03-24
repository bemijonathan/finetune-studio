import { useState, useEffect, useRef, useCallback } from 'react'
import ColumnTransformModal from './ColumnTransformModal'
import ConvertDatasetModal from './ConvertDatasetModal'

export default function DatasetEditor({ dataset, onClose }) {
  const [rows, setRows] = useState([])
  const [columns, setColumns] = useState([])
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingCell, setEditingCell] = useState(null) // {rowIdx, col}
  const [editValue, setEditValue] = useState('')
  const [openMenu, setOpenMenu] = useState(null) // column name or null
  const [transformModal, setTransformModal] = useState(null) // {type, col}
  const [showConvert, setShowConvert] = useState(false)
  const [datasetRef, setDatasetRef] = useState(dataset) // track current file info

  useEffect(() => {
    loadData()
  }, [dataset.path])

  const loadData = async () => {
    setLoading(true)
    const data = await window.studio?.previewDataset(dataset.path, 0)
    if (data && data.length > 0) {
      setRows(data)
      setColumns(Object.keys(data[0]))
    }
    setLoading(false)
  }

  // Close menus on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])

  const markDirty = useCallback((newRows, newCols) => {
    setRows(newRows)
    if (newCols) setColumns(newCols)
    setDirty(true)
  }, [])

  // --- Cell editing ---
  const startEdit = (rowIdx, col) => {
    const val = rows[rowIdx][col]
    const str = typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val ?? '')
    setEditingCell({ rowIdx, col })
    setEditValue(str)
  }

  const commitEdit = () => {
    if (!editingCell) return
    const { rowIdx, col } = editingCell
    const oldVal = rows[rowIdx][col]
    let newVal = editValue

    // Try to parse JSON for object fields
    if (typeof oldVal === 'object' && oldVal !== null) {
      try { newVal = JSON.parse(editValue) } catch { newVal = editValue }
    }

    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      const updated = [...rows]
      updated[rowIdx] = { ...updated[rowIdx], [col]: newVal }
      markDirty(updated)
    }
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') cancelEdit()
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
  }

  // --- Row operations ---
  const addRow = () => {
    const empty = {}
    columns.forEach(c => empty[c] = '')
    markDirty([...rows, empty])
  }

  const deleteRow = (idx) => {
    markDirty(rows.filter((_, i) => i !== idx))
  }

  // --- Column transforms ---
  const handleColumnAction = (col, action) => {
    setOpenMenu(null)

    if (action === 'rename') {
      setTransformModal({ type: 'rename', col })
    } else if (action === 'find-replace') {
      setTransformModal({ type: 'find-replace', col })
    } else if (action === 'trim') {
      const updated = rows.map(row => {
        const val = row[col]
        return { ...row, [col]: typeof val === 'string' ? val.trim() : val }
      })
      markDirty(updated)
    } else if (action === 'delete') {
      const newCols = columns.filter(c => c !== col)
      const updated = rows.map(row => {
        const { [col]: _, ...rest } = row
        return rest
      })
      markDirty(updated, newCols)
    } else if (action === 'duplicate') {
      const newName = `${col}_copy`
      const newCols = [...columns, newName]
      const updated = rows.map(row => ({ ...row, [newName]: row[col] }))
      markDirty(updated, newCols)
    }
  }

  const handleTransformApply = (result) => {
    const { col } = transformModal

    if (transformModal.type === 'rename') {
      const { newName } = result
      const newCols = columns.map(c => c === col ? newName : c)
      const updated = rows.map(row => {
        const newRow = {}
        for (const c of columns) {
          newRow[c === col ? newName : c] = row[c]
        }
        return newRow
      })
      markDirty(updated, newCols)
    } else if (transformModal.type === 'find-replace') {
      const { find, replace, useRegex } = result
      const updated = rows.map(row => {
        const val = row[col]
        if (typeof val !== 'string') return row
        try {
          const replaced = useRegex
            ? val.replace(new RegExp(find, 'g'), replace)
            : val.split(find).join(replace)
          return { ...row, [col]: replaced }
        } catch {
          return row
        }
      })
      markDirty(updated)
    }

    setTransformModal(null)
  }

  // --- Save ---
  const handleSave = async () => {
    setSaving(true)
    const result = await window.studio?.saveDataset(datasetRef.path, rows)
    if (result && !result.error) setDirty(false)
    setSaving(false)
  }

  const handleSaveAs = async () => {
    setSaving(true)
    const base = datasetRef.name.replace(/\.(jsonl|json)$/, '')
    const result = await window.studio?.saveDatasetAs(rows, `${base}_cleaned.jsonl`)
    if (result && !result.error) {
      setDatasetRef({ path: result.path, name: result.name, size: result.size })
      setDirty(false)
    }
    setSaving(false)
  }

  const handleClose = () => {
    if (dirty && !confirm('You have unsaved changes. Discard?')) return
    onClose()
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text3)', fontSize: 13, padding: 40 }}>Loading dataset...</div>
    )
  }

  return (
    <>
      <button className="back-link" onClick={handleClose}>← Back to datasets</button>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="page-title">{datasetRef.name}</div>
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
      </div>

      <DatasetSummaryBar rows={rows} columns={columns} onConvert={() => setShowConvert(true)} />

      <div className="editor-toolbar">
        <div className="editor-toolbar-left">
          <button className="btn-xs" onClick={addRow}>+ Add Row</button>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {rows.length} rows · {columns.length} columns
          </span>
        </div>
        <div className="editor-toolbar-right">
          <button className="btn-secondary" onClick={handleSaveAs} disabled={saving} style={{ fontSize: 12, padding: '5px 12px' }}>
            Save As
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty} style={{ fontSize: 12, padding: '5px 12px' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="dataset-editor-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              {columns.map(col => (
                <th key={col}>
                  <div className="col-header-wrapper">
                    <div className="col-header">
                      <span>{col}</span>
                      <button
                        className="col-menu-btn"
                        onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === col ? null : col) }}
                      >▾</button>
                    </div>
                    {openMenu === col && (
                      <div className="col-dropdown" onClick={e => e.stopPropagation()}>
                        <button className="col-dropdown-item" onClick={() => handleColumnAction(col, 'rename')}>Rename</button>
                        <button className="col-dropdown-item" onClick={() => handleColumnAction(col, 'trim')}>Trim Whitespace</button>
                        <button className="col-dropdown-item" onClick={() => handleColumnAction(col, 'find-replace')}>Find & Replace</button>
                        <button className="col-dropdown-item" onClick={() => handleColumnAction(col, 'duplicate')}>Duplicate</button>
                        <div className="col-dropdown-divider" />
                        <button className="col-dropdown-item danger" onClick={() => handleColumnAction(col, 'delete')}>Delete Column</button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="row-num-cell">{rowIdx + 1}</td>
                {columns.map(col => {
                  const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.col === col
                  const val = row[col]
                  const display = typeof val === 'object' && val !== null
                    ? JSON.stringify(val)
                    : String(val ?? '')

                  return (
                    <td
                      key={col}
                      className={isEditing ? 'editing' : ''}
                      onClick={() => !isEditing && startEdit(rowIdx, col)}
                    >
                      {isEditing ? (
                        <textarea
                          className="cell-edit-input"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={commitEdit}
                          autoFocus
                          rows={editValue.split('\n').length > 3 ? 5 : 2}
                        />
                      ) : (
                        <span className="cell-truncated" title={display}>{display}</span>
                      )}
                    </td>
                  )
                })}
                <td className="row-actions-cell">
                  <button className="row-delete-btn" onClick={() => deleteRow(rowIdx)} title="Delete row">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {transformModal && (
        <ColumnTransformModal
          type={transformModal.type}
          column={transformModal.col}
          rows={rows}
          onApply={handleTransformApply}
          onCancel={() => setTransformModal(null)}
        />
      )}

      {showConvert && (
        <ConvertDatasetModal
          rows={rows.slice(0, 10)}
          columns={columns}
          datasetName={datasetRef.name}
          onConvert={async (mapping) => {
            try {
              const result = await window.studio?.convertDatasetMapped(datasetRef.path, mapping)
              if (result && !result.error) {
                setShowConvert(false)
                onClose()
              } else if (result?.error) {
                alert('Conversion failed: ' + result.error)
              }
            } catch (err) {
              alert('Conversion failed: ' + err.message)
            }
          }}
          onCancel={() => setShowConvert(false)}
        />
      )}
    </>
  )
}

function DatasetSummaryBar({ rows, columns, onConvert }) {
  if (!rows.length) return null

  const sample = rows[0]
  let format = 'unknown'
  let hint = null
  if (sample.messages && Array.isArray(sample.messages)) {
    format = 'chat'
  } else if ('prompt' in sample && 'completion' in sample) {
    format = 'completions'
  } else if ('text' in sample) {
    format = 'text'
  } else {
    hint = 'Not ready for training.'
  }

  const formatLabels = { chat: 'Chat', completions: 'Completions', text: 'Text', unknown: 'Custom' }
  const formatColors = { chat: '#4ecdc4', completions: '#ffe66d', text: '#a8dadc', unknown: '#888' }
  const color = formatColors[format]

  // Column type summary
  const colTypes = columns.map(col => {
    const val = sample[col]
    let type = typeof val
    if (Array.isArray(val)) type = 'array'
    else if (val === null) type = 'null'
    return { col, type }
  })

  return (
    <div className="dataset-summary-bar">
      <div className="dataset-summary-format">
        <span className="format-badge" style={{ background: color + '22', color, borderColor: color + '44' }}>
          {formatLabels[format]}
        </span>
        <span className="dataset-summary-cols">
          {colTypes.map(({ col, type }) => (
            <span key={col} className="col-type-tag">
              <strong>{col}</strong>
              <span className="col-type-label">{type}</span>
            </span>
          ))}
        </span>
      </div>
      {hint && (
        <div className="dataset-summary-hint">
          {hint}
          {onConvert && <button className="btn-xs convert-btn" onClick={onConvert}>Convert to Chat</button>}
        </div>
      )}
    </div>
  )
}
