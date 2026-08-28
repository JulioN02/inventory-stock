import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api/client.ts'
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
      if (filters.from) params.set('from', new Date(filters.from).toISOString())
      if (filters.to) params.set('to', new Date(filters.to).toISOString())
      if (filters.actor) params.set('actor', filters.actor)
      const data = await api.get<ListResult<AuditDto>>(`/api/audit?${params.toString()}`)
      setItems(data.items)
      setTotal(data.total)
      setPage(data.page)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar la auditoría')
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
      setError('El actor debe ser un UUID válido.')
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
      <h1>Auditoría</h1>
      <p className="muted small">
        Registro de eventos de solo lectura — sin controles de escritura.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="toolbar">
        <input
          placeholder="Acción (p. ej. auth.login.success)"
          value={filters.action}
          onChange={(e) => setFilter({ action: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <input
          placeholder="Tipo de entidad (p. ej. product)"
          value={filters.entity_type}
          onChange={(e) => setFilter({ entity_type: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <input
          type="datetime-local"
          aria-label="Desde"
          value={filters.from}
          onChange={(e) => setFilter({ from: e.target.value })}
        />
        <input
          type="datetime-local"
          aria-label="Hasta"
          value={filters.to}
          onChange={(e) => setFilter({ to: e.target.value })}
        />
        <input
          placeholder="Actor (UUID, p. ej. 00000000-0000-0000-0000-000000000000)"
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
          aria-label="Registros por página"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} por página
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => void search()}>
          Buscar
        </button>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <AuditTable items={items} />
      )}

      <div className="toolbar">
        <button
          type="button"
          className="btn"
          disabled={page === 1}
          onClick={() => void load(page - 1)}
        >
          {'← prev'}
        </button>
        <p className="muted small">
          Página {page} · {total} en total
        </p>
        <button
          type="button"
          className="btn"
          disabled={nextDisabled}
          onClick={() => void load(page + 1)}
        >
          {'next →'}
        </button>
      </div>
    </section>
  )
}

function AuditTable({ items }: { items: AuditDto[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo de actor</th>
          <th>Actor</th>
          <th>Acción</th>
          <th>Entidad</th>
          <th>ID de entidad</th>
          <th>Payload</th>
          <th>IP</th>
          <th>User agent</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id}>
            <td>{row.occurred_at}</td>
            <td>{row.actor_type}</td>
            <td>{row.actor_user_id ?? <span className="muted">—</span>}</td>
            <td>{row.action}</td>
            <td>{row.entity_type ?? <span className="muted">—</span>}</td>
            <td>{row.entity_id ?? <span className="muted">—</span>}</td>
            <td>
              <details>
                <summary>payload</summary>
                <pre>{JSON.stringify(row.payload, null, 2)}</pre>
              </details>
            </td>
            <td>{row.ip ?? <span className="muted">—</span>}</td>
            <td>{row.user_agent ?? <span className="muted">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}