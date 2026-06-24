'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createFarm(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    name: formData.get('name') as string,
    location_description: formData.get('location_description') as string || null,
    notes: formData.get('notes') as string || null,
    status: 'active',
  }
  const { error } = await supabase.from('farms').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/farms')
  return { success: true }
}

export async function deleteFarm(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('farms').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/farms')
  return { success: true }
}
