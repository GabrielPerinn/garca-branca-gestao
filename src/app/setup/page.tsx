import type { Metadata } from 'next'
import { farmFoundationDraftPayloadSchema } from '@/lib/onboarding/schema'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { SetupClientPage, type ExistingFoundation, type FoundationDraft } from './client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Base da operação pecuária',
}

export default async function SetupPage() {
  const { profile: actorProfile } = await requirePermission('settings.write')
  const supabase = createServiceRoleClient({ actorProfileId: actorProfile.id })
  const [farmResult, draftResult] = await Promise.all([
    supabase
      .from('farms')
      .select(`
        id, name, legal_name, document_number, state_registration, owner_name,
        owner_phone, municipality, state_code, postal_code, address,
        location_description, total_area_ha, productive_area_ha, primary_activity,
        livestock_system, timezone, notes, setup_completed_at
      `)
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('foundation_setup_drafts')
      .select('operation_id, payload, current_step, revision, last_saved_at')
      .eq('owner_profile_id', actorProfile.id)
      .maybeSingle(),
  ])

  let existing: ExistingFoundation | null = null
  if (farmResult.data) {
    const farm = farmResult.data
    const [pastures, lots, employees, inventory, land, assets, contracts] = await Promise.all([
      supabase.from('pastures').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('cattle_lots').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('employees').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('land_parcels').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('farm_assets').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id).neq('status', 'deleted'),
      supabase.from('rural_contracts').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id),
    ])

    existing = {
      farmId: farm.id,
      completed: Boolean(farm.setup_completed_at),
      profile: {
        name: farm.name ?? '',
        legal_name: farm.legal_name ?? '',
        document_number: farm.document_number ?? '',
        state_registration: farm.state_registration ?? '',
        owner_name: farm.owner_name ?? '',
        owner_phone: farm.owner_phone ?? '',
        municipality: farm.municipality ?? '',
        state_code: farm.state_code ?? '',
        postal_code: farm.postal_code ?? '',
        address: farm.address ?? '',
        location_description: farm.location_description ?? '',
        total_area_ha: farm.total_area_ha === null ? '' : String(farm.total_area_ha),
        productive_area_ha: farm.productive_area_ha === null ? '' : String(farm.productive_area_ha),
        primary_activity: farm.primary_activity ?? 'beef_cattle',
        livestock_system: farm.livestock_system ?? 'extensive',
        timezone: farm.timezone ?? 'America/Cuiaba',
        notes: farm.notes ?? '',
      },
      counts: {
        pastures: pastures.count ?? 0,
        cattleLots: lots.count ?? 0,
        employees: employees.count ?? 0,
        inventoryItems: inventory.count ?? 0,
        landParcels: land.count ?? 0,
        farmAssets: assets.count ?? 0,
        ruralContracts: contracts.count ?? 0,
      },
    }
  }

  let draft: FoundationDraft | null = null
  const parsedDraft = farmFoundationDraftPayloadSchema.safeParse(draftResult.data?.payload)
  const draftIsCurrent = !farmResult.data?.setup_completed_at
    || Boolean(draftResult.data?.last_saved_at && draftResult.data.last_saved_at > farmResult.data.setup_completed_at)
  if (draftResult.data && parsedDraft.success && draftIsCurrent) {
    draft = {
      currentStep: draftResult.data.current_step,
      revision: Number(draftResult.data.revision),
      lastSavedAt: draftResult.data.last_saved_at,
      payload: parsedDraft.data as FoundationDraft['payload'],
    }
  }

  const databaseError = farmResult.error?.message
    ?? draftResult.error?.message
    ?? (draftResult.data && !parsedDraft.success ? 'O rascunho salvo está incompatível e não pôde ser restaurado.' : null)

  return <SetupClientPage existing={existing} draft={draft} databaseError={databaseError} />
}
