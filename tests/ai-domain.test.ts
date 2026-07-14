import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSystemPrompt, enforceAIContract, MockAIProvider } from '../src/lib/ai/interpreter'
import type { AIResponse } from '../src/lib/validation/ai-schema'
import {
  classifyConversationalMessage,
  classifyDatabaseQuestion,
  isLikelyKnowledgeQuestion,
} from '../src/lib/ai/question-classifier'
import { getBlockingFields } from '../src/lib/ai/action-metadata'
import { getPendingActionPlanIssues } from '../src/lib/ai/action-plan'
import { getStrategicAnalysisWindow, keepKnownEvidenceKeys } from '../src/lib/ai/strategic-rules'

test('classifica consultas gerenciais comuns sem depender do modelo', () => {
  assert.equal(classifyDatabaseQuestion('Quanto gastamos esse mês?'), 'monthly_expenses')
  assert.equal(classifyDatabaseQuestion('Quantas cabeças temos?'), 'cattle_heads')
  assert.equal(classifyDatabaseQuestion('Tem tarefa atrasada?'), 'overdue_tasks')
  assert.equal(classifyDatabaseQuestion('Quais itens estão com estoque baixo?'), 'low_stock')
  assert.equal(classifyDatabaseQuestion('Quais vendas estão a receber?'), 'sales_receivable')
  assert.equal(classifyDatabaseQuestion('Mostre as despesas deste mês'), 'monthly_expenses')
  assert.equal(classifyDatabaseQuestion('Crie uma tarefa para consertar a cerca'), null)
  assert.equal(classifyDatabaseQuestion('Paguei 500 reais este mês'), null)
  assert.equal(classifyDatabaseQuestion('Recebi 1000 reais este mês'), null)
  assert.equal(classifyDatabaseQuestion('Pode registrar que paguei 500 reais este mês?'), null)
  assert.equal(classifyDatabaseQuestion('Você pode anotar que recebi 1000 este mês?'), null)
  assert.equal(classifyDatabaseQuestion('Quanto gastamos no mês passado?'), null)
  assert.equal(classifyDatabaseQuestion('Quantos animais estão no lote Recria?'), null)
})

test('identifica perguntas abertas sem confundir lançamentos operacionais', () => {
  assert.equal(isLikelyKnowledgeQuestion('Qual foi o saldo do mês passado?'), true)
  assert.equal(isLikelyKnowledgeQuestion('E no mês anterior?'), true)
  assert.equal(isLikelyKnowledgeQuestion('Explique como funciona a lotação do pasto'), true)
  assert.equal(isLikelyKnowledgeQuestion('Pode registrar que comprei 10 vacinas?'), false)
  assert.equal(isLikelyKnowledgeQuestion('Paguei 500 reais ao fornecedor'), false)
})

test('responde conversa e testes sem criar registros operacionais', () => {
  assert.equal(classifyConversationalMessage('teste final')?.kind, 'test')
  assert.equal(classifyConversationalMessage('Olá, teste Garça Branca 3')?.kind, 'test')
  assert.equal(classifyConversationalMessage('Bom dia!')?.kind, 'greeting')
  assert.equal(classifyConversationalMessage('Obrigado')?.kind, 'acknowledgement')
  assert.equal(classifyConversationalMessage('O que você faz?')?.kind, 'help')
  assert.equal(classifyConversationalMessage('Teste de mastite positivo na vaca 12'), null)
  assert.equal(classifyConversationalMessage('O pasto está seco'), null)
})

test('prompt declara record_inventory_entry e seus campos obrigatórios', () => {
  const prompt = buildSystemPrompt()
  assert.match(prompt, /record_inventory_entry/)
  assert.match(prompt, /item_name, quantity e unit/)
  assert.match(prompt, /CADA um em uma ação separada/)
  assert.match(prompt, /complete_task/)
  assert.match(prompt, /cancel_task/)
  assert.match(prompt, /create_livestock_protocol/)
  assert.match(prompt, /complete_livestock_protocol/)
  assert.match(prompt, /individual_weights/)
})

