'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createEmployee(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    full_name: formData.get('full_name') as string,
    role_description: formData.get('role_description') as string || null,
    salary_amount: formData.get('salary_amount') ? parseFloat(formData.get('salary_amount') as string) : null,
    payment_day: formData.get('payment_day') ? parseInt(formData.get('payment_day') as string) : null,
    phone_number: formData.get('phone_number') as string || null,
    notes: formData.get('notes') as string || null,
    status: 'active',
  }
  const { error } = await supabase.from('employees').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
  return { success: true }
}

export async function deleteEmployee(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('employees').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
  return { success: true }
}
