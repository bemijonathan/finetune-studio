import { useState, useEffect } from 'react'
import { useJobs } from '../context/JobsContext'
import JobProgress from '../components/JobProgress'
import SetupBanner from '../components/SetupBanner'

export default function Dashboard() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const { jobs, liveMetrics } = useJobs()
  const [gpu, setGpu] = useState(null)
  const [models, setModels] = useState([])

  useEffect(() => {
    window.studio?.getGpuInfo().then(setGpu)
    window.studio?.listModels().then(m => setModels(m || []))
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

      <SetupBanner />

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
