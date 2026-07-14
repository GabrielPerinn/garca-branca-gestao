import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyConversationReply,
  formatAudioUnderstanding,
  formatClarificationReply,
  formatExecutionReceipt,
  formatPendingReview,
} from '../src/lib/ai/conversation-language'
import type { AIResponse } from '../src/lib/validation/ai-schema'

test('entende confirmações naturais sem exigir uma palavra exata', () => {
  for (const message of [
    'sim',
    'isso mesmo',
    'Tá certo',
    'pode lançar',
    'pode salvar por favor',
    'manda ver',
  ]) {
    assert.equal(classifyConversationReply(message), 'confirm', message)
  }
})

test('separa cancelamento de correção falada naturalmente', () => {
  for (const message of [
    'deixa pra lá',
    'não salva',
    'cancela isso aí',
    'esquece o que eu mandei',
    'não precisa mais',
    'deixa quieto',
    'não faz isso',
    'apaga esse lançamento',
    'não coloca essa informação',
  ]) {
    assert.equal(classifyConversationReply(message), 'cancel', message)
  }
  assert.equal(classifyConversationReply('não, era 58 mil'), 'correction')
  assert.equal(classifyConversationReply('falei errado, foram 12 bois'), 'correction')
  assert.equal(classifyConversationReply('na verdade foi ontem'), 'correction')
  assert.equal(classifyConversationReply('o valor é 58 mil'), 'correction')
  assert.equal(classifyConversationReply('você entendeu errado'), 'correction')
})

test('não confunde uma nova informação comum com confirmação ou correção', () => {
  assert.equal(classifyConversationReply('paguei o sal hoje'), 'none')
  assert.equal(classifyConversationReply('comprei mais 10 bois'), 'none')
  assert.equal(classifyConversationReply('a cerca do fundo caiu'), 'none')
  assert.equal(classifyConversationReply('cancela a tarefa da cerca do lote 2'), 'none')
})

test('mostra um cadastro composto em itens simples antes de salvar', () => {
  const review = formatPendingReview('record_cattle_movement', {
    movement_type: 'purchase',
    quantity: 10,
    total_amount: 50_000,
    movement_date: '2026-07-13',
    human_summary: 'Compra e serviços.',
    secondary_actions: [{
      intent: 'create_expense',
      description: 'Despesa da compra',
      extracted_data: JSON.stringify({ amount: 50_000, description: 'Compra de 10 animais' }),
    }, {
      intent: 'create_task',
      description: 'Arrumar a cerca',
      extracted_data: JSON.stringify({ title: 'Arrumar a cerca do lote 2', due_date: '2026-07-17' }),
    }, {
      intent: 'create_expense',
      description: 'Pagamento do sal',
      extracted_data: JSON.stringify({ amount: 60_000, description: 'Pagamento do sal' }),
    }],
  })

  assert.match(review, /1\. Compra de 10 animais — R\$\s*50\.000,00 — 13\/07\/2026/)
  assert.match(review, /2\. Despesa: Compra de 10 animais — R\$\s*50\.000,00/)
  assert.match(review, /3\. Arrumar a cerca do lote 2 — para 17\/07\/2026/)
  assert.match(review, /4\. Despesa: Pagamento do sal — R\$\s*60\.000,00/)
  assert.match(review, /Responda \*sim\* para eu salvar/)
  assert.doesNotMatch(review, /intent|schema|ação pendente|plano/i)
})

test('pergunta somente uma informação por vez e mantém o restante guardado', () => {
  const plan: AIResponse = {
    intent: 'create_task',
    module: 'maintenance',
    action_type: 'create',
    confidence: 0.95,
    requires_confirmation: true,
    should_create_pending_action: true,
    risk_level: 'low',
    extracted_data: JSON.stringify({ title: 'Arrumar a cerca' }),
    secondary_actions: [{
      intent: 'create_expense',
      description: 'Compra de arame',
      extracted_data: JSON.stringify({ description: 'Compra de arame' }),
    }],
    missing_fields: ['due_date'],
    human_summary: 'Arrumar a cerca e comprar arame.',
  }
  const reply = formatClarificationReply(plan, [{
    actionIndex: 0,
    intent: 'create_task',
    field: 'due_date',
    description: 'Arrumar a cerca',
  }, {
    actionIndex: 1,
    intent: 'create_expense',
    field: 'amount',
    description: 'Compra de arame',
  }])

  assert.match(reply, /Para quando/)
  assert.doesNotMatch(reply, /Qual foi o valor/)
  assert.match(reply, /O restante continua guardado/)
})

test('repete o que ouviu e entrega comprovante de salvamento em linguagem comum', () => {
  assert.equal(
    formatAudioUnderstanding('Comprei dez bois por cinquenta mil.'),
    'No áudio, entendi:\n“Comprei dez bois por cinquenta mil.”',
  )
  const receipt = formatExecutionReceipt('create_expense', {
    description: 'Pagamento do sal',
    amount: 60_000,
    expense_date: '2026-07-13',
  })
  assert.match(receipt, /Pronto\. Salvei este registro/)
  assert.match(receipt, /Pagamento do sal/)
  assert.match(receipt, /Você pode conferir tudo no sistema/)
})

test('descreve cancelamento de tarefa sem parecer que já executou', () => {
  const review = formatPendingReview('cancel_task', {
    task_name: 'Arrumar a cerca do lote 2',
  })
  assert.match(review, /Cancelar tarefa: Arrumar a cerca do lote 2/)
  assert.match(review, /É essa tarefa mesmo/)
  assert.match(review, /Responda \*sim\* para cancelar/)
})