test('mock estrutura criação e baixa de protocolos coletivos', async () => {
  const create = await new MockAIProvider().interpret('Me lembre de vacinar o lote Matrizes hoje e repetir a cada 180 dias')
  const complete = await new MockAIProvider().interpret('Aplicamos a vacina aftosa no lote Matrizes hoje em 180 cabeças')
  const createPayload = JSON.parse(create.extracted_data)
  const completePayload = JSON.parse(complete.extracted_data)

  assert.equal(create.intent, 'create_livestock_protocol')
  assert.equal(createPayload.scope_type, 'lot')
  assert.equal(createPayload.lot_name, 'matrizes')
  assert.equal(createPayload.recurrence_days, 180)
  assert.deepEqual(getBlockingFields(create.intent, createPayload, create.missing_fields), [])
  assert.equal(complete.intent, 'complete_livestock_protocol')
  assert.equal(complete.action_type, 'update')
  assert.equal(completePayload.quantity_treated, 180)
})

test('mock diferencia cancelar uma tarefa cadastrada de descartar a conversa', async () => {
  const result = await new MockAIProvider().interpret(
    'Não precisa mais arrumar a cerca do lote 2, cancela essa tarefa.',
  )
  const payload = JSON.parse(result.extracted_data)

  assert.equal(result.intent, 'cancel_task')
  assert.equal(result.action_type, 'update')
  assert.match(payload.task_name, /arrumar a cerca do lote 2/i)
  assert.equal(result.requires_confirmation, true)
})

test('mock gera despesa com entrada secundária quando compra tem quantidade e unidade', async () => {
  const result = await new MockAIProvider().interpret('Comprei 10 sacos de sal por 1800.')

  assert.equal(result.intent, 'create_expense')
  assert.equal(result.secondary_actions?.length, 1)
  assert.equal(result.secondary_actions?.[0]?.intent, 'record_inventory_entry')

  const inventory = JSON.parse(result.secondary_actions?.[0]?.extracted_data ?? '{}')
  assert.deepEqual(
    { item_name: inventory.item_name, quantity: inventory.quantity, unit: inventory.unit },
    { item_name: 'sal', quantity: 10, unit: 'saco' }
  )
})

test('mock gera entrada primária quando recebimento físico não tem despesa', async () => {
  const result = await new MockAIProvider().interpret('Chegaram 25 litros de diesel hoje.')
  const payload = JSON.parse(result.extracted_data)

  assert.equal(result.intent, 'record_inventory_entry')
  assert.deepEqual(
    { item_name: payload.item_name, quantity: payload.quantity, unit: payload.unit },
    { item_name: 'diesel', quantity: 25, unit: 'litro' }
  )
})

test('mock calcula compra de gado por valor unitário quando a mensagem diz cada', async () => {
  const result = await new MockAIProvider().interpret('Comprei 2 bezerros hoje por R$ 1.800 cada')
  const payload = JSON.parse(result.extracted_data)
  const expense = JSON.parse(result.secondary_actions?.[0]?.extracted_data ?? '{}')

  assert.equal(payload.price_per_unit, 1800)
  assert.equal(payload.total_amount, 3600)
  assert.equal(expense.amount, 3600)
})

test('mock extrai nome e valor em pagamentos comuns de funcionário', async () => {
  const cases = [
    ['Paguei João 800 de adiantamento', 'joão', 800],
    ['João recebeu 300 de adiantamento', 'joão', 300],
    ['Paguei 2200 de salário para João', 'joão', 2200],
  ] as const

  for (const [message, employeeName, amount] of cases) {
    const result = await new MockAIProvider().interpret(message)
    const payload = JSON.parse(result.extracted_data)
    assert.equal(result.intent, 'record_employee_payment')
    assert.equal(payload.employee_name, employeeName)
    assert.equal(payload.amount, amount)
  }
})

