import { useState } from 'react'

export default function DatasetPreview({ rows }) {
  if (!rows || rows.length === 0) return null

  // Detect format from first row
  const first = rows[0]
  const isChat = 'messages' in first && Array.isArray(first.messages)
  const isCompletions = 'prompt' in first && 'completion' in first
  const isAlpaca = 'instruction' in first && 'output' in first

  if (isChat) return <ChatPreview rows={rows} />
  if (isCompletions) return <CompletionsPreview rows={rows} />
  if (isAlpaca) return <AlpacaPreview rows={rows} />
  return <GenericPreview rows={rows} />
}

function ChatPreview({ rows }) {
  const [expandedRow, setExpandedRow] = useState(null)

  return (
    <div className="dataset-preview-visual">
      {rows.map((row, i) => {
        const msgs = row.messages || []
        const isExpanded = expandedRow === i
        const preview = msgs.map(m => `${m.role}: ${m.content}`).join(' → ')

        return (
          <button
            key={i}
            className={`preview-row-card ${isExpanded ? 'expanded' : ''}`}
            onClick={() => setExpandedRow(isExpanded ? null : i)}
          >
            <div className="preview-row-header">
              <span className="preview-row-num">{i + 1}</span>
              <span className="preview-row-summary">{truncate(preview, 140)}</span>
              <span className="preview-row-badge">{msgs.length} msgs</span>
            </div>
            {isExpanded && (
              <div className="preview-messages">
                {msgs.map((msg, j) => (
                  <div key={j} className={`preview-msg ${msg.role}`}>
                    <span className="preview-msg-role">{msg.role}</span>
                    <span className="preview-msg-content">{msg.content}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CompletionsPreview({ rows }) {
  const [expandedRow, setExpandedRow] = useState(null)

  return (
    <div className="dataset-preview-visual">
      {rows.map((row, i) => {
        const isExpanded = expandedRow === i
        return (
          <button
            key={i}
            className={`preview-row-card ${isExpanded ? 'expanded' : ''}`}
            onClick={() => setExpandedRow(isExpanded ? null : i)}
          >
            <div className="preview-row-header">
              <span className="preview-row-num">{i + 1}</span>
              <span className="preview-row-summary">{truncate(row.prompt, 140)}</span>
            </div>
            {isExpanded && (
              <div className="preview-messages">
                <div className="preview-msg user">
                  <span className="preview-msg-role">prompt</span>
                  <span className="preview-msg-content">{row.prompt}</span>
                </div>
                <div className="preview-msg assistant">
                  <span className="preview-msg-role">completion</span>
                  <span className="preview-msg-content">{row.completion}</span>
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function AlpacaPreview({ rows }) {
  const [expandedRow, setExpandedRow] = useState(null)

  return (
    <div className="dataset-preview-visual">
      {rows.map((row, i) => {
        const isExpanded = expandedRow === i
        return (
          <button
            key={i}
            className={`preview-row-card ${isExpanded ? 'expanded' : ''}`}
            onClick={() => setExpandedRow(isExpanded ? null : i)}
          >
            <div className="preview-row-header">
              <span className="preview-row-num">{i + 1}</span>
              <span className="preview-row-summary">{truncate(row.instruction, 140)}</span>
            </div>
            {isExpanded && (
              <div className="preview-messages">
                <div className="preview-msg system">
                  <span className="preview-msg-role">instruction</span>
                  <span className="preview-msg-content">{row.instruction}</span>
                </div>
                {row.input && (
                  <div className="preview-msg user">
                    <span className="preview-msg-role">input</span>
                    <span className="preview-msg-content">{row.input}</span>
                  </div>
                )}
                <div className="preview-msg assistant">
                  <span className="preview-msg-role">output</span>
                  <span className="preview-msg-content">{row.output}</span>
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function GenericPreview({ rows }) {
  const columns = Object.keys(rows[0])

  return (
    <div className="dataset-preview">
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            {columns.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text3)' }}>{i + 1}</td>
              {columns.map(col => (
                <td key={col} title={typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}>
                  {truncate(typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? ''), 120)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function truncate(val, maxLen = 120) {
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}
