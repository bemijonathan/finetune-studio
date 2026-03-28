import { NavLink } from 'react-router-dom'
import { useServices } from '../context/ServicesContext'
import GpuStatus from './GpuStatus'

const navItems = [
  { to: '/', icon: '⊞', label: 'Dashboard' },
  { to: '/new-job', icon: '＋', label: 'New Job' },
  { to: '/datasets', icon: '▤', label: 'Datasets' },
  { to: '/jobs', icon: '◈', label: 'Jobs' },
  { to: '/models', icon: '◉', label: 'Models' },
]

export default function Layout({ children }) {
  const { services } = useServices()

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-left drag-region">
          <NavLink to="/" className="logo no-drag">
            <div className="logo-mark">◇</div>
            <span className="logo-text">FINETUNE STUDIO</span>
          </NavLink>
        </div>
        <div className="topbar-right no-drag">
          <div className="svc-pills-inline">
            <GpuStatus />
            <ServicePill name="mlflow" status={services.mlflow} />
          </div>
          <span className="topbar-tag">v0.1.0</span>
        </div>
      </header>

      <nav className="sidebar">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={item.label}
          >
            {item.icon}
          </NavLink>
        ))}
        <div className="nav-spacer" />
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Settings"
        >
          ⚙
        </NavLink>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

function ServicePill({ name, status }) {
  const dotClass = status === 'healthy' ? 'dot-green'
    : status === 'starting' ? 'dot-amber'
      : status === 'error' ? 'dot-red'
        : 'dot-dim'

  return (
    <div className="svc-pill" title={`${name}: ${status}`}>
      <div className={`dot ${dotClass}`} />
      {name}
    </div>
  )
}
