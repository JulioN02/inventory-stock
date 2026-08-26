import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ApiClientError } from '../api/client.ts'
import { RoleGate } from '../components/RoleGate.tsx'

/** Admin-only registration (OQ-3) — server enforces users:create. */
export function RegisterPage() {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      await register({ username, email, password })
      setMessage(`User '${username}' created (default role: viewer).`)
      setUsername('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RoleGate permission="users:create" fallback={<div className="alert alert-error">Forbidden: admin only.</div>}>
      <div className="auth-page">
        <form className="card auth-card" onSubmit={handleSubmit}>
          <h1>Register user</h1>
          <p className="muted">New users get the default viewer role.</p>
          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={50}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </div>
    </RoleGate>
  )
}