import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiClientError } from '../api/client.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import type { LowStockItem, StockItem } from '../types.ts'

const LOW_STOCK_THRESHOLD = 5

/**
 * Dashboard v1 (T2-11): derived stock table + low-stock, straight from the
 * movements API (movements:read). Stock is NEVER computed client-side — the
 * server derives it via SQL SUM over the ledger (MOV-4/MOV-7); numerics are
 * strings (no float drift).
 */
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

      <RoleGate
        permission="movements:read"
        fallback={<p className="muted">No stock visibility for this role.</p>}
      >
        <StockSection />
      </RoleGate>
    </section>
  )
}

function StockSection() {
  const [stock, setStock] = useState<StockItem[]>([])
  const [low, setLow] = useState<LowStockItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [stockData, lowData] = await Promise.all([
        api.get<{ items: StockItem[] }>('/api/stock'),
        api.get<{ items: LowStockItem[] }>(`/api/stock/low?threshold=${LOW_STOCK_THRESHOLD}`),
      ])
      setStock(stockData.items)
      setLow(lowData.items)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load stock')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <p className="muted">Loading stock…</p>

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <h2>Stock levels</h2>
      <p className="muted small">
        Derived from the movement ledger (SQL SUM) — never stored. String numerics, scale 1.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Warehouse</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((row) => (
            <tr key={`${row.product_id}:${row.warehouse_id}`}>
              <td>{row.sku}</td>
              <td>{row.name}</td>
              <td>{row.warehouse_code}</td>
              <td>{row.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Low stock (below {LOW_STOCK_THRESHOLD})</h2>
      {low.length === 0 ? (
        <p className="muted">Nothing below the threshold.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {low.map((row) => (
              <tr key={row.product_id}>
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td>{row.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}