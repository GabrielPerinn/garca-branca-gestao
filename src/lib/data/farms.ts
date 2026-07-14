import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPrimaryFarmId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('farms')
    .select('id')
    .neq('status', 'deleted')
    .order('setup_completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Não foi possível identificar a fazenda principal.')
  if (!data) throw new Error('Configure a base da fazenda antes de criar registros operacionais.')
  return data.id as string
}
