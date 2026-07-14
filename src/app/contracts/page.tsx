import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { ContractsClientPage } from './client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Contratos rurais' }

export default async function ContractsPage() {
  const supabase = await createAdminClient({ permission: 'actions.approve' })
  const [contracts, installments, parcels] = await Promise.all([
    supabase.from('rural_contracts').select('*').order('end_date', { ascending: true }),
    supabase.from('rural_contract_installments').select('*').order('due_date', { ascending: true }),
    supabase.from('land_parcels').select('id, name, tenure_type, total_area_ha').neq('status', 'deleted').order('name'),
  ])
  return (
    <ContractsClientPage
      contracts={contracts.data ?? []}
      installments={installments.data ?? []}
      parcels={parcels.data ?? []}
      databaseError={contracts.error?.message ?? installments.error?.message ?? parcels.error?.message ?? null}
    />
  )
}
