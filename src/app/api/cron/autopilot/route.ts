import { NextRequest, NextResponse } from 'next/server'
import { runOperationalAutopilot } from '@/lib/autopilot/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }
  try {
    const result = await runOperationalAutopilot({ trigger: 'scheduled' })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Cron operational autopilot]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Falha na verificação operacional agendada.' }, { status: 500 })
  }
}
