import { useMemo } from 'react'
import { useJobs } from '../context/JobsContext'

export function useTrainingJob(jobId) {
  const { jobs, liveMetrics, stopJob } = useJobs()

  const job = useMemo(() => {
    return jobs.find(j => j.jobId === jobId) || null
  }, [jobs, jobId])

  const metrics = liveMetrics[jobId] || []

  const progress = useMemo(() => {
    if (!metrics.length) return 0
    const last = metrics[metrics.length - 1]
    if (last.total_steps && last.step) {
      return Math.round((last.step / last.total_steps) * 100)
    }
    return 0
  }, [metrics])

  const currentLoss = useMemo(() => {
    const steps = metrics.filter(m => m.event === 'step')
    return steps.length > 0 ? steps[steps.length - 1].loss : null
  }, [metrics])

  const evalLoss = useMemo(() => {
    const evals = metrics.filter(m => m.event === 'eval')
    return evals.length > 0 ? evals[evals.length - 1].eval_loss : null
  }, [metrics])

  return {
    job,
    metrics,
    progress,
    currentLoss,
    evalLoss,
    stopJob: () => stopJob(jobId),
  }
}
