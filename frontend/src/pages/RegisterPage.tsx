import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import { localizeError, localizeRole, useTranslation } from '../i18n/index.ts'

/** Mirrors the backend REGISTERABLE_ROLES whitelist (operator|viewer|auditor). */
const REGISTERABLE_ROLES = ['operator', 'viewer', 'auditor'] as const

/** Admin-only registration (OQ-3) — server enforces users:create. REG-ROLE: optional role selector. */
export function RegisterPage() {
  const { register } = useAuth()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<string>('viewer')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const user = await register({ username, email, password, role })
      setMessage(
        t('register.success', { username: user.username, role: localizeRole(user.role, t) }),
      )
      setUsername('')
      setEmail('')
      setPassword('')
      setRole('viewer')
    } catch (err) {
      setError(localizeError(err, t))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RoleGate
      permission="users:create"
      fallback={
        <div className="alert alert-error" role="alert">
          {t('register.forbidden')}
        </div>
      }
    >
      <div className="auth-page">
        <form className="card auth-card" onSubmit={handleSubmit}>
          <h1>{t('register.title')}</h1>
          <p className="muted">{t('register.subtitle')}</p>
          {message && (
            <div className="alert alert-success" role="status">
              {message}
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <label>
            {t('register.username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={50}
              required
            />
          </label>
          <label>
            {t('register.email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {t('register.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            {t('register.role')}
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {REGISTERABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {localizeRole(option, t)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t('register.submitting') : t('register.submit')}
          </button>
        </form>
      </div>
    </RoleGate>
  )
}
