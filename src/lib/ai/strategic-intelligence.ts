import 'server-only'

import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCivilDate, shiftCivilDate } from '@/lib/date'
import { recordAIUsageEvent } from '@/lib/ai/telemetry'
import { getStrategicAnalysisWindow, keepKnownEvidenceKeys } from '@/lib/ai/strategic-rules'

const InsightCategory = z.enum([
  'finance', 'livestock', 'productivity', 'operations',
  'inventory', 'people', 'compliance', 'data_quality',
])
const InsightPriority = z.enum(['critical', 'high', 'medium', 'opportunity'])
const InsightConfidence = z.enum(['high', 'medium', 'low'])
const InsightHorizon = z.enum(['immediate', '30_days', '90_days', 'long_term'])

const StrategicAIOutputSchema = z.object({
  executive_summary: z.string().min(40).max(1_500),
  maturity_score: z.number().int().min(0).max(100),
  maturity_label: z.string().min(3).max(80),
  insights: z.array(z.object({
    category: InsightCategory,
    priority: InsightPriority,
    title: z.string().min(5).max(140),
    finding: z.string().min(20).max(900),
    why_it_matters: z.string().min(20).max(700),
    recommendation: z.string().min(20).max(900),
    estimated_impact: z.string().max(400).nullable(),
    evidence_keys: z.array(z.string()).min(1).max(6),
    confidence: InsightConfidence,
    horizon: InsightHorizon,
    action_title: z.string().max(180).nullable(),
  })).min(3).max(12),
  limitations: z.array(z.string().max(400)).max(8),
})

type AIInsight = z.infer<typeof StrategicAIOutputSchema>['insights'][number]
type FactCategory = z.infer<typeof InsightCategory>

export type StrategicFact = {
  key: string
  category: FactCategory
  label: string
  value: string
  numeric_value: number | null
  unit: string | null
  source: string
  quality: 'high' | 'medium' | 'low'
}

export type StrategicSnapshot = {
  generated_at: string
  window: { start: string; end: string; previous_start: string; previous_end: string }
  farm: { id: string | null; name: string; location: string | null }
  maturity: { score: number; label: string }
  facts: StrategicFact[]
  limitations: string[]
}

type NumberLike = number | string | null
const PAGE_SIZE = 1_000
const MAX_ROWS = 20_000

