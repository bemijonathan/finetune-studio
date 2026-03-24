import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ProjectProvider } from './context/ProjectContext'
import { ServicesProvider } from './context/ServicesContext'
import { JobsProvider } from './context/JobsContext'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ProjectProvider>
        <ServicesProvider>
          <JobsProvider>
            <App />
          </JobsProvider>
        </ServicesProvider>
      </ProjectProvider>
    </HashRouter>
  </React.StrictMode>
)
