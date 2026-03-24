import { useState, useMemo } from 'react'

const USER_HINTS = ['instruction', 'question', 'input', 'prompt', 'user', 'query']
const ASST_HINTS = ['output', 'answer', 'response', 'completion', 'assistant', 'reply']
const SYS_HINTS = ['system', 'system_prompt', 'context']

function guessCol(columns, hints) {
  for (const h of hints) {
    const match = columns.find(c => c.toLowerCase() === h)
    if (match) return match
  }
  for (const h of hints) {
    const match = columns.find(c => c.toLowerCase().includes(h))
    if (match) return match
  }
  return null
}

function guessTemplate(columns) {
  const hasInstruction = columns.find(c => c.toLowerCase().includes('instruction'))
  const hasInput = columns.find(c => c.toLowerCase().includes('input'))
  if (hasInstruction && hasInput) return `{${hasInstruction}}\n\n{${hasInput}}`
  return null
}

function toStr(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function applyMapping(row, mapping) {
  const { userCol, assistantCol, systemCol, useTemplate, template } = mapping
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
}

export default function ConvertDatasetModal({ rows, columns, datasetName, onConvert, onCancel }) {
  const defaultUser = guessCol(columns, USER_HINTS) || columns[0]
  const defaultAsst = guessCol(columns, ASST_HINTS) || columns[Math.min(1, columns.length - 1)]
  const defaultSys = guessCol(columns, SYS_HINTS)
  const defaultTemplate = guessTemplate(columns)

  const [userCol, setUserCol] = useState(defaultUser)
  const [assistantCol, setAssistantCol] = useState(defaultAsst)
  const [systemCol, setSystemCol] = useState(defaultSys || '')
  const [useTemplate, setUseTemplate] = useState(!!defaultTemplate)
  const [template, setTemplate] = useState(defaultTemplate || `{${columns[0]}}`)
  const [converting, setConverting] = useState(false)

  const mapping = { userCol, assistantCol, systemCol: systemCol || null, useTemplate, template }

  const preview = useMemo(() => {
    return rows.slice(0, 3).map(row => applyMapping(row, mapping))
  }, [rows, userCol, assistantCol, systemCol, useTemplate, template])

  const valid = assistantCol && (useTemplate ? template.trim() : userCol)

  const handleConvert = async () => {
    setConverting(true)
    try {
      await onConvert(mapping)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="transform-modal-overlay" onClick={onCancel}>
      <div className="convert-modal" onClick={e => e.stopPropagation()}>
        <div className="convert-modal-title">Convert to Chat Format</div>
        <div className="convert-modal-sub">
          Map columns from <strong>{datasetName}</strong> to chat message roles.
        </div>

        <div className="mapping-section">
          <MappingRow
            label="User message"
            value={userCol}
            onChange={setUserCol}
            columns={columns}
            disabled={useTemplate}
          />
          <MappingRow
            label="Assistant message"
            value={assistantCol}
            onChange={setAssistantCol}
            columns={columns}
          />
          <MappingRow
            label="System prompt"
            value={systemCol}
            onChange={setSystemCol}
            columns={columns}
            optional
          />

          <label className="mapping-checkbox">
            <input
              type="checkbox"
              checked={useTemplate}
              onChange={e => setUseTemplate(e.target.checked)}
            />
            Combine columns for user message
          </label>

          {useTemplate && (
            <div className="mapping-template-wrap">
              <div className="mapping-template-hint">
                Use {'{'}<em>column_name</em>{'}'} placeholders. Available: {columns.map(c => `{${c}}`).join(', ')}
              </div>
              <input
                className="mapping-template"
                value={template}
                onChange={e => setTemplate(e.target.value)}
                placeholder="{instruction}\n\n{input}"
              />
            </div>
          )}
        </div>

        <div className="convert-preview-label">Preview</div>
        <div className="convert-preview">
          {preview.map((row, i) => (
            <div key={i} className="preview-row">
              <div className="preview-row-num">Row {i + 1}</div>
              {row.messages.map((msg, j) => (
                <div key={j} className="preview-message">
                  <span className={`preview-role preview-role-${msg.role}`}>{msg.role}</span>
                  <span className="preview-content">{truncate(msg.content, 120)}</span>
                </div>
              ))}
              {row.messages.length === 0 && (
                <div className="preview-empty">No messages generated</div>
              )}
            </div>
          ))}
        </div>

        <div className="convert-modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleConvert} disabled={!valid || converting}>
            {converting ? 'Converting...' : `Convert ${rows.length} rows`}
          </button>
        </div>
      </div>
    </div>
  )
}

function MappingRow({ label, value, onChange, columns, optional, disabled }) {
  return (
    <div className="mapping-row">
      <label className="mapping-label">{label}{optional && <span className="mapping-opt"> (optional)</span>}</label>
      <select
        className="mapping-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        {optional && <option value="">(none)</option>}
        {columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}