function number(value: NumberLike | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function sum<T>(rows: T[], selector: (row: T) => NumberLike | undefined) {
  return rows.reduce((total, row) => total + number(selector(row)), 0)
}

function percentage(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function deltaPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

async function fetchAll<T>(
  loader: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
) {
  const rows: T[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await loader(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
  throw new Error('A análise excedeu 20 mil registros em uma fonte. Reduza a janela de análise.')
}

function addFact(
  facts: StrategicFact[],
  fact: Omit<StrategicFact, 'numeric_value' | 'unit' | 'quality'> & {
    numeric_value?: number | null
    unit?: string | null
    quality?: StrategicFact['quality']
  },
) {
  facts.push({
    ...fact,
    numeric_value: fact.numeric_value ?? null,
    unit: fact.unit ?? null,
    quality: fact.quality ?? 'high',
  })
}

function groupAmounts<T>(rows: T[], category: (row: T) => string | null, amount: (row: T) => NumberLike) {
  const grouped = new Map<string, number>()
  for (const row of rows) {
    const key = category(row)?.trim() || 'Sem categoria'
    grouped.set(key, (grouped.get(key) || 0) + number(amount(row)))
  }
  return [...grouped.entries()].sort((left, right) => right[1] - left[1])
}

export async function buildStrategicSnapshot(supabase: SupabaseClient): Promise<StrategicSnapshot> {
  const today = getCivilDate()
  const { start, previousStart, previousEnd } = getStrategicAnalysisWindow(today)
  const weighingStart = shiftCivilDate(today, -365)

  type Expense = { category: string | null; amount: NumberLike; expense_date: string }
  type Revenue = { category: string | null; amount: NumberLike; revenue_date: string }
  type Lot = { id: string; name: string; current_quantity: NumberLike; pasture_id: string | null }
  type Pasture = { id: string; name: string; land_parcel_id: string | null; approximate_capacity: NumberLike; current_condition: string | null; rest_status: string | null }
  type Property = { id: string; name: string; total_area_ha: NumberLike; usable_area_ha: NumberLike; municipality: string | null; state_code: string | null; georeferencing_status: string | null }
  type Weighing = { cattle_lot_id: string | null; weighing_date: string; average_weight: NumberLike; quantity_weighed: NumberLike }
  type Task = { status: string; due_date: string | null; completed_at: string | null; created_at: string }
  type Inventory = { name: string; current_quantity: NumberLike; minimum_quantity: NumberLike }
  type Maintenance = { asset_name: string; maintenance_date: string | null; cost_amount: NumberLike }
  type Sale = { quantity: NumberLike; negotiation_date: string | null; net_amount: NumberLike; gross_amount: NumberLike; payment_status: string | null; expected_payment_date: string | null }
  type Movement = { movement_type: string; quantity: NumberLike; movement_date: string | null }
  type Document = { title: string; expiration_date: string | null }
  type HealthProtocol = { name: string; protocol_type: string; next_due_date: string; status: string }
  type Farm = { id: string; name: string; municipality: string | null; state_code: string | null; location_description: string | null; total_area_ha: NumberLike; productive_area_ha: NumberLike; primary_activity: string | null; livestock_system: string | null; setup_completed_at: string | null }

  const [
    farmResult,
    properties,
    expenses,
    revenues,
    lots,
    pastures,
    weighings,
    tasks,
    inventory,
    maintenance,
    sales,
    movements,
    documents,
    healthProtocols,
    alertsResult,
  ] = await Promise.all([
    supabase.from('farms')
      .select('id, name, municipality, state_code, location_description, total_area_ha, productive_area_ha, primary_activity, livestock_system, setup_completed_at')
      .neq('status', 'deleted').order('created_at').limit(1).maybeSingle(),
    fetchAll<Property>((from, to) => supabase.from('land_parcels')
      .select('id, name, total_area_ha, usable_area_ha, municipality, state_code, georeferencing_status')
      .neq('status', 'deleted').order('name').range(from, to)),
    fetchAll<Expense>((from, to) => supabase.from('expenses')
      .select('category, amount, expense_date').neq('status', 'deleted')
      .gte('expense_date', previousStart).lte('expense_date', today).range(from, to)),
    fetchAll<Revenue>((from, to) => supabase.from('revenues')
      .select('category, amount, revenue_date').neq('status', 'deleted')
      .gte('revenue_date', previousStart).lte('revenue_date', today).range(from, to)),
    fetchAll<Lot>((from, to) => supabase.from('cattle_lots')
      .select('id, name, current_quantity, pasture_id').neq('status', 'deleted').range(from, to)),
    fetchAll<Pasture>((from, to) => supabase.from('pastures')
      .select('id, name, land_parcel_id, approximate_capacity, current_condition, rest_status').neq('status', 'deleted').range(from, to)),
    fetchAll<Weighing>((from, to) => supabase.from('weighings')
      .select('cattle_lot_id, weighing_date, average_weight, quantity_weighed').neq('status', 'deleted')
      .gte('weighing_date', weighingStart).lte('weighing_date', today)
      .order('weighing_date', { ascending: false }).range(from, to)),
    fetchAll<Task>((from, to) => supabase.from('tasks')
      .select('status, due_date, completed_at, created_at').neq('status', 'deleted').range(from, to)),
    fetchAll<Inventory>((from, to) => supabase.from('inventory_items')
      .select('name, current_quantity, minimum_quantity').neq('status', 'deleted').range(from, to)),
    fetchAll<Maintenance>((from, to) => supabase.from('maintenance_records')
      .select('asset_name, maintenance_date, cost_amount').neq('status', 'deleted')
      .gte('maintenance_date', previousStart).lte('maintenance_date', today).range(from, to)),
    fetchAll<Sale>((from, to) => supabase.from('cattle_sales')
      .select('quantity, negotiation_date, net_amount, gross_amount, payment_status, expected_payment_date')
      .neq('status', 'deleted').gte('negotiation_date', previousStart).lte('negotiation_date', today).range(from, to)),
    fetchAll<Movement>((from, to) => supabase.from('cattle_movements')
      .select('movement_type, quantity, movement_date').neq('status', 'deleted')
      .gte('movement_date', previousStart).lte('movement_date', today).range(from, to)),
    fetchAll<Document>((from, to) => supabase.from('documents')
      .select('title, expiration_date').neq('status', 'deleted').range(from, to)),
    fetchAll<HealthProtocol>((from, to) => supabase.from('livestock_protocols')
      .select('name, protocol_type, next_due_date, status').neq('status', 'deleted').range(from, to)),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).neq('status', 'deleted'),
  ])

  if (farmResult.error) throw new Error(farmResult.error.message)
  if (alertsResult.error) throw new Error(alertsResult.error.message)
  const farm = farmResult.data as Farm | null
  const currentExpenses = expenses.filter(row => row.expense_date >= start)
  const previousExpenses = expenses.filter(row => row.expense_date <= previousEnd)
  const currentRevenues = revenues.filter(row => row.revenue_date >= start)
  const previousRevenues = revenues.filter(row => row.revenue_date <= previousEnd)
  const currentExpenseTotal = sum(currentExpenses, row => row.amount)
  const previousExpenseTotal = sum(previousExpenses, row => row.amount)
  const currentRevenueTotal = sum(currentRevenues, row => row.amount)
  const previousRevenueTotal = sum(previousRevenues, row => row.amount)
  const currentBalance = currentRevenueTotal - currentExpenseTotal
  const previousBalance = previousRevenueTotal - previousExpenseTotal
  const expenseDelta = deltaPercent(currentExpenseTotal, previousExpenseTotal)
  const revenueDelta = deltaPercent(currentRevenueTotal, previousRevenueTotal)
  const expenseGroups = groupAmounts(currentExpenses, row => row.category, row => row.amount)
  const topExpense = expenseGroups[0]
  const topExpenseShare = topExpense && currentExpenseTotal > 0 ? topExpense[1] / currentExpenseTotal * 100 : 0

  const totalHeads = sum(lots, row => row.current_quantity)
  const capacity = sum(pastures, row => row.approximate_capacity)
  const stocking = capacity > 0 ? totalHeads / capacity * 100 : null
  const lotsWithoutPasture = lots.filter(lot => !lot.pasture_id && number(lot.current_quantity) > 0)
  const pastureById = new Map(pastures.map(pasture => [pasture.id, pasture]))
  const pasturesWithoutProperty = pastures.filter(pasture => !pasture.land_parcel_id)
  const latestWeighingByLot = new Map<string, Weighing>()
  for (const weighing of weighings) {
    if (weighing.cattle_lot_id && !latestWeighingByLot.has(weighing.cattle_lot_id)) {
      latestWeighingByLot.set(weighing.cattle_lot_id, weighing)
    }
  }
  const staleThreshold = shiftCivilDate(today, -90)
  const staleLots = lots.filter(lot => {
    const latest = latestWeighingByLot.get(lot.id)
    return number(lot.current_quantity) > 0 && (!latest || latest.weighing_date < staleThreshold)
  })
  const weightedQuantity = sum(weighings, row => row.quantity_weighed)
  const weightedKg = weighings.reduce(
    (total, row) => total + number(row.average_weight) * number(row.quantity_weighed), 0,
  )
  const avgWeight = weightedQuantity > 0 ? weightedKg / weightedQuantity : null
  const deaths = sum(movements.filter(row => row.movement_type === 'death' && (row.movement_date || '') >= start), row => row.quantity)
  const births = sum(movements.filter(row => row.movement_type === 'birth' && (row.movement_date || '') >= start), row => row.quantity)

  const openTasks = tasks.filter(row => ['pending', 'in_progress'].includes(row.status))
  const overdueTasks = openTasks.filter(row => row.due_date && row.due_date < today)
  const completedCurrent = tasks.filter(row => row.status === 'completed' && (row.completed_at || '') >= `${start}T00:00:00`)
  const lowStock = inventory.filter(row => row.minimum_quantity !== null && number(row.current_quantity) <= number(row.minimum_quantity))
  const outOfStock = lowStock.filter(row => number(row.current_quantity) <= 0)
  const currentMaintenance = maintenance.filter(row => (row.maintenance_date || '') >= start)
  const previousMaintenance = maintenance.filter(row => (row.maintenance_date || '') <= previousEnd)
  const maintenanceCurrentCost = sum(currentMaintenance, row => row.cost_amount)
  const maintenancePreviousCost = sum(previousMaintenance, row => row.cost_amount)
  const maintenanceByAsset = groupAmounts(currentMaintenance, row => row.asset_name, row => row.cost_amount)
  const currentSales = sales.filter(row => (row.negotiation_date || '') >= start)
  const receivableOverdue = currentSales.filter(row => row.payment_status === 'pending' && row.expected_payment_date && row.expected_payment_date < today)
  const documentDeadline = shiftCivilDate(today, 60)
  const expiringDocuments = documents.filter(row => row.expiration_date && row.expiration_date >= today && row.expiration_date <= documentDeadline)
  const expiredDocuments = documents.filter(row => row.expiration_date && row.expiration_date < today)
  const activeHealthProtocols = healthProtocols.filter(row => row.status === 'active')
  const overdueHealthProtocols = activeHealthProtocols.filter(row => row.next_due_date < today)
  const healthDeadline = shiftCivilDate(today, 30)
  const upcomingHealthProtocols = activeHealthProtocols.filter(row => row.next_due_date >= today && row.next_due_date <= healthDeadline)

  const facts: StrategicFact[] = []
  addFact(facts, { key: 'finance.balance.current_90d', category: 'finance', label: 'Resultado financeiro dos últimos 90 dias', value: currency(currentBalance), numeric_value: currentBalance, unit: 'BRL', source: 'Receitas e despesas' })
  addFact(facts, { key: 'finance.balance.previous_90d', category: 'finance', label: 'Resultado financeiro dos 90 dias anteriores', value: currency(previousBalance), numeric_value: previousBalance, unit: 'BRL', source: 'Receitas e despesas' })
  addFact(facts, { key: 'finance.expenses.current_90d', category: 'finance', label: 'Despesas dos últimos 90 dias', value: currency(currentExpenseTotal), numeric_value: currentExpenseTotal, unit: 'BRL', source: 'Despesas' })
  addFact(facts, { key: 'finance.revenues.current_90d', category: 'finance', label: 'Receitas dos últimos 90 dias', value: currency(currentRevenueTotal), numeric_value: currentRevenueTotal, unit: 'BRL', source: 'Receitas' })
  if (expenseDelta !== null) addFact(facts, { key: 'finance.expense_change', category: 'finance', label: 'Variação das despesas contra o período anterior', value: percentage(expenseDelta), numeric_value: expenseDelta, unit: '%', source: 'Comparação de períodos' })
  if (revenueDelta !== null) addFact(facts, { key: 'finance.revenue_change', category: 'finance', label: 'Variação das receitas contra o período anterior', value: percentage(revenueDelta), numeric_value: revenueDelta, unit: '%', source: 'Comparação de períodos' })
  if (topExpense) addFact(facts, { key: 'finance.top_expense_category', category: 'finance', label: `Concentração de despesas em ${topExpense[0]}`, value: `${currency(topExpense[1])} (${percentage(topExpenseShare)})`, numeric_value: topExpenseShare, unit: '%', source: 'Despesas por categoria' })

  addFact(facts, { key: 'livestock.total_heads', category: 'livestock', label: 'Rebanho atual', value: `${totalHeads.toLocaleString('pt-BR')} cabeças`, numeric_value: totalHeads, unit: 'cabeças', source: 'Lotes de gado' })
  addFact(facts, { key: 'livestock.active_lots', category: 'livestock', label: 'Lotes ativos', value: String(lots.length), numeric_value: lots.length, unit: 'lotes', source: 'Lotes de gado' })
  addFact(facts, { key: 'properties.total', category: 'operations', label: 'Propriedades físicas na operação', value: String(properties.length), numeric_value: properties.length, unit: 'propriedades', source: 'Base da operação pecuária' })
  addFact(facts, { key: 'properties.total_area', category: 'productivity', label: 'Área total consolidada das propriedades', value: `${sum(properties, property => property.total_area_ha).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`, numeric_value: sum(properties, property => property.total_area_ha), unit: 'ha', source: 'Propriedades rurais' })
  addFact(facts, { key: 'properties.pastures_without_property', category: 'data_quality', label: 'Pastos sem propriedade vinculada', value: String(pasturesWithoutProperty.length), numeric_value: pasturesWithoutProperty.length, unit: 'pastos', source: 'Pastos e propriedades' })
  for (const [index, property] of properties.slice(0, 20).entries()) {
    const propertyPastures = pastures.filter(pasture => pasture.land_parcel_id === property.id)
    const propertyHeads = lots.reduce((total, lot) => {
      const pasture = lot.pasture_id ? pastureById.get(lot.pasture_id) : null
      return total + (pasture?.land_parcel_id === property.id ? number(lot.current_quantity) : 0)
    }, 0)
    const propertyCapacity = sum(propertyPastures, pasture => pasture.approximate_capacity)
    addFact(facts, {
      key: `properties.unit_${index + 1}.livestock`, category: 'livestock',
      label: `${property.name}: rebanho e pastos`,
      value: `${propertyHeads.toLocaleString('pt-BR')} cabeças em ${propertyPastures.length} pasto(s)${propertyCapacity > 0 ? `; ${percentage(propertyHeads / propertyCapacity * 100)} da capacidade informada` : ''}`,
      numeric_value: propertyHeads, unit: 'cabeças', source: 'Propriedades, pastos e lotes',
      quality: propertyPastures.every(pasture => pasture.approximate_capacity !== null) ? 'high' : 'medium',
    })
  }
  if (stocking !== null) addFact(facts, { key: 'livestock.pasture_capacity_usage', category: 'productivity', label: 'Ocupação da capacidade informada dos pastos', value: percentage(stocking), numeric_value: stocking, unit: '%', source: 'Lotes e capacidade dos pastos', quality: pastures.every(pasture => pasture.approximate_capacity !== null) ? 'high' : 'medium' })
  addFact(facts, { key: 'livestock.lots_without_pasture', category: 'data_quality', label: 'Lotes com animais sem pasto vinculado', value: String(lotsWithoutPasture.length), numeric_value: lotsWithoutPasture.length, unit: 'lotes', source: 'Lotes de gado' })
  addFact(facts, { key: 'livestock.stale_weighings', category: 'productivity', label: 'Lotes sem pesagem nos últimos 90 dias', value: `${staleLots.length} de ${lots.length}`, numeric_value: staleLots.length, unit: 'lotes', source: 'Pesagens e lotes' })
  if (avgWeight !== null) addFact(facts, { key: 'livestock.weighted_average', category: 'productivity', label: 'Peso médio ponderado registrado em 12 meses', value: `${avgWeight.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`, numeric_value: avgWeight, unit: 'kg', source: 'Pesagens' })
  addFact(facts, { key: 'livestock.births.current_90d', category: 'livestock', label: 'Nascimentos registrados nos últimos 90 dias', value: String(births), numeric_value: births, unit: 'cabeças', source: 'Movimentações do rebanho' })
  addFact(facts, { key: 'livestock.deaths.current_90d', category: 'livestock', label: 'Mortes registradas nos últimos 90 dias', value: String(deaths), numeric_value: deaths, unit: 'cabeças', source: 'Movimentações do rebanho' })
  addFact(facts, { key: 'livestock.health.active_protocols', category: 'livestock', label: 'Protocolos sanitários e reprodutivos ativos', value: String(activeHealthProtocols.length), numeric_value: activeHealthProtocols.length, unit: 'protocolos', source: 'Sanidade e reprodução' })
  addFact(facts, { key: 'livestock.health.overdue_protocols', category: 'livestock', label: 'Protocolos coletivos vencidos', value: String(overdueHealthProtocols.length), numeric_value: overdueHealthProtocols.length, unit: 'protocolos', source: 'Sanidade e reprodução' })
  addFact(facts, { key: 'livestock.health.due_30d', category: 'livestock', label: 'Protocolos com vencimento em até 30 dias', value: String(upcomingHealthProtocols.length), numeric_value: upcomingHealthProtocols.length, unit: 'protocolos', source: 'Sanidade e reprodução' })

  addFact(facts, { key: 'operations.open_tasks', category: 'operations', label: 'Tarefas abertas', value: String(openTasks.length), numeric_value: openTasks.length, unit: 'tarefas', source: 'Tarefas' })
  addFact(facts, { key: 'operations.overdue_tasks', category: 'operations', label: 'Tarefas atrasadas', value: String(overdueTasks.length), numeric_value: overdueTasks.length, unit: 'tarefas', source: 'Tarefas' })
  addFact(facts, { key: 'operations.completed_tasks.current_90d', category: 'operations', label: 'Tarefas concluídas nos últimos 90 dias', value: String(completedCurrent.length), numeric_value: completedCurrent.length, unit: 'tarefas', source: 'Tarefas' })
  addFact(facts, { key: 'inventory.low_stock', category: 'inventory', label: 'Itens no mínimo ou abaixo', value: String(lowStock.length), numeric_value: lowStock.length, unit: 'itens', source: 'Estoque' })
  addFact(facts, { key: 'inventory.out_of_stock', category: 'inventory', label: 'Itens zerados com estoque mínimo definido', value: String(outOfStock.length), numeric_value: outOfStock.length, unit: 'itens', source: 'Estoque' })
  addFact(facts, { key: 'maintenance.cost.current_90d', category: 'operations', label: 'Custo de manutenção nos últimos 90 dias', value: currency(maintenanceCurrentCost), numeric_value: maintenanceCurrentCost, unit: 'BRL', source: 'Manutenções' })
  addFact(facts, { key: 'maintenance.cost.previous_90d', category: 'operations', label: 'Custo de manutenção nos 90 dias anteriores', value: currency(maintenancePreviousCost), numeric_value: maintenancePreviousCost, unit: 'BRL', source: 'Manutenções' })
  if (maintenanceByAsset[0]) addFact(facts, { key: 'maintenance.top_asset', category: 'operations', label: `Ativo com maior custo de manutenção: ${maintenanceByAsset[0][0]}`, value: currency(maintenanceByAsset[0][1]), numeric_value: maintenanceByAsset[0][1], unit: 'BRL', source: 'Manutenções' })
  addFact(facts, { key: 'sales.overdue_receivables', category: 'finance', label: 'Vendas com recebimento vencido', value: String(receivableOverdue.length), numeric_value: receivableOverdue.length, unit: 'vendas', source: 'Vendas de gado' })
  addFact(facts, { key: 'compliance.expired_documents', category: 'compliance', label: 'Documentos vencidos', value: String(expiredDocuments.length), numeric_value: expiredDocuments.length, unit: 'documentos', source: 'Documentos' })
  addFact(facts, { key: 'compliance.expiring_documents_60d', category: 'compliance', label: 'Documentos vencendo em até 60 dias', value: String(expiringDocuments.length), numeric_value: expiringDocuments.length, unit: 'documentos', source: 'Documentos' })
  addFact(facts, { key: 'operations.active_alerts', category: 'operations', label: 'Alertas ativos', value: String(alertsResult.count || 0), numeric_value: alertsResult.count || 0, unit: 'alertas', source: 'Alertas' })

  const baseFields = [farm?.municipality, farm?.state_code, farm?.total_area_ha, farm?.productive_area_ha, farm?.primary_activity, farm?.livestock_system, properties.length > 0 ? properties.length : null]
  const baseCompleteness = baseFields.filter(value => value !== null && value !== undefined && value !== '').length / baseFields.length * 100
  addFact(facts, { key: 'data.farm_profile_completeness', category: 'data_quality', label: 'Completude dos dados-base da propriedade', value: percentage(baseCompleteness), numeric_value: baseCompleteness, unit: '%', source: 'Base da fazenda' })

  let score = 0
  score += Math.round(baseCompleteness * 0.30)
  score += Math.min(20, currentExpenses.length + currentRevenues.length > 0 ? 20 : 0)
  score += lots.length === 0 ? 0 : Math.round((lots.length - staleLots.length) / lots.length * 20)
  score += Math.min(10, tasks.length > 0 ? 10 : 3)
  score += healthProtocols.length > 0 ? 5 : 0
  score += documents.length > 0 ? 10 : 3
  score += inventory.length > 0 ? 5 : 0
  score = Math.max(0, Math.min(100, score))
  const maturityLabel = score >= 80 ? 'Gestão avançada' : score >= 60 ? 'Gestão estruturada' : score >= 40 ? 'Gestão em desenvolvimento' : 'Gestão em implantação'

  const limitations: string[] = []
  if (!farm?.setup_completed_at) limitations.push('A implantação da base da fazenda ainda não consta como concluída.')
  if (properties.length === 0) limitations.push('Nenhuma propriedade física está cadastrada na operação consolidada.')
  if (pasturesWithoutProperty.length > 0) limitations.push(`${pasturesWithoutProperty.length} pasto(s) ainda não estão vinculados a uma propriedade; comparações entre fazendas ficam incompletas.`)
  if (currentExpenses.length + currentRevenues.length === 0) limitations.push('Não há lançamentos financeiros na janela atual para avaliar tendência.')
  if (weighings.length === 0) limitations.push('Não há pesagens nos últimos 12 meses para avaliar produtividade animal.')
  if (capacity === 0) limitations.push('As capacidades dos pastos não foram informadas; a pressão de lotação não pôde ser calculada.')
  if (documents.length === 0) limitations.push('Nenhum documento está cadastrado para análise de conformidade.')
  if (healthProtocols.length === 0) limitations.push('Nenhum protocolo coletivo de sanidade ou reprodução está cadastrado; o calendário do rebanho não pode ser avaliado.')

  return {
    generated_at: new Date().toISOString(),
    window: { start, end: today, previous_start: previousStart, previous_end: previousEnd },
    farm: {
      id: farm?.id ?? null,
      name: farm?.name || 'Garça Branca',
      location: [farm?.municipality, farm?.state_code].filter(Boolean).join(' - ') || farm?.location_description || null,
    },
    maturity: { score, label: maturityLabel },
    facts,
    limitations,
  }
}

function fallbackInsights(snapshot: StrategicSnapshot): AIInsight[] {
  const value = (key: string) => snapshot.facts.find(fact => fact.key === key)?.numeric_value ?? 0
  const insights: AIInsight[] = []
  if (value('finance.balance.current_90d') < 0) insights.push({ category: 'finance', priority: 'high', title: 'Resultado financeiro negativo na janela atual', finding: 'As despesas registradas superaram as receitas nos últimos 90 dias.', why_it_matters: 'A continuidade desse padrão reduz a capacidade de financiar custeio e melhorias sem capital adicional.', recommendation: 'Revisar as maiores categorias de despesas e o calendário de recebimentos antes de assumir novos compromissos.', estimated_impact: null, evidence_keys: ['finance.balance.current_90d', 'finance.expenses.current_90d', 'finance.revenues.current_90d'], confidence: 'high', horizon: 'immediate', action_title: 'Revisar plano de caixa dos próximos 90 dias' })
  if (value('livestock.stale_weighings') > 0) insights.push({ category: 'productivity', priority: 'high', title: 'Falta de pesagens reduz a leitura da produtividade', finding: 'Há lotes ativos sem pesagem registrada nos últimos 90 dias.', why_it_matters: 'Sem evolução de peso por lote, decisões de suplementação, venda e mudança de pasto ficam menos objetivas.', recommendation: 'Implantar uma rotina de pesagem por lote e comparar ganho médio diário entre ciclos.', estimated_impact: 'Melhora a qualidade das decisões de manejo e comercialização; o impacto financeiro depende das próximas pesagens.', evidence_keys: ['livestock.stale_weighings', 'livestock.active_lots'], confidence: 'high', horizon: '30_days', action_title: 'Programar pesagem dos lotes sem medição recente' })
  if (value('operations.overdue_tasks') > 0) insights.push({ category: 'operations', priority: 'high', title: 'Pendências operacionais fora do prazo', finding: 'Existem tarefas abertas com prazo vencido.', why_it_matters: 'Atrasos em manutenção e manejo podem aumentar custo, risco e retrabalho.', recommendation: 'Repriorizar as pendências por risco e definir responsável e nova data para cada uma.', estimated_impact: null, evidence_keys: ['operations.overdue_tasks', 'operations.open_tasks'], confidence: 'high', horizon: 'immediate', action_title: 'Revisar tarefas atrasadas por criticidade' })
  if (value('livestock.health.overdue_protocols') > 0) insights.push({ category: 'livestock', priority: 'critical', title: 'Manejo sanitário ou reprodutivo fora do prazo', finding: 'Há protocolos coletivos ativos com data vencida.', why_it_matters: 'O atraso pode comprometer proteção sanitária, calendário reprodutivo, carências e rastreabilidade do manejo.', recommendation: 'Revisar imediatamente cada protocolo vencido, confirmar o que foi executado e reagendar o próximo ciclo.', estimated_impact: null, evidence_keys: ['livestock.health.overdue_protocols', 'livestock.health.active_protocols'], confidence: 'high', horizon: 'immediate', action_title: 'Regularizar protocolos coletivos vencidos' })
  if (value('properties.pastures_without_property') > 0) insights.push({ category: 'data_quality', priority: 'high', title: 'Pastos precisam ser associados às propriedades corretas', finding: 'Existem pastos sem vínculo com uma propriedade física da operação.', why_it_matters: 'Sem esse vínculo, a análise consolidada continua válida, mas comparações de lotação, capacidade e desempenho entre fazendas ficam incompletas.', recommendation: 'Revisar os pastos e informar em qual propriedade cada um está localizado.', estimated_impact: 'Libera análises comparativas confiáveis por propriedade.', evidence_keys: ['properties.pastures_without_property', 'properties.total'], confidence: 'high', horizon: 'immediate', action_title: 'Vincular pastos às propriedades' })
  if (value('inventory.low_stock') > 0) insights.push({ category: 'inventory', priority: value('inventory.out_of_stock') > 0 ? 'high' : 'medium', title: 'Risco de ruptura no estoque', finding: 'Há itens no limite mínimo ou abaixo dele.', why_it_matters: 'A falta de insumos pode interromper manejo, manutenção ou alimentação e elevar compras emergenciais.', recommendation: 'Revisar os itens críticos, consumo médio e prazo de reposição antes de emitir compras.', estimated_impact: null, evidence_keys: ['inventory.low_stock', 'inventory.out_of_stock'], confidence: 'high', horizon: 'immediate', action_title: 'Repor itens críticos do estoque' })
  if (value('compliance.expired_documents') + value('compliance.expiring_documents_60d') > 0) insights.push({ category: 'compliance', priority: value('compliance.expired_documents') > 0 ? 'critical' : 'high', title: 'Documentação exige atenção', finding: 'O cadastro contém documentos vencidos ou próximos do vencimento.', why_it_matters: 'Pendências documentais podem comprometer operações, fiscalizações, crédito ou autorizações.', recommendation: 'Validar a situação de cada documento e iniciar a renovação com antecedência.', estimated_impact: null, evidence_keys: ['compliance.expired_documents', 'compliance.expiring_documents_60d'], confidence: 'high', horizon: 'immediate', action_title: 'Regularizar documentos vencidos ou próximos do vencimento' })
  if (value('data.farm_profile_completeness') < 100) insights.push({ category: 'data_quality', priority: 'medium', title: 'Base da propriedade ainda pode ser completada', finding: 'Parte dos dados estruturantes da fazenda não está preenchida.', why_it_matters: 'Área, sistema produtivo e atividade principal melhoram comparações e indicadores futuros.', recommendation: 'Concluir a Base da fazenda antes da próxima análise estratégica.', estimated_impact: 'Aumenta a precisão das análises; não representa economia direta calculável.', evidence_keys: ['data.farm_profile_completeness'], confidence: 'high', horizon: '30_days', action_title: 'Completar os dados-base da propriedade' })
  const baselineOpportunities: AIInsight[] = [
    { category: 'data_quality', priority: 'opportunity', title: 'Criar uma linha de base histórica mais densa', finding: 'A análise atual já consolida os registros disponíveis, mas uma série histórica maior permitirá detectar sazonalidade e correlações.', why_it_matters: 'Comparações contínuas ajudam a separar variações normais de mudanças que exigem ação.', recommendation: 'Manter registros financeiros, pesagens, tarefas, estoque e manutenções atualizados e repetir a análise semanalmente.', estimated_impact: 'Benefício analítico crescente conforme a série histórica amadurece.', evidence_keys: ['data.farm_profile_completeness', 'operations.completed_tasks.current_90d'], confidence: 'medium', horizon: '90_days', action_title: 'Revisar a qualidade dos registros semanalmente' },
    { category: 'finance', priority: 'opportunity', title: 'Transformar a comparação financeira em rotina de decisão', finding: 'O sistema já separa o resultado atual do período anterior e permite acompanhar a direção de receitas e despesas.', why_it_matters: 'Uma revisão frequente reduz o tempo entre uma mudança de tendência e a decisão gerencial.', recommendation: 'Revisar resultado, variação das despesas e concentração por categoria a cada nova análise semanal.', estimated_impact: 'O valor depende das decisões tomadas; não há economia presumida sem dados adicionais.', evidence_keys: ['finance.balance.current_90d', 'finance.balance.previous_90d'], confidence: 'high', horizon: '30_days', action_title: 'Criar revisão financeira semanal' },
    { category: 'operations', priority: 'opportunity', title: 'Usar execução de tarefas como indicador de disciplina operacional', finding: 'A base permite acompanhar simultaneamente tarefas abertas, atrasadas e concluídas no período.', why_it_matters: 'A evolução desses três números mostra se as recomendações estão virando execução real.', recommendation: 'Acompanhar semanalmente a redução do estoque de pendências e registrar a conclusão no mesmo dia.', estimated_impact: 'Melhora a rastreabilidade da execução; impacto financeiro não calculado.', evidence_keys: ['operations.open_tasks', 'operations.overdue_tasks', 'operations.completed_tasks.current_90d'], confidence: 'high', horizon: '30_days', action_title: 'Implantar revisão semanal das pendências' },
  ]
  for (const opportunity of baselineOpportunities) {
    if (insights.length >= 3) break
    if (!insights.some(insight => insight.title === opportunity.title)) insights.push(opportunity)
  }
  return insights.slice(0, 10)
}

function validateInsights(insights: AIInsight[], snapshot: StrategicSnapshot) {
  return insights
    .map(insight => ({ ...insight, evidence_keys: keepKnownEvidenceKeys(insight.evidence_keys, snapshot.facts) }))
    .filter(insight => insight.evidence_keys.length > 0)
    .slice(0, 12)
}

async function generateNarrative(snapshot: StrategicSnapshot, identity?: string | null) {
  const startedAt = Date.now()
  const model = process.env.OPENAI_STRATEGIC_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6'
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 60_000 })
    const response = await openai.responses.parse({
      model,
      instructions: `Você é o núcleo de inteligência estratégica da Fazenda Garça Branca.
Analise somente os FATOS ESTRUTURADOS recebidos. Não invente números, causas, correlações, economia, benchmarking, clima ou preços externos.
Cada conclusão deve citar de 1 a 6 evidence_keys existentes. Diferencie claramente fato, hipótese e recomendação.
estimated_impact só pode conter um valor financeiro quando ele for calculável diretamente pelos fatos; caso contrário descreva o impacto sem números ou use null.
Priorize achados cruzados e acionáveis que um gestor possa não perceber ao olhar módulos isolados.
Não apresente diagnóstico veterinário, agronômico, contábil ou jurídico como certeza; recomende validação profissional quando necessário.
O maturity_score e maturity_label devem ser repetidos exatamente como fornecidos, pois são calculados deterministicamente pelo sistema.
Produza de 3 a 10 insights, sem frases genéricas, em português do Brasil.`,
      input: [{
        role: 'user',
        content: `FAZENDA: ${snapshot.farm.name}\nJANELA: ${snapshot.window.start} a ${snapshot.window.end}\nMATURIDADE CALCULADA: ${snapshot.maturity.score} — ${snapshot.maturity.label}\nLIMITAÇÕES: ${JSON.stringify(snapshot.limitations)}\nFATOS ESTRUTURADOS: ${JSON.stringify(snapshot.facts)}`,
      }],
      text: {
        format: zodTextFormat(StrategicAIOutputSchema, 'farm_strategic_analysis'),
        verbosity: 'medium',
      },
      reasoning: { effort: 'high' },
      max_output_tokens: 6_000,
      store: false,
      ...(identity ? { safety_identifier: createHash('sha256').update(identity).digest('hex') } : {}),
    })
    const parsed = response.output_parsed
    if (!parsed) throw new Error('A IA não retornou uma análise estruturada.')
    const validated = validateInsights(parsed.insights, snapshot)
    if (validated.length < 3) throw new Error('A análise não apresentou evidências suficientes.')
    await recordAIUsageEvent({ operation: 'strategic_analysis', modelName: model, status: 'success', startedAt, usage: response.usage })
    return {
      executiveSummary: parsed.executive_summary,
      insights: validated,
      limitations: [...new Set([...snapshot.limitations, ...parsed.limitations])],
      model,
    }
  } catch (error) {
    await recordAIUsageEvent({ operation: 'strategic_analysis', modelName: model, status: 'fallback', startedAt, errorCategory: error instanceof Error ? error.name : 'unknown' })
    return {
      executiveSummary: `A gestão da ${snapshot.farm.name} está no estágio “${snapshot.maturity.label}” (${snapshot.maturity.score}/100). A análise encontrou pontos de ação com base nos registros financeiros, produtivos, operacionais e de conformidade disponíveis. As recomendações abaixo usam somente dados cadastrados e destacam onde ainda falta histórico para conclusões mais profundas.`,
      insights: fallbackInsights(snapshot),
      limitations: snapshot.limitations,
      model: null,
    }
  }
}

