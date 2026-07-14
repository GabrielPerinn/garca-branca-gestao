'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCivilDate } from '@/lib/date'
import { databaseErrorMessage } from '@/lib/data/database-errors'
import { ruralContractFoundationSchema } from '@/lib/onboarding/schema'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

const uuidSchema = z.string().uuid()

function optionalNumber(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim()
  return value ? Number(value) : null
}

function optionalText(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim() || undefined
}

async function activeFarmId(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data, error } = await supabase.from('farms').select('id').neq('status', 'deleted').order('created_at').limit(1).maybeSingle()
  if (error) throw new Error(databaseErrorMessage(error, 'Não foi possível localizar a fazenda.'))
  if (!data) throw new Error('Cadastre a base da fazenda antes de criar contratos.')
  return data.id as string
}

export async function createRuralContract(formData: FormData) {
  const { profile } = await requirePermission('actions.approve')
  const parsed = ruralContractFoundationSchema.safeParse({
    title: optionalText(formData, 'title'),
    contract_number: optionalText(formData, 'contract_number'),
    parcel_name: String(formData.get('parcel_name') ?? ''),
    contract_type: String(formData.get('contract_type') ?? ''),
    farm_role: String(formData.get('farm_role') ?? ''),
    counterparty_name: String(formData.get('counterparty_name') ?? ''),
    counterparty_document: optionalText(formData, 'counterparty_document'),
    counterparty_phone: optionalText(formData, 'counterparty_phone'),
    start_date: String(formData.get('start_date') ?? ''),
    end_date: String(formData.get('end_date') ?? ''),
    area_ha: Number(formData.get('area_ha')),
    activity: String(formData.get('activity') ?? ''),
    crop_name: optionalText(formData, 'crop_name'),
    payment_type: String(formData.get('payment_type') ?? ''),
    payment_amount: optionalNumber(formData, 'payment_amount'),
    payment_frequency: optionalText(formData, 'payment_frequency'),
    first_due_date: optionalText(formData, 'first_due_date'),
    installment_count: optionalNumber(formData, 'installment_count'),
    product_name: optionalText(formData, 'product_name'),
    product_quantity: optionalNumber(formData, 'product_quantity'),
    production_percentage: optionalNumber(formData, 'production_percentage'),
    adjustment_index: optionalText(formData, 'adjustment_index'),
    renewal_notice_days: Number(formData.get('renewal_notice_days') || 90),
    conservation_obligations: optionalText(formData, 'conservation_obligations'),
    improvement_responsibility: optionalText(formData, 'improvement_responsibility'),
    tax_responsibility: optionalText(formData, 'tax_responsibility'),
    notes: optionalText(formData, 'notes'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Revise os dados do contrato.')

  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const farmId = await activeFarmId(supabase)
  const { data, error } = await supabase.rpc('insert_rural_contract', {
    p_farm_id: farmId,
    p_payload: parsed.data,
    p_actor_profile_id: profile.id,
  })
  if (error) throw new Error(databaseErrorMessage(error, 'Não foi possível criar o contrato rural.'))
  revalidateContracts()
  return { success: true, id: data as string }
}

export async function receiveContractInstallment(id: string) {
  const installmentId = uuidSchema.parse(id)
  const { profile } = await requirePermission('finance.write')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data, error } = await supabase.rpc('receive_rural_contract_installment', {
    p_installment_id: installmentId,
    p_received_date: getCivilDate(),
    p_actor_profile_id: profile.id,
  })
  if (error) throw new Error(databaseErrorMessage(error, 'Não foi possível confirmar o recebimento.'))
  revalidateContracts()
  return { success: true, revenueId: data as string }
}

export async function updateRuralContractStatus(id: string, status: string) {
  const contractId = uuidSchema.parse(id)
  const nextStatus = z.enum(['active', 'terminated', 'cancelled']).parse(status)
  const { profile } = await requirePermission('actions.approve')
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { error } = await supabase.from('rural_contracts').update({
    status: nextStatus,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', contractId)
  if (error) throw new Error(databaseErrorMessage(error, 'Não foi possível atualizar o contrato.'))
  revalidateContracts()
  return { success: true }
}

function revalidateContracts() {
  revalidatePath('/contracts')
  revalidatePath('/finance')
  revalidatePath('/alerts')
  revalidatePath('/intelligence')
  revalidatePath('/twin')
  revalidatePath('/')
}
