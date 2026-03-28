import { useState, useEffect } from 'react'
import { useJobs } from '../context/JobsContext'
import JobProgress from '../components/JobProgress'

export default function Dashboard() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const { jobs, liveMetrics } = useJobs()
  const [gpu, setGpu] = useState(null)
  const [models, setModels] = useState([])
  const [setupStatus, setSetupStatus] = useState(null)

  useEffect(() => {
    window.studio?.getGpuInfo().then(setGpu)
    window.studio?.listModels().then(m => setModels(m || []))
    window.studio?.getSetupStatus().then(s => {
      if (!s.ready) setSetupStatus({ stage: 'checking', message: s.message })
    })

    const unsub = window.studio?.onSetupProgress((data) => {
      setSetupStatus(data)
      if (data.stage === 'done') {
        setTimeout(() => setSetupStatus(null), 3000)
      }
    })

    return () => unsub?.()
  }, [])

  const activeJobs = jobs.filter(j => j.status === 'running')
  const completedJobs = jobs.filter(j => j.status === 'completed')

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">{greeting}.</div>
        </div>
      </div>

      {setupStatus && (
        <div style={{
          background: setupStatus.stage === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)',
          border: `1px solid ${setupStatus.stage === 'error' ? 'var(--red, #ef4444)' : 'var(--blue, #6366f1)'}`,
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 20,
          fontSize: 12,
          color: 'var(--text2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {setupStatus.stage !== 'done' && setupStatus.stage !== 'error' && (
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          )}
          {setupStatus.stage === 'done' && <span style={{ color: 'var(--green, #22c55e)' }}>✓</span>}
          {setupStatus.stage === 'error' && <span style={{ color: 'var(--red, #ef4444)' }}>✕</span>}
          <span>{setupStatus.message}</span>
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">ACTIVE JOBS</div>
          <div className="stat-value" style={{ color: activeJobs.length > 0 ? 'var(--amber)' : undefined }}>
            {activeJobs.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">COMPLETED</div>
          <div className="stat-value" style={{ color: completedJobs.length > 0 ? 'var(--green)' : undefined }}>
            {completedJobs.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">MODELS</div>
          <div className="stat-value">{models.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">GPU</div>
          <div className="stat-value" style={{ fontSize: 14 }}>
            {gpu ? `${gpu.chip?.replace('Apple ', '')} ${gpu.memoryGB}GB` : 'Detecting...'}
          </div>
        </div>
      </div>

      {/* Active training jobs */}
      {activeJobs.length > 0 && (
        <>
          <div className="section-title">Active Training</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {activeJobs.map(job => (
              <div key={job.jobId} className="stat-card" style={{ cursor: 'pointer' }}
                onClick={() => window.location.hash = '/jobs'}>
                <JobProgress job={job} metrics={liveMetrics[job.jobId] || []} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Quick Actions</div>
      <div className="launch-grid">
        <button className="launch-card blue" onClick={() => window.location.hash = '/new-job'}>
          <div className="card-icon blue">＋</div>
          <div className="card-title">New Fine-Tune</div>
          <div className="card-desc">Pick a model, upload data, and start training.</div>
        </button>
        <button className="launch-card teal" onClick={() => window.location.hash = '/jobs'}>
          <div className="card-icon teal">◈</div>
          <div className="card-title">View Jobs</div>
          <div className="card-desc">Monitor training progress and view results.</div>
        </button>
        <button className="launch-card green" onClick={() => window.location.hash = '/models'}>
          <div className="card-icon green">◉</div>
          <div className="card-title">Browse Models</div>
          <div className="card-desc">Chat with and export your fine-tuned models.</div>
        </button>
      </div>

      {/* Recent models */}
      {models.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>Recent Models</div>
          <div className="runs-panel">
            {models.slice(0, 5).map(model => (
              <button key={model.jobId} className="run-row" onClick={() => window.location.hash = '/models'}>
                <div className="run-dot" style={{ background: 'var(--green)' }} />
                <div className="run-name">{model.modelName}</div>
                <span className={`method-badge ${model.method === 'QLoRA' ? 'teal' : 'blue'}`} style={{ fontSize: 9 }}>{model.method}</span>
                <div className="run-metric">{model.finalLoss != null ? `loss: ${model.finalLoss.toFixed(4)}` : ''}</div>
                <div className="run-time">{model.createdAt ? new Date(model.createdAt).toLocaleDateString() : ''}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
