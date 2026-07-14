'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'

const farmSchema = z.object({
  name: requiredText('Nome da operação'),
  location_description: optionalText('Localização', 500),
  notes: optionalText('Observações'),
})

export async function createFarm(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'settings.write' })
  const input = parseFormData(farmSchema, formData)
  const { count, error: countError } = await supabase
    .from('farms')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'deleted')
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) throw new Error('A operação pecuária já existe. Revise-a na Base da operação.')
  const data = {
    name: input.name,
    location_description: input.location_description ?? null,
    notes: input.notes ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('farms').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/farms')
  return { success: true }
}

export async function deleteFarm(id: string) {
  const supabase = await createAdminClient({ permission: 'settings.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'farms', recordId, 'Operação pecuária')
  revalidatePath('/farms')
  return { success: true }
}
