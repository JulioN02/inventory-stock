# Inventory & Stock Management System

Proyecto profesional CORE de la Temporada 1. Documentación pedagógica en Obsidian → `Proyectos profesionales/Inventory & Stock Management.md`.

> **No** es el típico CRUD de inventario. El interés está en el **dominio**: el stock es una *consecuencia* de movimientos inmutables.

Estado: 💡 Idea

## Qué demuestra

No es "otro proyecto de PostgreSQL": es un sistema donde la **consistencia del stock depende de transacciones y movimientos inmutables**. Cada módulo aporta una decisión de ingeniería, no una tabla más.

## Dominio

El stock nunca se setea: se deriva de movimientos.

```
Purchase → Receiving → Stock Movement → Inventory
Sale     → Stock Movement → Inventory
```

## Módulos

| Módulo | Rol |
|---|---|
| Products | Catálogo de productos |
| Warehouses | Ubicaciones físicas de almacenamiento |
| Stock | Estado derivado de los movimientos |
| Movements | Registro inmutable de entrada/salida |
| Suppliers | Proveedores |
| Purchase Orders | Órdenes de compra |
| Users / Roles | Acceso y permisos |
| Audit | Auditoría de todo cambio relevante |
| Reports | Reportes con agregaciones |

## Capacidades que demuestra

- **Transacciones**: atomicidad de operaciones multi-tabla
- **Consistencia**: invariantes de stock bajo concurrencia
- **Reglas de negocio**: validaciones de dominio, no solo de formato
- **Auditoría**: quién, cuándo y qué cambió
- **SQL**: consultas, joins, agregaciones, reportes
- **Concurrencia**: lecturas y escrituras concurrentes seguras
- **Permisos**: RBAC sobre módulos y operaciones
- **Reportes**: lectura eficiente para dashboards

## Labs que lo alimentan

- LAB-01 Race Condition — consistencia bajo concurrencia
- LAB-02 Idempotency — operaciones repetidas sin efectos duplicados
- LAB-08 Audit Trail — auditoría inmutable

## Presentación

> "Diseñé un sistema de inventario donde la consistencia del stock depende de transacciones y movimientos inmutables" — no "proyecto de PostgreSQL".