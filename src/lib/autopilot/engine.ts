import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getCivilDate } from '@/lib/date'
import { defaultAutopilotRules, evaluateAutopilotSnapshot, type AutopilotRule, type AutopilotSnapshot } from './rules'

export type AutopilotTrigger = 'manual' | 'scheduled' | 'event'

export type AutopilotRunResult = {
  status: 'completed' | 'skipped'
  reason?: 'farm_not_configured' | 'disabled' | 'already_running'
  runId?: string
  evaluatedRules: number
  findingsDetected: number
  findingsCreated: number
  findingsResolved: number
}

async function ensureAutopilotConfiguration(supabase: SupabaseClient, farmId: string, actorProfileId?: string) {
  const { error: settingsError } = await supabase.from('autopilot_settings').upsert({
    farm_id: farmId,
    created_by: actorProfileId || null,
  }, { onConflict: 'farm_id', ignoreDuplicates: true })
  if (settingsError) throw new Error(`Falha ao preparar as configurações do Autopiloto: ${settingsError.message}`)

  const rows = defaultAutopilotRules.map(rule => ({ ...rule, farm_id: farmId, updated_by: actorProfileId || null }))
  const { error: rulesError } = await supabase.from('autopilot_rules').upsert(rows, {
    onConflict: 'farm_id,rule_key', ignoreDuplicates: true,
  })
  if (rulesError) throw new Error(`Falha ao preparar as regras do Autopiloto: ${rulesError.message}`)
}

