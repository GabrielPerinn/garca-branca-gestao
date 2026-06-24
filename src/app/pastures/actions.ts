'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createPasture(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    name: formData.get('name') as string,
    approximate_capacity: formData.get('approximate_capacity') ? parseFloat(formData.get('approximate_capacity') as string) : null,
    rest_status: formData.get('rest_status') as string || null,
    current_condition: formData.get('current_condition') as string || null,
    notes: formData.get('notes') as string || null,
    status: 'active',
  }
  const { error } = await supabase.from('pastures').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/pastures')
  return { success: true }
}

export async function deletePasture(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('pastures').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/pastures')
  return { success: true }
}
