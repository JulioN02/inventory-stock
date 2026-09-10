import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { RoleGate } from './RoleGate.tsx'
import { LocaleToggle } from './LocaleToggle.tsx'
import { localizeRole, useTranslation } from '../i18n/index.ts'

export function Layout() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  async function handleLogout(): Promise<void> {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">{t('layout.brand')}</span>
        <nav className="nav">
          <NavLink to="/">{t('layout.nav.dashboard')}</NavLink>
          <RoleGate permission="catalog:read">
            <NavLink to="/products">{t('layout.nav.products')}</NavLink>
          </RoleGate>
          <RoleGate permission="catalog:read">
            <NavLink to="/warehouses">{t('layout.nav.warehouses')}</NavLink>
          </RoleGate>
          <RoleGate permission="movements:read">
            <NavLink to="/movements">{t('layout.nav.movements')}</NavLink>
          </RoleGate>
          <RoleGate permission="audit:read">
            <NavLink to="/audit">{t('layout.nav.audit')}</NavLink>
          </RoleGate>
          <RoleGate permission="users:create">
            <NavLink to="/register">{t('layout.nav.register')}</NavLink>
          </RoleGate>
        </nav>
        <LocaleToggle />
        <div className="session">
          <span className="session-user">
            {user?.username} <em>({user ? localizeRole(user.role, t) : ''})</em>
          </span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            {t('layout.logout')}
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        <Link to="/">{t('layout.back')}</Link>
      </footer>
    </div>
  )
}
