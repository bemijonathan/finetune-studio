import { Routes, Route } from 'react-router-dom'
import { useProject } from './context/ProjectContext'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import Dashboard from './pages/Dashboard'
import NewJob from './pages/NewJob'
import Jobs from './pages/Jobs'
import Datasets from './pages/Datasets'
import Models from './pages/Models'
import Settings from './pages/Settings'

export default function App() {
  const { project, loading } = useProject()

  if (loading) {
    return (
      <div className="welcome-screen">
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  if (!project) {
    return <Welcome />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new-job" element={<NewJob />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/models" element={<Models />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}
