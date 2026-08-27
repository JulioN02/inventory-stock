import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api/client.ts'
import { RoleGate } from '../components/RoleGate.tsx'
import type { ListResult, Warehouse } from '../types.ts'

interface WarehouseForm {
  name: string
  code: string
}

const EMPTY_FORM: WarehouseForm = { name: '', code: '' }

export function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<ListResult<Warehouse>>('/api/warehouses?pageSize=100')
      setWarehouses(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load warehouses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createWarehouse(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      await api.post<{ warehouse: Warehouse }>('/api/warehouses', form)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create warehouse')
    }
  }

  async function deactivate(id: string): Promise<void> {
    setError(null)
    try {
      await api.delete<{ warehouse: Warehouse }>(`/api/warehouses/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to deactivate warehouse')
    }
  }

  return (
    <section>
      <h1>Warehouses</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <RoleGate permission="catalog:create">
        <form className="card form-row" onSubmit={createWarehouse}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder="Code (e.g. WH-MAIN)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      </RoleGate>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Status</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {warehouses.map((warehouse) => (
              <tr key={warehouse.id}>
                <td>{warehouse.name}</td>
                <td>{warehouse.code}</td>
                <td>{warehouse.active ? 'active' : 'inactive'}</td>
                <td>
                  <RoleGate permission="catalog:deactivate">
                    {warehouse.active && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void deactivate(warehouse.id)}
                      >
                        Deactivate
                      </button>
                    )}
                  </RoleGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">Total: {total} warehouses.</p>
    </section>
  )
}