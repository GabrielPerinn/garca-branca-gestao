export type PlanningClassification = 'viable' | 'attention' | 'high_risk'

export interface PlanningCoverage {
  expenseRecords: number
  revenueRecords: number
  activeLots: number
  activePastures: number
  pasturesWithCapacity: number
}

export interface PlanningBaseline {
  farmId: string
  farmName: string
  snapshotAt: string
  today: string
  herdSize: number
  pastureCapacity: number
  occupancyRate: number | null
  monthlyRevenue: number
  monthlyExpenses: number
  monthlyResult: number
  openCriticalRisks: number
  dataConfidence: number
  coverage: PlanningCoverage
}

export interface PlanningAssumptions {
  horizonMonths: number
  herdDelta: number
  purchasePricePerHead: number
  salePricePerHead: number
  monthlyCostPerHead: number
  capacityExpansion: number
  monthlyRevenueChangePercent: number
  monthlyExpenseChangePercent: number
  upfrontInvestment: number
}

export interface PlanningSimulationResult {
  baselineHorizonResult: number
  scenarioHorizonResult: number
  operationalDifference: number
  acquisitionOutlay: number
  saleProceeds: number
  investmentOutlay: number
  netCashImpact: number
  projectedMonthlyRevenue: number
  projectedMonthlyExpenses: number
  projectedMonthlyResult: number
  projectedHerdSize: number
  projectedCapacity: number
  projectedOccupancyRate: number | null
  paybackMonths: number | null
  confidenceScore: number
  classification: PlanningClassification
  warnings: string[]
}

