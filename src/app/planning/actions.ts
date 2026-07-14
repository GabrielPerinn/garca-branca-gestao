'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCivilDate } from '@/lib/date'
import { getPlanningBaseline } from '@/lib/planning/data'
import { currentGoalMetricValue, simulatePlanningScenario } from '@/lib/planning/simulator'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

const idSchema = z.string().uuid('Identificador inválido.')
const templateSchema = z.enum(['custom', 'herd_growth', 'cost_reduction', 'market_stress', 'capacity_investment'])
const scenarioStatusSchema = z.enum(['draft', 'approved', 'archived'])
const goalStatusSchema = z.enum(['active', 'completed', 'paused', 'cancelled'])
const metricSchema = z.enum(['monthly_result', 'herd_size', 'monthly_revenue', 'monthly_expenses', 'stocking_rate'])
const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

const assumptionsSchema = z.object({
  horizonMonths: z.coerce.number().int().min(1).max(60),
  herdDelta: z.coerce.number().int().min(-100_000).max(100_000),
  purchasePricePerHead: z.coerce.number().min(0).max(100_000_000),
  salePricePerHead: z.coerce.number().min(0).max(100_000_000),
  monthlyCostPerHead: z.coerce.number().min(0).max(10_000_000),
  capacityExpansion: z.coerce.number().min(0).max(100_000),
  monthlyRevenueChangePercent: z.coerce.number().min(-100).max(500),
  monthlyExpenseChangePercent: z.coerce.number().min(-100).max(500),
  upfrontInvestment: z.coerce.number().min(0).max(100_000_000_000),
})

const scenarioSchema = z.object({
  name: z.string().trim().min(3, 'Dê um nome claro ao cenário.').max(160),
  templateType: templateSchema,
  linkedGoalId: z.string().uuid().nullable().optional(),
  assumptions: assumptionsSchema,
})

const goalSchema = z.object({
  title: z.string().trim().min(3, 'Dê um nome claro à meta.').max(160),
  metric: metricSchema,
  targetValue: z.coerce.number().min(-100_000_000_000).max(100_000_000_000),
  targetDate: civilDateSchema,
})

const metricUnits: Record<z.infer<typeof metricSchema>, string> = {
  monthly_result: 'BRL/mês',
  herd_size: 'cabeças',
  monthly_revenue: 'BRL/mês',
  monthly_expenses: 'BRL/mês',
  stocking_rate: '%',
}

export async function savePlanningScenario(input: unknown) {
  const parsed = scenarioSchema.parse(input)
  const { profile } = await requirePermission('actions.approve')
  const baseline = await getPlanningBaseline(profile.id)
  if (!baseline) throw new Error('Cadastre a base da fazenda antes de salvar cenários.')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  if (parsed.linkedGoalId) {
    const { data: goal, error } = await supabase.from('farm_goals').select('id').eq('id', parsed.linkedGoalId).eq('farm_id', baseline.farmId).maybeSingle()
    if (error || !goal) throw new Error('A meta vinculada não pertence à propriedade ativa.')
  }
  const result = simulatePlanningScenario(baseline, parsed.assumptions)
  const { data, error } = await supabase.from('planning_scenarios').insert({
    farm_id: baseline.farmId,
    name: parsed.name,
    template_type: parsed.templateType,
    horizon_months: parsed.assumptions.horizonMonths,
    assumptions_json: parsed.assumptions,
    baseline_json: baseline,
    result_json: result,
    confidence_score: result.confidenceScore,
    status: 'draft',
    linked_goal_id: parsed.linkedGoalId ?? null,
    created_by: profile.id,
  }).select('id').single()
  if (error) throw new Error(`Não foi possível salvar o cenário: ${error.message}`)
  revalidatePath('/planning')
  revalidatePath('/twin')
  return { id: data.id as string }
}

export async function createFarmGoal(input: unknown) {
  const parsed = goalSchema.parse(input)
  const today = getCivilDate()
  if (parsed.targetDate < today) throw new Error('A data-alvo não pode estar no passado.')
  const { profile } = await requirePermission('actions.approve')
  const baseline = await getPlanningBaseline(profile.id)
  if (!baseline) throw new Error('Cadastre a base da fazenda antes de criar metas.')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data, error } = await supabase.from('farm_goals').insert({
    farm_id: baseline.farmId,
    title: parsed.title,
    metric: parsed.metric,
    target_value: parsed.targetValue,
    unit: metricUnits[parsed.metric],
    target_date: parsed.targetDate,
    baseline_value: currentGoalMetricValue(parsed.metric, baseline),
    status: 'active',
    created_by: profile.id,
  }).select('id').single()
  if (error) throw new Error(`Não foi possível criar a meta: ${error.message}`)
  revalidatePath('/planning')
  revalidatePath('/twin')
  return { id: data.id as string }
}

export async function updatePlanningScenarioStatus(scenarioId: string, status: 'draft' | 'approved' | 'archived') {
  const id = idSchema.parse(scenarioId)
  const nextStatus = scenarioStatusSchema.parse(status)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('planning_scenarios').update({
    status: nextStatus,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(`Não foi possível revisar o cenário: ${error.message}`)
  revalidatePath('/planning')
  revalidatePath('/twin')
}

export async function updateFarmGoalStatus(goalId: string, status: 'active' | 'completed' | 'paused' | 'cancelled') {
  const id = idSchema.parse(goalId)
  const nextStatus = goalStatusSchema.parse(status)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('farm_goals').update({
    status: nextStatus,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(`Não foi possível atualizar a meta: ${error.message}`)
  revalidatePath('/planning')
  revalidatePath('/twin')
}
