'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createSuppression(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    location_description: formData.get('location') as string,
    area_cleared: parseFloat(formData.get('area') as string),
    operation_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('suppression_operations').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/suppression-operations')
  return { success: true }
}

export async function deleteSuppression(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('suppression_operations').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/suppression-operations')
  return { success: true }
}
