'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function convertOccurrence(id: string, targetTable: string, payload: any) {
  const supabase = await createAdminClient()

  // 1. Inserir no targetTable
  const { data: insertedRecord, error: insertError } = await supabase
    .from(targetTable)
    .insert(payload)
    .select('id')
    .single()

  if (insertError) {
    throw new Error(`Erro ao converter para ${targetTable}: ` + insertError.message)
  }

  // 2. Atualizar a Ocorrência para 'converted'
  const { error: updateError } = await supabase
    .from('occurrences')
    .update({
      status: 'converted',
      converted_to_table: targetTable,
      converted_to_id: insertedRecord.id
    })
    .eq('id', id)

  if (updateError) {
    throw new Error(`Erro ao atualizar status da ocorrência: ` + updateError.message)
  }

  revalidatePath('/occurrences')
  return { success: true }
}

export async function archiveOccurrence(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('occurrences').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/occurrences')
  return { success: true }
}
