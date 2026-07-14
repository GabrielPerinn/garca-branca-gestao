'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { runOperationalAutopilot } from '@/lib/autopilot/engine'
import { getCivilDate, shiftCivilDate } from '@/lib/date'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

const idSchema = z.string().uuid('Identificador inválido.')
const findingStatusSchema = z.enum(['open', 'acknowledged', 'dismissed'])

export async function runAutopilotNow() {
  const { profile } = await requirePermission('actions.approve')
  const result = await runOperationalAutopilot({ trigger: 'manual', actorProfileId: profile.id })
  revalidatePath('/autopilot')
  revalidatePath('/twin')
  return result
}

export async function setAutopilotEnabled(enabled: boolean) {
  const { profile } = await requirePermission('settings.write')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data: farm, error: farmError } = await supabase.from('farms').select('id').neq('status', 'deleted').order('created_at').limit(1).maybeSingle()
  if (farmError || !farm) throw new Error(farmError?.message || 'Cadastre a propriedade antes de configurar o Autopiloto.')
  const { error } = await supabase.from('autopilot_settings').upsert({
    farm_id: farm.id, enabled: Boolean(enabled), updated_by: profile.id,
  }, { onConflict: 'farm_id' })
  if (error) throw new Error(`Não foi possível atualizar o Autopiloto: ${error.message}`)
  revalidatePath('/autopilot')
}

export async function setAutopilotRuleEnabled(ruleId: string, enabled: boolean) {
  const id = idSchema.parse(ruleId)
  const { profile } = await requirePermission('settings.write')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('autopilot_rules').update({ enabled: Boolean(enabled), updated_by: profile.id }).eq('id', id)
  if (error) throw new Error(`Não foi possível atualizar a regra: ${error.message}`)
  revalidatePath('/autopilot')
}

export async function updateAutopilotFindingStatus(findingId: string, status: 'open' | 'acknowledged' | 'dismissed') {
  const id = idSchema.parse(findingId)
  const nextStatus = findingStatusSchema.parse(status)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('autopilot_findings').update({
    status: nextStatus, reviewed_by: profile.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(`Não foi possível revisar o achado: ${error.message}`)
  revalidatePath('/autopilot')
  revalidatePath('/twin')
}

export async function convertAutopilotFindingToTask(findingId: string) {
  const id = idSchema.parse(findingId)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data: finding, error: findingError } = await supabase.from('autopilot_findings')
    .select('id, farm_id, title, summary, recommended_action, severity, status, related_table, related_id, pending_action_id')
    .eq('id', id).maybeSingle()
  if (findingError) throw new Error(`Falha ao localizar o achado: ${findingError.message}`)
  if (!finding) throw new Error('Achado não encontrado.')
  if (finding.pending_action_id) return { pendingActionId: finding.pending_action_id as string }
  if (finding.status === 'dismissed') throw new Error('Reabra o achado antes de transformá-lo em tarefa.')

  const dueDays = finding.severity === 'critical' ? 2 : finding.severity === 'high' ? 7 : 14
  const dueDate = shiftCivilDate(getCivilDate(), dueDays)
  const relationFields: Record<string, string> = {
    pastures: 'related_pasture_id', cattle_lots: 'related_cattle_lot_id',
  }
  const interpretedData: Record<string, unknown> = {
    title: finding.title.slice(0, 200),
    description: `${finding.recommended_action}\n\nMotivo detectado pelo Autopiloto: ${finding.summary}`.slice(0, 2000),
    due_date: dueDate,
    priority: finding.severity === 'critical' || finding.severity === 'high' ? 'high' : 'medium',
    task_type: 'autopilot_followup',
    related_farm_id: finding.farm_id,
    human_summary: `Criar tarefa do Autopiloto: ${finding.title}, com prazo até ${dueDate}.`,
    missing_fields: [],
  }
  const relationField = finding.related_table ? relationFields[finding.related_table] : null
  if (relationField && finding.related_id) interpretedData[relationField] = finding.related_id

  const { data: pendingActionId, error: pendingError } = await supabase.rpc('prepare_autopilot_task_action', {
    p_finding_id: id,
    p_profile_id: profile.id,
    p_interpreted_data: interpretedData,
    p_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (pendingError || !pendingActionId) throw new Error(`Não foi possível preparar a tarefa: ${pendingError?.message || 'erro desconhecido'}`)
  revalidatePath('/autopilot')
  revalidatePath('/pending-actions')
  return { pendingActionId: pendingActionId as string }
}
