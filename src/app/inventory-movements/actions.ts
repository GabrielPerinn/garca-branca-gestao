'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { getCivilDate } from '@/lib/date'
import {
  optionalDateString,
  optionalText,
  parseFormData,
  parseRecordId,
  positiveNumber,
  requiredText,
} from '@/lib/validation/forms'

const movementSchema = z.object({
  item_id: requiredText('Item de estoque', 50),
  type: z.enum(['in', 'out'], { error: 'Tipo de movimentação inválido.' }),
  quantity: positiveNumber('Quantidade'),
  date: optionalDateString('Data'),
  unit: optionalText('Unidade', 50),
  reason: optionalText('Motivo', 500),
  notes: optionalText('Observações', 2_000),
})

function revalidateInventory() {
  revalidatePath('/inventory-movements')
  revalidatePath('/inventory')
  revalidatePath('/')
}

export async function createMovement(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(movementSchema, formData)
  const itemId = parseRecordId(input.item_id)
  const { error } = await supabase.rpc('register_inventory_movement', {
    p_inventory_item_id: itemId,
    p_movement_type: input.type,
    p_quantity: input.quantity,
    p_movement_date: input.date ?? getCivilDate(),
    p_unit: input.unit ?? null,
    p_reason: input.reason ?? null,
    p_source_message_id: null,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(error.message)
  revalidateInventory()
  return { success: true }
}

export async function deleteMovement(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const movementId = parseRecordId(id)
  const { error } = await supabase.rpc('revert_inventory_movement', {
    p_movement_id: movementId,
  })

  if (error) throw new Error(error.message)
  revalidateInventory()
  return { success: true }
}
