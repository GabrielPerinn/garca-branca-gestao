import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { generateStrategicReport } from '@/lib/ai/strategic-intelligence'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const supabase = createServiceRoleClient({ requestTimeoutMs: 120_000 })
  const duplicateThreshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1_000).toISOString()
  const { data: recent, error: recentError } = await supabase
    .from('ai_strategic_reports')
    .select('id, created_at')
    .eq('generation_mode', 'scheduled')
    .eq('status', 'completed')
    .gte('created_at', duplicateThreshold)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recentError) return NextResponse.json({ error: recentError.message }, { status: 500 })
  if (recent) return NextResponse.json({ status: 'skipped', reason: 'recent_analysis_exists', report_id: recent.id })

  try {
    const result = await generateStrategicReport({ supabase, generationMode: 'scheduled' })
    return NextResponse.json({ status: 'completed', report_id: result.reportId, insights: result.insightCount })
  } catch (error) {
    console.error('[Cron strategic analysis]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Falha ao gerar a análise estratégica agendada.' }, { status: 500 })
  }
}
