'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, parseFormData, parseRecordId, positiveNumber, requiredText } from '@/lib/validation/forms'

const weighingSchema = z.object({
  cattle_lot_id: requiredText('Lote', 50),
  weight: positiveNumber('Peso médio'),
  date: dateString('Data'),
})

export async function createWeighing(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(weighingSchema, formData)
  const lotId = parseRecordId(input.cattle_lot_id)
  const { error } = await supabase.rpc('record_cattle_weighing_transactional', {
    p_cattle_lot_id: lotId,
    p_average_weight: input.weight,
    p_weighing_date: input.date,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/weighings')
  revalidatePath('/cattle')
  return { success: true }
}

export async function deleteWeighing(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'weighings', recordId, 'Pesagem')
  revalidatePath('/weighings')
  return { success: true }
}