test('mock estrutura retirada de cascalho como ação aprovável', async () => {
  const result = await new MockAIProvider().interpret('Tiramos 4 cargas de cascalho da entrada.')
  const payload = JSON.parse(result.extracted_data)

  assert.equal(result.intent, 'record_gravel_operation')
  assert.equal(result.requires_confirmation, true)
  assert.equal(payload.loads_quantity, 4)
  assert.equal(payload.origin_location, 'entrada')
  assert.deepEqual(getBlockingFields(result.intent, payload, result.missing_fields), [])
})

test('mock bloqueia supressão sem área ou autorização ambiental', async () => {
  const incomplete = await new MockAIProvider().interpret('Começamos a limpeza da área nova.')
  const complete = await new MockAIProvider().interpret('Limpamos 2 hectares na área nova com autorização 123/2026.')
  const completePayload = JSON.parse(complete.extracted_data)

  assert.equal(incomplete.intent, 'record_suppression_operation')
  assert.deepEqual(getBlockingFields(incomplete.intent, JSON.parse(incomplete.extracted_data), incomplete.missing_fields), [
    'approximate_area',
    'authorization_number',
  ])
  assert.equal(complete.intent, 'record_suppression_operation')
  assert.equal(completePayload.approximate_area, 2)
  assert.equal(completePayload.authorization_number, '123/2026')
})

test('mock separa contrato rural de receita e extrai o cronograma', async () => {
  const result = await new MockAIProvider().interpret(
    'Cedemos 120 hectares da Área Norte para João plantar soja, de 01/09/2026 a 31/08/2029, por R$ 80 mil ao ano, primeira parcela em 10/09/2026.',
  )
  const payload = JSON.parse(result.extracted_data)

  assert.equal(result.intent, 'create_rural_contract')
  assert.equal(result.module, 'contracts')
  assert.equal(payload.contract_type, 'rural_lease')
  assert.equal(payload.farm_role, 'grantor')
  assert.equal(payload.parcel_name, 'área norte')
  assert.equal(payload.counterparty_name, 'joão')
  assert.equal(payload.area_ha, 120)
  assert.equal(payload.start_date, '2026-09-01')
  assert.equal(payload.end_date, '2029-08-31')
  assert.equal(payload.payment_amount, 80_000)
  assert.equal(payload.payment_frequency, 'annual')
  assert.equal(payload.first_due_date, '2026-09-10')
  assert.deepEqual(getBlockingFields(result.intent, payload, result.missing_fields), [])
})

test('descrição vaga de terra alugada abre esclarecimento e não inventa contrato', async () => {
  const result = await new MockAIProvider().interpret('Meus pais alugam terra para plantarem.')
  const payload = JSON.parse(result.extracted_data)
  const blocking = getBlockingFields(result.intent, payload, result.missing_fields)

  assert.equal(result.intent, 'create_rural_contract')
  assert.ok(blocking.includes('parcel_name'))
  assert.ok(blocking.includes('counterparty_name'))
  assert.ok(blocking.includes('start_date'))
  assert.ok(blocking.includes('end_date'))
  assert.ok(blocking.includes('area_ha'))
  assert.ok(blocking.includes('payment_type'))
})

