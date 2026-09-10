import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { LoadingIndicator } from '../components/LoadingIndicator.tsx'
import { RoleGate } from '../components/RoleGate.tsx'
import { formatNumber, localizeError, localizeRole, useTranslation } from '../i18n/index.ts'
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
      setError(localizeError(err, t))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
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