import { useEffect, useState } from 'react'
import { api } from '../api/client.ts'
import { EmptyState } from '../components/EmptyState.tsx'
import { LoadingIndicator } from '../components/LoadingIndicator.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import { formatNumber, localizeError, useTranslation } from '../i18n/index.ts'
import type { ListResult, Warehouse } from '../types.ts'

interface WarehouseForm {
  name: string
  code: string
}

const EMPTY_FORM: WarehouseForm = { name: '', code: '' }

export function WarehousesPage() {
  const { t, locale } = useTranslation()
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
      setError(localizeError(err, t))
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
      setError(localizeError(err, t))
    }
  }

  async function deactivate(id: string): Promise<void> {
    setError(null)
    try {
      await api.delete<{ warehouse: Warehouse }>(`/api/warehouses/${id}`)
      await load()
    } catch (err) {
      setError(localizeError(err, t))
    }
  }

  return (
    <section>
      <h1>{t('warehouses.title')}</h1>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <RoleGate permission="catalog:create">
        <form className="card form-row" onSubmit={createWarehouse}>
          <input
            placeholder={t('warehouses.placeholder.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder={t('warehouses.placeholder.code')}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">
            {t('common.create')}
          </button>
        </form>
      </RoleGate>

      {loading ? (
        <LoadingIndicator />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('warehouses.headers.name')}</th>
                <th>{t('warehouses.headers.code')}</th>
                <th>{t('warehouses.headers.status')}</th>
                <th>
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 ? (
                <EmptyState message={t('warehouses.empty')} colSpan={4} />
              ) : (
                warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>{warehouse.name}</td>
                    <td>{warehouse.code}</td>
                    <td>{warehouse.active ? t('common.active') : t('common.inactive')}</td>
                    <td>
                      <RoleGate permission="catalog:deactivate">
                        {warehouse.active && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => void deactivate(warehouse.id)}
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
        {t('warehouses.total', { total: formatNumber(total, locale) })}
      </p>
    </section>
  )
}