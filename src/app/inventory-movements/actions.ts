'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createMovement(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    movement_type: formData.get('type') as string,
    quantity: parseFloat(formData.get('quantity') as string),
    movement_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('inventory_movements').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/inventory-movements')
  return { success: true }
}

export async function deleteMovement(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('inventory_movements').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/inventory-movements')
  return { success: true }
}
