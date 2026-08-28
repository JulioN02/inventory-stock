import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api/client.ts'
import { RoleGate } from '../components/RoleGate.tsx'
import { DIRECT_MOVEMENT_TYPES, MOVEMENT_TYPES } from '../types.ts'
import type {
  AdjustmentCreateInput,
  DirectMovementType,
  ListResult,
  MovementCreateInput,
  MovementListItemDto,
  MovementWriteResult,
  Product,
  TransferCreateInput,
  Warehouse,
} from '../types.ts'

const PAGE_SIZES = [20, 50, 100] as const
const DEFAULT_PAGE_SIZE = 20

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  [MOVEMENT_TYPES.receiving]: 'Receiving',
  [MOVEMENT_TYPES.sale]: 'Sale',
  [MOVEMENT_TYPES.transferIn]: 'Transfer in',
  [MOVEMENT_TYPES.transferOut]: 'Transfer out',
  [MOVEMENT_TYPES.adjustment]: 'Adjustment',
}

const EMPTY_MOVEMENT_FORM = { product_id: '', warehouse_id: '', quantity: '', unit_price: '', reference: '' }

interface ReceivingSaleFormState {
  product_id: string
  warehouse_id: string
  quantity: string
  unit_price: string
  reference: string
  type: string
}
const EMPTY_TRANSFER_FORM = {
  product_id: '',
  source_warehouse_id: '',
  destination_warehouse_id: '',
  quantity: '',
  reference: '',
}
const EMPTY_ADJUSTMENT_FORM = { product_id: '', warehouse_id: '', quantity: '', reason: '' }

interface WriteFormProps {
  products: Product[]
  warehouses: Warehouse[]
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  onRegistered: () => Promise<void>
}

interface LedgerFilters {
  type: string
  product_id: string
  warehouse_id: string
  pageSize: number
}

const EMPTY_FILTERS: LedgerFilters = {
  type: '',
  product_id: '',
  warehouse_id: '',
  pageSize: DEFAULT_PAGE_SIZE,
}

/**
 * Portal operativo — Movements screen (I6, MOV-UI + LED-UI + IDEM-UI).
 * Three write forms (receiving/sale, transfer, adjustment) gated
 * movements:create, plus the movement ledger gated movements:read.
 * Client-side idempotency (D-P5): per-form key survives network failures /
 * 5xx so a retry of the SAME payload replays (200); 2xx/4xx regenerate.
 */
export function MovementsPage() {
  const [items, setItems] = useState<MovementListItemDto[]>([])
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_FILTERS)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.set('type', filters.type)
      if (filters.product_id) params.set('product_id', filters.product_id)
      if (filters.warehouse_id) params.set('warehouse_id', filters.warehouse_id)
      params.set('pageSize', String(filters.pageSize))
      const data = await api.get<ListResult<MovementListItemDto>>(`/api/movements?${params.toString()}`)
      setItems(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el libro mayor')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Dropdown options load ONCE (D-P4) — never refetched on ledger reload.
    void Promise.all([
      api.get<ListResult<Product>>('/api/products?pageSize=100'),
      api.get<ListResult<Warehouse>>('/api/warehouses?pageSize=100'),
    ])
      .then(([productData, warehouseData]) => {
        setProducts(productData.items)
        setWarehouses(warehouseData.items)
      })
      .catch(() => {
        setError('No se pudieron cargar los productos y almacenes')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section>
      <h1>Movimientos</h1>
      <p className="muted small">
        El libro mayor se deriva del servidor — los números se muestran tal como llegan (string numerics, D13).
      </p>
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <RoleGate permission="movements:create">
        <ReceivingSaleForm
          products={products}
          warehouses={warehouses}
          onError={setError}
          onNotice={setSuccess}
          onRegistered={load}
        />
        <TransferForm
          products={products}
          warehouses={warehouses}
          onError={setError}
          onNotice={setSuccess}
          onRegistered={load}
        />
        <AdjustmentForm
          products={products}
          warehouses={warehouses}
          onError={setError}
          onNotice={setSuccess}
          onRegistered={load}
        />
      </RoleGate>

      <LedgerFilters
        filters={filters}
        onChange={setFilters}
        products={products}
        warehouses={warehouses}
        onSearch={() => void load()}
      />

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <LedgerTable items={items} />
      )}
      <p className="muted small">
        Total: {total} movimientos · Los traslados crean dos filas (transfer_out −, transfer_in +) que
        comparten el mismo grupo de operación.
      </p>
    </section>
  )
}

