'use server'

import { z } from 'zod'
import { processIncomingMessage } from '@/lib/ai/message-processor'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'
import type { ConversationMessage } from '@/lib/ai/knowledge'
import { isAllowedAudioType, MAX_AUDIO_BYTES, transcribeAudio } from '@/lib/ai/transcription'
import { hasPermission } from '@/lib/auth/permissions'
import { approvePendingActionInternal, rejectPendingActionInternal } from '@/lib/ai/action-executor'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { linkEvidenceToPendingAction, storeAIMessageEvidence } from '@/lib/ai/evidence'

const messageSchema = z.string().trim().min(1, 'Digite uma mensagem.').max(4_000, 'Mensagem muito longa.')
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const historySchema = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(1_000),
})).max(8)

export async function processChatAction(formData: FormData) {
  const { profile } = await requirePermission('operations.write')

  try {
    const image = formData.get('image')
    const audio = formData.get('audio')
    const hasImage = image instanceof File && image.size > 0
    const hasAudio = audio instanceof File && audio.size > 0
    const rawMessage = typeof formData.get('message') === 'string'
      ? String(formData.get('message')).trim()
      : ''
    let base64Image: string | undefined
    let transcription: string | undefined
    let evidenceBytes: Uint8Array | undefined
    let evidenceMimeType: string | undefined
    let evidenceName: string | undefined
    let evidenceKind: 'audio' | 'image' | undefined

    if (hasImage && hasAudio) {
      throw new Error('Envie uma imagem ou um áudio por vez.')
    }

    const isApproval = /^(sim|s|ok|confirma|confirmar|pode|pode sim|tá bom|ta bom)$/i.test(rawMessage)
    const isRejection = /^(não|nao|n|cancela|cancelar|rejeita|rejeitar|descarta|descartar)$/i.test(rawMessage)
    if (!hasImage && !hasAudio && (isApproval || isRejection)) {
      if (!hasPermission(profile.role, 'actions.approve')) {
        throw new Error('Seu perfil não possui permissão para aprovar ou rejeitar ações.')
      }
      const supabase = createServiceRoleClient({ actorProfileId: profile.id })
      const { data: action, error } = await supabase
        .from('pending_actions')
        .select('id, interpreted_data_json')
        .eq('requested_by_user_id', profile.id)
        .eq('confirmation_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`Erro ao localizar a ação: ${error.message}`)
      if (action) {
        if (isApproval) {
          await approvePendingActionInternal(supabase, action.id, {
            actorProfileId: profile.id,
            reason: 'Approved from Garça Branca web conversation',
          })
        } else {
          await rejectPendingActionInternal(supabase, action.id, {
            actorProfileId: profile.id,
            reason: 'Rejected from Garça Branca web conversation',
          })
        }
        for (const path of ['/', '/pending-actions', '/finance', '/tasks', '/cattle', '/inventory']) {
          revalidatePath(path)
        }
        return {
          success: true,
          result: {
            human_summary: isApproval
              ? 'Plano confirmado e executado com sucesso. Os módulos relacionados já foram atualizados.'
              : 'Plano descartado. Nenhum dado desse plano foi cadastrado.',
            extracted_data: null,
          },
        }
      }
    }

    if (hasImage && image instanceof File) {
      if (image.size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 5 MB.')
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) throw new Error('Formato de imagem não suportado.')

      const buffer = await image.arrayBuffer()
      base64Image = `data:${image.type};base64,${Buffer.from(buffer).toString('base64')}`
      evidenceBytes = new Uint8Array(buffer)
      evidenceMimeType = image.type
      evidenceName = image.name
      evidenceKind = 'image'
    }

    if (hasAudio && audio instanceof File) {
      if (audio.size > MAX_AUDIO_BYTES) throw new Error('O áudio deve ter no máximo 25 MB.')
      if (!isAllowedAudioType(audio.type)) throw new Error('Formato de áudio não suportado.')
      transcription = await transcribeAudio(audio)
      evidenceBytes = new Uint8Array(await audio.arrayBuffer())
      evidenceMimeType = audio.type
      evidenceName = audio.name
      evidenceKind = 'audio'
    }

    const message = messageSchema.parse(
      transcription
        ? `${rawMessage ? `${rawMessage}\n\n` : ''}Transcrição do áudio: ${transcription}`
        : rawMessage || (base64Image ? 'Analise esta imagem e extraia somente os dados visíveis.' : ''),
    )
    const rawHistory = formData.get('history')
    let conversationHistory: ConversationMessage[] = []
    if (typeof rawHistory === 'string' && rawHistory) {
      conversationHistory = historySchema.parse(JSON.parse(rawHistory))
    }

    const supabase = createServiceRoleClient({ actorProfileId: profile.id })
    const requestedExternalId = typeof formData.get('external_message_id') === 'string'
      ? String(formData.get('external_message_id')).trim()
      : ''
    const externalMessageId = /^offline-media:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedExternalId)
      ? requestedExternalId
      : `web:${randomUUID()}`
    let incomingMessage: { id: string } | null = null
    if (externalMessageId.startsWith('offline-media:')) {
      const { data: existing, error: existingError } = await supabase.from('incoming_messages')
        .select('id, processing_status, processing_started_at').eq('external_message_id', externalMessageId).maybeSingle()
      if (existingError) throw new Error(`Não foi possível verificar a mídia offline: ${existingError.message}`)
      if (existing?.processing_status === 'processed') {
        return { success: true, result: { human_summary: 'Esta mídia já foi processada anteriormente. Nenhum lançamento foi duplicado.', extracted_data: null } }
      }
      const startedAt = existing?.processing_started_at ? Date.parse(existing.processing_started_at) : 0
      if (existing?.processing_status === 'processing' && Date.now() - startedAt < 5 * 60_000) {
        throw new Error('A mídia já está sendo processada. A sincronização tentará novamente em seguida.')
      }
      if (existing) {
        const { error: retryError } = await supabase.from('incoming_messages').update({
          processing_status: 'processing', processing_started_at: new Date().toISOString(), processed_at: null,
          text_content: message, sender_user_id: profile.id,
        }).eq('id', existing.id)
        if (retryError) throw new Error(`Não foi possível retomar a mídia: ${retryError.message}`)
        incomingMessage = { id: existing.id }
      }
    }
    if (!incomingMessage) {
      const { data, error: incomingError } = await supabase
        .from('incoming_messages')
        .insert({
          external_message_id: externalMessageId,
          provider: 'web',
          sender_user_id: profile.id,
          message_type: transcription ? 'audio' : base64Image ? 'image' : 'text',
          text_content: message,
          processing_status: 'processing',
          processing_started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (incomingError) throw new Error(`Não foi possível registrar a mensagem: ${incomingError.message}`)
      incomingMessage = data
    }

    try {
      if (evidenceBytes && evidenceMimeType && evidenceKind) {
        const { data: storedEvidence, error: evidenceLookupError } = await supabase.from('attachments')
          .select('id').eq('incoming_message_id', incomingMessage.id).neq('status', 'deleted').limit(1).maybeSingle()
        if (evidenceLookupError) throw new Error(`Não foi possível verificar a evidência: ${evidenceLookupError.message}`)
        if (!storedEvidence) await storeAIMessageEvidence({
          supabase,
          bytes: evidenceBytes,
          mimeType: evidenceMimeType,
          fileName: evidenceName,
          mediaKind: evidenceKind,
          incomingMessageId: incomingMessage.id,
          externalMessageId,
          uploadedBy: profile.id,
          transcription,
        })
      }

      const processed = await processIncomingMessage(message, {
        imageBase64: base64Image,
        senderUserId: profile.id,
        externalMessageId,
        incomingMessageId: incomingMessage.id,
        inputModality: transcription ? 'audio' : base64Image ? 'image' : 'text',
        returnDetails: true,
        conversationHistory,
      })
      await linkEvidenceToPendingAction(supabase, externalMessageId)
      await supabase.from('incoming_messages').update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
        processing_started_at: null,
      }).eq('id', incomingMessage.id)
      const suffix = processed.destination === 'pending_action'
        ? ' Responda “SIM” para executar, “NÃO” para descartar ou revise em Ações para revisar.'
        : ''

      return {
        success: true,
        result: {
          human_summary: `${transcription ? `Ouvi: “${transcription}”\n\n` : ''}${processed.reply}${suffix}`,
          extracted_data: null,
        },
      }
    } catch (processingError) {
      await supabase.from('incoming_messages').update({
        processing_status: 'error', processing_started_at: null,
      }).eq('id', incomingMessage.id)
      throw processingError
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar mensagem.'
    console.error('Chat Action Error:', message)
    return { success: false, error: message }
  }
}
