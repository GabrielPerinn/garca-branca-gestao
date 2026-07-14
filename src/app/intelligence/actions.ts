'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { generateStrategicReport } from '@/lib/ai/strategic-intelligence'
import { getCivilDate, shiftCivilDate } from '@/lib/date'

const idSchema = z.string().uuid('Identificador inválido.')
const insightStatusSchema = z.enum(['open', 'dismissed', 'completed'])

export async function generateStrategicAnalysis() {
  const { user, profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id, requestTimeoutMs: 90_000 })
  const result = await generateStrategicReport({
    supabase,
    createdBy: profile.id,
    generationMode: 'manual',
    safetyIdentity: user.id,
  })
  revalidatePath('/intelligence')
  return result
}

export async function updateStrategicInsightStatus(insightId: string, status: 'open' | 'dismissed' | 'completed') {
  const id = idSchema.parse(insightId)
  const nextStatus = insightStatusSchema.parse(status)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('ai_strategic_insights').update({
    status: nextStatus,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(`Não foi possível atualizar o achado: ${error.message}`)
  revalidatePath('/intelligence')
}

export async function convertInsightToPendingTask(insightId: string) {
  const id = idSchema.parse(insightId)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data: insight, error: insightError } = await supabase
    .from('ai_strategic_insights')
    .select('id, farm_id, title, finding, recommendation, action_title, horizon, priority, status, pending_action_id')
    .eq('id', id)
    .maybeSingle()
  if (insightError) throw new Error(`Falha ao localizar o achado: ${insightError.message}`)
  if (!insight) throw new Error('Achado não encontrado.')
  if (insight.pending_action_id) return { pendingActionId: insight.pending_action_id as string }
  if (insight.status === 'dismissed') throw new Error('Reabra o achado antes de transformá-lo em ação.')

  const days = insight.horizon === 'immediate' ? 7 : insight.horizon === '30_days' ? 30 : insight.horizon === '90_days' ? 90 : 180
  const dueDate = shiftCivilDate(getCivilDate(), days)
  const priority = insight.priority === 'critical' || insight.priority === 'high' ? 'high' : insight.priority === 'medium' ? 'medium' : 'low'
  const title = (insight.action_title || insight.title).slice(0, 200)
  const description = `${insight.recommendation}\n\nOrigem: Inteligência Estratégica — ${insight.finding}`.slice(0, 2_000)
  const interpretedData = {
    title,
    description,
    due_date: dueDate,
    priority,
    task_type: 'strategic_improvement',
    related_farm_id: insight.farm_id,
    human_summary: `Criar tarefa estratégica: ${title}, com prazo até ${dueDate}.`,
    missing_fields: [],
  }

  const { data: pending, error: pendingError } = await supabase.from('pending_actions').insert({
    source_message_id: null,
    action_type: 'create_task',
    interpreted_data_json: interpretedData,
    confidence_score: 1,
    missing_fields_json: [],
    requires_confirmation: true,
    confirmation_status: 'pending',
    requested_by_user_id: profile.id,
    input_modality: 'text',
    plan_version: 2,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
  }).select('id').single()
  if (pendingError) throw new Error(`Não foi possível preparar a tarefa: ${pendingError.message}`)

  const { error: updateError } = await supabase.from('ai_strategic_insights').update({
    status: 'converted',
    pending_action_id: pending.id,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id).is('pending_action_id', null)
  if (updateError) throw new Error(`A tarefa foi preparada, mas o vínculo falhou: ${updateError.message}`)

  revalidatePath('/intelligence')
  revalidatePath('/pending-actions')
  return { pendingActionId: pending.id as string }
}