function LedgerFilters({
  filters,
  onChange,
  products,
  warehouses,
  onSearch,
}: {
  filters: LedgerFilters
  onChange: (next: LedgerFilters) => void
  products: Product[]
  warehouses: Warehouse[]
  onSearch: () => void
}) {
  return (
    <div className="toolbar">
      <select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value })}
        aria-label="Tipo"
      >
        <option value="">Tipo: todos</option>
        {Object.values(MOVEMENT_TYPES).map((type) => (
          <option key={type} value={type}>
            {MOVEMENT_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <select
        value={filters.product_id}
        onChange={(e) => onChange({ ...filters, product_id: e.target.value })}
        aria-label="Producto"
      >
        <option value="">Producto: todos</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.sku} — {product.name}
          </option>
        ))}
      </select>
      <select
        value={filters.warehouse_id}
        onChange={(e) => onChange({ ...filters, warehouse_id: e.target.value })}
        aria-label="Almacén"
      >
        <option value="">Almacén: todos</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} — {warehouse.name}
          </option>
        ))}
      </select>
      <select
        value={filters.pageSize}
        onChange={(e) => onChange({ ...filters, pageSize: Number(e.target.value) })}
        aria-label="Registros por página"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size} por página
          </option>
        ))}
      </select>
      <button type="button" className="btn" onClick={onSearch}>
        Buscar
      </button>
    </div>
  )
}

