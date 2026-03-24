import { createContext, useContext, useState, useEffect } from 'react'
import { useProject } from './ProjectContext'

const ServicesContext = createContext({})

export function ServicesProvider({ children }) {
  const [services, setServices] = useState({
    mlflow: 'stopped',
    pythonPath: null,
  })
  const { project } = useProject()

  useEffect(() => {
    if (project) {
      setServices(prev => ({ ...prev, mlflow: 'starting' }))
    }
  }, [project?.path])

  useEffect(() => {
    window.studio?.getServiceStatus().then(s => {
      if (s && Object.keys(s).length > 0) setServices(s)
    })

    const unsub = window.studio?.onServiceStatus((statuses) => {
      setServices(statuses)
    })

    return () => unsub?.()
  }, [])

  return (
    <ServicesContext.Provider value={{ services }}>
      {children}
    </ServicesContext.Provider>
  )
}

export function useServices() {
  return useContext(ServicesContext)
}
