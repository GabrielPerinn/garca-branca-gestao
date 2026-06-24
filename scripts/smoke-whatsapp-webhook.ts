/**
 * Smoke Test: WhatsApp Webhook (publicado em URL pública)
 *
 * Testa o fluxo completo de ponta a ponta:
 * 1. GET de verificação do webhook (hub.challenge)
 * 2. POST de mensagem simulada (texto)
 * 3. Verifica criação de incoming_message no banco
 * 4. Verifica criação de pending_action ou occurrence
 *
 * Uso:
 *   npx tsx scripts/smoke-whatsapp-webhook.ts
 *
 * Variáveis necessárias em .env.local:
 *   APP_BASE_URL=https://seu-app.vercel.app   (ou http://localhost:3000 para local)
 *   WHATSAPP_VERIFY_TOKEN=seu_token_secreto
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   NEXT_PUBLIC_SUPABASE_URL=...
 */

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test_verify_token_123';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Unique test ID to avoid collision with real messages
const TEST_MESSAGE_ID = `smoke_test_${Date.now()}`;
const TEST_PHONE = '5500000000001';

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string) {
  console.log(`✅ PASS: ${label}${detail ? ` — ${detail}` : ''}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

async function testGetVerification() {
  console.log('\n── Teste 1: GET de verificação do webhook ──');
  const challenge = `challenge_${Date.now()}`;
  const url = `${BASE_URL}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=${challenge}`;

  try {
    const res = await fetch(url, { method: 'GET' });
    const body = await res.text();

    if (res.status === 200) {
      pass('Status 200 recebido');
    } else {
      fail(`Status esperado 200, recebido ${res.status}`, body);
    }

    if (body.trim() === challenge) {
      pass('hub.challenge retornado corretamente', `"${body.trim()}"`);
    } else {
      fail('hub.challenge incorreto', `Esperado: "${challenge}", Recebido: "${body.trim()}"`);
    }
  } catch (err: any) {
    fail('GET verification', err.message);
    console.error('  ⚠️  Certifique-se que o servidor está rodando em:', BASE_URL);
  }
}

async function testGetWithWrongToken() {
  console.log('\n── Teste 2: GET com token inválido (deve retornar 403) ──');
  const url = `${BASE_URL}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=xyz`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 403) {
      pass('Token inválido retornou 403');
    } else {
      fail(`Esperado 403 para token inválido, recebido ${res.status}`);
    }
  } catch (err: any) {
    fail('GET com token inválido', err.message);
  }
}

async function testPostMessage() {
  console.log('\n── Teste 3: POST de mensagem de texto simulada ──');

  // Payload real do formato da Meta WhatsApp Cloud API
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000001',
            phone_number_id: 'test_phone_id',
          },
          messages: [{
            id: TEST_MESSAGE_ID,
            from: TEST_PHONE,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: { body: 'Comprei 2 bezerros hoje por R$ 1.800 cada' },
          }],
        },
        field: 'messages',
      }],
    }],
  };

  try {
    const res = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 200) {
      pass('POST respondeu 200 imediatamente');
    } else {
      fail(`POST esperado 200, recebido ${res.status}`);
    }

    const body = await res.json();
    if (body.status === 'received') {
      pass('Body retornou { status: "received" }');
    } else {
      fail('Body inesperado', JSON.stringify(body));
    }
  } catch (err: any) {
    fail('POST de mensagem', err.message);
  }
}

async function testPostStatusUpdate() {
  console.log('\n── Teste 4: POST de status update (deve ser ignorado silenciosamente) ──');

  const statusPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          statuses: [{ id: 'msg_123', status: 'delivered', timestamp: '1234567890' }],
        },
        field: 'messages',
      }],
    }],
  };

  try {
    const res = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statusPayload),
    });

    if (res.status === 200) {
      pass('Status update retornou 200 (ignorado corretamente)');
    } else {
      fail(`Esperado 200, recebido ${res.status}`);
    }
  } catch (err: any) {
    fail('POST status update', err.message);
  }
}

async function waitForProcessing(ms = 3000) {
  console.log(`\n⏳ Aguardando ${ms / 1000}s para o processamento assíncrono...`);
  await new Promise(r => setTimeout(r, ms));
}

async function testIncomingMessageCreated() {
  console.log('\n── Teste 5: Verificar incoming_message no banco ──');
  try {
    const { data, error } = await supabase
      .from('incoming_messages')
      .select('*')
      .eq('external_message_id', TEST_MESSAGE_ID)
      .maybeSingle();

    if (error) {
      fail('Erro ao consultar incoming_messages', error.message);
      return;
    }

    if (!data) {
      fail('incoming_message não encontrada no banco', `external_message_id: ${TEST_MESSAGE_ID}`);
      return;
    }

    pass('incoming_message criada', `id: ${data.id}`);

    if (data.external_message_id === TEST_MESSAGE_ID) {
      pass('external_message_id correto (idempotência garantida)');
    } else {
      fail('external_message_id incorreto', data.external_message_id);
    }

    if (data.provider === 'whatsapp') {
      pass('Provider = whatsapp');
    } else {
      fail('Provider incorreto', data.provider);
    }

    if (data.sender_phone === TEST_PHONE) {
      pass('sender_phone correto');
    } else {
      fail('sender_phone incorreto', data.sender_phone);
    }

    if (['processing', 'processed', 'error'].includes(data.processing_status)) {
      pass(`processing_status válido: ${data.processing_status}`);
    } else {
      fail('processing_status inválido', data.processing_status);
    }

  } catch (err: any) {
    fail('testIncomingMessageCreated', err.message);
  }
}

async function testPendingActionOrOccurrence() {
  console.log('\n── Teste 6: Verificar pending_action ou occurrence criado ──');
  try {
    // Procura pending_action criada nos últimos 30 segundos
    const cutoff = new Date(Date.now() - 30000).toISOString();

    const { data: actions } = await supabase
      .from('pending_actions')
      .select('id, action_type, confirmation_status, created_at')
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: occurrences } = await supabase
      .from('occurrences')
      .select('id, status, created_at')
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    if ((actions && actions.length > 0) || (occurrences && occurrences.length > 0)) {
      if (actions && actions.length > 0) {
        pass(`pending_action criada`, `id: ${actions[0].id}, type: ${actions[0].action_type}`);
      }
      if (occurrences && occurrences.length > 0) {
        pass(`occurrence criada`, `id: ${occurrences[0].id}`);
      }
    } else {
      fail('Nenhum pending_action ou occurrence encontrado após processamento');
      console.error('  ⚠️  O processamento assíncrono pode não ter concluído. Tente aumentar o delay.');
    }
  } catch (err: any) {
    fail('testPendingActionOrOccurrence', err.message);
  }
}

async function testIdempotency() {
  console.log('\n── Teste 7: Idempotência (enviar mesma mensagem duas vezes) ──');

  const dupPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          messages: [{
            id: TEST_MESSAGE_ID, // mesmo ID!
            from: TEST_PHONE,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: { body: 'Mensagem duplicada' },
          }],
        },
        field: 'messages',
      }],
    }],
  };

  try {
    const res = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dupPayload),
    });

    if (res.status === 200) {
      pass('Segunda chamada com mesmo ID retornou 200');
    }

    await new Promise(r => setTimeout(r, 1500));

    // Verifica que não criou duplicata
    const { data, count } = await supabase
      .from('incoming_messages')
      .select('*', { count: 'exact' })
      .eq('external_message_id', TEST_MESSAGE_ID);

    if (count === 1) {
      pass('Idempotência: apenas 1 registro criado para o mesmo external_message_id');
    } else {
      fail(`Duplicata detectada: ${count} registros para o mesmo ID`);
    }
  } catch (err: any) {
    fail('testIdempotency', err.message);
  }
}

async function testHealthEndpoint() {
  console.log('\n── Teste 8: Health check /api/health ──');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const body = await res.json();

    if ([200, 207].includes(res.status)) {
      pass(`Health check respondeu ${res.status}`);
    } else {
      fail(`Health check retornou ${res.status}`);
    }

    if (body.checks?.database?.ok) {
      pass('Banco de dados OK no health check');
    } else {
      fail('Banco de dados com problema no health check', body.checks?.database?.message);
    }

    if (body.checks?.env?.ok) {
      pass('Variáveis de ambiente OK no health check');
    } else {
      fail('Variáveis de ambiente com problema', body.checks?.env?.message);
    }

    console.log('\n  📋 Status completo:');
    Object.entries(body.checks).forEach(([k, v]: any) => {
      console.log(`     ${v.ok ? '✓' : '✗'} ${k}: ${v.message}`);
    });
  } catch (err: any) {
    fail('Health check', err.message);
  }
}

async function cleanup() {
  console.log('\n── Limpeza: removendo dados de teste ──');
  await supabase.from('incoming_messages').delete().eq('external_message_id', TEST_MESSAGE_ID);
  console.log('  🗑️  incoming_message de teste removida.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Smoke Test: WhatsApp Webhook');
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  Verify Token: ${VERIFY_TOKEN.substring(0, 8)}...`);
  console.log('═══════════════════════════════════════════════════════');

  await testHealthEndpoint();
  await testGetVerification();
  await testGetWithWrongToken();
  await testPostMessage();
  await testPostStatusUpdate();
  await waitForProcessing(4000);
  await testIncomingMessageCreated();
  await testPendingActionOrOccurrence();
  await testIdempotency();
  await cleanup();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Resultado: ${passed} passaram / ${failed} falharam`);
  if (failed === 0) {
    console.log('  ✅ WEBHOOK PRONTO PARA PRODUÇÃO');
  } else {
    console.log('  ⚠️  Corrija os erros antes de ativar o WhatsApp real.');
  }
  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 Erro fatal no smoke test:', err);
  process.exit(1);
});
