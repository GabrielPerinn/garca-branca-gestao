/**
 * Smoke test destrutivo-controlado do webhook do WhatsApp.
 *
 * O script envia requisições ao APP_BASE_URL e grava no Supabase configurado.
 * Execute somente contra staging ou um ambiente local descartável.
 *
 * Variáveis obrigatórias em .env.local:
 *   APP_BASE_URL=http://localhost:3000
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   WHATSAPP_VERIFY_TOKEN=...
 *   WHATSAPP_APP_SECRET=...
 *   WHATSAPP_SMOKE_TEST_PHONE=5569999999999
 *
 * WHATSAPP_SMOKE_TEST_PHONE pode ser omitida quando o primeiro número de
 * WHATSAPP_ALLOWED_PHONES for o remetente autorizado que deve executar o smoke.
 */

import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const TEST_MESSAGE_ID = `smoke_test_${Date.now()}`;
const TEST_MESSAGE_TEXT = 'Comprei 2 bezerros hoje por R$ 1.800 cada';

let baseUrl = '';
let verifyToken = '';
let appSecret = '';
let testPhone = '';
let supabase: SupabaseClient;
let passed = 0;
let failed = 0;

interface HealthResponse {
  status?: string;
  checks?: {
    configuration?: { ok?: boolean };
    database?: { ok?: boolean; latency_ms?: number };
  };
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`A variável ${name} é obrigatória para o smoke do WhatsApp.`);
  return value;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function configureSmokeTest() {
  baseUrl = requireEnvironmentVariable('APP_BASE_URL').replace(/\/+$/, '');
  verifyToken = requireEnvironmentVariable('WHATSAPP_VERIFY_TOKEN');
  appSecret = requireEnvironmentVariable('WHATSAPP_APP_SECRET');

  const configuredPhone = process.env.WHATSAPP_SMOKE_TEST_PHONE?.trim();
  const firstAllowedPhone = (process.env.WHATSAPP_ALLOWED_PHONES ?? '')
    .split(',')
    .map(normalizePhone)
    .find(Boolean);
  testPhone = normalizePhone(configuredPhone || firstAllowedPhone || '');

  if (!/^\d{8,15}$/.test(testPhone)) {
    throw new Error(
      'Defina WHATSAPP_SMOKE_TEST_PHONE ou ao menos um número válido em WHATSAPP_ALLOWED_PHONES.',
    );
  }

  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('APP_BASE_URL deve usar http ou https.');
  }

  supabase = createClient(
    requireEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function pass(label: string, detail?: string) {
  console.log(`✅ PASS: ${label}${detail ? ` — ${detail}` : ''}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function signatureFor(rawBody: string, secret = appSecret): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

async function postWebhook(payload: unknown, signingSecret = appSecret): Promise<Response> {
  const rawBody = JSON.stringify(payload);
  return fetch(`${baseUrl}/api/webhook/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signatureFor(rawBody, signingSecret),
    },
    body: rawBody,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

function messagePayload(messageId = TEST_MESSAGE_ID, text = TEST_MESSAGE_TEXT) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'smoke-business-account',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000001',
            phone_number_id: 'smoke-phone-number-id',
          },
          messages: [{
            id: messageId,
            from: testPhone,
            timestamp: Math.floor(Date.now() / 1_000).toString(),
            type: 'text',
            text: { body: text },
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

async function testHealthEndpoint() {
  console.log('\n── Health check /api/health ──');
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json() as HealthResponse;

    if (response.status === 200 && body.status === 'healthy') {
      pass('Health check respondeu healthy com HTTP 200');
    } else {
      fail('Health check não está saudável', `HTTP ${response.status}; status=${body.status ?? 'ausente'}`);
    }

    if (body.checks?.configuration?.ok === true) {
      pass('Configuração obrigatória OK no health check');
    } else {
      fail('Configuração obrigatória inválida no health check');
    }

    if (body.checks?.database?.ok === true) {
      const latency = body.checks.database.latency_ms;
      pass('Banco de dados OK no health check', latency === undefined ? undefined : `${latency} ms`);
    } else {
      fail('Banco de dados indisponível no health check');
    }
  } catch (error) {
    fail('Health check', errorMessage(error));
  }
}

async function testGetVerification() {
  console.log('\n── GET de verificação do webhook ──');
  const challenge = `challenge_${Date.now()}`;
  const url = `${baseUrl}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`;

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();

    if (response.status === 200) pass('Verificação válida retornou HTTP 200');
    else fail('Verificação válida não retornou HTTP 200', `HTTP ${response.status}`);

    if (body.trim() === challenge) pass('hub.challenge retornado sem alterações');
    else fail('hub.challenge incorreto');
  } catch (error) {
    fail('GET de verificação', errorMessage(error));
  }
}

async function testGetWithWrongToken() {
  console.log('\n── GET com token de verificação inválido ──');
  const url = `${baseUrl}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=xyz`;

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 403) pass('Token de verificação inválido retornou HTTP 403');
    else fail('Token inválido deveria retornar HTTP 403', `HTTP ${response.status}`);
  } catch (error) {
    fail('GET com token inválido', errorMessage(error));
  }
}

