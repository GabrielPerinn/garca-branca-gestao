import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { databaseErrorMessage } from '@/lib/data/database-errors'

export async function softDeleteRecord(
  supabase: SupabaseClient,
  table: string,
  id: string,
  label = 'Registro',
) {
  const { data, error } = await supabase
    .from(table)
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'deleted')
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(databaseErrorMessage(error, `Não foi possível excluir ${label.toLowerCase()}.`))
  }
  if (!data) {
    throw new Error(`${label} não encontrado ou já excluído.`)
  }
}

export async function updateRecordState(
  supabase: SupabaseClient,
  options: {
    table: string
    id: string
    fromStatus: string
    values: Record<string, unknown>
    label?: string
  },
) {
  const { data, error } = await supabase
    .from(options.table)
    .update({ ...options.values, updated_at: new Date().toISOString() })
    .eq('id', options.id)
    .eq('status', options.fromStatus)
    .select('id')
    .maybeSingle()

  const label = options.label ?? 'Registro'
  if (error) {
    throw new Error(databaseErrorMessage(error, `Não foi possível atualizar ${label.toLowerCase()}.`))
  }
  if (!data) {
    throw new Error(`${label} não encontrado ou já processado.`)
  }
}