export const defaultPlanningAssumptions: PlanningAssumptions = {
  horizonMonths: 12,
  herdDelta: 0,
  purchasePricePerHead: 0,
  salePricePerHead: 0,
  monthlyCostPerHead: 0,
  capacityExpansion: 0,
  monthlyRevenueChangePercent: 0,
  monthlyExpenseChangePercent: 0,
  upfrontInvestment: 0,
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function simulatePlanningScenario(
  baseline: PlanningBaseline,
  rawAssumptions: PlanningAssumptions,
): PlanningSimulationResult {
  const assumptions: PlanningAssumptions = {
    horizonMonths: Math.round(clamp(finite(rawAssumptions.horizonMonths, 12), 1, 60)),
    herdDelta: Math.round(clamp(finite(rawAssumptions.herdDelta), -baseline.herdSize, 100_000)),
    purchasePricePerHead: Math.max(0, finite(rawAssumptions.purchasePricePerHead)),
    salePricePerHead: Math.max(0, finite(rawAssumptions.salePricePerHead)),
    monthlyCostPerHead: Math.max(0, finite(rawAssumptions.monthlyCostPerHead)),
    capacityExpansion: Math.max(0, finite(rawAssumptions.capacityExpansion)),
    monthlyRevenueChangePercent: clamp(finite(rawAssumptions.monthlyRevenueChangePercent), -100, 500),
    monthlyExpenseChangePercent: clamp(finite(rawAssumptions.monthlyExpenseChangePercent), -100, 500),
    upfrontInvestment: Math.max(0, finite(rawAssumptions.upfrontInvestment)),
  }

  const projectedHerdSize = Math.max(0, baseline.herdSize + assumptions.herdDelta)
  const projectedCapacity = Math.max(0, baseline.pastureCapacity + assumptions.capacityExpansion)
  const herdCostChange = assumptions.herdDelta * assumptions.monthlyCostPerHead
  const projectedMonthlyRevenue = Math.max(
    0,
    baseline.monthlyRevenue * (1 + assumptions.monthlyRevenueChangePercent / 100),
  )
  const projectedMonthlyExpenses = Math.max(
    0,
    baseline.monthlyExpenses * (1 + assumptions.monthlyExpenseChangePercent / 100) + herdCostChange,
  )
  const projectedMonthlyResult = projectedMonthlyRevenue - projectedMonthlyExpenses
  const baselineHorizonResult = baseline.monthlyResult * assumptions.horizonMonths
  const scenarioHorizonResult = projectedMonthlyResult * assumptions.horizonMonths
  const operationalDifference = scenarioHorizonResult - baselineHorizonResult
  const acquisitionOutlay = Math.max(0, assumptions.herdDelta) * assumptions.purchasePricePerHead
  const saleProceeds = Math.max(0, -assumptions.herdDelta) * assumptions.salePricePerHead
  const investmentOutlay = assumptions.upfrontInvestment
  const netCashImpact = operationalDifference - acquisitionOutlay - investmentOutlay + saleProceeds
  const projectedOccupancyRate = projectedCapacity > 0 ? projectedHerdSize / projectedCapacity * 100 : null
  const monthlyImprovement = projectedMonthlyResult - baseline.monthlyResult
  const netUpfrontOutlay = Math.max(0, acquisitionOutlay + investmentOutlay - saleProceeds)
  const paybackMonths = netUpfrontOutlay > 0 && monthlyImprovement > 0
    ? netUpfrontOutlay / monthlyImprovement
    : null

  let confidenceScore = baseline.dataConfidence
  const warnings: string[] = []
  if (assumptions.herdDelta > 0 && assumptions.purchasePricePerHead === 0) {
    confidenceScore -= 12
    warnings.push('Informe o preço de compra por cabeça para incluir o desembolso da aquisição.')
  }
  if (assumptions.herdDelta < 0 && assumptions.salePricePerHead === 0) {
    confidenceScore -= 10
    warnings.push('Informe o preço de venda por cabeça para contabilizar a receita da redução do rebanho.')
  }
  if (assumptions.herdDelta !== 0 && assumptions.monthlyCostPerHead === 0) {
    confidenceScore -= 8
    warnings.push('O custo mensal por cabeça está zerado; o efeito operacional do rebanho pode estar subestimado.')
  }
  if (assumptions.capacityExpansion > 0 && assumptions.upfrontInvestment === 0) {
    confidenceScore -= 6
    warnings.push('A expansão de capacidade não possui investimento associado.')
  }
  if (baseline.monthlyRevenue === 0 && baseline.monthlyExpenses === 0) {
    warnings.push('Não há histórico financeiro recente; o resultado considera apenas as premissas informadas.')
  }
  if (projectedCapacity === 0 && projectedHerdSize > 0) {
    confidenceScore -= 10
    warnings.push('Não existe capacidade de pasto informada para comparar com o rebanho projetado.')
  } else if (projectedOccupancyRate !== null && projectedOccupancyRate > 115) {
    warnings.push('A projeção ultrapassa 115% da capacidade informada dos pastos.')
  } else if (projectedOccupancyRate !== null && projectedOccupancyRate > 100) {
    warnings.push('A projeção ultrapassa a capacidade informada dos pastos.')
  }
  if (projectedMonthlyResult < 0) {
    warnings.push('O cenário termina com resultado operacional mensal negativo.')
  }
  if (baseline.openCriticalRisks > 0) {
    warnings.push(`A base possui ${baseline.openCriticalRisks} risco(s) crítico(s) ativo(s) no Autopiloto.`)
  }

  confidenceScore = Math.round(clamp(confidenceScore, 0, 100))
  const materialLossThreshold = Math.max(100_000, Math.abs(baselineHorizonResult) * 0.5)
  let classification: PlanningClassification = 'viable'
  if (
    (projectedOccupancyRate !== null && projectedOccupancyRate > 115)
    || (projectedMonthlyResult < 0 && projectedMonthlyResult < baseline.monthlyResult)
    || netCashImpact < -materialLossThreshold
  ) {
    classification = 'high_risk'
  } else if (
    projectedOccupancyRate === null
    || projectedOccupancyRate > 100
    || netCashImpact < 0
    || confidenceScore < 60
  ) {
    classification = 'attention'
  }

  return {
    baselineHorizonResult: money(baselineHorizonResult),
    scenarioHorizonResult: money(scenarioHorizonResult),
    operationalDifference: money(operationalDifference),
    acquisitionOutlay: money(acquisitionOutlay),
    saleProceeds: money(saleProceeds),
    investmentOutlay: money(investmentOutlay),
    netCashImpact: money(netCashImpact),
    projectedMonthlyRevenue: money(projectedMonthlyRevenue),
    projectedMonthlyExpenses: money(projectedMonthlyExpenses),
    projectedMonthlyResult: money(projectedMonthlyResult),
    projectedHerdSize,
    projectedCapacity,
    projectedOccupancyRate: projectedOccupancyRate === null ? null : money(projectedOccupancyRate),
    paybackMonths: paybackMonths === null ? null : money(paybackMonths),
    confidenceScore,
    classification,
    warnings,
  }
}

export function currentGoalMetricValue(metric: string, baseline: PlanningBaseline) {
  const values: Record<string, number> = {
    monthly_result: baseline.monthlyResult,
    herd_size: baseline.herdSize,
    monthly_revenue: baseline.monthlyRevenue,
    monthly_expenses: baseline.monthlyExpenses,
    stocking_rate: baseline.occupancyRate ?? 0,
  }
  return values[metric] ?? 0
}

export function goalProgressPercent(baselineValue: number, targetValue: number, currentValue: number) {
  if (![baselineValue, targetValue, currentValue].every(Number.isFinite)) return 0
  if (targetValue === baselineValue) return currentValue === targetValue ? 100 : 0
  return clamp((currentValue - baselineValue) / (targetValue - baselineValue) * 100, 0, 100)
}
