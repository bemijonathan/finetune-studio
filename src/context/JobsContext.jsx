import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const JobsContext = createContext({})

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState([])
  const [liveMetrics, setLiveMetrics] = useState({}) // jobId -> metrics[]

  // Load jobs on mount
  useEffect(() => {
    window.studio?.listJobs().then(j => setJobs(j || []))
  }, [])

  // Subscribe to live progress
  useEffect(() => {
    const unsubProgress = window.studio?.onJobProgress((data) => {
      const { jobId, ...rest } = data

      if (rest.event === 'step' || rest.event === 'eval') {
        setLiveMetrics(prev => ({
          ...prev,
          [jobId]: [...(prev[jobId] || []), rest],
        }))
      }

      // Update job in list
      setJobs(prev => {
        const idx = prev.findIndex(j => j.jobId === jobId)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], status: 'running', lastMetric: rest }
          return updated
        }
        // New job appeared
        return [{ jobId, status: 'running', lastMetric: rest }, ...prev]
      })
    })

    const unsubComplete = window.studio?.onJobComplete((data) => {
      const { jobId, status, error } = data
      setJobs(prev => prev.map(j =>
        j.jobId === jobId ? { ...j, status, error: error || j.error } : j
      ))
    })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
    }
  }, [])

  const startJob = useCallback(async (config) => {
    const jobId = await window.studio?.startTraining(config)
    // Refresh job list
    const updated = await window.studio?.listJobs()
    if (updated) setJobs(updated)
    return jobId
  }, [])

  const stopJob = useCallback(async (jobId) => {
    await window.studio?.stopTraining(jobId)
  }, [])

  const refreshJobs = useCallback(async () => {
    const updated = await window.studio?.listJobs()
    if (updated) setJobs(updated)
  }, [])

  return (
    <JobsContext.Provider value={{ jobs, liveMetrics, startJob, stopJob, refreshJobs }}>
      {children}
    </JobsContext.Provider>
  )
}

export function useJobs() {
  return useContext(JobsContext)
}
