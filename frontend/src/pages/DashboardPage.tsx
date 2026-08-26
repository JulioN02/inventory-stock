import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <section>
      <h1>Dashboard</h1>
      <p>
        Welcome, <strong>{user?.username}</strong> ({user?.role}).
      </p>
      <div className="card-grid">
        <Link className="card" to="/products">
          <h2>Products</h2>
          <p>Catalog master data — SKU, unit, price.</p>
        </Link>
        <Link className="card" to="/warehouses">
          <h2>Warehouses</h2>
          <p>Physical locations holding stock.</p>
        </Link>
      </div>
    </section>
  )
}