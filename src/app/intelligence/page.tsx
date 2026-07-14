import type { Metadata } from 'next'
import type { ComponentProps } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCivilDate, shiftCivilDate } from '@/lib/date'
import { IntelligenceClientPage } from './client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Inteligência Estratégica',
  description: 'Análises cruzadas e oportunidades baseadas nos dados reais da fazenda.',
}

export default async function IntelligencePage() {
  const supabase = await createAdminClient()
  const since = `${shiftCivilDate(getCivilDate(), -30)}T00:00:00Z`
  const [latestResult, historyResult, usageResult] = await Promise.all([
    supabase.from('ai_strategic_reports').select('*').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ai_strategic_reports').select('id, created_at, maturity_score, maturity_label, generation_mode, processing_ms').order('created_at', { ascending: false }).limit(12),
    supabase.from('ai_usage_events').select('status, latency_ms, total_tokens').gte('created_at', since).order('created_at', { ascending: false }).limit(5_000),
  ])

  let insights: ComponentProps<typeof IntelligenceClientPage>['insights'] = []
  let insightError: { message: string } | null = null
  if (latestResult.data?.id) {
    const result = await supabase.from('ai_strategic_insights').select('*').eq('report_id', latestResult.data.id).order('created_at')
    insights = (result.data ?? []) as ComponentProps<typeof IntelligenceClientPage>['insights']
    insightError = result.error
  }

  const usage = usageResult.data ?? []
  const successful = usage.filter(event => event.status === 'success')
  const telemetry = {
    calls30d: usage.length,
    successRate: usage.length ? successful.length / usage.length * 100 : null,
    averageLatencyMs: successful.length
      ? Math.round(successful.reduce((total, event) => total + Number(event.latency_ms || 0), 0) / successful.length)
      : null,
    tokens30d: usage.reduce((total, event) => total + Number(event.total_tokens || 0), 0),
  }

  const error = latestResult.error || historyResult.error || usageResult.error || insightError
  return (
    <IntelligenceClientPage
      latestReport={latestResult.data}
      insights={insights}
      history={historyResult.data ?? []}
      telemetry={telemetry}
      dbError={error?.message}
    />
  )
}