function LedgerTable({ items }: { items: MovementListItemDto[] }) {
  const hasOperationGroups = items.some((item) => item.operation_group_id !== null)
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>SKU</th>
          <th>Almacén</th>
          <th>Cantidad</th>
          <th>Signo</th>
          <th>Precio unitario</th>
          <th>Referencia</th>
          {hasOperationGroups && <th>Grupo de operación</th>}
          <th>Actor</th>
          <th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id}>
            <td>{MOVEMENT_TYPE_LABELS[row.type] ?? row.type}</td>
            <td>{row.sku}</td>
            <td>{row.warehouse_code}</td>
            <td>{row.quantity}</td>
            <td>{row.sign === 1 ? '+1' : '−1'}</td>
            <td>{row.unit_price ?? <span className="muted">—</span>}</td>
            <td>{row.reference ?? <span className="muted">—</span>}</td>
            {hasOperationGroups && <td>{row.operation_group_id ?? <span className="muted">—</span>}</td>}
            <td>{row.actor_user_id ?? <span className="muted">—</span>}</td>
            <td>{row.occurred_at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Shared idempotency submit (D-P5 / IDEM-UI). Key lifecycle:
 *  - 2xx (201 new / 200 replay) → key discarded; replay shows a specific note.
 *  - 4xx (definitive, not committed) → key discarded (regenerate next time).
 *  - network TypeError / 5xx (commit-ambiguous) → key KEPT; the Submit button
 *    IS the retry (same payload → 200 replay; changed payload → 409).
 *
 * Returns true when the outcome is definitive (2xx/4xx) — the caller resets
 * the form; false on commit-ambiguous (TypeError/5xx) — the caller KEEPS the
 * form values so the retry sends the identical payload (W1 verify fix).
 */
async function submitMovement(
  url: string,
  payload: Record<string, unknown>,
  idemKey: string | null,
  setIdemKey: (key: string | null) => void,
  onError: (message: string | null) => void,
  onNotice: (message: string | null) => void,
  onRegistered: () => Promise<void>,
): Promise<boolean> {
  const key = idemKey ?? crypto.randomUUID()
  try {
    const { status } = await api.postWithStatus<MovementWriteResult>(url, {
      ...payload,
      idempotency_key: key,
    })
    setIdemKey(null) // 201 new / 200 replay → next submit gets a fresh UUID
    onError(null)
    if (status === 200) {
      onNotice('movimiento ya registrado (replay)')
    } else {
      onNotice('Movimiento registrado correctamente.')
    }
    await onRegistered()
    return true // definitive 2xx → caller resets the form
  } catch (err) {
    if (err instanceof TypeError || (err instanceof ApiClientError && err.status >= 500)) {
      // Network-level failure (fetch TypeError) or 5xx — commit ambiguous.
      // KEEP the key AND the form values: retry sends the identical payload.
      setIdemKey(key)
      onNotice(null)
      onError('movimiento NO registrado — vuelve a enviar para reintentar con la misma clave')
      return false // ambiguous → caller KEEPS the form values for the retry
    } else if (err instanceof ApiClientError) {
      // Definitive 4xx — payload rejected, not committed → regenerate next time.
      setIdemKey(null)
      onNotice(null)
      onError(err.message)
      return true
    } else {
      // JSON parse error / unknown — safe default: regenerate.
      setIdemKey(null)
      onNotice(null)
      onError('No se pudo registrar el movimiento')
      return true
    }
  }
}

/** MOV-UI: receiving | sale — single ledger row, sign derived server-side. */
function ReceivingSaleForm({ products, warehouses, onError, onNotice, onRegistered }: WriteFormProps) {
  const [form, setForm] = useState<ReceivingSaleFormState>({
    ...EMPTY_MOVEMENT_FORM,
    type: DIRECT_MOVEMENT_TYPES.receiving,
  })
  const [idemKey, setIdemKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!form.product_id || !form.warehouse_id || !form.quantity) return
    onError(null)
    onNotice(null)
    setSubmitting(true)
    try {
      const payload: Omit<MovementCreateInput, 'idempotency_key'> = {
        product_id: form.product_id,
        warehouse_id: form.warehouse_id,
        quantity: form.quantity,
        type: form.type as DirectMovementType,
        unit_price: form.unit_price || undefined,
        reference: form.reference || undefined,
      }
      const committed = await submitMovement('/api/movements', payload, idemKey, setIdemKey, onError, onNotice, onRegistered)
      if (committed) setForm({ ...EMPTY_MOVEMENT_FORM, type: form.type })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h2>Registrar recepción / venta</h2>
      <form className="card form-row" onSubmit={handleSubmit}>
        <select
          value={form.product_id}
          onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          aria-label="Producto"
          required
        >
        <option value="">Producto…</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.sku} — {product.name}
          </option>
        ))}
      </select>
      <select
        value={form.warehouse_id}
        onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
        aria-label="Almacén"
        required
      >
        <option value="">Almacén…</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} — {warehouse.name}
          </option>
        ))}
      </select>
      <select
        value={form.type}
        onChange={(e) => setForm({ ...form, type: e.target.value })}
        aria-label="Tipo"
      >
        <option value={DIRECT_MOVEMENT_TYPES.receiving}>Receiving</option>
        <option value={DIRECT_MOVEMENT_TYPES.sale}>Sale</option>
      </select>
      <input
        type="number"
        step="0.1"
        min="0.1"
        placeholder="Cantidad"
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        required
      />
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="Precio unitario (opcional)"
        value={form.unit_price}
        onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
      />
      <input
        placeholder="Referencia (opcional, máx. 200)"
        maxLength={200}
        value={form.reference}
        onChange={(e) => setForm({ ...form, reference: e.target.value })}
      />
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Registrando…' : 'Registrar'}
      </button>
      </form>
    </>
  )
}

