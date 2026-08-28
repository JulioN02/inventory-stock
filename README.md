# Inventory & Stock Management System

Proyecto profesional CORE de la Temporada 1 — **entregado**. Documentación pedagógica en Obsidian → `Proyectos profesionales/Inventory & Stock Management.md` y ficha técnica → `Proyectos profesionales/Inventory & Stock Management — Ficha Técnica.md`.

> **No** es el típico CRUD de inventario. El interés está en el **dominio**: el stock es una *consecuencia* de movimientos inmutables.

Estado: ✅ Entregado · 138/138 tests · typecheck limpio

## Dominio

El stock nunca se setea: se deriva del libro mayor de movimientos.

```
Purchase → Receiving → Stock Movement → Inventory
Sale     → Stock Movement → Inventory
```

Cada movimiento es una fila inmutable `(quantity > 0, sign ±1)`; `stock_levels` es una vista `SUM(quantity * sign)`. Un `pg_advisory_xact_lock` por clave `(product, warehouse)` impide vender stock inexistente bajo concurrencia.

## Módulos

| Módulo | Rol |
|---|---|
| Products | Catálogo de productos |
| Warehouses | Ubicaciones físicas de almacenamiento |
| Movements | Ledger inmutable de entrada/salida/transferencias/ajustes |
| Stock | Estado derivado de los movimientos (vista SQL) |
| Auth / RBAC | Login, refresh rotativo, 13 permisos sobre 4 roles |
| Audit | Auditoría append-only de eventos de dominio y auth |

## Capacidades que demuestra

- **Transacciones**: atomicidad de operaciones multi-tabla
- **Consistencia**: invariantes de stock bajo concurrencia (LAB-01)
- **Idempotencia**: reintentos seguros sin efectos duplicados (LAB-02)
- **Auditoría**: quién, cuándo y qué cambió, inmutable (LAB-08)
- **SQL**: consultas parametrizadas, joins RBAC, vista agregada `stock_levels`
- **Permisos**: RBAC verificado por request sobre módulos y operaciones

## Cómo correr

```bash
docker compose up -d          # PostgreSQL 16 (puerto 55434)
npm run migrate               # migraciones
npm run seed:admin            # bootstrap admin (ADMIN_PASSWORD en backend/.env)
npm run dev:api               # Express 5 en http://localhost:3000
npm run dev:web               # Vite + React 19 en http://localhost:5173
npm test                      # 138/138
npm run typecheck
```

Configuración: copiar `backend/.env.example` a `backend/.env`.

## Labs que lo alimentan

- LAB-01 Race Condition — consistencia bajo concurrencia
- LAB-02 Idempotency — operaciones repetidas sin efectos duplicados
- LAB-08 Audit Trail — auditoría inmutable

## Documentación

- Obsidian (general + pedagógica): `Proyectos profesionales/Inventory & Stock Management.md`
- Obsidian (ficha técnica): `Proyectos profesionales/Inventory & Stock Management — Ficha Técnica.md`
- Repositorio: [github.com/JulioN02/inventory-stock](https://github.com/JulioN02/inventory-stock)