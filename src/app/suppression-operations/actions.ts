'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, parseFormData, parseRecordId, positiveNumber, requiredText } from '@/lib/validation/forms'

const suppressionSchema = z.object({
  notes: requiredText('Localização e observações', 2_000),
  approximate_area: positiveNumber('Área'),
  date: dateString('Data'),
})

export async function createSuppression(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(suppressionSchema, formData)
  const data = {
    approximate_area: input.approximate_area,
    operation_date: input.date,
    operation_type: 'clearing',
    notes: input.notes,
    status: 'active',
  }
  const { error } = await supabase.from('suppression_operations').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/suppression-operations')
  return { success: true }
}

export async function deleteSuppression(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'suppression_operations', recordId, 'Operação de supressão')
  revalidatePath('/suppression-operations')
  return { success: true }
}
