'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createAlert(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    alert_type: formData.get('type') as string,
  }
  const { error } = await supabase.from('alerts').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/alerts')
  return { success: true }
}

export async function deleteAlert(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('alerts').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/alerts')
  return { success: true }
}
