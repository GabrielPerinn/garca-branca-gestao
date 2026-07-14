'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { databaseErrorMessage } from '@/lib/data/database-errors'
import { farmFoundationDraftPayloadSchema, farmFoundationSchema } from '@/lib/onboarding/schema'

const MAX_FOUNDATION_BYTES = 200_000

function parseJsonField(formData: FormData, name: string, fallback: unknown) {
  const raw = formData.get(name)
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  if (Buffer.byteLength(raw, 'utf8') > MAX_FOUNDATION_BYTES) {
    throw new Error('Os dados da implantação excedem o tamanho permitido.')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`A etapa ${name} contém dados inválidos.`)
  }
}

export async function saveFarmFoundationDraft(formData: FormData) {
  const { profile } = await requirePermission('settings.write')
  const payload = farmFoundationDraftPayloadSchema.safeParse(parseJsonField(formData, 'payload', {}))
  if (!payload.success) {
    throw new Error(payload.error.issues[0]?.message ?? 'O rascunho da implantação contém dados inválidos.')
  }

  const currentStep = Number(formData.get('current_step'))
  const expectedRevisionValue = formData.get('expected_revision')
  const expectedRevision = typeof expectedRevisionValue === 'string' && expectedRevisionValue !== ''
    ? Number(expectedRevisionValue)
    : null
  const operationIdValue = formData.get('farm_id')
  const operationId = typeof operationIdValue === 'string' && operationIdValue ? operationIdValue : null

  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 8) {
    throw new Error('Etapa da implantação inválida.')
  }
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    throw new Error('A revisão do rascunho é inválida.')
  }

  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data, error } = await supabase.rpc('save_foundation_setup_draft', {
    p_owner_profile_id: profile.id,
    p_operation_id: operationId,
    p_payload: payload.data,
    p_current_step: currentStep,
    p_expected_revision: expectedRevision,
  })
  if (error) {
    throw new Error(databaseErrorMessage(error, 'Não foi possível salvar o rascunho. Tente novamente.'))
  }
  const saved = Array.isArray(data) ? data[0] : data
  if (!saved?.revision || !saved?.last_saved_at) {
    throw new Error('O salvamento não retornou a revisão atual do rascunho.')
  }

  return {
    success: true,
    revision: Number(saved.revision),
    savedAt: String(saved.last_saved_at),
  }
}

export async function configureFarmFoundation(formData: FormData) {
  const { profile } = await requirePermission('settings.write')
  const farmIdValue = formData.get('farm_id')
  const parsed = farmFoundationSchema.safeParse({
    farm_id: typeof farmIdValue === 'string' && farmIdValue ? farmIdValue : null,
    profile: parseJsonField(formData, 'profile', {}),
    pastures: parseJsonField(formData, 'pastures', []),
    cattle_lots: parseJsonField(formData, 'cattle_lots', []),
    employees: parseJsonField(formData, 'employees', []),
    inventory_items: parseJsonField(formData, 'inventory_items', []),
    land_parcels: parseJsonField(formData, 'land_parcels', []),
    farm_assets: parseJsonField(formData, 'farm_assets', []),
    rural_contracts: parseJsonField(formData, 'rural_contracts', []),
  })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Revise os dados da implantação.')
  }
  const input = parsed.data

  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const { data, error } = await supabase.rpc('configure_livestock_operation_foundation_transactional', {
    p_operation_id: input.farm_id,
    p_profile: input.profile,
    p_pastures: input.pastures,
    p_cattle_lots: input.cattle_lots,
    p_employees: input.employees,
    p_inventory_items: input.inventory_items,
    p_properties: input.land_parcels,
    p_farm_assets: input.farm_assets,
    p_rural_contracts: input.rural_contracts,
    p_actor_profile_id: profile.id,
  })

  if (error) {
    throw new Error(databaseErrorMessage(error, 'Não foi possível concluir a implantação da operação pecuária.'))
  }
  if (!data) throw new Error('A implantação não retornou a operação pecuária configurada.')

  // The official base is already durable. Removing the draft prevents stale
  // partial data from resurfacing after the successful conclusion.
  await supabase
    .from('foundation_setup_drafts')
    .delete()
    .eq('owner_profile_id', profile.id)

  revalidatePath('/')
  revalidatePath('/setup')
  revalidatePath('/farms')
  revalidatePath('/pastures')
  revalidatePath('/cattle')
  revalidatePath('/employees')
  revalidatePath('/inventory')
  revalidatePath('/contracts')
  revalidatePath('/twin')
  return { success: true, farmId: data as string }
}
