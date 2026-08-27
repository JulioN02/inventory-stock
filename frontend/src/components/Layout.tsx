import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { RoleGate } from './RoleGate.tsx'

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout(): Promise<void> {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">Inventory &amp; Stock</span>
        <nav className="nav">
          <NavLink to="/">Dashboard</NavLink>
          <RoleGate permission="catalog:read">
            <NavLink to="/products">Products</NavLink>
          </RoleGate>
          <RoleGate permission="catalog:read">
            <NavLink to="/warehouses">Warehouses</NavLink>
          </RoleGate>
          <RoleGate permission="users:create">
            <NavLink to="/register">Register</NavLink>
          </RoleGate>
        </nav>
        <div className="session">
          <span className="session-user">
            {user?.username} <em>({user?.role})</em>
          </span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        <Link to="/">{'← back'}</Link>
      </footer>
    </div>
  )
}