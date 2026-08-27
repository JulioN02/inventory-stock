import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api/client.ts'
import { RoleGate } from '../components/RoleGate.tsx'
import type { ListResult, Product } from '../types.ts'

const UNITS = ['kg', 'g', 'l', 'ml', 'unit', 'box', 'pair'] as const

interface ProductForm {
  sku: string
  name: string
  unit: string
  price: string
}

const EMPTY_FORM: ProductForm = { sku: '', name: '', unit: 'unit', price: '' }

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const query = search ? `?search=${encodeURIComponent(search)}&pageSize=100` : '?pageSize=100'
      const data = await api.get<ListResult<Product>>(`/api/products${query}`)
      setProducts(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createProduct(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      await api.post<{ product: Product }>('/api/products', form)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create product')
    }
  }

  async function deactivate(id: string): Promise<void> {
    setError(null)
    try {
      await api.delete<{ product: Product }>(`/api/products/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to deactivate product')
    }
  }

  return (
    <section>
      <h1>Products</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <RoleGate permission="catalog:create">
        <form className="card form-row" onSubmit={createProduct}>
          <input
            placeholder="SKU (auto upper-case)"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
          />
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            aria-label="Unit"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <input
            placeholder="Price (e.g. 9.99)"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      </RoleGate>

      <div className="toolbar">
        <input
          placeholder="Search by SKU or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load()
          }}
        />
        <button type="button" className="btn" onClick={() => void load()}>
          Search
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Status</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>{product.unit}</td>
                <td>{product.price}</td>
                <td>{product.active ? 'active' : 'inactive'}</td>
                <td>
                  <RoleGate permission="catalog:deactivate">
                    {product.active && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void deactivate(product.id)}
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
      <p className="muted small">Total: {total} products (string numerics — no float drift).</p>
    </section>
  )
}