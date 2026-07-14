import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ProtectionStatus = {
  backup_fresh?: boolean
  backup?: { backup_id?: string; verified_at?: string; completed_at?: string } | null
  integrity?: { is_valid?: boolean; checked_at?: string; issues?: unknown[] } | null
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const supabase = createServiceRoleClient({ requestTimeoutMs: 30_000 })
  const { data: integrity, error: integrityError } = await supabase.rpc('run_data_integrity_check', {
    p_source: 'vercel_daily_cron',
    p_record: true,
  })
  if (integrityError) {
    console.error('[Data protection] Integridade:', integrityError.message)
    return NextResponse.json({ error: 'Falha ao verificar a integridade dos dados.' }, { status: 500 })
  }

  const { data, error: statusError } = await supabase.rpc('get_data_protection_status')
  if (statusError) {
    console.error('[Data protection] Status:', statusError.message)
    return NextResponse.json({ error: 'Falha ao consultar o estado dos backups.' }, { status: 500 })
  }
  const status = (data ?? {}) as ProtectionStatus
  const integrityValid = status.integrity?.is_valid === true
  const protectedNow = status.backup_fresh === true && integrityValid
  const title = 'Proteção dos dados da fazenda exige atenção'
  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('alert_type', 'data_protection')
    .eq('title', title)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (!protectedNow) {
    const reasons = [
      status.backup_fresh ? null : 'não existe backup externo verificado nas últimas 36 horas',
      integrityValid ? null : 'a última verificação de integridade encontrou divergências',
    ].filter(Boolean).join('; ')
    const values = {
      alert_type: 'data_protection',
      title,
      message: `A proteção automática detectou que ${reasons}. Não faça alterações em massa antes da revisão técnica.`,
      due_date: new Date().toISOString().slice(0, 10),
      related_table: 'data_protection_runs',
      status: 'pending',
      updated_at: new Date().toISOString(),
    }
    if (existing) await supabase.from('alerts').update(values).eq('id', existing.id)
    else await supabase.from('alerts').insert(values)
  } else if (existing) {
    await supabase.from('alerts').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', existing.id)
  }

  return NextResponse.json({
    status: protectedNow ? 'protected' : 'attention',
    backup_fresh: status.backup_fresh === true,
    integrity_valid: integrityValid,
    backup_id: status.backup?.backup_id ?? null,
    integrity,
  }, { status: protectedNow ? 200 : 503 })
}
