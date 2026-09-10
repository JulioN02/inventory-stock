import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { LoadingIndicator } from '../components/LoadingIndicator.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import { formatNumber, localizeError, localizeRole, useTranslation } from '../i18n/index.ts'
import type { LowStockItem, StockItem, Warehouse } from '../types.ts'

const LOW_STOCK_THRESHOLD = 5

/**
 * Dashboard v1 (T2-11): derived stock table + low-stock, straight from the
 * movements API (movements:read). Stock is NEVER computed client-side — the
 * server derives it via SQL SUM over the ledger (MOV-4/MOV-7); numerics are
 * strings (no float drift).
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('dashboard.title')}</h1>
      <p>
        {t('dashboard.welcome', {
          username: user?.username ?? '',
          role: localizeRole(user?.role ?? '', t),
        })}
      </p>
      <div className="card-grid">
        <Link className="card" to="/products">
          <h2>{t('dashboard.card.products.title')}</h2>
          <p>{t('dashboard.card.products.desc')}</p>
        </Link>
        <Link className="card" to="/warehouses">
          <h2>{t('dashboard.card.warehouses.title')}</h2>
          <p>{t('dashboard.card.warehouses.desc')}</p>
        </Link>
        <RoleGate permission="movements:read">
          <Link className="card" to="/movements">
            <h2>{t('dashboard.card.movements.title')}</h2>
            <p>{t('dashboard.card.movements.desc')}</p>
          </Link>
        </RoleGate>
        <RoleGate permission="audit:read">
          <Link className="card" to="/audit">
            <h2>{t('dashboard.card.audit.title')}</h2>
            <p>{t('dashboard.card.audit.desc')}</p>
          </Link>
        </RoleGate>
      </div>

      <RoleGate
        permission="movements:read"
        fallback={<p className="muted">{t('dashboard.noStockVisibility')}</p>}
      >
        <StockSection />
      </RoleGate>
    </section>
  )
}

function StockSection() {
  const { t, locale } = useTranslation()
  const [stock, setStock] = useState<StockItem[]>([])
  const [low, setLow] = useState<LowStockItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('') // '' = all
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      // DASH-FILTER: append warehouse_id when a specific warehouse is selected;
      // omit the parameter entirely for "all" (backend defaults to the full matrix).
      // NOTE: /api/stock has no query string yet (needs `?`); /api/stock/low
      // already has ?threshold=5 (needs `&`).
      const stockParam = selectedWarehouseId === '' ? '' : `?warehouse_id=${selectedWarehouseId}`
      const lowParam = selectedWarehouseId === '' ? '' : `&warehouse_id=${selectedWarehouseId}`
      const [stockData, lowData] = await Promise.all([
        api.get<{ items: StockItem[] }>(`/api/stock${stockParam}`),
        api.get<{ items: LowStockItem[] }>(
          `/api/stock/low?threshold=${LOW_STOCK_THRESHOLD}${lowParam}`,
        ),
      ])
      setStock(stockData.items)
      setLow(lowData.items)
    } catch (err) {
      setError(localizeError(err, t))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId])

  useEffect(() => {
    // Warehouse dropdown options load ONCE (D-P4 pattern, same as MovementsPage).
    api
      .get<{ items: Warehouse[] }>('/api/warehouses?pageSize=100')
      .then((data) => setWarehouses(data.items))
      .catch((err: unknown) => setError(localizeError(err, t)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <LoadingIndicator />

  return (
    <>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <h2>{t('dashboard.stockLevels')}</h2>
      <div className="toolbar">
        <label className="muted small" htmlFor="dashboard-warehouse-filter">
          {t('dashboard.filter.warehouse')}
        </label>
        <select
          id="dashboard-warehouse-filter"
          value={selectedWarehouseId}
          onChange={(e) => setSelectedWarehouseId(e.target.value)}
        >
          <option value="">{t('dashboard.filter.warehouseAll')}</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} — {warehouse.name}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">{t('dashboard.stockNote')}</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('dashboard.headers.sku')}</th>
              <th>{t('dashboard.headers.product')}</th>
              <th>{t('dashboard.headers.warehouse')}</th>
              <th>{t('dashboard.headers.stock')}</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <EmptyState message={t('dashboard.empty')} colSpan={4} />
            ) : (
              stock.map((row) => (
                <tr key={`${row.product_id}:${row.warehouse_id}`}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>{row.warehouse_code}</td>
                  <td>{formatNumber(row.stock, locale)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>{t('dashboard.lowStock', { threshold: LOW_STOCK_THRESHOLD })}</h2>
      {selectedWarehouseId !== '' && (
        <p className="muted small">{t('dashboard.filter.lowStockNote')}</p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('dashboard.headers.sku')}</th>
              <th>{t('dashboard.headers.product')}</th>
              <th>{t('dashboard.headers.stock')}</th>
            </tr>
          </thead>
          <tbody>
            {low.length === 0 ? (
              <EmptyState message={t('dashboard.nothingBelow')} colSpan={3} />
            ) : (
              low.map((row) => (
                <tr key={row.product_id}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>{formatNumber(row.stock, locale)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}