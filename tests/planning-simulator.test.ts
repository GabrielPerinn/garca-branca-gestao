import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultPlanningAssumptions,
  goalProgressPercent,
  simulatePlanningScenario,
  type PlanningBaseline,
} from '../src/lib/planning/simulator'

function baseline(overrides: Partial<PlanningBaseline> = {}): PlanningBaseline {
  return {
    farmId: 'farm-1', farmName: 'Garça Branca', snapshotAt: '2026-07-13T12:00:00.000Z', today: '2026-07-13',
    herdSize: 100, pastureCapacity: 150, occupancyRate: 66.67,
    monthlyRevenue: 200_000, monthlyExpenses: 120_000, monthlyResult: 80_000,
    openCriticalRisks: 0, dataConfidence: 100,
    coverage: { expenseRecords: 20, revenueRecords: 10, activeLots: 2, activePastures: 3, pasturesWithCapacity: 3 },
    ...overrides,
  }
}

test('redução de custos melhora resultado e calcula impacto no horizonte', () => {
  const result = simulatePlanningScenario(baseline(), {
    ...defaultPlanningAssumptions, horizonMonths: 12, monthlyExpenseChangePercent: -10,
  })
  assert.equal(result.projectedMonthlyExpenses, 108_000)
  assert.equal(result.projectedMonthlyResult, 92_000)
  assert.equal(result.netCashImpact, 144_000)
  assert.equal(result.classification, 'viable')
})

test('crescimento acima da capacidade é classificado como risco elevado', () => {
  const result = simulatePlanningScenario(baseline(), {
    ...defaultPlanningAssumptions, herdDelta: 100, purchasePricePerHead: 3_500, monthlyCostPerHead: 80,
  })
  assert.equal(result.projectedHerdSize, 200)
  assert.ok((result.projectedOccupancyRate ?? 0) > 115)
  assert.equal(result.classification, 'high_risk')
  assert.ok(result.warnings.some(item => item.includes('115%')))
})

test('redução do rebanho contabiliza receita de venda e reduz a lotação', () => {
  const result = simulatePlanningScenario(baseline(), {
    ...defaultPlanningAssumptions, herdDelta: -20, salePricePerHead: 4_000, monthlyCostPerHead: 70,
  })
  assert.equal(result.saleProceeds, 80_000)
  assert.equal(result.projectedHerdSize, 80)
  assert.ok((result.projectedOccupancyRate ?? 100) < 60)
})

test('premissas financeiras ausentes reduzem a confiança e geram avisos', () => {
  const result = simulatePlanningScenario(baseline(), { ...defaultPlanningAssumptions, herdDelta: 10 })
  assert.equal(result.confidenceScore, 80)
  assert.ok(result.warnings.some(item => item.includes('preço de compra')))
  assert.ok(result.warnings.some(item => item.includes('custo mensal')))
})

test('payback usa desembolso líquido e ganho operacional mensal', () => {
  const result = simulatePlanningScenario(baseline(), {
    ...defaultPlanningAssumptions, upfrontInvestment: 120_000, monthlyExpenseChangePercent: -10,
  })
  assert.equal(result.paybackMonths, 10)
})

test('progresso da meta funciona também quando o objetivo é reduzir o indicador', () => {
  assert.equal(goalProgressPercent(120_000, 100_000, 110_000), 50)
  assert.equal(goalProgressPercent(120_000, 100_000, 90_000), 100)
})
