/**
 * i18n dictionary for the portfolio site (site/).
 *
 * Flat dotted keys, `sec.<id>.<element>`. `es` is the default locale; `en` is a
 * complete mirror (identical key sets — parity is enforced by a check script).
 * Values containing HTML (`<code>`, `<a>`, `<strong>`, lists) are applied via
 * `data-i18n-html`; everything else via `data-i18n` (textContent).
 */
const I18N = {
  es: {
    // ── meta ─────────────────────────────────────────────────────────────
    'meta.title': 'Inventory & Stock — Sistema de Gestión de Inventario y Stock',
    'meta.description': 'Proyecto de portafolio: sistema de inventario y stock donde el stock se deriva de un libro mayor inmutable de movimientos. Monolito modular + vertical slices, API-first, Express 5 + React 19 + PostgreSQL 16.',

    // ── topbar / nav ─────────────────────────────────────────────────────
    'topbar.skipLink': 'Saltar al contenido',
    'topbar.brand': 'Inventory & Stock',
    'topbar.navLabel': 'Navegación',
    'topbar.localeLabel': 'Idioma',
    'nav.overview': 'Descripción',
    'nav.features': 'Funciones',
    'nav.fundamentals': 'Fundamentos',
    'nav.architecture': 'Arquitectura',
    'nav.stack': 'Stack',
    'nav.modules': 'Módulos',
    'nav.dataModel': 'Modelo de datos',
    'nav.api': 'API',
    'nav.run': 'Cómo correr',
    'nav.tests': 'Tests',
    'nav.labs': 'Labs',
    'nav.screenshots': 'Capturas',

    // ── hero (P1) ────────────────────────────────────────────────────────
    'hero.badge': 'Proyecto profesional · Temporada 1',
    'hero.title': 'Sistema de Gestión de Inventario y Stock',
    'hero.pitch': 'El stock es una <strong>consecuencia</strong> de movimientos inmutables, no un valor que se edite a mano.',
    'hero.status': 'Entregado · 138/138 tests · typecheck limpio',
    'hero.ctaRepo': 'Ver repositorio',
    'hero.ctaRun': 'Cómo correr',

    // ── overview (P2) ────────────────────────────────────────────────────
    'overview.title': 'Descripción del proyecto',
    'overview.lead': '<strong>No</strong> es el típico CRUD de inventario.',
    'overview.insight': 'El stock nunca se establece: se deriva del libro mayor de movimientos. Cada movimiento es una fila inmutable y el saldo es una vista agregada.',
    'overview.flowPurchase': 'Flujo de compra',
    'overview.flowSale': 'Flujo de venta',

    // ── features (P3) ────────────────────────────────────────────────────
    'features.title': 'Funciones / capacidades',
    'features.lead': 'Lo que demuestra el proyecto, más allá de un ABM de productos.',
    'features.card1.title': 'Transacciones',
    'features.card1.body': 'Atomicidad de operaciones multi-tabla: si una parte falla, no queda ningún cambio a medias.',
    'features.card2.title': 'Consistencia',
    'features.card2.body': 'Invariantes de stock bajo concurrencia; imposible vender stock inexistente (LAB-01).',
    'features.card3.title': 'Idempotencia',
    'features.card3.body': 'Reintentos seguros sin efectos duplicados mediante claves de idempotencia (LAB-02).',
    'features.card4.title': 'Auditoría',
    'features.card4.body': 'Quién, cuándo y qué cambió, de forma inmutable y append-only (LAB-08).',
    'features.card5.title': 'SQL',
    'features.card5.body': 'Consultas parametrizadas, joins de RBAC y la vista agregada stock_levels.',
    'features.card6.title': 'Permisos',
    'features.card6.body': 'RBAC verificado por request sobre módulos y operaciones.',

    // ── fundamentals (P4) ────────────────────────────────────────────────
    'fundamentals.title': 'Fundamentos',
    'fundamentals.lead': 'Las reglas de dominio que sostienen el sistema.',
    'fundamentals.item1': 'Libro mayor inmutable: los movimientos nunca se editan ni se borran.',
    'fundamentals.item2': 'Cada movimiento es una fila con <code>quantity &gt; 0</code> y un <code>sign</code> de ±1.',
    'fundamentals.item3': '<code>stock_levels</code> es una vista: <code>SUM(quantity * sign)</code>.',
    'fundamentals.item4': 'Un <code>pg_advisory_xact_lock</code> por clave <code>(product, warehouse)</code> evita sobregirar el stock bajo concurrencia.',
    'fundamentals.item5': 'Idempotencia con <code>idempotency_key</code> + <code>request_hash</code> canónico (SHA-256): un reintento devuelve 200 y una operación nueva, 201.',
    'fundamentals.item6': 'La auditoría append-only se garantiza con el trigger de base de datos <code>forbid_ledger_mutation</code>.',

    // ── architecture (P5) ────────────────────────────────────────────────
    'architecture.title': 'Arquitectura',
    'architecture.lead': 'Un monolito modular organizado por vertical slices, con contrato API-first.',
    'architecture.point1': 'Monolito modular + vertical slices: cada módulo agrupa su dominio, su servicio y sus rutas.',
    'architecture.point2': 'API-first: el contrato HTTP se define antes que la interfaz y es la fuente de verdad.',
    'architecture.point3': 'Un solo origen: Express sirve el SPA compilado, sin CORS entre frontend y backend.',

    // ── stack (P6) ───────────────────────────────────────────────────────
    'stack.title': 'Stack',
    'stack.lead': 'Versiones exactas, sin rangos.',
    'stack.backend.title': 'Backend',
    'stack.backend.items': '<li>Node.js (ESM) + TypeScript 5.9 estricto</li><li>Express 5.2.1</li><li>zod 4.4.3</li><li>pg 8.23.0</li><li>bcryptjs 3.0.3</li><li>jsonwebtoken 9.0.3</li><li>cookie-parser 1.4.7</li>',
    'stack.frontend.title': 'Frontend',
    'stack.frontend.items': '<li>React 19.2.8 (React Compiler)</li><li>Vite 6.4.3</li><li>react-router-dom 7.18.2</li><li>CSS plano</li><li>Cliente fetch con token en memoria</li>',
    'stack.database.title': 'Base de datos',
    'stack.database.items': '<li>PostgreSQL 16 (Docker, puerto 55434)</li>',
    'stack.testing.title': 'Testing',
    'stack.testing.items': '<li>node:test + supertest</li><li>138/138 tests</li><li>Typecheck limpio</li>',

    // ── modules (P7) ─────────────────────────────────────────────────────
    'modules.title': 'Módulos',
    'modules.lead': 'Seis módulos con responsabilidades claras.',
    'modules.th.module': 'Módulo',
    'modules.th.role': 'Rol',
    'modules.products.role': 'Catálogo de productos',
    'modules.warehouses.role': 'Ubicaciones físicas de almacenamiento',
    'modules.movements.role': 'Libro mayor inmutable: recepción, venta, transferencia y ajuste',
    'modules.stock.role': 'Estado derivado de los movimientos (vista SQL)',
    'modules.auth.role': 'Login, refresh rotativo y 13 permisos sobre 4 roles (admin/operator/viewer/auditor)',
    'modules.audit.role': 'Auditoría append-only de eventos de dominio y autenticación',

    // ── data model (P8) ──────────────────────────────────────────────────
    'dataModel.title': 'Modelo de datos',
    'dataModel.lead': 'Tablas normalizadas y una vista para el saldo derivado.',
    'dataModel.tablesLabel': 'Tablas',
    'dataModel.tables': '<li><code>users</code></li><li><code>roles</code></li><li><code>permissions</code></li><li><code>role_permissions</code></li><li><code>user_roles</code></li><li><code>refresh_tokens</code></li><li><code>products</code></li><li><code>warehouses</code></li><li><code>movements</code></li><li><code>audit_log</code></li>',
    'dataModel.viewLabel': 'Vista',
    'dataModel.view': 'stock_levels = SUM(quantity * sign)',
    'dataModel.note': 'La tabla <code>products</code> no tiene columna de cantidad: el stock siempre se calcula desde los movimientos.',

    // ── api (P9) ─────────────────────────────────────────────────────────
    'api.title': 'API',
    'api.lead': 'Superficie HTTP del sistema, agrupada por recurso.',
    'api.health': '<code>GET /api/health</code>',
    'api.auth': '<code>POST /api/auth/{register,login,refresh,logout}</code> — <code>register</code> solo para administradores.',
    'api.products': '<code>GET/POST/PATCH/DELETE /api/products</code>',
    'api.warehouses': '<code>GET/POST/PATCH/DELETE /api/warehouses</code>',
    'api.movements': '<code>POST/GET /api/movements</code>, <code>POST /api/movements/transfers</code>, <code>POST /api/movements/adjustments</code>',
    'api.stock': '<code>GET /api/stock</code>, <code>GET /api/stock/low</code>',
    'api.audit': '<code>GET /api/audit</code>',
    'api.note': 'Todas las rutas protegidas verifican permisos por request.',

    // ── run (P10) ────────────────────────────────────────────────────────
    'run.title': 'Cómo correr',
    'run.lead': 'Requiere Docker y Node.js.',
    'run.commands': 'docker compose up -d          # PostgreSQL 16 (puerto 55434)\nnpm run migrate               # migraciones\nnpm run seed:admin            # bootstrap del admin\nnpm run dev:api               # Express 5 en http://localhost:3000\nnpm run dev:web               # Vite + React 19 en http://localhost:5173\nnpm test                      # 138/138\nnpm run typecheck',
    'run.note': 'Copia <code>backend/.env.example</code> a <code>backend/.env</code> antes de correr el backend.',

    // ── tests (P11) ──────────────────────────────────────────────────────
    'tests.title': 'Tests',
    'tests.lead': 'Evidencia de calidad del proyecto.',
    'tests.stat': '138/138',
    'tests.item1': 'Suite de backend con node:test + supertest.',
    'tests.item2': 'Typecheck limpio con TypeScript estricto.',
    'tests.item3': 'Sin tests automatizados de frontend: decisión documentada, verificada con typecheck y E2E manual.',

    // ── labs (P12) ───────────────────────────────────────────────────────
    'labs.title': 'Labs',
    'labs.lead': 'Los ejercicios que dieron forma al sistema.',
    'labs.lab1.title': 'LAB-01 · Race Condition',
    'labs.lab1.body': 'Consistencia de stock bajo concurrencia: el advisory lock por producto y almacén impide vender stock inexistente.',
    'labs.lab2.title': 'LAB-02 · Idempotency',
    'labs.lab2.body': 'Operaciones repetidas sin efectos duplicados: la clave de idempotencia y el hash del request detectan reintentos.',
    'labs.lab8.title': 'LAB-08 · Audit Trail',
    'labs.lab8.body': 'Auditoría inmutable: el trigger de base de datos rechaza cualquier mutación del libro mayor y del log de auditoría.',

    // ── screenshots (S1) ─────────────────────────────────────────────────
    'screenshots.title': 'Capturas',
    'screenshots.lead': 'Recorrido visual de la aplicación.',
    'screenshots.note': 'Imágenes pendientes: los marcadores se reemplazan por capturas reales siguiendo la convención documentada.',
    'screenshots.cap.dashboard': 'Panel',
    'screenshots.cap.products': 'Productos',
    'screenshots.cap.warehouses': 'Almacenes',
    'screenshots.cap.movements': 'Movimientos',
    'screenshots.cap.audit': 'Auditoría',
    'screenshots.cap.login': 'Inicio de sesión',
    'screenshots.cap.register': 'Registro',

    // ── footer (P13) ─────────────────────────────────────────────────────
    'footer.built': 'Sitio estático bilingüe · sin build · sin dependencias',
    'footer.repo': 'Repositorio: <a href="https://github.com/JulioN02/inventory-stock">github.com/JulioN02/inventory-stock</a>'
  },

  en: {
    // ── meta ─────────────────────────────────────────────────────────────
    'meta.title': 'Inventory & Stock — Inventory and Stock Management System',
    'meta.description': 'Portfolio project: an inventory and stock system where stock is derived from an immutable movement ledger. Modular monolith + vertical slices, API-first, Express 5 + React 19 + PostgreSQL 16.',

    // ── topbar / nav ─────────────────────────────────────────────────────
    'topbar.skipLink': 'Skip to content',
    'topbar.brand': 'Inventory & Stock',
    'topbar.navLabel': 'Navigation',
    'topbar.localeLabel': 'Language',
    'nav.overview': 'Overview',
    'nav.features': 'Features',
    'nav.fundamentals': 'Fundamentals',
    'nav.architecture': 'Architecture',
    'nav.stack': 'Stack',
    'nav.modules': 'Modules',
    'nav.dataModel': 'Data model',
    'nav.api': 'API',
    'nav.run': 'How to run',
    'nav.tests': 'Tests',
    'nav.labs': 'Labs',
    'nav.screenshots': 'Screenshots',

    // ── hero (P1) ────────────────────────────────────────────────────────
    'hero.badge': 'Professional project · Season 1',
    'hero.title': 'Inventory & Stock Management System',
    'hero.pitch': 'Stock is a <strong>consequence</strong> of immutable movements, not a value you edit by hand.',
    'hero.status': 'Delivered · 138/138 tests · clean typecheck',
    'hero.ctaRepo': 'View repository',
    'hero.ctaRun': 'How to run',

    // ── overview (P2) ────────────────────────────────────────────────────
    'overview.title': 'Project overview',
    'overview.lead': '<strong>Not</strong> your typical inventory CRUD.',
    'overview.insight': 'Stock is never set: it is derived from the movement ledger. Each movement is an immutable row and the balance is an aggregate view.',
    'overview.flowPurchase': 'Purchase flow',
    'overview.flowSale': 'Sale flow',

    // ── features (P3) ────────────────────────────────────────────────────
    'features.title': 'Features / capabilities',
    'features.lead': 'What the project demonstrates beyond product CRUD.',
    'features.card1.title': 'Transactions',
    'features.card1.body': 'Atomic multi-table operations: if one part fails, no partial change is left behind.',
    'features.card2.title': 'Consistency',
    'features.card2.body': 'Stock invariants under concurrency; overselling is impossible (LAB-01).',
    'features.card3.title': 'Idempotency',
    'features.card3.body': 'Safe retries with no duplicate effects via idempotency keys (LAB-02).',
    'features.card4.title': 'Audit',
    'features.card4.body': 'Who, when, and what changed — immutably and append-only (LAB-08).',
    'features.card5.title': 'SQL',
    'features.card5.body': 'Parameterized queries, RBAC joins, and the aggregate stock_levels view.',
    'features.card6.title': 'Permissions',
    'features.card6.body': 'RBAC verified per request over modules and operations.',

    // ── fundamentals (P4) ────────────────────────────────────────────────
    'fundamentals.title': 'Fundamentals',
    'fundamentals.lead': 'The domain rules that hold the system together.',
    'fundamentals.item1': 'Immutable ledger: movements are never edited or deleted.',
    'fundamentals.item2': 'Each movement is a row with <code>quantity &gt; 0</code> and a <code>sign</code> of ±1.',
    'fundamentals.item3': '<code>stock_levels</code> is a view: <code>SUM(quantity * sign)</code>.',
    'fundamentals.item4': 'A <code>pg_advisory_xact_lock</code> per <code>(product, warehouse)</code> key prevents overselling under concurrency.',
    'fundamentals.item5': 'Idempotency via <code>idempotency_key</code> + canonical <code>request_hash</code> (SHA-256): a replay returns 200 and a new operation, 201.',
    'fundamentals.item6': 'Append-only audit is enforced by the <code>forbid_ledger_mutation</code> database trigger.',

    // ── architecture (P5) ────────────────────────────────────────────────
    'architecture.title': 'Architecture',
    'architecture.lead': 'A modular monolith organized by vertical slices, with an API-first contract.',
    'architecture.point1': 'Modular monolith + vertical slices: each module groups its domain, service, and routes.',
    'architecture.point2': 'API-first: the HTTP contract is defined before the UI and is the source of truth.',
    'architecture.point3': 'Single origin: Express serves the built SPA, with no CORS between frontend and backend.',

    // ── stack (P6) ───────────────────────────────────────────────────────
    'stack.title': 'Stack',
    'stack.lead': 'Exact versions, no ranges.',
    'stack.backend.title': 'Backend',
    'stack.backend.items': '<li>Node.js (ESM) + TypeScript 5.9 strict</li><li>Express 5.2.1</li><li>zod 4.4.3</li><li>pg 8.23.0</li><li>bcryptjs 3.0.3</li><li>jsonwebtoken 9.0.3</li><li>cookie-parser 1.4.7</li>',
    'stack.frontend.title': 'Frontend',
    'stack.frontend.items': '<li>React 19.2.8 (React Compiler)</li><li>Vite 6.4.3</li><li>react-router-dom 7.18.2</li><li>Plain CSS</li><li>Fetch client with in-memory token</li>',
    'stack.database.title': 'Database',
    'stack.database.items': '<li>PostgreSQL 16 (Docker, port 55434)</li>',
    'stack.testing.title': 'Testing',
    'stack.testing.items': '<li>node:test + supertest</li><li>138/138 tests</li><li>Clean typecheck</li>',

    // ── modules (P7) ─────────────────────────────────────────────────────
    'modules.title': 'Modules',
    'modules.lead': 'Six modules with clear responsibilities.',
    'modules.th.module': 'Module',
    'modules.th.role': 'Role',
    'modules.products.role': 'Product catalog',
    'modules.warehouses.role': 'Physical storage locations',
    'modules.movements.role': 'Immutable ledger: receiving, sale, transfer, and adjustment',
    'modules.stock.role': 'State derived from movements (SQL view)',
    'modules.auth.role': 'Login, rotating refresh, and 13 permissions over 4 roles (admin/operator/viewer/auditor)',
    'modules.audit.role': 'Append-only audit of domain and auth events',

    // ── data model (P8) ──────────────────────────────────────────────────
    'dataModel.title': 'Data model',
    'dataModel.lead': 'Normalized tables plus a view for the derived balance.',
    'dataModel.tablesLabel': 'Tables',
    'dataModel.tables': '<li><code>users</code></li><li><code>roles</code></li><li><code>permissions</code></li><li><code>role_permissions</code></li><li><code>user_roles</code></li><li><code>refresh_tokens</code></li><li><code>products</code></li><li><code>warehouses</code></li><li><code>movements</code></li><li><code>audit_log</code></li>',
    'dataModel.viewLabel': 'View',
    'dataModel.view': 'stock_levels = SUM(quantity * sign)',
    'dataModel.note': 'The <code>products</code> table has no quantity column: stock is always computed from movements.',

    // ── api (P9) ─────────────────────────────────────────────────────────
    'api.title': 'API',
    'api.lead': 'The system HTTP surface, grouped by resource.',
    'api.health': '<code>GET /api/health</code>',
    'api.auth': '<code>POST /api/auth/{register,login,refresh,logout}</code> — <code>register</code> is admin-only.',
    'api.products': '<code>GET/POST/PATCH/DELETE /api/products</code>',
    'api.warehouses': '<code>GET/POST/PATCH/DELETE /api/warehouses</code>',
    'api.movements': '<code>POST/GET /api/movements</code>, <code>POST /api/movements/transfers</code>, <code>POST /api/movements/adjustments</code>',
    'api.stock': '<code>GET /api/stock</code>, <code>GET /api/stock/low</code>',
    'api.audit': '<code>GET /api/audit</code>',
    'api.note': 'All protected routes verify permissions per request.',

    // ── run (P10) ────────────────────────────────────────────────────────
    'run.title': 'How to run',
    'run.lead': 'Requires Docker and Node.js.',
    'run.commands': 'docker compose up -d          # PostgreSQL 16 (port 55434)\nnpm run migrate               # migrations\nnpm run seed:admin            # admin bootstrap\nnpm run dev:api               # Express 5 at http://localhost:3000\nnpm run dev:web               # Vite + React 19 at http://localhost:5173\nnpm test                      # 138/138\nnpm run typecheck',
    'run.note': 'Copy <code>backend/.env.example</code> to <code>backend/.env</code> before running the backend.',

    // ── tests (P11) ──────────────────────────────────────────────────────
    'tests.title': 'Tests',
    'tests.lead': 'The project quality evidence.',
    'tests.stat': '138/138',
    'tests.item1': 'Backend suite with node:test + supertest.',
    'tests.item2': 'Clean typecheck under strict TypeScript.',
    'tests.item3': 'No automated frontend tests: a documented decision, verified via typecheck and manual E2E.',

    // ── labs (P12) ───────────────────────────────────────────────────────
    'labs.title': 'Labs',
    'labs.lead': 'The exercises that shaped the system.',
    'labs.lab1.title': 'LAB-01 · Race Condition',
    'labs.lab1.body': 'Stock consistency under concurrency: the per product-and-warehouse advisory lock prevents overselling.',
    'labs.lab2.title': 'LAB-02 · Idempotency',
    'labs.lab2.body': 'Repeated operations with no duplicate effects: the idempotency key and request hash detect retries.',
    'labs.lab8.title': 'LAB-08 · Audit Trail',
    'labs.lab8.body': 'Immutable audit: the database trigger rejects any mutation of the ledger and the audit log.',

    // ── screenshots (S1) ─────────────────────────────────────────────────
    'screenshots.title': 'Screenshots',
    'screenshots.lead': 'A visual walkthrough of the application.',
    'screenshots.note': 'Images pending: placeholders are replaced with real captures following the documented convention.',
    'screenshots.cap.dashboard': 'Dashboard',
    'screenshots.cap.products': 'Products',
    'screenshots.cap.warehouses': 'Warehouses',
    'screenshots.cap.movements': 'Movements',
    'screenshots.cap.audit': 'Audit',
    'screenshots.cap.login': 'Login',
    'screenshots.cap.register': 'Register',

    // ── footer (P13) ─────────────────────────────────────────────────────
    'footer.built': 'Bilingual static site · no build · no dependencies',
    'footer.repo': 'Repository: <a href="https://github.com/JulioN02/inventory-stock">github.com/JulioN02/inventory-stock</a>'
  }
};