export async function generateStrategicReport(input: {
  supabase: SupabaseClient
  createdBy?: string | null
  generationMode: 'manual' | 'scheduled'
  safetyIdentity?: string | null
}) {
  const startedAt = Date.now()
  const snapshot = await buildStrategicSnapshot(input.supabase)
  const narrative = await generateNarrative(snapshot, input.safetyIdentity)
  const { data: report, error: reportError } = await input.supabase
    .from('ai_strategic_reports')
    .insert({
      farm_id: snapshot.farm.id,
      window_start: snapshot.window.start,
      window_end: snapshot.window.end,
      previous_window_start: snapshot.window.previous_start,
      previous_window_end: snapshot.window.previous_end,
      generation_mode: input.generationMode,
      status: 'completed',
      executive_summary: narrative.executiveSummary,
      maturity_score: snapshot.maturity.score,
      maturity_label: snapshot.maturity.label,
      snapshot_json: snapshot,
      limitations_json: narrative.limitations,
      model_name: narrative.model,
      prompt_version: 1,
      processing_ms: Date.now() - startedAt,
      created_by: input.createdBy || null,
    })
    .select('id')
    .single()
  if (reportError) throw new Error(`Falha ao salvar a análise: ${reportError.message}`)

  const factMap = new Map(snapshot.facts.map(fact => [fact.key, fact]))
  const insightRows = narrative.insights.map(insight => ({
    report_id: report.id,
    farm_id: snapshot.farm.id,
    category: insight.category,
    priority: insight.priority,
    title: insight.title,
    finding: insight.finding,
    why_it_matters: insight.why_it_matters,
    recommendation: insight.recommendation,
    estimated_impact: insight.estimated_impact,
    evidence_json: insight.evidence_keys.map(key => factMap.get(key)).filter(Boolean),
    confidence: insight.confidence,
    horizon: insight.horizon,
    action_title: insight.action_title,
    status: 'open',
  }))
  const { error: insightError } = await input.supabase.from('ai_strategic_insights').insert(insightRows)
  if (insightError) {
    await input.supabase.from('ai_strategic_reports').update({ status: 'failed' }).eq('id', report.id)
    throw new Error(`Falha ao salvar os achados: ${insightError.message}`)
  }
  return { reportId: report.id as string, insightCount: insightRows.length }
}
