import { useState, useRef, useEffect } from 'react'

export default function ChatInterface({ onSend, disabled, loading }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [responding, setResponding] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || disabled || responding) return

    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setResponding(true)

    try {
      // Build full message list with system prompt
      const fullMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...newMessages]
        : newMessages

      const response = await onSend(fullMessages)
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setResponding(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-container">
      {/* System prompt toggle */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border1)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setShowSystem(!showSystem)}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {showSystem ? '▾' : '▸'} System prompt
        </button>
        {systemPrompt && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>set</span>}
        <div style={{ flex: 1 }} />
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Clear
          </button>
        )}
      </div>

      {showSystem && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border1)' }}>
          <textarea
            className="chat-input"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant..."
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
          />
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 60 }}>
            Send a message to start chatting with your fine-tuned model.
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 60 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading model...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {responding && (
          <div className="chat-bubble assistant" style={{ opacity: 0.6 }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Load a model to start chatting...' : 'Type a message...'}
          disabled={disabled || responding}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={disabled || responding || !input.trim()}
          style={{ padding: '10px 20px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
