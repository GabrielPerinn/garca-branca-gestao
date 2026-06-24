'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createPayment(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    amount: parseFloat(formData.get('amount') as string),
    description: formData.get('description') as string,
    payment_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('employee_payments').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/employee-payments')
  return { success: true }
}

export async function deletePayment(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('employee_payments').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/employee-payments')
  return { success: true }
}
