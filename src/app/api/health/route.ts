import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DATABASE_HEALTH_TIMEOUT_MS = 5_000

function hasValidAppUrl() {
  const candidate = process.env.APP_BASE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  if (!candidate) return process.env.NODE_ENV !== 'production'

  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')
  } catch {
    return false
  }
}

export async function GET() {
  const startedAt = Date.now()
  const configurationOk = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      && process.env.SUPABASE_SERVICE_ROLE_KEY
      && hasValidAppUrl()
  )
  let databaseOk = false
  let databaseLatencyMs: number | undefined
  let dataProtection: { backup_fresh?: boolean; integrity?: { is_valid?: boolean } | null } | undefined

  if (configurationOk) {
    try {
      const queryStartedAt = Date.now()
      const supabase = createServiceRoleClient({ requestTimeoutMs: DATABASE_HEALTH_TIMEOUT_MS })
      const query = supabase.from('farms').select('id', { head: true }).limit(1)
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('database_health_timeout')), DATABASE_HEALTH_TIMEOUT_MS)
        timer.unref()
      })
      const { error } = await Promise.race([query, timeout])
      databaseLatencyMs = Date.now() - queryStartedAt
      databaseOk = !error
      if (error) console.error('[Health] Banco indisponível:', error.code)
      if (!error) {
        const { data: protectionData, error: protectionError } = await supabase.rpc('get_data_protection_status')
        if (!protectionError) dataProtection = protectionData as typeof dataProtection
        else console.error('[Health] Proteção de dados indisponível:', protectionError.code)
      }
    } catch (error) {
      console.error('[Health] Falha na verificação do banco:', error instanceof Error ? error.name : 'unknown')
    }
  }

  const healthy = configurationOk && databaseOk
  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    latency_ms: Date.now() - startedAt,
    checks: {
      configuration: { ok: configurationOk },
      database: { ok: databaseOk, ...(databaseLatencyMs === undefined ? {} : { latency_ms: databaseLatencyMs }) },
      data_protection: {
        ok: dataProtection?.backup_fresh === true && dataProtection?.integrity?.is_valid === true,
        backup_fresh: dataProtection?.backup_fresh === true,
        integrity_valid: dataProtection?.integrity?.is_valid === true,
      },
    },
  }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