/** MOV-UI: transfer — two atomic ledger rows sharing operation_group_id. */
function TransferForm({ products, warehouses, onError, onNotice, onRegistered }: WriteFormProps) {
  const [form, setForm] = useState(EMPTY_TRANSFER_FORM)
  const [idemKey, setIdemKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!form.product_id || !form.source_warehouse_id || !form.destination_warehouse_id || !form.quantity) {
      return
    }
    onError(null)
    onNotice(null)
    if (form.source_warehouse_id === form.destination_warehouse_id) {
      onError('El almacén de origen y destino deben ser diferentes.')
      return
    }
    setSubmitting(true)
    try {
      const payload: Omit<TransferCreateInput, 'idempotency_key'> = {
        product_id: form.product_id,
        source_warehouse_id: form.source_warehouse_id,
        destination_warehouse_id: form.destination_warehouse_id,
        quantity: form.quantity,
        reference: form.reference || undefined,
      }
      const committed = await submitMovement('/api/movements/transfers', payload, idemKey, setIdemKey, onError, onNotice, onRegistered)
      if (committed) setForm(EMPTY_TRANSFER_FORM)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h2>Registrar traslado</h2>
      <form className="card form-row" onSubmit={handleSubmit}>
        <select
          value={form.product_id}
          onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          aria-label="Producto"
          required
        >
        <option value="">Producto…</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.sku} — {product.name}
          </option>
        ))}
      </select>
      <select
        value={form.source_warehouse_id}
        onChange={(e) => setForm({ ...form, source_warehouse_id: e.target.value })}
        aria-label="Almacén de origen"
        required
      >
        <option value="">Origen…</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} — {warehouse.name}
          </option>
        ))}
      </select>
      <select
        value={form.destination_warehouse_id}
        onChange={(e) => setForm({ ...form, destination_warehouse_id: e.target.value })}
        aria-label="Almacén de destino"
        required
      >
        <option value="">Destino…</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} — {warehouse.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.1"
        min="0.1"
        placeholder="Cantidad"
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        required
      />
      <input
        placeholder="Referencia (opcional, máx. 200)"
        maxLength={200}
        value={form.reference}
        onChange={(e) => setForm({ ...form, reference: e.target.value })}
      />
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Registrando…' : 'Registrar'}
      </button>
      </form>
    </>
  )
}

/** MOV-UI: adjustment — signed quantity (±, never 0; 0 → server 422 backstop), reason required. */
function AdjustmentForm({ products, warehouses, onError, onNotice, onRegistered }: WriteFormProps) {
  const [form, setForm] = useState(EMPTY_ADJUSTMENT_FORM)
  const [idemKey, setIdemKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!form.product_id || !form.warehouse_id || !form.quantity || !form.reason) return
    onError(null)
    onNotice(null)
    setSubmitting(true)
    try {
      const payload: Omit<AdjustmentCreateInput, 'idempotency_key'> = {
        product_id: form.product_id,
        warehouse_id: form.warehouse_id,
        quantity: form.quantity,
        reason: form.reason,
      }
      const committed = await submitMovement('/api/movements/adjustments', payload, idemKey, setIdemKey, onError, onNotice, onRegistered)
      if (committed) setForm(EMPTY_ADJUSTMENT_FORM)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h2>Registrar ajuste</h2>
      <form className="card form-row" onSubmit={handleSubmit}>
        <select
          value={form.product_id}
          onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          aria-label="Producto"
          required
        >
        <option value="">Producto…</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.sku} — {product.name}
          </option>
        ))}
      </select>
      <select
        value={form.warehouse_id}
        onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
        aria-label="Almacén"
        required
      >
        <option value="">Almacén…</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} — {warehouse.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.1"
        placeholder="Cantidad (±, nunca 0)"
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        required
      />
      <input
        placeholder="Motivo (requerido, máx. 500)"
        maxLength={500}
        value={form.reason}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
        required
      />
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Registrando…' : 'Registrar'}
      </button>
      </form>
    </>
  )
}