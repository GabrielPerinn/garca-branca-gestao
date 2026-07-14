'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateString, optionalDateString, optionalText, parseFormData, parseRecordId, positiveInteger, positiveNumber, requiredText } from '@/lib/validation/forms'
import { getCivilDate } from '@/lib/date'

const saleSchema = z.object({
  cattle_lot_id: requiredText('Lote', 50),
  buyer: requiredText('Comprador'),
  amount: positiveNumber('Valor bruto'),
  quantity: positiveInteger('Quantidade'),
  date: dateString('Data da negociação'),
  shipment_date: optionalDateString('Data de embarque'),
  notes: optionalText('Observações'),
}).refine(
  (input) => !input.shipment_date || input.shipment_date >= input.date,
  { path: ['shipment_date'], message: 'A data de embarque não pode ser anterior à negociação.' },
)

export async function createSale(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const input = parseFormData(saleSchema, formData)
  const lotId = parseRecordId(input.cattle_lot_id)
  const { error } = await supabase.rpc('record_cattle_sale_transactional', {
    p_cattle_lot_id: lotId,
    p_buyer_name: input.buyer,
    p_quantity: input.quantity,
    p_gross_amount: input.amount,
    p_negotiation_date: input.date,
    p_shipment_date: input.shipment_date ?? null,
    p_notes: input.notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/sales')
  revalidatePath('/')
  return { success: true }
}

export async function deleteSale(id: string) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const recordId = parseRecordId(id)
  const { error } = await supabase.rpc('revert_cattle_sale_transactional', {
    p_sale_id: recordId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/sales')
  revalidatePath('/')
  return { success: true }
}

export async function receiveSale(id: string) {
  const supabase = await createAdminClient({ permission: 'finance.write' })
  const recordId = parseRecordId(id)
  const { error } = await supabase.rpc('receive_cattle_sale_transactional', {
    p_sale_id: recordId,
    p_payment_date: getCivilDate(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/sales')
  revalidatePath('/finance')
  revalidatePath('/reports')
  revalidatePath('/')
  return { success: true }
}