test('campos críticos impedem ações pecuárias e de estoque incompletas', () => {
  assert.deepEqual(
    getBlockingFields('record_inventory_entry', { item_name: 'Sal', quantity: 10 }, []),
    ['unit'],
  )
  assert.deepEqual(
    getBlockingFields('record_cattle_sale', {
      buyer_name: 'JBS', quantity: 10, gross_amount: 50_000,
    }, []),
    ['lot_name'],
  )
  assert.deepEqual(
    getBlockingFields('record_cattle_movement', {
      movement_type: 'purchase', quantity: 10,
    }, ['lot_name']),
    ['purchase_amount'],
  )
  assert.deepEqual(
    getBlockingFields('record_cattle_movement', {
      movement_type: 'pasture_change', quantity: 10, lot_name: 'Recria',
    }, []),
    ['to_pasture_name'],
  )
  assert.deepEqual(
    getBlockingFields('create_task', { title: 'Arrumar a cerca' }, []),
    ['due_date'],
  )
  assert.deepEqual(
    getBlockingFields('complete_task', { task_name: 'Arrumar a cerca' }, []),
    [],
  )
  assert.deepEqual(
    getBlockingFields('cancel_task', { task_name: 'Arrumar a cerca' }, []),
    [],
  )
  assert.deepEqual(
    getBlockingFields('record_weighing', { lot_name: 'Bois', total_weight: 4_500, quantity_weighed: 10 }, []),
    [],
  )
  assert.deepEqual(
    getBlockingFields('create_livestock_protocol', {
      name: 'Vacinação', protocol_type: 'sanitary', event_type: 'vaccination', scope_type: 'lot', next_due_date: '2026-08-01',
    }, []),
    ['lot_name'],
  )
  assert.deepEqual(
    getBlockingFields('complete_livestock_protocol', { protocol_name: 'Vacinação Matrizes' }, []),
    [],
  )
})

test('plano composto valida também todas as ações secundárias', () => {
  const issues = getPendingActionPlanIssues('create_expense', {
    amount: 50_000,
    description: 'Compra de materiais',
    human_summary: 'Compra e manutenção',
    secondary_actions: [{
      intent: 'create_task',
      description: 'Arrumar a cerca do lote 2',
      extracted_data: JSON.stringify({ title: 'Arrumar a cerca do lote 2' }),
    }, {
      intent: 'create_expense',
      description: 'Pagamento do sal',
      extracted_data: JSON.stringify({ amount: 60_000, description: 'Pagamento do sal' }),
    }],
  })

  assert.deepEqual(
    issues.map(issue => ({ actionIndex: issue.actionIndex, field: issue.field })),
    [{ actionIndex: 1, field: 'due_date' }],
  )
})

test('plano de pesagem divergente pede correção antes de entrar na aprovação', () => {
  const issues = getPendingActionPlanIssues('record_weighing', {
    lot_name: 'Bois Venda', individual_weights: [400, 420, 440],
    quantity_weighed: 3, total_weight: 1_300, average_weight: 433.333,
    human_summary: 'Pesagem da folha do lote Bois Venda',
  })
  assert.deepEqual(issues.map(issue => issue.field), ['weighing_consistency'])
})

test('compra de gado exige despesa correspondente e valores consistentes', () => {
  const withoutExpense = getPendingActionPlanIssues('record_cattle_movement', {
    movement_type: 'purchase',
    quantity: 10,
    total_amount: 50_000,
    human_summary: 'Compra de 10 animais',
    secondary_actions: [],
  })
  const mismatched = getPendingActionPlanIssues('record_cattle_movement', {
    movement_type: 'purchase',
    quantity: 10,
    price_per_unit: 5_000,
    human_summary: 'Compra de 10 animais',
    secondary_actions: [{
      intent: 'create_expense',
      description: 'Compra de animais',
      extracted_data: JSON.stringify({
        amount: 45_000,
        category: 'Aquisição de Gado',
        description: 'Compra de 10 animais',
      }),
    }],
  })

  assert.ok(withoutExpense.some(issue => issue.field === 'acquisition_expense'))
  assert.ok(mismatched.some(issue => issue.field === 'amount_consistency'))
})

function proposedAction(overrides: Partial<AIResponse> = {}): AIResponse {
  return {
    intent: 'create_expense',
    module: 'finance',
    action_type: 'create',
    confidence: 0.95,
    requires_confirmation: false,
    should_create_pending_action: false,
    risk_level: 'medium',
    extracted_data: JSON.stringify({ amount: 500, description: 'Insumos' }),
    secondary_actions: null,
    missing_fields: [],
    human_summary: 'Registrar despesa.',
    ...overrides,
  }
}

