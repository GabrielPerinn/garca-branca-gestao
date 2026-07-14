import 'server-only'

import OpenAI from 'openai'
import { recordAIUsageEvent } from '@/lib/ai/telemetry'

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'video/mp4',
])

export function isAllowedAudioType(contentType: string) {
  return ALLOWED_AUDIO_TYPES.has(contentType.toLowerCase().split(';')[0].trim())
}

export async function transcribeAudio(audio: File) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.')
  if (audio.size < 1) throw new Error('O áudio está vazio.')
  if (audio.size > MAX_AUDIO_BYTES) throw new Error('O áudio deve ter no máximo 25 MB.')
  if (!isAllowedAudioType(audio.type)) throw new Error('Formato de áudio não suportado.')

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 2,
    timeout: 60_000,
  })
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe'
  const startedAt = Date.now()
  const result = await openai.audio.transcriptions.create({
    file: audio,
    model,
    language: 'pt',
    response_format: 'json',
    prompt: 'Conversa natural de gestão de uma fazenda de pecuária brasileira. Preserve números, valores, datas e nomes próprios com muito cuidado. Vocabulário possível: Garça Branca, gado, cabeça, boi, vaca, bezerro, novilha, matriz, recria, engorda, lote, pasto, piquete, invernada, curral, arroba, quilo, pesagem, frigorífico, sal mineral, ração, suplemento, vacina, vermífugo, cerca, mourão, arame, compra, venda, despesa, pagamento, funcionário, fornecedor e manutenção.',
  })
  const text = result.text.trim()
  if (!text) throw new Error('Não foi possível identificar fala no áudio.')
  await recordAIUsageEvent({ operation: 'audio_transcription', modelName: model, status: 'success', startedAt, metadata: { bytes: audio.size } })
  return text
}
