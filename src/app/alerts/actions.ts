'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseFormData, parseRecordId, requiredText, optionalText } from '@/lib/validation/forms'

const alertSchema = z.object({
  title: requiredText('Título'),
  type: requiredText('Tipo', 80),
  message: optionalText('Mensagem'),
})

export async function createAlert(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(alertSchema, formData)
  const data = {
    title: input.title,
    message: input.message ?? null,
    alert_type: input.type,
    status: 'pending',
  }
  const { error } = await supabase.from('alerts').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/alerts')
  return { success: true }
}

export async function deleteAlert(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'alerts', recordId, 'Alerta')
  revalidatePath('/alerts')
  return { success: true }
}
