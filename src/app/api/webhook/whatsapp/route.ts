import { createHmac, timingSafeEqual } from 'node:crypto'
import { after, NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth/permissions'
import {
  approvePendingActionInternal,
  rejectPendingActionInternal,
} from '@/lib/ai/action-executor'
import { normalizePhone, phoneIdentityVariants, phonesAreEquivalent } from '@/lib/phone'
import { isAllowedAudioType, MAX_AUDIO_BYTES, transcribeAudio } from '@/lib/ai/transcription'
import { linkEvidenceToPendingAction, storeAIMessageEvidence } from '@/lib/ai/evidence'
import {
  classifyConversationReply,
  conversationMessages,
  formatAudioUnderstanding,
  formatExecutionReceipt,
  formatPendingReview,
} from '@/lib/ai/conversation-language'

const MAX_WEBHOOK_BYTES = 1_000_000

interface WhatsAppMessage {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  audio?: { id?: string; mime_type?: string; voice?: boolean }
  image?: { id?: string; mime_type?: string; caption?: string }
  [key: string]: unknown
}

const MAX_WHATSAPP_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_WHATSAPP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function mediaExtension(contentType: string) {
  const extensions: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  return extensions[contentType] ?? 'bin'
}

async function downloadWhatsAppMedia(mediaId: string, maximumBytes: number) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0'
  if (!accessToken) throw new Error('Token do WhatsApp não configurado.')
  if (!/^[A-Za-z0-9_-]+$/.test(mediaId)) throw new Error('Identificador de mídia inválido.')

  const metadataResponse = await fetch(`https://graph.facebook.com/${graphApiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!metadataResponse.ok) throw new Error(`Falha ao localizar mídia do WhatsApp (${metadataResponse.status}).`)
  const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number }
  if (!metadata.url) throw new Error('O WhatsApp não retornou a URL da mídia.')
  if (Number(metadata.file_size ?? 0) > maximumBytes) throw new Error('A mídia excede o tamanho permitido.')

  const mediaUrl = new URL(metadata.url)
  const trustedHost = ['facebook.com', 'fbcdn.net', 'fbsbx.com']
    .some(domain => mediaUrl.hostname === domain || mediaUrl.hostname.endsWith(`.${domain}`))
  if (mediaUrl.protocol !== 'https:' || !trustedHost) throw new Error('URL de mídia não confiável.')

  const mediaResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!mediaResponse.ok) throw new Error(`Falha ao baixar mídia do WhatsApp (${mediaResponse.status}).`)
  const declaredLength = Number(mediaResponse.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error('A mídia excede o tamanho permitido.')
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer())
  if (bytes.byteLength > maximumBytes) throw new Error('A mídia excede o tamanho permitido.')
  const contentType = (mediaResponse.headers.get('content-type') || metadata.mime_type || '')
    .toLowerCase().split(';')[0].trim()
  return { bytes, contentType, mediaUrl: mediaUrl.toString() }
}

interface WebhookBody {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[]
        statuses?: unknown[]
      }
    }>
  }>
}

function getAllowedPhones() {
  return new Set(
    (process.env.WHATSAPP_ALLOWED_PHONES ?? '')
      .split(',')
      .flatMap(phone => [...phoneIdentityVariants(phone)])
  )
}

function validateHmacSignature(rawBody: string, signature: string, appSecret: string) {
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`)
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

async function sendWhatsAppReply(to: string, text: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0'
  if (!phoneNumberId || !accessToken) return
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    console.error('[WhatsApp] WHATSAPP_GRAPH_API_VERSION inválida.')
    return
  }

  const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text.substring(0, 4096) },
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    console.error('[WhatsApp] Falha ao enviar resposta:', response.status)
  }
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (!verifyToken) {
    return NextResponse.json({ error: 'Webhook indisponível' }, { status: 503 })
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json({ error: 'Verificação inválida' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Content-Type inválido' }, { status: 415 })
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 })
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret && process.env.NODE_ENV === 'production') {
    console.error('[Webhook] WHATSAPP_APP_SECRET ausente em produção.')
    return NextResponse.json({ error: 'Webhook indisponível' }, { status: 503 })
  }

  if (appSecret) {
    const signature = request.headers.get('x-hub-signature-256') ?? ''
    if (!validateHmacSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }
  }

  let body: WebhookBody
  try {
    body = JSON.parse(rawBody) as WebhookBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  after(async () => {
    try {
      await processWebhookAsync(body)
    } catch (error) {
      console.error('[Webhook] Falha no processamento:', error instanceof Error ? error.message : error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function authorizeSender(
  supabase: ReturnType<typeof createServiceRoleClient>,
  senderPhone: string
) {
  const normalizedPhone = normalizePhone(senderPhone)
  if (!/^\d{8,15}$/.test(normalizedPhone)) return null
  const allowedPhones = getAllowedPhones()
  const allowlisted = [...phoneIdentityVariants(normalizedPhone)]
    .some(candidate => allowedPhones.has(candidate))
  const { data: profiles, error } = await supabase
    .from('users_profiles')
    .select('id, phone_number, role')
    .eq('is_active', true)
    .limit(1_000)

  if (error) throw new Error(`Falha ao autorizar remetente: ${error.message}`)
  const profile = profiles?.find((item) => {
    return phonesAreEquivalent(item.phone_number ?? '', normalizedPhone)
  })

  if (!allowlisted && !profile) return null
  if (profile && !hasPermission(profile.role, 'operations.write')) return null
  return {
    phone: normalizedPhone,
    profileId: profile?.id ?? null,
    role: profile?.role ?? 'allowlist',
    canApprove: profile ? hasPermission(profile.role, 'actions.approve') : allowlisted,
  }
}

function collectMessages(body: WebhookBody) {
  const messages: WhatsAppMessage[] = []
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) messages.push(message)
    }
  }
  return messages
}

async function processWebhookAsync(body: WebhookBody) {
  const supabase = createServiceRoleClient()
  const currentMessageIds = new Set(
    collectMessages(body)
      .map(message => typeof message.id === 'string' ? message.id.trim() : '')
      .filter(Boolean)
  )

  const recoverableMessages = await loadRecoverableMessages(supabase, currentMessageIds)
  for (const message of recoverableMessages) {
    try {
      await processMessage(supabase, message)
    } catch (error) {
      console.error('[Webhook] Falha ao recuperar mensagem:', error instanceof Error ? error.message : error)
    }
  }

  for (const message of collectMessages(body)) {
    try {
      await processMessage(supabase, message)
    } catch (error) {
      console.error('[Webhook] Mensagem não processada:', error instanceof Error ? error.message : error)
    }
  }
}

async function loadRecoverableMessages(
  supabase: ReturnType<typeof createServiceRoleClient>,
  excludedIds: Set<string>
) {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1_000).toISOString()
  const [errorsResult, staleResult] = await Promise.all([
    supabase
      .from('incoming_messages')
      .select('external_message_id, raw_payload_json')
      .eq('processing_status', 'error')
      .not('raw_payload_json', 'is', null)
      .order('created_at', { ascending: true })
      .limit(5),
    supabase
      .from('incoming_messages')
      .select('external_message_id, raw_payload_json')
      .eq('processing_status', 'processing')
      .lt('processing_started_at', staleBefore)
      .not('raw_payload_json', 'is', null)
      .order('processing_started_at', { ascending: true })
      .limit(5),
  ])

  if (errorsResult.error || staleResult.error) {
    console.error('[Webhook] Não foi possível consultar mensagens recuperáveis.')
    return []
  }

  const seen = new Set<string>()
  const messages: WhatsAppMessage[] = []
  for (const row of [...(errorsResult.data ?? []), ...(staleResult.data ?? [])]) {
    const externalId = row.external_message_id
    const raw = row.raw_payload_json
    if (
      typeof externalId !== 'string'
      || excludedIds.has(externalId)
      || seen.has(externalId)
      || !raw
      || typeof raw !== 'object'
      || Array.isArray(raw)
    ) continue
    seen.add(externalId)
    messages.push(raw as WhatsAppMessage)
  }
  return messages
}

async function reclaimIncomingMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  externalMessageId: string
) {
  const leaseStartedAt = new Date().toISOString()
  const update = {
    processing_status: 'processing',
    processing_started_at: leaseStartedAt,
    processed_at: null,
  }

  const { data: failedClaim, error: failedClaimError } = await supabase
    .from('incoming_messages')
    .update(update)
    .eq('external_message_id', externalMessageId)
    .eq('processing_status', 'error')
    .select('id')
    .maybeSingle()

  if (failedClaimError) throw new Error(`Falha ao recuperar mensagem: ${failedClaimError.message}`)
  if (failedClaim) return failedClaim

  const staleBefore = new Date(Date.now() - 5 * 60 * 1_000).toISOString()
  const { data: staleClaim, error: staleClaimError } = await supabase
    .from('incoming_messages')
    .update(update)
    .eq('external_message_id', externalMessageId)
    .eq('processing_status', 'processing')
    .lt('processing_started_at', staleBefore)
    .select('id')
    .maybeSingle()

  if (staleClaimError) throw new Error(`Falha ao recuperar lease: ${staleClaimError.message}`)
  return staleClaim
}