async function testInvalidPostSignature() {
  console.log('\n── POST com assinatura HMAC inválida ──');

  try {
    const response = await postWebhook(
      { object: 'whatsapp_business_account', entry: [] },
      `${appSecret}:invalid-smoke-secret`,
    );
    if (response.status === 401) pass('Assinatura inválida retornou HTTP 401');
    else fail('Assinatura inválida deveria retornar HTTP 401', `HTTP ${response.status}`);
  } catch (error) {
    fail('POST com assinatura inválida', errorMessage(error));
  }
}

async function testPostMessage() {
  console.log('\n── POST de mensagem de texto assinada ──');

  try {
    const response = await postWebhook(messagePayload());
    const body = await response.json() as { status?: string; error?: string };

    if (response.status === 200) pass('Mensagem assinada retornou HTTP 200');
    else fail('Mensagem assinada não retornou HTTP 200', `HTTP ${response.status}`);

    if (body.status === 'received') pass('Webhook confirmou o recebimento');
    else fail('Body inesperado no POST', body.error ?? JSON.stringify(body));
  } catch (error) {
    fail('POST de mensagem', errorMessage(error));
  }
}

async function testPostStatusUpdate() {
  console.log('\n── POST assinado de atualização de status ──');
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'smoke-business-account',
      changes: [{
        value: {
          statuses: [{ id: 'smoke-status-id', status: 'delivered', timestamp: '1234567890' }],
        },
        field: 'messages',
      }],
    }],
  };

  try {
    const response = await postWebhook(payload);
    if (response.status === 200) pass('Atualização de status assinada retornou HTTP 200');
    else fail('Atualização de status não retornou HTTP 200', `HTTP ${response.status}`);
  } catch (error) {
    fail('POST de atualização de status', errorMessage(error));
  }
}

