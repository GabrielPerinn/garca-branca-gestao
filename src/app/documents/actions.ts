'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createDocument(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    title: formData.get('title') as string,
    document_type: formData.get('type') as string,
  }
  const { error } = await supabase.from('documents').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/documents')
  return { success: true }
}

export async function deleteDocument(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('documents').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/documents')
  return { success: true }
}