async function hasMaterializedResult(
  supabase: ReturnType<typeof createServiceRoleClient>,
  externalMessageId: string,
  incomingMessageId: string
) {
  const [actionResult, occurrenceResult, clarificationResult, clarificationFollowupResult, revisionResult] = await Promise.all([
    supabase
      .from('pending_actions')
      .select('id')
      .eq('source_message_id', externalMessageId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('occurrences')
      .select('id')
      .eq('source_message_id', incomingMessageId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ai_clarifications')
      .select('id')
      .eq('source_message_id', externalMessageId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ai_clarifications')
      .select('id')
      .eq('last_message_id', externalMessageId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('audit_logs')
      .select('id')
      .eq('source_message_id', externalMessageId)
      .eq('action', 'revise_pending_action_whatsapp')
      .limit(1)
      .maybeSingle(),
  ])

  if (actionResult.error || occurrenceResult.error || clarificationResult.error || clarificationFollowupResult.error || revisionResult.error) {
    throw new Error('Falha ao verificar o resultado idempotente da mensagem.')
  }
  return Boolean(
    actionResult.data
    || occurrenceResult.data
    || clarificationResult.data
    || clarificationFollowupResult.data
    || revisionResult.data
  )
}

async function processMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  message: WhatsAppMessage
) {
  const externalMessageId = typeof message.id === 'string' ? message.id.trim() : ''
  const rawSenderPhone = typeof message.from === 'string' ? message.from : ''
  const sender = await authorizeSender(supabase, rawSenderPhone)

  if (!externalMessageId || !sender) {
    const suffix = normalizePhone(rawSenderPhone).slice(-4)
    console.warn(`[Webhook] Mensagem ignorada de remetente não autorizado (*${suffix || 'sem número'}).`)
    return
  }

  if (!['text', 'audio', 'image'].includes(message.type ?? '')) {
    await sendWhatsAppReply(sender.phone, conversationMessages.unsupportedMedia)
    return
  }

  const { data: existingEnvelope, error: existingEnvelopeError } = await supabase
    .from('incoming_messages')
    .select('processing_status, processing_started_at')
    .eq('external_message_id', externalMessageId)
    .maybeSingle()
  if (existingEnvelopeError) throw new Error(`Falha ao verificar idempotência: ${existingEnvelopeError.message}`)
  if (existingEnvelope?.processing_status === 'processed') return
  if (
    existingEnvelope?.processing_status === 'processing'
    && existingEnvelope.processing_started_at
    && new Date(existingEnvelope.processing_started_at).getTime() > Date.now() - 5 * 60 * 1_000
  ) return

  let textContent = message.text?.body?.trim() ?? ''
  let imageBase64: string | undefined
  let transcription: string | undefined
  let mediaId: string | null = null
  let mediaUrl: string | null = null
  let mediaBytes: Uint8Array | undefined
  let mediaContentType: string | undefined
  let mediaFileName: string | undefined

  try {
    if (message.type === 'audio') {
      mediaId = message.audio?.id?.trim() || null
      if (!mediaId) throw new Error('Áudio recebido sem identificador.')
      const media = await downloadWhatsAppMedia(mediaId, MAX_AUDIO_BYTES)
      if (!isAllowedAudioType(media.contentType)) throw new Error('Formato de áudio do WhatsApp não suportado.')
      mediaUrl = media.mediaUrl
      mediaBytes = media.bytes
      mediaContentType = media.contentType
      mediaFileName = `whatsapp-${externalMessageId}.${mediaExtension(media.contentType)}`
      const audio = new File(
        [media.bytes],
        mediaFileName,
        { type: media.contentType },
      )
      transcription = await transcribeAudio(audio)
      textContent = `Transcrição do áudio: ${transcription}`
    }
    if (message.type === 'image') {
      mediaId = message.image?.id?.trim() || null
      if (!mediaId) throw new Error('Imagem recebida sem identificador.')
      const media = await downloadWhatsAppMedia(mediaId, MAX_WHATSAPP_IMAGE_BYTES)
      if (!ALLOWED_WHATSAPP_IMAGE_TYPES.has(media.contentType)) throw new Error('Formato de imagem do WhatsApp não suportado.')
      mediaUrl = media.mediaUrl
      mediaBytes = media.bytes
      mediaContentType = media.contentType
      mediaFileName = `whatsapp-${externalMessageId}.${mediaExtension(media.contentType)}`
      imageBase64 = `data:${media.contentType};base64,${Buffer.from(media.bytes).toString('base64')}`
      const caption = message.image?.caption?.trim()
      textContent = caption || 'Analise esta imagem e extraia somente os dados visíveis.'
    }
  } catch (error) {
    console.error('[WhatsApp] Falha ao preparar mídia:', error instanceof Error ? error.message : error)
    await sendWhatsAppReply(sender.phone, `⚠️ ${error instanceof Error ? error.message : 'Não foi possível processar a mídia.'}`)
    return
  }

  if (!textContent || textContent.length > 4_000) return

  const leaseStartedAt = new Date().toISOString()
  const { data: insertedMessage, error: insertError } = await supabase
    .from('incoming_messages')
    .insert({
      external_message_id: externalMessageId,
      provider: 'whatsapp',
      sender_phone: sender.phone,
      sender_user_id: sender.profileId,
      message_type: message.type,
      text_content: textContent,
      media_id: mediaId,
      media_url: mediaUrl,
      raw_payload_json: message,
      processing_status: 'processing',
      processing_started_at: leaseStartedAt,
    })
    .select('id')
    .single()

  let incomingMessage = insertedMessage
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('[Webhook] Falha ao registrar mensagem:', insertError.message)
      return
    }
    incomingMessage = await reclaimIncomingMessage(supabase, externalMessageId)
    if (!incomingMessage) return

    if (await hasMaterializedResult(supabase, externalMessageId, incomingMessage.id)) {
      await supabase.from('incoming_messages').update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
        processing_started_at: null,
      }).eq('id', incomingMessage.id)
      await sendWhatsAppReply(sender.phone, conversationMessages.duplicateProcessed)
      return
    }
  }

  if (!incomingMessage) {
    throw new Error('Mensagem recebida sem identificador interno.')
  }

  if (mediaBytes && mediaContentType && mediaId) {
    const { data: existingEvidence, error: evidenceLookupError } = await supabase
      .from('attachments')
      .select('id')
      .eq('provider_media_id', mediaId)
      .neq('status', 'deleted')
      .maybeSingle()
    if (evidenceLookupError) throw new Error(`Falha ao verificar evidência: ${evidenceLookupError.message}`)
    if (!existingEvidence) {
      await storeAIMessageEvidence({
        supabase,
        bytes: mediaBytes,
        mimeType: mediaContentType,
        fileName: mediaFileName,
        mediaKind: message.type === 'audio' ? 'audio' : 'image',
        incomingMessageId: incomingMessage.id,
        externalMessageId,
        uploadedBy: sender.profileId,
        providerMediaId: mediaId,
        transcription,
      })
    }
  }

  const conversationalText = transcription || textContent
  const replyIntent = classifyConversationReply(conversationalText)
  const isYes = replyIntent === 'confirm'
  const isNo = replyIntent === 'cancel'

  try {
    if (isYes || isNo) {
      if (!sender.canApprove) {
        await sendWhatsAppReply(sender.phone, conversationMessages.permissionDenied)
        await supabase.from('incoming_messages').update({
          processing_status: 'processed',
          processed_at: new Date().toISOString(),
          processing_started_at: null,
        }).eq('id', incomingMessage.id)
        return
      }
      await handleConfirmationReply(supabase, sender.phone, sender.profileId, externalMessageId, isYes)
    } else {
      const { processIncomingMessage, revisePendingActionFromMessage } = await import('@/lib/ai/message-processor')
      const messageContext = {
        senderPhone: sender.phone,
        senderUserId: sender.profileId,
        externalMessageId,
        incomingMessageId: incomingMessage.id,
        imageBase64,
        inputModality: message.type === 'audio' ? 'audio' : message.type === 'image' ? 'image' : 'text',
        returnDetails: true,
      } as const
      const revision = replyIntent === 'correction'
        ? await revisePendingActionFromMessage(textContent, messageContext)
        : null
      // Se ainda não existe um cadastro pronto para confirmação, a frase pode
      // estar respondendo à pergunta de complemento feita no turno anterior.
      const aiReply = revision ?? await processIncomingMessage(textContent, messageContext)

      let pendingQuery = supabase
        .from('pending_actions')
        .select('id, action_type, interpreted_data_json')
        .eq('confirmation_status', 'pending')
      pendingQuery = aiReply.pendingActionId
        ? pendingQuery.eq('id', aiReply.pendingActionId)
        : pendingQuery.eq('source_message_id', externalMessageId)
      const { data: pendingAction } = await pendingQuery.maybeSingle()
      const heard = transcription ? `${formatAudioUnderstanding(transcription)}\n\n` : ''
      const pendingPayload = pendingAction?.interpreted_data_json
        && typeof pendingAction.interpreted_data_json === 'object'
        && !Array.isArray(pendingAction.interpreted_data_json)
        ? pendingAction.interpreted_data_json as Record<string, unknown>
        : null
      const reply = pendingAction && pendingPayload
        ? `${heard}${formatPendingReview(pendingAction.action_type, pendingPayload)}`
        : `${heard}${aiReply.reply}`
      await sendWhatsAppReply(sender.phone, reply)

      if (aiReply.pendingActionId) {
        await linkEvidenceToPendingAction(supabase, externalMessageId, aiReply.pendingActionId)
      }
    }

    await linkEvidenceToPendingAction(supabase, externalMessageId)

    await supabase.from('incoming_messages').update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      processing_started_at: null,
    }).eq('external_message_id', externalMessageId)
  } catch (error) {
    console.error(`[Webhook] Erro em ${externalMessageId}:`, error instanceof Error ? error.message : error)
    await supabase.from('incoming_messages').update({
      processing_status: 'error',
      processed_at: null,
      processing_started_at: null,
    }).eq('external_message_id', externalMessageId)
    await sendWhatsAppReply(sender.phone, conversationMessages.processingError)
  }
}