async function waitForProcessing(timeoutMs = 15_000) {
  console.log('\n⏳ Aguardando o processamento assíncrono...');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('incoming_messages')
      .select('id, processing_status')
      .eq('external_message_id', TEST_MESSAGE_ID)
      .maybeSingle();

    if (error) {
      fail('Consulta do processamento', error.message);
      return;
    }

    if (data?.processing_status === 'processed') {
      pass('Mensagem concluída pelo processamento assíncrono');
      return;
    }
    if (data?.processing_status === 'error') {
      fail('Mensagem terminou com processing_status=error');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  fail('Processamento assíncrono excedeu o tempo limite', `${timeoutMs / 1_000}s`);
}

async function testIncomingMessageCreated() {
  console.log('\n── Registro incoming_message pelo TEST_MESSAGE_ID ──');
  try {
    const { data, error } = await supabase
      .from('incoming_messages')
      .select('id, external_message_id, provider, sender_phone, processing_status')
      .eq('external_message_id', TEST_MESSAGE_ID)
      .maybeSingle();

    if (error) {
      fail('Consulta de incoming_messages', error.message);
      return;
    }
    if (!data) {
      fail('incoming_message não encontrada', TEST_MESSAGE_ID);
      return;
    }

    pass('incoming_message localizada pelo TEST_MESSAGE_ID', data.id);

    if (data.external_message_id === TEST_MESSAGE_ID) pass('external_message_id preservado');
    else fail('external_message_id incorreto');

    if (data.provider === 'whatsapp') pass('provider=whatsapp');
    else fail('Provider incorreto', String(data.provider));

    if (data.sender_phone === testPhone) pass('sender_phone normalizado e correto');
    else fail('sender_phone incorreto');

    if (['processing', 'processed', 'error'].includes(data.processing_status)) {
      pass(`processing_status válido: ${data.processing_status}`);
    } else {
      fail('processing_status inválido', String(data.processing_status));
    }
  } catch (error) {
    fail('Validação de incoming_message', errorMessage(error));
  }
}

async function testPendingActionOrOccurrence() {
  console.log('\n── Dependente vinculado ao TEST_MESSAGE_ID ──');
  try {
    const { data: sourceMessage, error: sourceError } = await supabase
      .from('incoming_messages')
      .select('id')
      .eq('external_message_id', TEST_MESSAGE_ID)
      .maybeSingle();

    if (sourceError || !sourceMessage) {
      fail('Mensagem de origem não encontrada para localizar dependentes', sourceError?.message);
      return;
    }
    const [{ data: actions, error: actionsError }, { data: occurrences, error: occurrencesError }] = await Promise.all([
      supabase
        .from('pending_actions')
        .select('id, action_type, confirmation_status')
        .eq('source_message_id', TEST_MESSAGE_ID),
      supabase
        .from('occurrences')
        .select('id, status')
        .eq('source_message_id', sourceMessage.id),
    ]);

    if (actionsError) fail('Consulta de pending_actions', actionsError.message);
    if (occurrencesError) fail('Consulta de occurrences', occurrencesError.message);
    if (actionsError || occurrencesError) return;

    if ((actions?.length ?? 0) > 0) {
      pass('pending_action localizada pelo TEST_MESSAGE_ID', `${actions?.[0].action_type}`);
    }
    if ((occurrences?.length ?? 0) > 0) {
      pass('occurrence localizada pela incoming_message do TEST_MESSAGE_ID', `${occurrences?.[0].status}`);
    }
    if ((actions?.length ?? 0) === 0 && (occurrences?.length ?? 0) === 0) {
      fail('Nenhuma pending_action ou occurrence vinculada ao TEST_MESSAGE_ID');
    }
  } catch (error) {
    fail('Validação de dependentes', errorMessage(error));
  }
}

async function testIdempotency() {
  console.log('\n── Idempotência pelo external_message_id ──');

  try {
    const response = await postWebhook(messagePayload(TEST_MESSAGE_ID, 'Mensagem duplicada'));
    if (response.status === 200) pass('Reenvio assinado do mesmo ID retornou HTTP 200');
    else fail('Reenvio idempotente não retornou HTTP 200', `HTTP ${response.status}`);

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const { count, error } = await supabase
      .from('incoming_messages')
      .select('id', { count: 'exact', head: true })
      .eq('external_message_id', TEST_MESSAGE_ID);

    if (error) fail('Contagem de idempotência', error.message);
    else if (count === 1) pass('Existe somente um incoming_message para o TEST_MESSAGE_ID');
    else fail('Idempotência violada', `${count ?? 0} registros`);
  } catch (error) {
    fail('Teste de idempotência', errorMessage(error));
  }
}

async function archiveAndAnonymizeSmokeData() {
  console.log('\n── Finalização segura dos dados de smoke ──');
  const now = new Date().toISOString();

  try {
    const { data: sourceMessage, error: sourceError } = await supabase
      .from('incoming_messages')
      .select('id')
      .eq('external_message_id', TEST_MESSAGE_ID)
      .maybeSingle();

    if (sourceError) {
      fail('Localização da mensagem para finalização', sourceError.message);
      return;
    }
    if (!sourceMessage) {
      console.log('  ℹ️ Nenhuma incoming_message do smoke foi criada; não há dados para finalizar.');
      return;
    }
    const { data: discardedActions, error: actionsError } = await supabase
      .from('pending_actions')
      .update({
        confirmation_status: 'discarded',
        confirmed_at: now,
        updated_at: now,
      })
      .eq('source_message_id', TEST_MESSAGE_ID)
      .eq('confirmation_status', 'pending')
      .select('id');

    if (actionsError) fail('Descarte de pending_actions do smoke', actionsError.message);
    else pass('pending_actions pendentes descartadas', `${discardedActions?.length ?? 0}`);

    const { data: archivedOccurrences, error: occurrencesError } = await supabase
      .from('occurrences')
      .update({ status: 'archived', updated_at: now })
      .eq('source_message_id', sourceMessage.id)
      .neq('status', 'archived')
      .select('id');

    if (occurrencesError) fail('Arquivamento de occurrences do smoke', occurrencesError.message);
    else pass('occurrences arquivadas', `${archivedOccurrences?.length ?? 0}`);

    const { error: anonymizeError } = await supabase
      .from('incoming_messages')
      .update({
        sender_phone: null,
        sender_user_id: null,
        text_content: null,
        raw_payload_json: null,
        media_id: null,
        media_url: null,
        processing_started_at: null,
        retention_expires_at: now,
        status: 'redacted',
        redacted_at: now,
      })
      .eq('external_message_id', TEST_MESSAGE_ID);

    if (anonymizeError) fail('Anonimização da incoming_message', anonymizeError.message);
    else {
      pass('incoming_message retida e anonimizada');
      console.log('  ℹ️ O registro não sofre DELETE físico: o ID é retido para idempotência/auditoria,');
      console.log('     enquanto remetente e conteúdo operacional são removidos conforme a política.');
    }
  } catch (error) {
    fail('Finalização dos dados de smoke', errorMessage(error));
  }
}

async function main() {
  configureSmokeTest();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Smoke Test: WhatsApp Webhook');
  console.log(`  URL: ${baseUrl}`);
  console.log(`  Remetente autorizado: *${testPhone.slice(-4)}`);
  console.log(`  Message ID: ${TEST_MESSAGE_ID}`);
  console.log('═══════════════════════════════════════════════════════');

  await testHealthEndpoint();
  await testGetVerification();
  await testGetWithWrongToken();
  await testInvalidPostSignature();
  await testPostMessage();
  await testPostStatusUpdate();
  await waitForProcessing();
  await testIncomingMessageCreated();
  await testPendingActionOrOccurrence();
  await testIdempotency();
  await archiveAndAnonymizeSmokeData();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Resultado: ${passed} passaram / ${failed} falharam`);
  console.log(failed === 0
    ? '  ✅ Fluxo do webhook aprovado neste ambiente de smoke.'
    : '  ⚠️ Corrija os erros antes de ativar o WhatsApp real.');
  console.log('═══════════════════════════════════════════════════════\n');

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(`\n💥 Erro fatal no smoke test: ${errorMessage(error)}`);
  process.exitCode = 1;
});
