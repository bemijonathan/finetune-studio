export default function JobProgress({ job, metrics = [] }) {
  const steps = metrics.filter(m => m.event === 'step')
  const last = steps[steps.length - 1]
  const totalSteps = last?.total_steps || 0
  const currentStep = last?.step || 0
  const progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0
  const currentLoss = last?.loss

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--text2)' }}>
          {job?.config?.model_id?.split('/').pop() || 'Training'}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--teal)' }}>
          {progress}%
        </span>
      </div>
      <div className="progress-bar" style={{ marginBottom: 6 }}>
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
        <span style={{ color: 'var(--text3)' }}>
          Step {currentStep}{totalSteps ? ` / ${totalSteps}` : ''}
        </span>
        {currentLoss != null && (
          <span style={{ color: 'var(--accent)' }}>
            loss: {currentLoss.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  )
}
