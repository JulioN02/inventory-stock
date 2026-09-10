import { useEffect, useState } from 'react'
import { api } from '../api/client.ts'
import { EmptyState } from '../components/EmptyState.tsx'
import { HelpBlock } from '../components/HelpBlock.tsx'
import { LoadingIndicator } from '../components/LoadingIndicator.tsx'
import { formatDateTime, formatNumber, localizeError, useTranslation } from '../i18n/index.ts'
import type { AuditDto, ListResult } from '../types.ts'

const PAGE_SIZES = [20, 50, 100] as const
const DEFAULT_PAGE_SIZE = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuditFilters {
  action: string
  entity_type: string
  from: string
  to: string
  actor: string
}

const EMPTY_FILTERS: AuditFilters = { action: '', entity_type: '', from: '', to: '', actor: '' }

/**
 * Portal operativo — Audit screen (I6, AUD-UI). Read-only, gated audit:read
 * at route AND nav. Filters are applied on Search (D-P2); from/to are
 * datetime-local → ISO-8601 with offset (D-P9); actor is a free-text UUID
 * validated client-side (OQ-A / D-P8). Payload renders inside a native
 * <details> collapse — XSS-safe (React escapes text), zero extra state (D-P10).
 */
export function AuditPage() {
  const { t, locale } = useTranslation()
  const [items, setItems] = useState<AuditDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(nextPage: number): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(nextPage))
      params.set('pageSize', String(pageSize))
      if (filters.action) params.set('action', filters.action)
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      // datetime-local values stay ISO (`yyyy-MM-ddTHH:mm`) → ISO-8601 (D-P9/I5).
      if (filters.from) params.set('from', new Date(filters.from).toISOString())
      if (filters.to) params.set('to', new Date(filters.to).toISOString())
      if (filters.actor) params.set('actor', filters.actor)
      const data = await api.get<ListResult<AuditDto>>(`/api/audit?${params.toString()}`)
      setItems(data.items)
      setTotal(data.total)
      setPage(data.page)
    } catch (err) {
      setError(localizeError(err, t))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function search(): Promise<void> {
    // OQ-A/D-P8: actor must be a valid UUID — reject client-side, no request.
    if (filters.actor && !UUID_PATTERN.test(filters.actor)) {
      setError(t('audit.uuidInvalid'))
      return
    }
    await load(1) // Search resets to page 1 (AUD-UI)
  }

  function setFilter(patch: Partial<AuditFilters>): void {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const nextDisabled = page * pageSize >= total

  return (
    <section>
      <h1>{t('audit.title')}</h1>
      <p className="muted small">{t('audit.intro')}</p>
      <HelpBlock summary={t('audit.help.summary')} body={t('audit.help.body')} />
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="toolbar">
        <input
          placeholder={t('audit.placeholder.action')}
          value={filters.action}
          onChange={(e) => setFilter({ action: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <input
          placeholder={t('audit.placeholder.entityType')}
          value={filters.entity_type}
          onChange={(e) => setFilter({ entity_type: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <input
          type="datetime-local"
          aria-label={t('audit.from')}
          value={filters.from}
          onChange={(e) => setFilter({ from: e.target.value })}
        />
        <input
          type="datetime-local"
          aria-label={t('audit.to')}
          value={filters.to}
          onChange={(e) => setFilter({ to: e.target.value })}
        />
        <input
          placeholder={t('audit.placeholder.actor')}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          value={filters.actor}
          onChange={(e) => setFilter({ actor: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label={t('common.pageSize')}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {t('common.pageSizeOption', { n: size })}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => void search()}>
          {t('common.search')}
        </button>
      </div>

      {loading ? <LoadingIndicator /> : <AuditTable items={items} />}

      <div className="toolbar">
        <button type="button" className="btn" disabled={page === 1} onClick={() => void load(page - 1)}>
          {t('common.prev')}
        </button>
        <p className="muted small">
          {t('common.pageSummary', { page, total: formatNumber(total, locale) })}
        </p>
        <button
          type="button"
          className="btn"
          disabled={nextDisabled}
          onClick={() => void load(page + 1)}
        >
          {t('common.next')}
        </button>
      </div>
    </section>
  )
}

function AuditTable({ items }: { items: AuditDto[] }) {
  const { t, locale } = useTranslation()
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('audit.headers.date')}</th>
            <th>{t('audit.headers.actorType')}</th>
            <th>{t('audit.headers.actor')}</th>
            <th>{t('audit.headers.action')}</th>
            <th>{t('audit.headers.entity')}</th>
            <th>{t('audit.headers.entityId')}</th>
            <th>{t('audit.headers.payload')}</th>
            <th>{t('audit.headers.ip')}</th>
            <th>{t('audit.headers.userAgent')}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyState message={t('audit.empty')} colSpan={9} />
          ) : (
            items.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.occurred_at, locale)}</td>
                <td>{row.actor_type}</td>
                <td>{row.actor_user_id ?? <span className="muted">—</span>}</td>
                <td>{row.action}</td>
                <td>{row.entity_type ?? <span className="muted">—</span>}</td>
                <td>{row.entity_id ?? <span className="muted">—</span>}</td>
                <td>
                  <details>
                    <summary>{t('audit.payloadSummary')}</summary>
                    <pre>{JSON.stringify(row.payload, null, 2)}</pre>
                  </details>
                </td>
                <td>{row.ip ?? <span className="muted">—</span>}</td>
                <td>{row.user_agent ?? <span className="muted">—</span>}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
