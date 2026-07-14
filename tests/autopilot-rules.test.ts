import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateAutopilotSnapshot, type AutopilotRule, type AutopilotSnapshot } from '../src/lib/autopilot/rules'

const rules: AutopilotRule[] = [
  { id: '1', rule_key: 'overdue_tasks', enabled: true, config_json: { critical_days: 7 } },
  { id: '2', rule_key: 'low_inventory', enabled: true, config_json: {} },
  { id: '3', rule_key: 'pasture_overcapacity', enabled: true, config_json: { critical_ratio: 1.2 } },
  { id: '4', rule_key: 'unreviewed_occurrences', enabled: true, config_json: { critical_hours: 48 } },
  { id: '5', rule_key: 'expiring_documents', enabled: true, config_json: { warning_days: 30 } },
  { id: '6', rule_key: 'stale_weighings', enabled: true, config_json: { stale_days: 90 } },
  { id: '7', rule_key: 'expense_acceleration', enabled: true, config_json: { ratio: 1.5, minimum_delta: 10000 } },
]

function snapshot(overrides: Partial<AutopilotSnapshot> = {}): AutopilotSnapshot {
  return {
    today: '2026-07-13', now: '2026-07-13T12:00:00.000Z', tasks: [], inventory: [], pastures: [], cattleLots: [],
    occurrences: [], documents: [], weighings: [], expenses: [], revenues: [], ...overrides,
  }
}

test('prioriza tarefa vencida e preserva evidência verificável', () => {
  const result = evaluateAutopilotSnapshot(snapshot({ tasks: [{ id: 'task-1', title: 'Reparar cerca', due_date: '2026-07-01', priority: 'high', status: 'pending' }] }), rules)
  const finding = result.findings.find(item => item.ruleKey === 'overdue_tasks')
  assert.equal(finding?.severity, 'critical')
  assert.equal(finding?.evidence.overdue_days, 12)
  assert.equal(finding?.relatedTable, 'tasks')
})

test('detecta simultaneamente ruptura de estoque e sobrecarga de pasto', () => {
  const result = evaluateAutopilotSnapshot(snapshot({
    inventory: [{ id: 'item-1', name: 'Sal mineral', current_quantity: 0, minimum_quantity: 50, status: 'active' }],
    pastures: [{ id: 'pasture-1', name: 'Norte', approximate_capacity: 100, status: 'active' }],
    cattleLots: [{ id: 'lot-1', name: 'Garrotes', current_quantity: 130, pasture_id: 'pasture-1', status: 'active' }],
  }), rules)
  assert.equal(result.findings.find(item => item.ruleKey === 'low_inventory')?.severity, 'critical')
  assert.equal(result.findings.find(item => item.ruleKey === 'pasture_overcapacity')?.severity, 'critical')
})

test('diferencia documento vencido e lote sem pesagem recente', () => {
  const result = evaluateAutopilotSnapshot(snapshot({
    documents: [{ id: 'doc-1', title: 'Licença', expiration_date: '2026-07-10', status: 'active' }],
    cattleLots: [{ id: 'lot-1', name: 'Matrizes', current_quantity: 80, pasture_id: null, status: 'active' }],
    weighings: [],
  }), rules)
  assert.equal(result.findings.find(item => item.ruleKey === 'expiring_documents')?.severity, 'critical')
  assert.equal(result.findings.find(item => item.ruleKey === 'stale_weighings')?.severity, 'high')
})

test('sinaliza aceleração material de despesas com contexto de receitas', () => {
  const result = evaluateAutopilotSnapshot(snapshot({
    expenses: [
      { amount: 60000, expense_date: '2026-07-10', status: 'active' },
      { amount: 20000, expense_date: '2026-06-01', status: 'active' },
    ],
    revenues: [{ amount: 10000, revenue_date: '2026-07-08', status: 'active' }],
  }), rules)
  const finding = result.findings.find(item => item.ruleKey === 'expense_acceleration')
  assert.equal(finding?.severity, 'critical')
  assert.equal(finding?.evidence.delta, 40000)
})

test('não inventa risco quando os indicadores estão dentro dos limites', () => {
  const result = evaluateAutopilotSnapshot(snapshot({
    tasks: [{ id: 'task-1', title: 'Rotina', due_date: '2026-07-20', priority: 'medium', status: 'pending' }],
    inventory: [{ id: 'item-1', name: 'Sal', current_quantity: 80, minimum_quantity: 50, status: 'active' }],
  }), rules)
  assert.equal(result.findings.length, 0)
  assert.equal(result.evaluatedRuleKeys.length, 7)
})
