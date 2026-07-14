'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import {
  approvePendingActionInternal,
  rejectPendingActionInternal,
} from '@/lib/ai/action-executor'

const idSchema = z.string().uuid('Identificador de ação inválido.')
const editablePlanSchema = z.string().min(2).max(50_000)
const supportedEditableActions = new Set([
  'create_expense', 'create_revenue', 'create_task', 'complete_task',
  'cancel_task',
  'create_cattle_lot', 'record_inventory_entry', 'record_cattle_sale',
  'record_cattle_movement', 'record_weighing', 'record_employee_payment',
  'create_livestock_protocol', 'complete_livestock_protocol',
  'record_gravel_operation', 'record_suppression_operation',
])

async function getAuthenticatedContext() {
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  return { supabase, profileId: profile.id }
}

function revalidatePendingActionPages() {
  revalidatePath('/')
  revalidatePath('/pending-actions')
  revalidatePath('/finance')
  revalidatePath('/tasks')
  revalidatePath('/cattle')
  revalidatePath('/sales')
  revalidatePath('/weighings')
  revalidatePath('/inventory')
  revalidatePath('/inventory-movements')
  revalidatePath('/employees')
  revalidatePath('/contracts')
  revalidatePath('/pastures')
  revalidatePath('/gravel-operations')
  revalidatePath('/suppression-operations')
  revalidatePath('/herd-health')
  revalidatePath('/alerts')
  revalidatePath('/twin')
}

export async function approvePendingAction(actionId: string) {
  const id = idSchema.parse(actionId)
  const { supabase, profileId } = await getAuthenticatedContext()
  const result = await approvePendingActionInternal(supabase, id, {
    actorProfileId: profileId,
    reason: 'Approved from authenticated dashboard',
  })
  revalidatePendingActionPages()
  return result
}

export async function rejectPendingAction(actionId: string) {
  const id = idSchema.parse(actionId)
  const { supabase, profileId } = await getAuthenticatedContext()
  const result = await rejectPendingActionInternal(supabase, id, {
    actorProfileId: profileId,
    reason: 'Rejected from authenticated dashboard',
  })
  revalidatePath('/pending-actions')
  return result
}

function safePlanObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Plano inválido.')
  return value as Record<string, unknown>
}

export async function updatePendingActionPlan(actionId: string, serializedPlan: string) {
  const id = idSchema.parse(actionId)
  const rawPlan = editablePlanSchema.parse(serializedPlan)
  const plan = safePlanObject(JSON.parse(rawPlan))
  const { supabase, profileId } = await getAuthenticatedContext()
  const { data: current, error: currentError } = await supabase
    .from('pending_actions')
    .select('action_type, confirmation_status, plan_version')
    .eq('id', id)
    .maybeSingle()
  if (currentError) throw new Error(`Falha ao localizar o plano: ${currentError.message}`)
  if (!current || current.confirmation_status !== 'pending') throw new Error('Este plano não está mais disponível para edição.')
  if (!supportedEditableActions.has(current.action_type)) throw new Error('Este tipo de plano não pode ser editado por esta tela.')

  const secondary = Array.isArray(plan.secondary_actions) ? plan.secondary_actions : []
  if (secondary.length > 10) throw new Error('O plano excede o limite de ações relacionadas.')
  for (const rawAction of secondary) {
    const action = safePlanObject(rawAction)
    if (typeof action.intent !== 'string' || !supportedEditableActions.has(action.intent)) {
      throw new Error('O plano contém uma ação relacionada não suportada.')
    }
    safePlanObject(action.extracted_data)
  }

  const { error: updateError } = await supabase.from('pending_actions').update({
    interpreted_data_json: plan,
    missing_fields_json: [],
    plan_version: Number(current.plan_version || 1) + 1,
  }).eq('id', id).eq('confirmation_status', 'pending')
  if (updateError) throw new Error(`Não foi possível salvar o plano: ${updateError.message}`)

  await supabase.from('audit_logs').insert({
    table_name: 'pending_actions',
    record_id: id,
    action: 'edit_pending_action_plan',
    changed_by: profileId,
    reason: 'Plano estruturado revisado antes da aprovação.',
  })
  revalidatePath('/pending-actions')
  return { success: true }
}
