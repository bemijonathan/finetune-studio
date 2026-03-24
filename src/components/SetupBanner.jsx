import { useState, useEffect } from 'react'

export default function SetupBanner() {
  const [setup, setSetup] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    window.studio?.checkSetup().then(setSetup)

    const unsub = window.studio?.onSetupProgress((data) => {
      setProgress(data.message)
      if (data.stage === 'done') {
        setInstalling(false)
        window.studio?.checkSetup().then(setSetup)
      }
    })

    return () => unsub?.()
  }, [])

  const runSetup = async () => {
    setInstalling(true)
    setError(null)
    setProgress('Starting setup...')
    try {
      await window.studio?.runSetup()
    } catch (err) {
      setError(err.message || 'Setup failed')
      setInstalling(false)
    }
  }

  if (!setup || setup.ready) return null

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--amber)',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>
            Python Environment Setup Required
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {setup.message}
          </div>
        </div>
        {!installing && setup.systemPython && (
          <button className="btn btn-primary" onClick={runSetup} style={{ flexShrink: 0 }}>
            Setup Environment
          </button>
        )}
      </div>

      {installing && (
        <div style={{
          fontSize: 11,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--teal)',
          padding: '6px 10px',
          background: 'var(--bg)',
          borderRadius: 6,
          maxHeight: 60,
          overflow: 'hidden',
        }}>
          {progress}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
          {error}
        </div>
      )}
    </div>
  )
}
