import { createContext, useContext, useState, useEffect } from 'react'

const ServicesContext = createContext({})

export function ServicesProvider({ children }) {
  const [services, setServices] = useState({
    mlflow: 'stopped',
    pythonPath: null,
  })

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