export async function runOperationalAutopilot(input: {
  trigger: AutopilotTrigger
  actorProfileId?: string
  supabase?: SupabaseClient
}): Promise<AutopilotRunResult> {
  const startedAt = Date.now()
  const supabase = input.supabase || createServiceRoleClient({ actorProfileId: input.actorProfileId, requestTimeoutMs: 60_000 })
  const { data: farm, error: farmError } = await supabase.from('farms').select('id').neq('status', 'deleted').order('created_at').limit(1).maybeSingle()
  if (farmError) throw new Error(`Falha ao localizar a propriedade: ${farmError.message}`)
  if (!farm) return { status: 'skipped', reason: 'farm_not_configured', evaluatedRules: 0, findingsDetected: 0, findingsCreated: 0, findingsResolved: 0 }

  await ensureAutopilotConfiguration(supabase, farm.id, input.actorProfileId)
  const { data: settings, error: settingsError } = await supabase.from('autopilot_settings').select('enabled').eq('farm_id', farm.id).single()
  if (settingsError) throw new Error(`Falha ao carregar o Autopiloto: ${settingsError.message}`)
  if (!settings.enabled && input.trigger !== 'manual') return { status: 'skipped', reason: 'disabled', evaluatedRules: 0, findingsDetected: 0, findingsCreated: 0, findingsResolved: 0 }

  const staleThreshold = new Date(Date.now() - 15 * 60 * 1_000).toISOString()
  await supabase.from('autopilot_runs').update({
    status: 'failed', completed_at: new Date().toISOString(), error_message: 'Execução interrompida antes da conclusão.',
  }).eq('farm_id', farm.id).eq('status', 'running').lt('started_at', staleThreshold)

  const { data: run, error: runError } = await supabase.from('autopilot_runs').insert({
    farm_id: farm.id, trigger_source: input.trigger, initiated_by: input.actorProfileId || null,
  }).select('id').single()
  if (runError?.code === '23505') return { status: 'skipped', reason: 'already_running', evaluatedRules: 0, findingsDetected: 0, findingsCreated: 0, findingsResolved: 0 }
  if (runError || !run) throw new Error(`Não foi possível iniciar o Autopiloto: ${runError?.message || 'erro desconhecido'}`)

  try {
    const [rulesResult, tasksResult, inventoryResult, pasturesResult, lotsResult, occurrencesResult, documentsResult, weighingsResult, expensesResult, revenuesResult] = await Promise.all([
      supabase.from('autopilot_rules').select('id, rule_key, enabled, config_json').eq('farm_id', farm.id).order('rule_key'),
      supabase.from('tasks').select('id, title, due_date, priority, status').eq('related_farm_id', farm.id).neq('status', 'deleted').limit(1000),
      supabase.from('inventory_items').select('id, name, current_quantity, minimum_quantity, status').eq('farm_id', farm.id).neq('status', 'deleted').limit(1000),
      supabase.from('pastures').select('id, name, approximate_capacity, status').eq('farm_id', farm.id).neq('status', 'deleted').limit(1000),
      supabase.from('cattle_lots').select('id, name, current_quantity, pasture_id, status').eq('farm_id', farm.id).neq('status', 'deleted').limit(1000),
      supabase.from('occurrences').select('id, title, priority, status, created_at').eq('related_farm_id', farm.id).neq('status', 'deleted').limit(1000),
      supabase.from('documents').select('id, title, expiration_date, status').neq('status', 'deleted').limit(1000),
      supabase.from('weighings').select('cattle_lot_id, weighing_date').limit(5000),
      supabase.from('expenses').select('amount, expense_date, status').eq('related_farm_id', farm.id).neq('status', 'deleted').limit(5000),
      supabase.from('revenues').select('amount, revenue_date, status').neq('status', 'deleted').limit(5000),
    ])
    const queryError = [rulesResult, tasksResult, inventoryResult, pasturesResult, lotsResult, occurrencesResult, documentsResult, weighingsResult, expensesResult, revenuesResult].find(result => result.error)?.error
    if (queryError) throw new Error(`Falha ao montar o diagnóstico operacional: ${queryError.message}`)

    const snapshot: AutopilotSnapshot = {
      today: getCivilDate(), now: new Date().toISOString(),
      tasks: tasksResult.data || [], inventory: inventoryResult.data || [], pastures: pasturesResult.data || [], cattleLots: lotsResult.data || [],
      occurrences: occurrencesResult.data || [], documents: documentsResult.data || [], weighings: weighingsResult.data || [], expenses: expensesResult.data || [], revenues: revenuesResult.data || [],
    }
    const rules = (rulesResult.data || []) as AutopilotRule[]
    const evaluation = evaluateAutopilotSnapshot(snapshot, rules)
    const ruleByKey = new Map(rules.map(rule => [rule.rule_key, rule]))
    let findingsCreated = 0
    for (const finding of evaluation.findings) {
      const rule = ruleByKey.get(finding.ruleKey)
      if (!rule) continue
      const { data, error } = await supabase.rpc('record_autopilot_finding', {
        p_run_id: run.id, p_rule_id: rule.id, p_fingerprint: finding.fingerprint,
        p_category: finding.category, p_severity: finding.severity, p_title: finding.title,
        p_summary: finding.summary, p_recommended_action: finding.recommendedAction,
        p_evidence_json: finding.evidence, p_related_table: finding.relatedTable || null, p_related_id: finding.relatedId || null,
      })
      if (error) throw new Error(`Falha ao registrar um achado do Autopiloto: ${error.message}`)
      if (data?.[0]?.was_created) findingsCreated += 1
    }

    const { data: resolved, error: resolveError } = await supabase.rpc('resolve_missing_autopilot_findings', {
      p_run_id: run.id, p_evaluated_rule_keys: evaluation.evaluatedRuleKeys,
    })
    if (resolveError) throw new Error(`Falha ao reconciliar os achados: ${resolveError.message}`)
    const bySeverity = evaluation.findings.reduce<Record<string, number>>((accumulator, finding) => {
      accumulator[finding.severity] = (accumulator[finding.severity] || 0) + 1
      return accumulator
    }, {})
    const durationMs = Date.now() - startedAt
    const { error: finishError } = await supabase.rpc('finish_autopilot_run', {
      p_run_id: run.id, p_status: 'completed', p_evaluated_rules: evaluation.evaluatedRuleKeys.length,
      p_findings_detected: evaluation.findings.length, p_findings_created: findingsCreated,
      p_findings_resolved: Number(resolved || 0), p_duration_ms: durationMs,
      p_stats_json: { by_severity: bySeverity, snapshot_sizes: { tasks: snapshot.tasks.length, inventory: snapshot.inventory.length, cattle_lots: snapshot.cattleLots.length } },
      p_error_message: null,
    })
    if (finishError) throw new Error(`Falha ao finalizar o Autopiloto: ${finishError.message}`)
    return { status: 'completed', runId: run.id, evaluatedRules: evaluation.evaluatedRuleKeys.length, findingsDetected: evaluation.findings.length, findingsCreated, findingsResolved: Number(resolved || 0) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no Autopiloto.'
    await supabase.rpc('finish_autopilot_run', {
      p_run_id: run.id, p_status: 'failed', p_evaluated_rules: 0, p_findings_detected: 0,
      p_findings_created: 0, p_findings_resolved: 0, p_duration_ms: Date.now() - startedAt,
      p_stats_json: {}, p_error_message: message,
    })
    throw error
  }
}
