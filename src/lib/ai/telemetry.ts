import { createClient } from '@supabase/supabase-js'

type UsageLike = {
  input_tokens?: number | null
  output_tokens?: number | null
  total_tokens?: number | null
} | null | undefined

export async function recordAIUsageEvent(input: {
  operation: string
  modelName?: string | null
  status: 'success' | 'error' | 'fallback'
  startedAt: number
  usage?: UsageLike
  errorCategory?: string | null
  userProfileId?: string | null
  sourceMessageId?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: {
        fetch: (resource: RequestInfo | URL, init?: RequestInit) => fetch(resource, {
          ...init,
          signal: AbortSignal.timeout(5_000),
        }),
      },
    })
    const inputTokens = Number(input.usage?.input_tokens ?? 0) || null
    const outputTokens = Number(input.usage?.output_tokens ?? 0) || null
    const totalTokens = Number(input.usage?.total_tokens ?? 0)
      || (inputTokens || 0) + (outputTokens || 0)
      || null

    const { error } = await supabase.from('ai_usage_events').insert({
      operation: input.operation.slice(0, 100),
      model_name: input.modelName?.slice(0, 100) || null,
      status: input.status,
      latency_ms: Math.max(0, Date.now() - input.startedAt),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      error_category: input.errorCategory?.slice(0, 120) || null,
      user_profile_id: input.userProfileId || null,
      source_message_id: input.sourceMessageId?.slice(0, 300) || null,
      metadata_json: input.metadata ?? {},
    })
    if (error) console.error('[AI telemetry] Falha ao registrar evento:', error.message)
  } catch (error) {
    console.error('[AI telemetry] Falha silenciosa:', error instanceof Error ? error.message : error)
  }
}
