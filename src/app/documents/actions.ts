'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'

const documentSchema = z.object({
  title: requiredText('Título'),
  type: optionalText('Tipo', 100),
})

export async function createDocument(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(documentSchema, formData)
  const data = {
    title: input.title,
    document_type: input.type ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('documents').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/documents')
  return { success: true }
}

export async function deleteDocument(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'documents', recordId, 'Documento')
  revalidatePath('/documents')
  return { success: true }
}