test('contrato determinístico sempre exige aprovação para mutações', () => {
  const result = enforceAIContract(proposedAction())

  assert.equal(result.intent, 'create_expense')
  assert.equal(result.requires_confirmation, true)
  assert.equal(result.should_create_pending_action, true)
})

test('conclusão de tarefa exige update e permanece sujeita à confirmação', () => {
  const result = enforceAIContract(proposedAction({
    intent: 'complete_task',
    module: 'maintenance',
    action_type: 'update',
    extracted_data: JSON.stringify({ task_name: 'Arrumar a cerca' }),
  }))

  assert.equal(result.intent, 'complete_task')
  assert.equal(result.requires_confirmation, true)
  assert.equal(result.should_create_pending_action, true)
})

test('cancelamento de tarefa exige update e confirmação', () => {
  const result = enforceAIContract(proposedAction({
    intent: 'cancel_task',
    module: 'operations',
    action_type: 'update',
    extracted_data: JSON.stringify({ task_name: 'Arrumar a cerca' }),
  }))

  assert.equal(result.intent, 'cancel_task')
  assert.equal(result.requires_confirmation, true)
  assert.equal(result.should_create_pending_action, true)
})

test('criação e conclusão de protocolo sempre permanecem sujeitas à confirmação', () => {
  const create = enforceAIContract(proposedAction({
    intent: 'create_livestock_protocol', module: 'livestock', action_type: 'create',
    extracted_data: JSON.stringify({ name: 'Vacinação', protocol_type: 'sanitary' }),
  }))
  const complete = enforceAIContract(proposedAction({
    intent: 'complete_livestock_protocol', module: 'livestock', action_type: 'update',
    extracted_data: JSON.stringify({ protocol_name: 'Vacinação Matrizes' }),
  }))
  assert.equal(create.intent, 'create_livestock_protocol')
  assert.equal(complete.intent, 'complete_livestock_protocol')
  assert.equal(create.requires_confirmation, true)
  assert.equal(complete.requires_confirmation, true)
})

test('contrato bloqueia baixa confiança e tentativas de ação destrutiva', () => {
  const uncertain = enforceAIContract(proposedAction({ confidence: 0.45 }))
  const destructive = enforceAIContract(proposedAction({ action_type: 'delete' }))

  assert.equal(uncertain.intent, 'general_observation')
  assert.equal(uncertain.should_create_pending_action, false)
  assert.equal(destructive.intent, 'general_observation')
  assert.equal(destructive.should_create_pending_action, false)
})

test('contrato impede ações secundárias inválidas e normaliza JSON quebrado', () => {
  const invalidSecondary = enforceAIContract(proposedAction({
    secondary_actions: [{
      intent: 'unknown',
      extracted_data: '{}',
      description: 'Executar instrução não suportada',
    }],
  }))
  const malformed = enforceAIContract(proposedAction({ extracted_data: '{quebrado' }))

  assert.equal(invalidSecondary.intent, 'general_observation')
  assert.deepEqual(JSON.parse(malformed.extracted_data), {})
})

test('consultas e observações nunca entram na fila de execução', () => {
  const result = enforceAIContract(proposedAction({
    intent: 'answer_question',
    action_type: 'query',
    requires_confirmation: true,
    should_create_pending_action: true,
  }))

  assert.equal(result.requires_confirmation, false)
  assert.equal(result.should_create_pending_action, false)
})

test('janela estratégica compara dois períodos consecutivos de 90 dias', () => {
  assert.deepEqual(getStrategicAnalysisWindow('2026-07-13'), {
    start: '2026-04-15',
    end: '2026-07-13',
    previousStart: '2026-01-15',
    previousEnd: '2026-04-14',
  })
})

test('análise estratégica descarta evidências inventadas e duplicadas', () => {
  assert.deepEqual(
    keepKnownEvidenceKeys(['finance.balance', 'inventada', 'finance.balance'], [{ key: 'finance.balance' }]),
    ['finance.balance'],
  )
})
