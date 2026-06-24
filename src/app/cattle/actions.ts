'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createCattleLot(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    name: formData.get('name') as string,
    category: formData.get('category') as string || null,
    current_quantity: parseInt(formData.get('current_quantity') as string) || 0,
    owner: formData.get('owner') as string || null,
    origin: formData.get('origin') as string || null,
    notes: formData.get('notes') as string || null,
    status: 'active',
  }
  const { error } = await supabase.from('cattle_lots').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/cattle')
  revalidatePath('/')
  return { success: true }
}

export async function deleteCattleLot(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('cattle_lots').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cattle')
  revalidatePath('/')
  return { success: true }
}
