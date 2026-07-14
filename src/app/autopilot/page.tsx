import type { Metadata } from 'next'
import { createClient, createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { AutopilotClientPage } from './client-page'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Autopiloto Operacional' }

export default async function AutopilotPage() {
  const { profile } = await requirePermission('actions.approve')
  const supabase = await createClient()
  const service = createServiceRoleClient({ actorProfileId: profile.id })
  const farmResult = await service.from('farms').select('id, name').neq('status', 'deleted').order('created_at').limit(1).maybeSingle()
  const farm = farmResult.data
  if (!farm) return <AutopilotClientPage farm={null} settings={null} rules={[]} findings={[]} runs={[]} canConfigure={profile.role === 'owner' || profile.role === 'admin'} />

  const [settingsResult, rulesResult, findingsResult, runsResult] = await Promise.all([
    supabase.from('autopilot_settings').select('*').eq('farm_id', farm.id).maybeSingle(),
    supabase.from('autopilot_rules').select('*').eq('farm_id', farm.id).order('category').order('name'),
    supabase.from('autopilot_findings').select('*').eq('farm_id', farm.id).order('last_detected_at', { ascending: false }).limit(200),
    supabase.from('autopilot_runs').select('*').eq('farm_id', farm.id).order('started_at', { ascending: false }).limit(50),
  ])
  const error = settingsResult.error || rulesResult.error || findingsResult.error || runsResult.error
  if (error) throw new Error(`Não foi possível carregar o Autopiloto: ${error.message}`)
  return <AutopilotClientPage farm={farm} settings={settingsResult.data} rules={rulesResult.data || []} findings={findingsResult.data || []} runs={runsResult.data || []} canConfigure={profile.role === 'owner' || profile.role === 'admin'} />
}
