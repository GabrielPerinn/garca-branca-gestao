'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { nonNegativeNumber, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const inventoryItemSchema = z.object({
  name: requiredText('Nome do item'),
  category: optionalText('Categoria', 100),
  quantity: nonNegativeNumber('Quantidade atual'),
  min_quantity: nonNegativeNumber('Estoque mínimo'),
  unit: requiredText('Unidade', 40),
})

export async function createInventoryItem(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(inventoryItemSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    farm_id: farmId,
    name: input.name,
    category: input.category ?? null,
    current_quantity: input.quantity,
    minimum_quantity: input.min_quantity,
    unit: input.unit,
    status: 'active',
  }
  const { error } = await supabase.from('inventory_items').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}

export async function deleteInventoryItem(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'inventory_items', recordId, 'Item de estoque')
  revalidatePath('/inventory')
  revalidatePath('/')
  return { success: true }
}
