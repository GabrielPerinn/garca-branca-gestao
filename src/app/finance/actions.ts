'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createExpense(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    amount: parseFloat(formData.get('amount') as string),
    description: formData.get('description') as string,
    category: formData.get('category') as string,
    expense_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('expenses').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function createRevenue(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    amount: parseFloat(formData.get('amount') as string),
    description: formData.get('description') as string,
    category: formData.get('category') as string,
    revenue_date: formData.get('date') as string,
  }
  const { error } = await supabase.from('revenues').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function deleteExpense(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('expenses').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function deleteRevenue(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('revenues').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}
