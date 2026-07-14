import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultReportRange,
  InvalidReportRangeError,
  managementReportToCsv,
  parseReportRange,
  type ManagementReport,
} from '../src/lib/reports/report-utils'

test('período do relatório usa o mês atual e valida limites', () => {
  assert.deepEqual(defaultReportRange('2026-07-13'), { from: '2026-07-01', to: '2026-07-13' })
  assert.deepEqual(parseReportRange(undefined, undefined, '2026-07-13'), { from: '2026-07-01', to: '2026-07-13' })
  assert.deepEqual(parseReportRange('2026-01-01', '2026-12-31'), { from: '2026-01-01', to: '2026-12-31' })

  assert.throws(() => parseReportRange('2026-02-30', '2026-03-01'), InvalidReportRangeError)
  assert.throws(() => parseReportRange('2026-07-10', '2026-07-01'), InvalidReportRangeError)
  assert.throws(() => parseReportRange('2025-01-01', '2026-07-01'), InvalidReportRangeError)
})

test('CSV gerencial abre no Excel e neutraliza fórmulas em dados textuais', () => {
  const report: ManagementReport = {
    range: { from: '2026-07-01', to: '2026-07-13' },
    farm: { name: '=HYPERLINK("https://example.com")', location: 'Cáceres; MT' },
    finance: {
      expenses: 100,
      revenues: 250,
      balance: -150,
      expenseCount: 1,
      revenueCount: 1,
      sales: 250,
      payroll: 0,
      expenseCategories: [{ category: 'Combustível', amount: 100, share: 100 }],
      revenueCategories: [{ category: 'Gado', amount: 250, share: 100 }],
      monthlySeries: [{ month: 'Jul 26', receita: 250, despesa: 100, saldo: 150 }],
      largestExpenses: [],
      expenseRows: [{
        id: 'expense-1',
        expense_date: '2026-07-10',
        category: 'Combustível',
        description: '+cmd',
        supplier_name: 'Posto "Central"',
        amount: 100,
      }],
      revenueRows: [{
        id: 'revenue-1',
        revenue_date: '2026-07-11',
        category: 'Gado',
        description: 'Venda',
        amount: 250,
      }],
    },
    operation: {
      totalHeads: 120,
      activeLots: 2,
      averageHeadsPerLot: 60,
      inventoryItems: 4,
      lowStockItems: 1,
      pendingTasks: 2,
      overdueTasks: 1,
      completedTasks: 3,
      activeAlerts: 1,
    },
    generatedAt: '2026-07-13T12:00:00.000Z',
  }

  const csv = managementReportToCsv(report)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes(';'))
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'))
  assert.ok(csv.includes('"\'+cmd"'))
  assert.ok(csv.includes('"Posto ""Central"""'))
  assert.ok(csv.includes('"Saldo";"-150"'))
  assert.ok(!csv.includes('"Saldo";"\'-150"'))
})
