import type { Metadata } from 'next'
import { getPlanningBaseline } from '@/lib/planning/data'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import { PlanningClientPage } from './client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Laboratório de Decisões',
  description: 'Simulações rastreáveis e metas gerenciais baseadas nos dados reais da fazenda.',
}

export default async function PlanningPage() {
  const { profile } = await requirePermission('actions.approve')
  const baseline = await getPlanningBaseline(profile.id)
  if (!baseline) return <PlanningClientPage baseline={null} scenarios={[]} goals={[]} />
  const supabase = createServiceRoleClient({ actorProfileId: profile.id })
  const [scenariosResult, goalsResult] = await Promise.all([
    supabase.from('planning_scenarios').select('*').eq('farm_id', baseline.farmId).order('created_at', { ascending: false }).limit(100),
    supabase.from('farm_goals').select('*').eq('farm_id', baseline.farmId).order('target_date').order('created_at', { ascending: false }).limit(100),
  ])
  const error = scenariosResult.error || goalsResult.error
  if (error) throw new Error(`Não foi possível carregar o planejamento: ${error.message}`)
  return <PlanningClientPage baseline={baseline} scenarios={scenariosResult.data ?? []} goals={goalsResult.data ?? []} />
}
