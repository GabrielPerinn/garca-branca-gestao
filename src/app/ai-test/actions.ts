'use server'

import { z } from 'zod'
import { processIncomingMessage } from '@/lib/ai/message-processor'
import { requirePermission } from '@/lib/supabase/server'

const messageSchema = z.string().trim().min(1, 'Digite uma mensagem.').max(4_000, 'Mensagem muito longa.')
const providerSchema = z.enum(['mock', 'openai'])

export async function processMessage(text: string, forceProvider: 'mock' | 'openai' = 'mock') {
  const { profile } = await requirePermission('operations.write')

  try {
    const validatedText = messageSchema.parse(text)
    const provider = providerSchema.parse(forceProvider)
    const reply = await processIncomingMessage(validatedText, {
      forceProvider: provider,
      senderUserId: profile.id,
    })

    return {
      reply,
      ai_data: 'A ação foi processada e enviada para a fila (ver tela de Aprovações/Ocorrências)',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar mensagem.'
    return {
      reply: `❌ Ocorreu um erro no servidor: ${message}`,
      ai_data: 'Erro Crítico',
    }
  }
}
