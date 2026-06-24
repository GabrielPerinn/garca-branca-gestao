'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createSale(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    buyer_name: formData.get('buyer') as string,
    gross_amount: parseFloat(formData.get('amount') as string),
    quantity: parseInt(formData.get('quantity') as string) || 1,
    negotiation_date: formData.get('date') as string,
    shipment_date: formData.get('shipment_date') as string || null,
    notes: formData.get('notes') as string || null,
    payment_status: 'pending',
    status: 'active',
  }
  const { error } = await supabase.from('cattle_sales').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/sales')
  revalidatePath('/')
  return { success: true }
}

export async function deleteSale(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('cattle_sales').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sales')
  revalidatePath('/')
  return { success: true }
}
