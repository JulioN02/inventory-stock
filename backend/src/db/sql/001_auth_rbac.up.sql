-- 001_auth_rbac.up.sql — RBAC + refresh tokens (I1, per design #911)
-- Idempotent: CREATE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- bcryptjs cost 10, never plaintext (AUTH-7)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,            -- admin | operator | viewer | auditor
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE             -- '{module}:{operation}', mirrors const registry
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- = JWT jti claim
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL,                    -- SHA-256 hex of token; raw token NEVER stored
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,                          -- NULL = active
  replaced_by UUID,                                -- jti that rotated this one
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);

-- Seed permissions (13 codes — 12 per design + users:create for admin-only
-- registration, OQ-3 confirmed)
INSERT INTO permissions (code) VALUES
  ('users:create'),
  ('catalog:create'), ('catalog:read'), ('catalog:update'), ('catalog:deactivate'),
  ('movements:create'), ('movements:read'),
  ('purchasing:create'), ('purchasing:read'), ('purchasing:update'), ('purchasing:receive'),
  ('audit:read'),
  ('reports:read')
ON CONFLICT (code) DO NOTHING;

-- Seed roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full access to all modules'),
  ('operator', 'Write and read access to catalog, movements and purchasing'),
  ('viewer', 'Read-only access plus reports'),
  ('auditor', 'Audit and reports read access')
ON CONFLICT (name) DO NOTHING;

-- Role → permission matrix (idempotent)
-- admin = all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- operator = catalog + movements + purchasing write & read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'catalog:create', 'catalog:read', 'catalog:update', 'catalog:deactivate',
  'movements:create', 'movements:read',
  'purchasing:create', 'purchasing:read', 'purchasing:update', 'purchasing:receive'
) WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

-- viewer = read-only + reports:read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'catalog:read', 'movements:read', 'purchasing:read', 'reports:read'
) WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;

-- auditor = audit:read + reports:read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('audit:read', 'reports:read')
WHERE r.name = 'auditor'
ON CONFLICT DO NOTHING;