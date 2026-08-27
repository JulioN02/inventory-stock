import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from '../../src/permissions/registry.ts'

const EXPECTED_CODES = [
  'users:create',
  'catalog:create',
  'catalog:read',
  'catalog:update',
  'catalog:deactivate',
  'movements:create',
  'movements:read',
  'purchasing:create',
  'purchasing:read',
  'purchasing:update',
  'purchasing:receive',
  'audit:read',
  'reports:read',
]

test('registry exports the full permission set (13 codes, incl. users:create)', () => {
  assert.deepEqual([...ALL_PERMISSIONS].sort(), [...EXPECTED_CODES].sort())
})

test('every permission code matches the {module}:{operation} format', () => {
  for (const code of ALL_PERMISSIONS) {
    assert.match(code, /^[a-z]+:[a-z]+$/, `code ${code} must be {module}:{operation}`)
  }
})

test('admin role grants every permission', () => {
  assert.deepEqual(ROLE_PERMISSIONS[ROLES.admin], ALL_PERMISSIONS)
})

test('operator role grants catalog/movements/purchasing write+read', () => {
  const expected = [
    PERMISSIONS.catalog.create,
    PERMISSIONS.catalog.read,
    PERMISSIONS.catalog.update,
    PERMISSIONS.catalog.deactivate,
    PERMISSIONS.movements.create,
    PERMISSIONS.movements.read,
    PERMISSIONS.purchasing.create,
    PERMISSIONS.purchasing.read,
    PERMISSIONS.purchasing.update,
    PERMISSIONS.purchasing.receive,
  ]
  assert.deepEqual([...ROLE_PERMISSIONS[ROLES.operator]].sort(), [...expected].sort())
})

test('viewer role grants read-only + reports:read', () => {
  const expected = [
    PERMISSIONS.catalog.read,
    PERMISSIONS.movements.read,
    PERMISSIONS.purchasing.read,
    PERMISSIONS.reports.read,
  ]
  assert.deepEqual([...ROLE_PERMISSIONS[ROLES.viewer]].sort(), [...expected].sort())
})

test('auditor role grants audit:read + reports:read', () => {
  const expected = [PERMISSIONS.audit.read, PERMISSIONS.reports.read]
  assert.deepEqual([...ROLE_PERMISSIONS[ROLES.auditor]].sort(), [...expected].sort())
})