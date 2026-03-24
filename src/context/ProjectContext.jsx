import { createContext, useContext, useState, useEffect } from 'react'

const ProjectContext = createContext({})

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(null)
  const [recentProjects, setRecentProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial state
    Promise.all([
      window.studio?.getProject(),
      window.studio?.getRecentProjects(),
    ]).then(([proj, recent]) => {
      if (proj) setProject(proj)
      if (recent) setRecentProjects(recent)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    // Listen for project changes
    const unsub = window.studio?.onProjectChanged((info) => {
      setProject(info)
      window.studio?.getRecentProjects().then(r => {
        if (r) setRecentProjects(r)
      })
    })

    return () => unsub?.()
  }, [])

  const openProject = async () => {
    try {
      const info = await window.studio?.openProject()
      if (info) setProject(info)
    } catch (err) {
      console.error('Failed to open project:', err)
    }
  }

  const openProjectPath = async (projectPath) => {
    try {
      const info = await window.studio?.openProjectPath(projectPath)
      if (info) setProject(info)
    } catch (err) {
      console.error('Failed to open project:', err)
    }
  }

  const newProject = async () => {
    try {
      const info = await window.studio?.newProject()
      if (info) setProject(info)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  return (
    <ProjectContext.Provider value={{ project, recentProjects, loading, openProject, openProjectPath, newProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  return useContext(ProjectContext)
}
