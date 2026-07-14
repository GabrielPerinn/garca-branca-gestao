import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getCivilDate } from '@/lib/date'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

async function sendReminderTemplate(to: string, title: string, dueDate: string) {
  const templateName = process.env.WHATSAPP_ALERT_REMINDER_TEMPLATE?.trim()
    || process.env.WHATSAPP_TASK_REMINDER_TEMPLATE?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0'
  if (!templateName || !phoneNumberId || !accessToken) return false

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TASK_REMINDER_LANGUAGE || 'pt_BR' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: title.substring(0, 200) },
            { type: 'text', text: dueDate },
          ],
        }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  return response.ok
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const today = getCivilDate()
  const [messageRetention, clarificationRetention, evidenceRetention] = await Promise.all([
    supabase.rpc('redact_expired_incoming_messages', { p_limit: 500 }),
    supabase.rpc('maintain_ai_conversation_retention', {
      p_redact_after_days: 30,
      p_batch_size: 500,
    }),
    supabase.rpc('maintain_ai_evidence_retention', { p_limit: 200 }),
  ])
  if (messageRetention.error) console.error('[Cron] Retenção de mensagens:', messageRetention.error.message)
  if (clarificationRetention.error) console.error('[Cron] Retenção de complementos:', clarificationRetention.error.message)
  if (evidenceRetention.error) console.error('[Cron] Retenção de evidências:', evidenceRetention.error.message)
  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, due_date, assigned_to_user_id')
    .in('status', ['pending', 'in_progress'])
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(200)

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 })
  }

  const { data: fallbackProfiles } = await supabase
    .from('users_profiles')
    .select('id, phone_number')
    .eq('is_active', true)
    .in('role', ['admin', 'manager'])
    .not('phone_number', 'is', null)
    .limit(1)
  const fallbackProfile = fallbackProfiles?.[0]

  let refreshed = 0
  let sent = 0
  for (const task of tasks ?? []) {
    const reminderMessage = `A tarefa venceu ou vence hoje. Já foi concluída? Responda à Garça Branca com “concluí ${task.title}” para preparar a atualização.`
    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .update({
        title: `Confirmar conclusão: ${task.title}`,
        message: reminderMessage,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('related_table', 'tasks')
      .eq('related_id', task.id)
      .neq('status', 'deleted')
      .select('id, sent_at')
      .maybeSingle()
    if (alertError || !alert) continue
    refreshed += 1
    if (alert.sent_at) continue

    let recipient = fallbackProfile
    if (task.assigned_to_user_id) {
      const { data } = await supabase
        .from('users_profiles')
        .select('id, phone_number')
        .eq('id', task.assigned_to_user_id)
        .eq('is_active', true)
        .maybeSingle()
      if (data?.phone_number) recipient = data
    }
    if (!recipient?.phone_number) continue

    const delivered = await sendReminderTemplate(recipient.phone_number, task.title, task.due_date)
    if (!delivered) continue
    await supabase.from('alerts').update({ sent_at: new Date().toISOString() }).eq('id', alert.id)
    sent += 1
  }

  const { data: healthAlerts, error: healthAlertError } = await supabase
    .from('alerts')
    .select('id, title, due_date, related_id, sent_at')
    .eq('related_table', 'livestock_protocols')
    .eq('status', 'pending')
    .is('sent_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .order('due_date')
    .limit(200)
  if (healthAlertError) {
    return NextResponse.json({ error: healthAlertError.message }, { status: 500 })
  }

  const protocolIds = (healthAlerts ?? []).map(alert => alert.related_id).filter((id): id is string => Boolean(id))
  const protocolDueDates = new Map<string, string>()
  if (protocolIds.length > 0) {
    const { data: healthProtocols } = await supabase
      .from('livestock_protocols')
      .select('id, next_due_date')
      .in('id', protocolIds)
      .eq('status', 'active')
    for (const protocol of healthProtocols ?? []) protocolDueDates.set(protocol.id, protocol.next_due_date)
  }

  let healthSent = 0
  if (fallbackProfile?.phone_number) {
    for (const alert of healthAlerts ?? []) {
      const dueDate = alert.related_id ? protocolDueDates.get(alert.related_id) : null
      if (!dueDate) continue
      const delivered = await sendReminderTemplate(fallbackProfile.phone_number, alert.title, dueDate)
      if (!delivered) continue
      await supabase.from('alerts').update({ sent_at: new Date().toISOString() }).eq('id', alert.id).is('sent_at', null)
      healthSent += 1
    }
  }

  return NextResponse.json({
    date: today,
    due_tasks: tasks?.length ?? 0,
    refreshed,
    whatsapp_sent: sent,
    due_livestock_protocols: healthAlerts?.length ?? 0,
    livestock_whatsapp_sent: healthSent,
    retention: {
      incoming_messages_redacted: messageRetention.data ?? 0,
      clarification_maintenance_ok: !clarificationRetention.error,
      evidence_redacted: evidenceRetention.data ?? 0,
    },
  })
}
