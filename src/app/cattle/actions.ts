'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { nonNegativeInteger, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const cattleLotSchema = z.object({
  name: requiredText('Nome do lote'),
  category: optionalText('Categoria', 100),
  current_quantity: nonNegativeInteger('Quantidade atual'),
  owner: optionalText('Proprietário', 150),
  origin: optionalText('Origem', 200),
  notes: optionalText('Observações'),
})

export async function createCattleLot(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(cattleLotSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    farm_id: farmId,
    name: input.name,
    category: input.category ?? null,
    current_quantity: input.current_quantity,
    owner: input.owner ?? null,
    origin: input.origin ?? null,
    notes: input.notes ?? null,
    status: 'active',
  }
  const { error } = await supabase.from('cattle_lots').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/cattle')
  revalidatePath('/')
  return { success: true }
}

export async function deleteCattleLot(id: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(id)
  await softDeleteRecord(supabase, 'cattle_lots', recordId, 'Lote')
  revalidatePath('/cattle')
  revalidatePath('/')
  return { success: true }
}
