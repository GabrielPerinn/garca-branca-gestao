import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateHmacSignature(rawBody: string, signature: string, appSecret: string): boolean {
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  if (signature.length !== expected.length) return false;
  // Constant-time comparison to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sendWhatsAppReply(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return;

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
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
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('[WhatsApp] Falha ao enviar resposta:', err);
  }
}

// ─── GET /api/webhook/whatsapp ─────────────────────────────────────────────
// Meta envia GET para verificar o endpoint antes de salvar
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('[Webhook] WHATSAPP_VERIFY_TOKEN não configurado.');
    return NextResponse.json({ error: 'Webhook não configurado no servidor' }, { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[Webhook] ✅ Verificação da Meta bem-sucedida.');
    // A Meta exige que o body seja exatamente a string do challenge
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[Webhook] ❌ Token inválido na verificação:', { mode, token });
  return NextResponse.json({ error: 'Token inválido ou parâmetros ausentes' }, { status: 403 });
}

// ─── POST /api/webhook/whatsapp ────────────────────────────────────────────
// Meta envia POST para cada mensagem recebida no número
export async function POST(request: NextRequest) {
  // Captura body como texto para validação HMAC antes de parsear
  const rawBody = await request.text();

  // Valida assinatura HMAC-SHA256 se APP_SECRET estiver configurado
  const signature = request.headers.get('x-hub-signature-256') || '';
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    if (!validateHmacSignature(rawBody, signature, appSecret)) {
      console.error('[Webhook] ❌ Assinatura HMAC inválida — possível request falsificado.');
      // Retorna 200 mesmo assim para a Meta não re-tentar — mas não processa
      return NextResponse.json({ status: 'signature_invalid' }, { status: 200 });
    }
  }

  // Parse seguro do JSON
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: 'invalid_json' }, { status: 200 });
  }

  // ⚡ Responde 200 IMEDIATAMENTE — obrigatório pela Meta (timeout de 20s)
  // O processamento pesado roda em background após o retorno
  processWebhookAsync(body).catch(err =>
    console.error('[Webhook] Erro no processamento assíncrono:', err?.message || err)
  );

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

// ─── Processamento assíncrono ──────────────────────────────────────────────
async function processWebhookAsync(body: any): Promise<void> {
  const supabase = await createAdminClient();

  // Ignora notificações de status (delivered, read, failed) — não são mensagens
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (value?.statuses) return; // Status update — ignora

  const messages: any[] = value?.messages || [];
  if (messages.length === 0) return;

  for (const msg of messages) {
    const externalMessageId: string = msg.id;
    const senderPhone: string = msg.from;
    const timestampMs = parseInt(msg.timestamp || '0') * 1000;
    const receivedAt = new Date(timestampMs || Date.now()).toISOString();

    // Texto só — áudio e imagem não implementados ainda
    if (msg.type !== 'text') {
      console.log(`[Webhook] Tipo '${msg.type}' ignorado (não suportado ainda).`);
      continue;
    }

    const textContent: string = msg.text?.body?.trim() || '';
    if (!textContent) continue;

    // ── Idempotência: não processar a mesma mensagem duas vezes ──────────────
    const { data: existing } = await supabase
      .from('incoming_messages')
      .select('id, processing_status')
      .eq('external_message_id', externalMessageId)
      .maybeSingle();

    if (existing) {
      console.log(`[Webhook] Mensagem ${externalMessageId} já registrada (${existing.processing_status}). Pulando.`);
      continue;
    }

    // ── Salva mensagem bruta ANTES de processar ───────────────────────────────
    const { error: insertError } = await supabase.from('incoming_messages').insert({
      external_message_id: externalMessageId,
      provider: 'whatsapp',
      sender_phone: senderPhone,
      message_type: 'text',
      text_content: textContent,
      raw_payload_json: msg,
      processing_status: 'processing',
    });

    if (insertError) {
      // Se for violação de unique constraint, outra instância já está processando
      if (insertError.code === '23505') {
        console.log(`[Webhook] Concorrência detectada para ${externalMessageId}. Pulando.`);
        continue;
      }
      console.error('[Webhook] Erro ao salvar incoming_message:', insertError.message);
      continue;
    }

    // ── Verifica se é resposta SIM/NÃO a uma ação pendente ──────────────────
    const isYes = /^(sim|s|yes|y|ok|confirma|confirmar|pode|vai|pode sim|tá bom|ta bom)$/i.test(textContent.trim());
    const isNo  = /^(nao|não|n|no|cancela|cancelar|para|errado|não quero|esquece)$/i.test(textContent.trim());

    if (isYes || isNo) {
      await handleConfirmationReply(supabase, senderPhone, externalMessageId, isYes);
      return;
    }

    // ── Processa com IA ───────────────────────────────────────────────────────
    try {
      const { processIncomingMessage } = await import('@/lib/ai/message-processor');
      const aiReply = await processIncomingMessage(textContent, senderPhone);

      // Atualiza registro com resultado
      await supabase.from('incoming_messages').update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      }).eq('external_message_id', externalMessageId);

      // Envia resposta de volta pelo WhatsApp
      if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
        const replyWithHint = aiReply + '\n\n_Responda *SIM* para confirmar ou *NÃO* para cancelar._';
        await sendWhatsAppReply(senderPhone, replyWithHint);
      }

    } catch (err: any) {
      console.error(`[Webhook] Erro ao processar ${externalMessageId}:`, err.message);
      await supabase.from('incoming_messages').update({
        processing_status: 'error',
      }).eq('external_message_id', externalMessageId);

      if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
        await sendWhatsAppReply(senderPhone, '⚠️ Erro interno ao processar sua mensagem. Tente novamente em instantes.');
      }
    }
  }
}

// ─── Trata resposta SIM/NÃO do usuário ────────────────────────────────────
async function handleConfirmationReply(
  supabase: any,
  senderPhone: string,
  externalMessageId: string,
  isConfirmed: boolean
): Promise<void> {
  // Busca a ação pendente mais recente para esse telefone
  const { data: action } = await supabase
    .from('pending_actions')
    .select('id, action_type, interpreted_data_json')
    .eq('confirmation_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!action) {
    await sendWhatsAppReply(senderPhone, '❓ Nenhuma ação pendente encontrada para confirmar.');
    return;
  }

  if (isConfirmed) {
    try {
      const { approvePendingAction } = await import('@/lib/ai/actions');
      await approvePendingAction(action.id);
      await sendWhatsAppReply(senderPhone, `✅ Ação confirmada e executada com sucesso!\n\n*${action.action_type}* registrado no sistema.`);
    } catch (err: any) {
      await sendWhatsAppReply(senderPhone, `❌ Erro ao executar a ação: ${err.message}`);
    }
  } else {
    const { rejectPendingAction } = await import('@/lib/ai/actions');
    await rejectPendingAction(action.id);
    await sendWhatsAppReply(senderPhone, '🚫 Ação cancelada. Nenhum dado foi salvo.');
  }

  // Atualiza incoming_message
  await supabase.from('incoming_messages').update({
    processing_status: 'processed',
    processed_at: new Date().toISOString(),
  }).eq('external_message_id', externalMessageId);
}