async function handleConfirmationReply(
  supabase: ReturnType<typeof createServiceRoleClient>,
  senderPhone: string,
  actorProfileId: string | null,
  confirmationMessageId: string,
  isConfirmed: boolean
) {
  const { data: ownedAction, error: ownedActionError } = await supabase
    .from('pending_actions')
    .select('id, action_type, source_message_id, interpreted_data_json')
    .eq('requested_by_phone', senderPhone)
    .eq('confirmation_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ownedActionError) throw new Error(`Falha ao localizar ação: ${ownedActionError.message}`)

  let action = ownedAction
  if (!action) {
  const { data: sourceMessages, error: sourceError } = await supabase
    .from('incoming_messages')
    .select('external_message_id')
    .eq('sender_phone', senderPhone)
    .neq('external_message_id', confirmationMessageId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (sourceError) throw new Error(`Falha ao localizar conversa: ${sourceError.message}`)
  const sourceIds = sourceMessages?.map(item => item.external_message_id).filter(Boolean) ?? []
  if (sourceIds.length === 0) {
    if (!isConfirmed) {
      const cancelled = await cancelLatestClarification(supabase, senderPhone, confirmationMessageId)
      if (cancelled) {
        await sendWhatsAppReply(senderPhone, conversationMessages.clarificationCancelled)
        return
      }
    }
    await sendWhatsAppReply(senderPhone, conversationMessages.noPending)
    return
  }

  const { data: legacyAction, error: actionError } = await supabase
    .from('pending_actions')
    .select('id, action_type, source_message_id, interpreted_data_json')
    .eq('confirmation_status', 'pending')
    .in('source_message_id', sourceIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (actionError) throw new Error(`Falha ao localizar ação: ${actionError.message}`)
  action = legacyAction
  }
  if (!action) {
    if (!isConfirmed) {
      const cancelled = await cancelLatestClarification(supabase, senderPhone, confirmationMessageId)
      if (cancelled) {
        await sendWhatsAppReply(senderPhone, conversationMessages.clarificationCancelled)
        return
      }
    }
    await sendWhatsAppReply(senderPhone, conversationMessages.noPending)
    return
  }

  const context = {
    actorProfileId,
    expectedSourceMessageId: action.source_message_id,
    reason: `WhatsApp confirmation from ${senderPhone}`,
  }

  if (isConfirmed) {
    await approvePendingActionInternal(supabase, action.id, context)
    const payload = action.interpreted_data_json && typeof action.interpreted_data_json === 'object'
      ? action.interpreted_data_json as Record<string, unknown>
      : {}
    await sendWhatsAppReply(
      senderPhone,
      formatExecutionReceipt(action.action_type, payload),
    )
  } else {
    await rejectPendingActionInternal(supabase, action.id, context)
    await sendWhatsAppReply(senderPhone, conversationMessages.actionCancelled)
  }
}

async function cancelLatestClarification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  senderPhone: string,
  confirmationMessageId: string,
) {
  const { data: clarification, error } = await supabase
    .from('ai_clarifications')
    .select('id')
    .eq('sender_phone', senderPhone)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Falha ao localizar plano incompleto: ${error.message}`)
  if (!clarification) return false
  const { error: updateError } = await supabase
    .from('ai_clarifications')
    .update({ status: 'cancelled', last_message_id: confirmationMessageId })
    .eq('id', clarification.id)
    .eq('status', 'open')
  if (updateError) throw new Error(`Falha ao cancelar plano incompleto: ${updateError.message}`)
  return true
}
