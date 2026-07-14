'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { getPrimaryFarmId } from '@/lib/data/farms'
import { dateString, optionalDateString, optionalInteger, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getCivilDate } from '@/lib/date'

const optionalUuid = z.preprocess(value => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().uuid().optional())

const protocolSchema = z.object({
  name: requiredText('Nome do protocolo'),
  protocol_type: z.enum(['sanitary', 'reproductive']),
  event_type: requiredText('Tipo de evento', 80),
  scope_type: z.enum(['operation', 'property', 'lot', 'category']),
  land_parcel_id: optionalUuid,
  cattle_lot_id: optionalUuid,
  animal_category: optionalText('Categoria', 100),
  responsible_employee_id: optionalUuid,
  product_name: optionalText('Produto', 160),
  dosage: optionalText('Dosagem', 120),
  withdrawal_days: optionalInteger('Carência', 0, 3650),
  instructions: optionalText('Instruções', 2_000),
  next_due_date: dateString('Data programada'),
  recurrence_days: optionalInteger('Recorrência', 1, 3650),
  alert_lead_days: optionalInteger('Antecedência', 0, 365),
}).superRefine((value, context) => {
  if (value.scope_type === 'property' && !value.land_parcel_id) context.addIssue({ code: 'custom', path: ['land_parcel_id'], message: 'Selecione a propriedade.' })
  if (value.scope_type === 'lot' && !value.cattle_lot_id) context.addIssue({ code: 'custom', path: ['cattle_lot_id'], message: 'Selecione o lote.' })
  if (value.scope_type === 'category' && !value.animal_category) context.addIssue({ code: 'custom', path: ['animal_category'], message: 'Informe a categoria dos animais.' })
})

const executionSchema = z.object({
  protocol_id: z.string().uuid(),
  executed_on: dateString('Data de execução'),
  quantity_treated: optionalInteger('Quantidade atendida', 0, 1_000_000),
  result_status: z.enum(['completed', 'partial', 'skipped']),
  notes: optionalText('Observações', 2_000),
  next_due_date: optionalDateString('Próxima data'),
})

function revalidateHealth() {
  revalidatePath('/herd-health')
  revalidatePath('/alerts')
  revalidatePath('/twin')
  revalidatePath('/')
}

export async function createLivestockProtocol(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(protocolSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const { error } = await supabase.from('livestock_protocols').insert({
    farm_id: farmId,
    name: input.name,
    protocol_type: input.protocol_type,
    event_type: input.event_type,
    scope_type: input.scope_type,
    land_parcel_id: input.scope_type === 'property' ? input.land_parcel_id : null,
    cattle_lot_id: input.scope_type === 'lot' ? input.cattle_lot_id : null,
    animal_category: input.scope_type === 'category' ? input.animal_category : null,
    responsible_employee_id: input.responsible_employee_id ?? null,
    product_name: input.product_name ?? null,
    dosage: input.dosage ?? null,
    withdrawal_days: input.withdrawal_days ?? null,
    instructions: input.instructions ?? null,
    next_due_date: input.next_due_date,
    recurrence_days: input.recurrence_days ?? null,
    alert_lead_days: input.alert_lead_days ?? 7,
    status: 'active',
  })
  if (error) throw new Error(error.message)
  revalidateHealth()
  return { success: true }
}

export async function completeLivestockProtocol(formData: FormData) {
  const { profile } = await requirePermission('operations.write')
  const input = parseFormData(executionSchema, formData)
  if (input.executed_on > getCivilDate()) throw new Error('A execução não pode ser registrada em uma data futura.')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.rpc('complete_livestock_protocol', {
    p_protocol_id: input.protocol_id,
    p_executed_on: input.executed_on,
    p_quantity_treated: input.quantity_treated ?? null,
    p_result_status: input.result_status,
    p_notes: input.notes ?? null,
    p_next_due_date: input.next_due_date ?? null,
    p_actor_profile_id: profile.id,
  })
  if (error) throw new Error(error.message)
  revalidateHealth()
  return { success: true }
}

export async function pauseLivestockProtocol(id: string, paused: boolean) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  const { error } = await supabase.from('livestock_protocols').update({ status: paused ? 'paused' : 'active' }).eq('id', recordId).neq('status', 'deleted')
  if (error) throw new Error(error.message)
  revalidateHealth()
  return { success: true }
}

export async function deleteLivestockProtocol(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  const { error } = await supabase.from('livestock_protocols').update({ status: 'deleted' }).eq('id', recordId)
  if (error) throw new Error(error.message)
  revalidateHealth()
  return { success: true }
}
