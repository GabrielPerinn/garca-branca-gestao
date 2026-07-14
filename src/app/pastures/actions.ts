'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalNonNegativeNumber, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const pastureSchema = z.object({
  name: requiredText('Nome do pasto'),
  land_parcel_id: z.string().uuid('Selecione uma propriedade válida.'),
  approximate_capacity: optionalNonNegativeNumber('Capacidade aproximada'),
  rest_status: optionalText('Status de descanso', 80),
  current_condition: optionalText('Condição atual', 120),
  notes: optionalText('Observações'),
})

export async function createPasture(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(pastureSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    farm_id: farmId,
    land_parcel_id: input.land_parcel_id,
    name: input.name,
    approximate_capacity: input.approximate_capacity ?? null,
    rest_status: input.rest_status ?? null,
    current_condition: input.current_condition ?? null,
    notes: input.notes ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('pastures').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/pastures')
  return { success: true }
}

export async function deletePasture(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'pastures', recordId, 'Pasto')
  revalidatePath('/pastures')
  return { success: true }
}
