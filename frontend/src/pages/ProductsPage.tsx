import { useEffect, useState } from 'react'
import { api } from '../api/client.ts'
import { EmptyState } from '../components/EmptyState.tsx'
import { LoadingIndicator } from '../components/LoadingIndicator.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import { formatNumber, localizeError, useTranslation } from '../i18n/index.ts'
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
  const { t, locale } = useTranslation()
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
      setError(localizeError(err, t))
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
      setError(localizeError(err, t))
    }
  }

  async function deactivate(id: string): Promise<void> {
    setError(null)
    try {
      await api.delete<{ product: Product }>(`/api/products/${id}`)
      await load()
    } catch (err) {
      setError(localizeError(err, t))
    }
  }

  return (
    <section>
      <h1>{t('products.title')}</h1>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <RoleGate permission="catalog:create">
        <form className="card form-row" onSubmit={createProduct}>
          <input
            placeholder={t('products.placeholder.sku')}
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
          />
          <input
            placeholder={t('products.placeholder.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            aria-label={t('products.unit')}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <input
            placeholder={t('products.placeholder.price')}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">
            {t('common.create')}
          </button>
        </form>
      </RoleGate>

      <div className="toolbar">
        <input
          placeholder={t('products.placeholder.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load()
          }}
        />
        <button type="button" className="btn" onClick={() => void load()}>
          {t('common.search')}
        </button>
      </div>

      {loading ? (
        <LoadingIndicator />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('products.headers.sku')}</th>
                <th>{t('products.headers.name')}</th>
                <th>{t('products.headers.unit')}</th>
                <th>{t('products.headers.price')}</th>
                <th>{t('products.headers.status')}</th>
                <th>
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <EmptyState message={t('products.empty')} colSpan={6} />
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.sku}</td>
                    <td>{product.name}</td>
                    <td>{product.unit}</td>
                    <td>{formatNumber(product.price, locale)}</td>
                    <td>{product.active ? t('common.active') : t('common.inactive')}</td>
                    <td>
                      <RoleGate permission="catalog:deactivate">
                        {product.active && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => void deactivate(product.id)}
                          >
                            {t('common.deactivate')}
                          </button>
                        )}
                      </RoleGate>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        {t('products.total', { total: formatNumber(total, locale) })}
      </p>
    </section>
  )
}