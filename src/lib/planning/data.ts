import 'server-only'

import { getCivilDate, shiftCivilDate } from '@/lib/date'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { PlanningBaseline } from './simulator'

type NumberLike = number | string | null

function number(value: NumberLike) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function sum<T>(rows: T[], selector: (row: T) => NumberLike) {
  return rows.reduce((total, row) => total + number(selector(row)), 0)
}

export async function getPlanningBaseline(actorProfileId?: string): Promise<PlanningBaseline | null> {
  const supabase = createServiceRoleClient({ actorProfileId })
  const { data: farm, error: farmError } = await supabase
    .from('farms')
    .select('id, name')
    .neq('status', 'deleted')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (farmError) throw new Error(`Não foi possível carregar a propriedade: ${farmError.message}`)
  if (!farm) return null

  const today = getCivilDate()
  const startDate = shiftCivilDate(today, -89)
  const [expensesResult, revenuesResult, lotsResult, pasturesResult, risksResult] = await Promise.all([
    supabase.from('expenses').select('amount').neq('status', 'deleted').gte('expense_date', startDate).lte('expense_date', today).limit(10_000),
    supabase.from('revenues').select('amount').neq('status', 'deleted').gte('revenue_date', startDate).lte('revenue_date', today).limit(10_000),
    supabase.from('cattle_lots').select('current_quantity').eq('farm_id', farm.id).neq('status', 'deleted').limit(2_000),
    supabase.from('pastures').select('approximate_capacity').eq('farm_id', farm.id).neq('status', 'deleted').limit(2_000),
    supabase.from('autopilot_findings').select('id', { count: 'exact', head: true }).eq('farm_id', farm.id).eq('severity', 'critical').in('status', ['open', 'acknowledged']),
  ])
  const error = expensesResult.error || revenuesResult.error || lotsResult.error || pasturesResult.error || risksResult.error
  if (error) throw new Error(`Não foi possível montar a linha de base: ${error.message}`)

  const expenses = expensesResult.data ?? []
  const revenues = revenuesResult.data ?? []
  const lots = lotsResult.data ?? []
  const pastures = pasturesResult.data ?? []
  const pasturesWithCapacity = pastures.filter(row => row.approximate_capacity !== null)
  const herdSize = sum(lots, row => row.current_quantity)
  const pastureCapacity = sum(pasturesWithCapacity, row => row.approximate_capacity)
  const monthlyExpenses = sum(expenses, row => row.amount) / 3
  const monthlyRevenue = sum(revenues, row => row.amount) / 3
  let dataConfidence = 30
  if (expenses.length > 0) dataConfidence += 20
  if (revenues.length > 0) dataConfidence += 20
  if (pasturesWithCapacity.length > 0) dataConfidence += 15
  if (lots.length > 0) dataConfidence += 15

  return {
    farmId: farm.id,
    farmName: farm.name,
    snapshotAt: new Date().toISOString(),
    today,
    herdSize,
    pastureCapacity,
    occupancyRate: pastureCapacity > 0 ? herdSize / pastureCapacity * 100 : null,
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
    monthlyResult: Math.round((monthlyRevenue - monthlyExpenses) * 100) / 100,
    openCriticalRisks: risksResult.count ?? 0,
    dataConfidence,
    coverage: {
      expenseRecords: expenses.length,
      revenueRecords: revenues.length,
      activeLots: lots.length,
      activePastures: pastures.length,
      pasturesWithCapacity: pasturesWithCapacity.length,
    },
  }
}
