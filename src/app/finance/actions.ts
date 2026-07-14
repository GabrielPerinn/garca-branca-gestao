'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, optionalText, parseFormData, parseRecordId, positiveNumber, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const financialEntrySchema = z.object({
  amount: positiveNumber('Valor'),
  description: requiredText('Descrição'),
  category: optionalText('Categoria', 100),
  date: dateString('Data'),
})

export async function createExpense(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const input = parseFormData(financialEntrySchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    amount: input.amount,
    description: input.description,
    category: input.category ?? null,
    expense_date: input.date,
    status: 'active',
    related_farm_id: farmId,
  }
  const { error } = await supabase.from('expenses').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function createRevenue(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const input = parseFormData(financialEntrySchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    amount: input.amount,
    description: input.description,
    category: input.category ?? null,
    revenue_date: input.date,
    status: 'active',
    related_farm_id: farmId,
  }
  const { error } = await supabase.from('revenues').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function deleteExpense(id: string) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'expenses', recordId, 'Despesa')
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function deleteRevenue(id: string) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'revenues', recordId, 'Receita')
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}
