'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createInventoryItem(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    current_quantity: parseFloat(formData.get('quantity') as string),
    minimum_quantity: parseFloat(formData.get('min_quantity') as string),
    unit: formData.get('unit') as string,
  }
  const { error } = await supabase.from('inventory_items').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}

export async function deleteInventoryItem(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('inventory_items').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}
