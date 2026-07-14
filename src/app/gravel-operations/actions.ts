'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, parseFormData, parseRecordId, positiveNumber, requiredText } from '@/lib/validation/forms'

const gravelSchema = z.object({
  origin_location: requiredText('Localização', 500),
  estimated_volume: positiveNumber('Volume'),
  date: dateString('Data'),
})

export async function createGravel(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(gravelSchema, formData)
  const data = {
    origin_location: input.origin_location,
    estimated_volume: input.estimated_volume,
    operation_date: input.date,
    operation_type: 'extraction',
    status: 'active',
  }
  const { error } = await supabase.from('gravel_operations').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/gravel-operations')
  return { success: true }
}

export async function deleteGravel(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'gravel_operations', recordId, 'Operação de cascalho')
  revalidatePath('/gravel-operations')
  return { success: true }
}
