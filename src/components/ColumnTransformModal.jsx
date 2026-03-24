import { useState, useEffect, useRef } from 'react'

export default function ColumnTransformModal({ type, column, rows, onApply, onCancel }) {
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  if (type === 'rename') return <RenameModal column={column} onApply={onApply} onCancel={onCancel} inputRef={inputRef} />
  if (type === 'find-replace') return <FindReplaceModal column={column} rows={rows} onApply={onApply} onCancel={onCancel} inputRef={inputRef} />
  return null
}

function RenameModal({ column, onApply, onCancel, inputRef }) {
  const [name, setName] = useState(column)

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed && trimmed !== column) onApply({ newName: trimmed })
  }

  return (
    <div className="transform-modal-overlay" onClick={onCancel}>
      <form className="transform-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Rename Column</h3>
        <div className="modal-field">
          <label>Column Name</label>
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || name.trim() === column}>Rename</button>
        </div>
      </form>
    </div>
  )
}

function FindReplaceModal({ column, rows, onApply, onCancel, inputRef }) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [useRegex, setUseRegex] = useState(false)

  const matchCount = (() => {
    if (!find) return 0
    let count = 0
    for (const row of rows) {
      const val = typeof row[column] === 'string' ? row[column] : ''
      try {
        if (useRegex) {
          if (new RegExp(find).test(val)) count++
        } else {
          if (val.includes(find)) count++
        }
      } catch { /* invalid regex */ }
    }
    return count
  })()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!find) return
    onApply({ find, replace, useRegex })
  }

  return (
    <div className="transform-modal-overlay" onClick={onCancel}>
      <form className="transform-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Find & Replace in "{column}"</h3>
        <div className="modal-field">
          <label>Find</label>
          <input ref={inputRef} value={find} onChange={e => setFind(e.target.value)} placeholder="Search text or pattern..." />
        </div>
        <div className="modal-field">
          <label>Replace With</label>
          <input value={replace} onChange={e => setReplace(e.target.value)} placeholder="Replacement text..." />
        </div>
        <label className="modal-check">
          <input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} />
          Use regular expression
        </label>
        {find && (
          <div style={{ fontSize: 11, color: matchCount > 0 ? 'var(--green)' : 'var(--text3)', marginBottom: 8 }}>
            {matchCount} row{matchCount !== 1 ? 's' : ''} will be affected
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!find || matchCount === 0}>Replace All</button>
        </div>
      </form>
    </div>
  )
}
