'use server'

import { processIncomingMessage } from "@/lib/ai/message-processor";

export async function processMessage(text: string, forceProvider: 'mock' | 'openai' = 'mock') {
  try {
    const reply = await processIncomingMessage(text, '5511999999999', undefined, forceProvider);
    
    return {
      reply,
      ai_data: 'A ação foi processada e enviada para a fila (ver tela de Aprovações/Ocorrências)'
    }
  } catch (error: any) {
    if (error.message?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return {
        reply: '⚠️ Erro de Segurança (RLS): A chave SUPABASE_SERVICE_ROLE_KEY não está configurada no seu arquivo .env.local. O banco de dados bloqueou a inserção dessa mensagem. Por favor, adicione a chave para que a IA consiga salvar as ocorrências.',
        ai_data: 'Acesso Negado'
      }
    }
    
    return {
      reply: '❌ Ocorreu um erro no servidor: ' + error.message,
      ai_data: 'Erro Crítico'
    }
  }
}
