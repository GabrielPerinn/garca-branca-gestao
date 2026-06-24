'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createWeighing(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    average_weight: parseFloat(formData.get('weight') as string),
    weighing_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('weighings').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/weighings')
  return { success: true }
}

export async function deleteWeighing(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('weighings').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/weighings')
  return { success: true }
}
