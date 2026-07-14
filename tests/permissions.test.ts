import assert from 'node:assert/strict'
import test from 'node:test'

import { hasPermission, normalizeRole } from '../src/lib/auth/permissions'

test('papéis legados permanecem compatíveis sem conceder acesso a papéis desconhecidos', () => {
  assert.equal(normalizeRole('user'), 'manager')
  assert.equal(normalizeRole('  ADMIN '), 'admin')
  assert.equal(normalizeRole('papel-inventado'), 'viewer')
  assert.equal(normalizeRole(null), 'viewer')
})

test('operador altera operação, mas não financeiro, pessoas ou aprovações', () => {
  assert.equal(hasPermission('operator', 'read'), true)
  assert.equal(hasPermission('operator', 'operations.write'), true)
  assert.equal(hasPermission('operator', 'finance.write'), false)
  assert.equal(hasPermission('operator', 'people.write'), false)
  assert.equal(hasPermission('operator', 'actions.approve'), false)
})

test('visualizador nunca possui permissão de mutação', () => {
  assert.equal(hasPermission('viewer', 'read'), true)
  assert.equal(hasPermission('viewer', 'operations.write'), false)
  assert.equal(hasPermission('viewer', 'settings.write'), false)
})

test('somente administração possui acesso às configurações críticas', () => {
  assert.equal(hasPermission('owner', 'settings.write'), true)
  assert.equal(hasPermission('admin', 'settings.write'), true)
  assert.equal(hasPermission('manager', 'settings.write'), false)
})
