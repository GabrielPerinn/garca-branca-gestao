'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, parseFormData, parseRecordId, positiveNumber, requiredText } from '@/lib/validation/forms'

const paymentSchema = z.object({
  employee_id: requiredText('Funcionário', 50),
  amount: positiveNumber('Valor'),
  description: requiredText('Descrição'),
  date: dateString('Data'),
  payment_type: requiredText('Tipo de pagamento', 80),
})

export async function createPayment(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'people.write' })
  const input = parseFormData(paymentSchema, formData)
  const employeeId = parseRecordId(input.employee_id)
  const { error } = await supabase.rpc('record_employee_payment_transactional', {
    p_employee_id: employeeId,
    p_payment_type: input.payment_type,
    p_amount: input.amount,
    p_payment_date: input.date,
    p_description: input.description,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/employee-payments')
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}

export async function deletePayment(id: string) {
  const supabase = await createAdminClient({ permission: 'people.write' })
  const recordId = parseRecordId(id)
  const { error } = await supabase.rpc('revert_employee_payment_transactional', {
    p_payment_id: recordId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/employee-payments')
  revalidatePath('/finance')
  revalidatePath('/')
  return { success: true }
}
