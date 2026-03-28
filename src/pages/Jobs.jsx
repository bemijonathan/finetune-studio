import { useState, useEffect } from 'react'
import { useJobs } from '../context/JobsContext'
import LossChart from '../components/LossChart'

const STATUS_COLORS = {
  running: 'var(--amber)',
  completed: 'var(--green)',
  failed: 'var(--red)',
  cancelled: 'var(--text3)',
}

export default function Jobs() {
  const { jobs, liveMetrics, stopJob, refreshJobs } = useJobs()
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [detailMetrics, setDetailMetrics] = useState([])

  useEffect(() => { refreshJobs() }, [refreshJobs])

  useEffect(() => {
    if (!selectedJobId) { setDetailMetrics([]); return }
    const live = liveMetrics[selectedJobId]
    if (live && live.length > 0) {
      setDetailMetrics(live)
    } else {
      window.studio?.getJobMetrics(selectedJobId).then(m => setDetailMetrics(m || []))
    }
  }, [selectedJobId, liveMetrics])

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)
  const selectedJob = jobs.find(j => j.jobId === selectedJobId)
  const selectedMetrics = liveMetrics[selectedJobId]?.length > 0 ? liveMetrics[selectedJobId] : detailMetrics

  if (selectedJob) {
    return <JobDetail job={selectedJob} metrics={selectedMetrics} onBack={() => setSelectedJobId(null)} onStop={stopJob} />
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Training Jobs</div>
          <div className="page-sub">All fine-tuning jobs.</div>
        </div>
        <a href="#/new-job" className="btn-primary" style={{ textDecoration: 'none' }}>+ New Job</a>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-page">
          <div className="empty-icon">◈</div>
          <div className="empty-title">No training jobs yet</div>
          <div className="empty-desc">Create your first fine-tuning job to get started.</div>
          <a href="#/new-job" className="btn-primary" style={{ textDecoration: 'none', marginTop: 8 }}>+ New Job</a>
        </div>
      ) : (
        <>
          <div className="filter-chips">
            {['all', 'running', 'completed', 'failed', 'cancelled'].map(f => (
              <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${jobs.filter(j => j.status === f).length})`}
              </button>
            ))}
          </div>

          <div className="jobs-list">
            {filtered.map(job => {
              const modelName = job.config?.model_id?.split('/').pop() || '—'
              const jobLabel = job.jobId.replace(/^job_\d+_/, '')
              const loss = job.lastMetric?.loss != null ? job.lastMetric.loss.toFixed(4) : null

              return (
                <button key={job.jobId} className="job-row" onClick={() => setSelectedJobId(job.jobId)}>
                  <div className="job-row-dot">
                    <div className="run-dot" style={{ background: STATUS_COLORS[job.status] || 'var(--text3)' }} />
                  </div>
                  <div className="job-row-info">
                    <div className="job-row-name">{modelName}</div>
                    <div className="job-row-id">{jobLabel}</div>
                  </div>
                  <div className="job-row-status">
                    <span className={`status-badge ${job.status}`}>{job.status}</span>
                    {job.config?.runtime === 'cloud' && <span className="method-badge teal" style={{ marginLeft: 6 }}>cloud</span>}
                  </div>
                  <div className="job-row-loss">
                    {loss ? (
                      <span className="job-loss-value">{loss}</span>
                    ) : (
                      <span className="job-loss-empty">—</span>
                    )}
                    <span className="job-loss-label">loss</span>
                  </div>
                  <div className="job-row-progress">
                    {job.status === 'running' ? (
                      <JobProgressMini metrics={liveMetrics[job.jobId] || []} />
                    ) : job.status === 'completed' ? (
                      <span className="job-progress-done">100%</span>
                    ) : job.status === 'failed' && job.error ? (
                      <span className="job-progress-error" title={job.error}>
                        {job.error.split('\n')[0].slice(0, 30)}
                      </span>
                    ) : (
                      <span className="job-progress-idle">—</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="jobs-empty-filter">
              No {filter} jobs found.
            </div>
          )}
        </>
      )}
    </>
  )
}

function JobProgressMini({ metrics }) {
  const steps = metrics.filter(m => m.event === 'step')
  const last = steps[steps.length - 1]
  const total = last?.total_steps || 0
  const current = last?.step || 0
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="job-progress-mini">
      <div className="progress-bar" style={{ flex: 1, height: 3 }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="job-progress-pct">{pct}%</span>
    </div>
  )
}

function JobDetail({ job, metrics, onBack, onStop }) {
  const [log, setLog] = useState(null)
  const [showLog, setShowLog] = useState(false)

  const steps = metrics.filter(m => m.event === 'step')
  const evals = metrics.filter(m => m.event === 'eval')
  const lastStep = steps[steps.length - 1]
  const lastEval = evals[evals.length - 1]
  const totalSteps = lastStep?.total_steps || 0
  const currentStep = lastStep?.step || 0
  const progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : job.status === 'completed' ? 100 : 0

  const elapsed = job.endTime
    ? formatDuration(job.endTime - job.startTime)
    : job.startTime
      ? formatDuration(Date.now() - job.startTime)
      : '—'

  const tokensPerSec = lastStep?.tokens_per_sec
  const peakMem = lastStep?.peak_mem_gb

  const viewLog = async () => {
    if (!log) {
      const content = await window.studio?.getJobLog(job.jobId)
      setLog(content || 'No log available.')
    }
    setShowLog(!showLog)
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to jobs</button>

      <div className="page-header">
        <div>
          <div className="job-detail-title">
            {job.config?.model_id?.split('/').pop() || job.jobId}
            <span className={`status-badge ${job.status}`}>{job.status}</span>
          </div>
          <div className="job-detail-id">{job.jobId}</div>
        </div>
        <div className="job-detail-actions">
          <button className="btn-secondary" onClick={viewLog}>
            {showLog ? 'Hide Log' : 'View Log'}
          </button>
          {job.status === 'running' && (
            <button className="btn-danger" onClick={() => onStop(job.jobId)}>
              Stop Training
            </button>
          )}
        </div>
      </div>

      {/* Progress bar for running jobs */}
      {job.status === 'running' && (
        <div className="job-detail-progress">
          <div className="job-detail-progress-info">
            <span>Step {currentStep}{totalSteps ? ` / ${totalSteps}` : ''}</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar" style={{ height: 6 }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {job.status === 'failed' && job.error && (
        <div className="job-error-banner">
          <div className="job-error-title">Error</div>
          <pre className="job-error-text">{job.error}</pre>
        </div>
      )}

      {/* Log viewer */}
      {showLog && (
        <div className="job-log-viewer">
          <pre className="job-log-text">{log || 'Loading...'}</pre>
        </div>
      )}

      {/* Metrics cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">PROGRESS</div>
          <div className="metric-value" style={{ color: 'var(--teal)' }}>{progress}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">TRAIN LOSS</div>
          <div className="metric-value" style={{ color: 'var(--accent)' }}>
            {lastStep?.loss != null ? lastStep.loss.toFixed(4) : '—'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">EVAL LOSS</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>
            {lastEval?.eval_loss != null ? lastEval.eval_loss.toFixed(4) : '—'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">STEP</div>
          <div className="metric-value">
            {currentStep}{totalSteps ? ` / ${totalSteps}` : ''}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">TOKENS/SEC</div>
          <div className="metric-value" style={{ color: 'var(--amber)' }}>
            {tokensPerSec != null ? tokensPerSec.toFixed(1) : '—'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">ELAPSED</div>
          <div className="metric-value">{elapsed}</div>
        </div>
      </div>

      {/* Loss chart */}
      <LossChart metrics={metrics} />

      {/* Config details */}
      <div className="section-title" style={{ marginTop: 8 }}>Configuration</div>
      <div className="detail-table">
        <div className="detail-table-header">
          <span>Parameter</span>
          <span>Value</span>
        </div>
        {[
          ['Runtime', job.config?.runtime === 'cloud' ? 'Cloud (Together AI)' : 'Local (MLX)'],
          ['Model', job.config?.model_id],
          ['Method', job.config?.use_qlora ? 'QLoRA' : 'LoRA'],
          ['LoRA Rank', job.config?.lora_rank],
          ['LoRA Alpha', job.config?.lora_alpha],
          ['Learning Rate', job.config?.learning_rate],
          ['Epochs', job.config?.epochs],
          ['Batch Size', job.config?.batch_size],
          ['Max Seq Length', job.config?.max_seq_length],
          ['Dataset', job.config?.dataset_path?.split('/').pop()],
        ].filter(([, v]) => v != null).map(([key, val]) => (
          <div key={key} className="detail-table-row">
            <span className="detail-key">{key}</span>
            <span className="detail-value">{String(val)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m`
}
