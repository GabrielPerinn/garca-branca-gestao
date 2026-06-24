'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createGravel(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    location_description: formData.get('location') as string,
    volume_extracted: parseFloat(formData.get('volume') as string),
    operation_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('gravel_operations').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/gravel-operations')
  return { success: true }
}

export async function deleteGravel(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('gravel_operations').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gravel-operations')
  return { success: true }
}
