import { useProject } from '../context/ProjectContext'

export default function Welcome() {
  const { recentProjects, newProject, openProject, openProjectPath } = useProject()

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-logo">
          <div className="logo-mark" style={{ fontSize: 28 }}>◇</div>
          <span className="logo-text" style={{ fontSize: 16 }}>FINETUNE STUDIO</span>
        </div>

        <h2 style={{ margin: '24px 0 6px', fontWeight: 500 }}>Welcome</h2>
        <p style={{ color: 'var(--text3)', fontSize: 13, margin: 0 }}>
          Open a project folder to get started. Each project stores training jobs, datasets, and fine-tuned models.
        </p>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={newProject}>
            + New Project
          </button>
          <button className="welcome-btn" onClick={openProject}>
            Open Existing Folder
          </button>
        </div>

        {recentProjects.length > 0 && (
          <>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)', marginTop: 28, marginBottom: 8 }}>
              Recent Projects
            </div>
            <div className="recent-list">
              {recentProjects.map((rp) => (
                <button
                  key={rp.path}
                  className="recent-project-card"
                  onClick={() => openProjectPath(rp.path)}
                >
                  <div className="recent-name">{rp.name}</div>
                  <div className="recent-path">{rp.path}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
