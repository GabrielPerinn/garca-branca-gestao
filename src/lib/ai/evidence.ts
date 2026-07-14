import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const EVIDENCE_BUCKET = 'ai-evidence'
const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1_000

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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
}

export async function storeAIMessageEvidence(input: {
  supabase: SupabaseClient
  bytes: Uint8Array
  mimeType: string
  fileName?: string | null
  mediaKind: 'audio' | 'image' | 'document'
  incomingMessageId: string
  externalMessageId: string
  uploadedBy?: string | null
  providerMediaId?: string | null
  transcription?: string | null
}) {
  const mimeType = input.mimeType.toLowerCase().split(';')[0].trim()
  const extension = extensionByMime[mimeType] || 'bin'
  const date = new Date()
  const storagePath = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    `${randomUUID()}.${extension}`,
  ].join('/')
  const checksum = createHash('sha256').update(input.bytes).digest('hex')

  const { error: uploadError } = await input.supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: mimeType,
      cacheControl: '0',
      upsert: false,
    })
  if (uploadError) throw new Error(`Falha ao guardar a evidência: ${uploadError.message}`)

  const { data: attachment, error: attachmentError } = await input.supabase
    .from('attachments')
    .insert({
      file_name: input.fileName?.slice(0, 255) || `evidencia-${input.mediaKind}.${extension}`,
      file_type: mimeType,
      file_url: `private://${EVIDENCE_BUCKET}/${storagePath}`,
      storage_path: storagePath,
      uploaded_by: input.uploadedBy || null,
      source_message_id: input.externalMessageId,
      incoming_message_id: input.incomingMessageId,
      provider_media_id: input.providerMediaId || null,
      media_kind: input.mediaKind,
      mime_type: mimeType,
      file_size_bytes: input.bytes.byteLength,
      checksum_sha256: checksum,
      transcription: input.transcription?.slice(0, 10_000) || null,
      retention_expires_at: new Date(Date.now() + TWO_YEARS_MS).toISOString(),
      status: 'active',
    })
    .select('id')
    .single()

  if (attachmentError) {
    await input.supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath])
    throw new Error(`Falha ao indexar a evidência: ${attachmentError.message}`)
  }
  return attachment
}

export async function linkEvidenceToPendingAction(
  supabase: SupabaseClient,
  externalMessageId: string,
  pendingActionId?: string,
) {
  let resolvedPendingActionId = pendingActionId
  if (!resolvedPendingActionId) {
    const { data: pendingAction, error } = await supabase
      .from('pending_actions')
      .select('id')
      .eq('source_message_id', externalMessageId)
      .maybeSingle()
    if (error) throw new Error(`Falha ao vincular evidência: ${error.message}`)
    if (!pendingAction) return null
    resolvedPendingActionId = pendingAction.id
  }

  const { error: updateError } = await supabase
    .from('attachments')
    .update({
      pending_action_id: resolvedPendingActionId,
      related_table: 'pending_actions',
      related_id: resolvedPendingActionId,
    })
    .eq('source_message_id', externalMessageId)
    .neq('status', 'deleted')
  if (updateError) throw new Error(`Falha ao relacionar a evidência: ${updateError.message}`)
  return resolvedPendingActionId
}
