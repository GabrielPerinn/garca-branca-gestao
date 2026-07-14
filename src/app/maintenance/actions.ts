'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalDateString, optionalNonNegativeNumber, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'

const maintenanceSchema = z.object({
  asset_name: requiredText('Equipamento ou ativo'),
  maintenance_type: optionalText('Tipo de manutenção', 100),
  maintenance_date: optionalDateString('Data'),
  cost_amount: optionalNonNegativeNumber('Custo'),
  responsible_person: optionalText('Responsável', 150),
  notes: optionalText('Observações'),
})

export async function createMaintenanceRecord(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(maintenanceSchema, formData)
  const data = {
    asset_name: input.asset_name,
    asset_type: 'equipment',
    maintenance_type: input.maintenance_type ?? null,
    maintenance_date: input.maintenance_date ?? null,
    cost_amount: input.cost_amount ?? null,
    responsible_person: input.responsible_person ?? null,
    notes: input.notes ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('maintenance_records').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/maintenance')
  return { success: true }
}

export async function deleteMaintenanceRecord(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'maintenance_records', recordId, 'Manutenção')
  revalidatePath('/maintenance')
  return { success: true }
}
