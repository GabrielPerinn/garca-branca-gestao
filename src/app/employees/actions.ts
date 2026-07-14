'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalInteger, optionalNonNegativeNumber, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const employeeSchema = z.object({
  full_name: requiredText('Nome completo'),
  role_description: optionalText('Função', 150),
  salary_amount: optionalNonNegativeNumber('Salário'),
  payment_day: optionalInteger('Dia de pagamento', 1, 31),
  phone_number: optionalText('Telefone', 30),
  notes: optionalText('Observações'),
})

export async function createEmployee(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'people.write' })
  const input = parseFormData(employeeSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    farm_id: farmId,
    full_name: input.full_name,
    role_description: input.role_description ?? null,
    salary_amount: input.salary_amount ?? null,
    payment_day: input.payment_day ?? null,
    phone_number: input.phone_number ?? null,
    notes: input.notes ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('employees').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
  return { success: true }
}

export async function deleteEmployee(id: string) {
  const supabase = await createAdminClient({ permission: 'people.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'employees', recordId, 'Funcionário')
  revalidatePath('/employees')
  return { success: true }
}
