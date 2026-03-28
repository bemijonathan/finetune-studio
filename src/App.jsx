import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import NewJob from './pages/NewJob'
import Jobs from './pages/Jobs'
import Datasets from './pages/Datasets'
import Models from './pages/Models'
import Settings from './pages/Settings'

export default function App() {
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
