import type { AIResponse } from '@/lib/validation/ai-schema'
import type { PlanIssue } from '@/lib/ai/action-plan'
import { blockingFieldLabels } from '@/lib/ai/action-metadata'

export type ConversationReplyIntent = 'confirm' | 'cancel' | 'correction' | 'none'

function normalizeConversationText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyConversationReply(text: string): ConversationReplyIntent {
  const normalized = normalizeConversationText(text)
  if (!normalized) return 'none'

  // Correções vêm antes do cancelamento porque frases como "não, era 58 mil"
  // começam com uma negativa, mas a intenção é consertar o cadastro.
  if (
    /\b(na verdade|quis dizer|falei errado|eu errei|entendeu errado|nao entendeu|nao foi isso que eu disse|voce confundiu|ficou errado|corrig\w*|corrige|corrija|muda|mude|troca|troque|valor certo|data certa|quantidade certa|nao era|nao e isso e|era para ser)\b/.test(normalized)
    || /^nao\s+(?:era|e|foi|sao)\b/.test(normalized)
    || /^(?:o|a)\s+(?:valor|data|quantidade|lote|pasto|nome|dia)\s+(?:e|eh|foi)\b/.test(normalized)
  ) return 'correction'

  if (/^(?:sim|s|isso|isso ai|isso mesmo|exatamente|correto|confere|ok|okay|certo|esta certo|ta certo|tudo certo|uhum|pode|pode sim|pode ir|pode tocar|pode confirmar|pode salvar|pode registrar|pode lancar|pode fazer|pode seguir|manda ver|confirma|confirmar|salva|salvar|registre|registrar|lanca|lancar)(?: por favor)?$/.test(normalized)) {
    return 'confirm'
  }

  const recentReference = '(?:isso|isso ai|aquilo|esse cadastro|esse registro|esse lancamento|esse pedido|essa anotacao|essa mensagem|essa informacao|essa parte|esse negocio|o ultimo|a ultima|o que eu mandei|o que eu falei)'
  const directCancellation = /^(?:nao|n|cancela|cancelar|cancele|pode cancelar|descarta|descartar|descarte|deixa pra la|deixe pra la|deixa quieto|deixe quieto|nao precisa mais|nao quero mais|nao salva|nao salvar|nao registra|nao registrar|nao lanca|nao lancar|nao quero|para|pare|esquece|esqueca|esta errado|ta errado|nao e isso|nao mexe nisso)$/
  const referencedCancellation = new RegExp(`^(?:cancela|cancelar|cancele|pode cancelar|descarta|descartar|descarte|apaga|apagar|pode apagar|tira|tirar|pode tirar|esquece|esqueca|deixa|deixe|nao salva|nao registre|nao registra|nao lanca|nao coloca|nao faz|nao mexe em|para com)\\s+${recentReference}(?:\\s+por favor)?$`)
  if (directCancellation.test(normalized) || referencedCancellation.test(normalized)) {
    return 'cancel'
  }

  return 'none'
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function textValue(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function numericValue(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(data[key])
    if (Number.isFinite(value) && value > 0) return value
  }
  return null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function append(parts: string[], value: string | null | undefined) {
  if (value) parts.push(value)
}

const movementLabels: Record<string, string> = {
  purchase: 'Compra',
  birth: 'Nascimento',
  death: 'Morte',
  loss: 'Perda',
  entry: 'Entrada',
  exit: 'Saída',
  pasture_change: 'Mudança de pasto',
  transfer: 'Transferência',
}

function describeAction(intent: string, data: Record<string, unknown>, fallback?: string) {
  const parts: string[] = []
  const amount = numericValue(data, 'amount', 'gross_amount', 'total_amount', 'payment_amount')
  const quantity = numericValue(data, 'quantity', 'current_quantity')

  if (intent === 'create_expense') {
    append(parts, `Despesa: ${textValue(data, 'description') || 'valor informado'}`)
    append(parts, amount ? formatCurrency(amount) : null)
    append(parts, formatDate(textValue(data, 'expense_date', 'date')))
  } else if (intent === 'create_revenue') {
    append(parts, `Receita: ${textValue(data, 'description') || 'valor informado'}`)
    append(parts, amount ? formatCurrency(amount) : null)
    append(parts, formatDate(textValue(data, 'revenue_date', 'date')))
  } else if (intent === 'create_task') {
    append(parts, textValue(data, 'title', 'description') || 'Serviço a fazer')
    const dueDate = formatDate(textValue(data, 'due_date'))
    append(parts, dueDate ? `para ${dueDate}` : null)
    const assigned = textValue(data, 'assigned_to_name', 'assigned_to', 'employee_name')
    append(parts, assigned ? `responsável: ${assigned}` : null)
  } else if (intent === 'complete_task') {
    append(parts, `Marcar como feito: ${textValue(data, 'task_name', 'title') || 'serviço informado'}`)
  } else if (intent === 'cancel_task') {
    append(parts, `Cancelar tarefa: ${textValue(data, 'task_name', 'title') || 'serviço informado'}`)
  } else if (intent === 'record_cattle_movement') {
    const movement = textValue(data, 'movement_type') || 'movement'
    append(parts, `${movementLabels[movement] || 'Movimentação'}${quantity ? ` de ${formatNumber(quantity)} animais` : ' de gado'}`)
    const lot = textValue(data, 'lot_name', 'cattle_lot_name')
    append(parts, lot ? `lote ${lot}` : null)
    const destination = textValue(data, 'to_pasture_name')
    append(parts, destination ? `destino: ${destination}` : null)
    append(parts, amount ? formatCurrency(amount) : null)
    append(parts, formatDate(textValue(data, 'movement_date', 'date')))
  } else if (intent === 'record_cattle_sale') {
    append(parts, `Venda${quantity ? ` de ${formatNumber(quantity)} animais` : ' de gado'}`)
    const lot = textValue(data, 'lot_name', 'cattle_lot_name')
    append(parts, lot ? `lote ${lot}` : null)
    const buyer = textValue(data, 'buyer_name', 'buyer')
    append(parts, buyer ? `comprador: ${buyer}` : null)
    append(parts, amount ? formatCurrency(amount) : null)
  } else if (intent === 'record_weighing') {
    append(parts, `Pesagem${textValue(data, 'lot_name', 'cattle_lot_name') ? ` do lote ${textValue(data, 'lot_name', 'cattle_lot_name')}` : ''}`)
    const weighed = numericValue(data, 'quantity_weighed')
    const average = numericValue(data, 'average_weight')
    append(parts, weighed ? `${formatNumber(weighed)} animais` : null)
    append(parts, average ? `média ${formatNumber(average)} kg` : null)
    append(parts, formatDate(textValue(data, 'weighing_date', 'date')))
  } else if (intent === 'create_cattle_lot') {
    append(parts, `Novo lote: ${textValue(data, 'name') || 'nome não informado'}`)
    append(parts, quantity ? `${formatNumber(quantity)} animais` : null)
  } else if (intent === 'record_inventory_entry') {
    const item = textValue(data, 'item_name', 'item', 'product_name', 'name') || 'Item de estoque'
    const unit = textValue(data, 'unit')
    append(parts, `Entrada de ${item}`)
    append(parts, quantity ? `${formatNumber(quantity)}${unit ? ` ${unit}` : ''}` : null)
  } else if (intent === 'record_employee_payment') {
    const employee = textValue(data, 'employee_name')
    append(parts, employee ? `Pagamento para ${employee}` : 'Pagamento de funcionário')
    append(parts, amount ? formatCurrency(amount) : null)
    append(parts, textValue(data, 'payment_type'))
  } else if (intent === 'create_livestock_protocol') {
    append(parts, textValue(data, 'name') || 'Manejo sanitário ou reprodutivo')
    append(parts, formatDate(textValue(data, 'next_due_date', 'date')))
    const recurrence = numericValue(data, 'recurrence_days')
    append(parts, recurrence ? `repetir a cada ${formatNumber(recurrence)} dias` : null)
  } else if (intent === 'complete_livestock_protocol') {
    append(parts, `Marcar como realizado: ${textValue(data, 'protocol_name', 'name') || 'manejo informado'}`)
    append(parts, formatDate(textValue(data, 'executed_on', 'date')))
  } else if (intent === 'record_gravel_operation') {
    append(parts, 'Retirada de cascalho')
    const loads = numericValue(data, 'loads_quantity')
    const volume = numericValue(data, 'estimated_volume')
    append(parts, loads ? `${formatNumber(loads)} cargas` : volume ? `${formatNumber(volume)} m³` : null)
    append(parts, textValue(data, 'origin_location') ? `origem: ${textValue(data, 'origin_location')}` : null)
  } else if (intent === 'record_suppression_operation') {
    append(parts, 'Limpeza ou supressão de vegetação')
    const area = numericValue(data, 'approximate_area')
    append(parts, area ? `${formatNumber(area)} ha` : null)
    append(parts, textValue(data, 'notes', 'location_description'))
    const authorization = textValue(data, 'authorization_number')
    append(parts, authorization ? `autorização ${authorization}` : null)
  } else if (intent === 'create_rural_contract') {
    append(parts, `Contrato da área ${textValue(data, 'parcel_name') || 'informada'}`)
    append(parts, textValue(data, 'counterparty_name') ? `com ${textValue(data, 'counterparty_name')}` : null)
    const area = numericValue(data, 'area_ha')
    append(parts, area ? `${formatNumber(area)} ha` : null)
    append(parts, amount ? formatCurrency(amount) : null)
  } else {
    append(parts, fallback?.replace(/[.!]+$/g, '').trim() || 'Informação da fazenda')
  }

  return parts.filter(Boolean).join(' — ')
}

export function getActionReviewLines(actionType: string, payload: Record<string, unknown>) {
  const primary = describeAction(actionType, payload, typeof payload.human_summary === 'string' ? payload.human_summary : undefined)
  const secondary = Array.isArray(payload.secondary_actions)
    ? payload.secondary_actions.map((rawAction) => {
      const action = asObject(rawAction)
      return describeAction(
        typeof action.intent === 'string' ? action.intent : 'unknown',
        asObject(action.extracted_data),
        typeof action.description === 'string' ? action.description : undefined,
      )
    })
    : []
  return [primary, ...secondary].filter(Boolean).slice(0, 11)
}

export function formatPendingReview(actionType: string, payload: Record<string, unknown>) {
  const lines = getActionReviewLines(actionType, payload)
  const details = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
  if (actionType === 'cancel_task') {
    return `Entendi assim:\n\n${details}\n\nÉ essa tarefa mesmo?\nResponda *sim* para cancelar. Se não quiser cancelar, responda *não*.`
  }
  return `Entendi assim:\n\n${details}\n\nEstá certo?\nResponda *sim* para eu salvar. Se quiser mudar algo, diga diretamente, por exemplo: “o valor certo é 58 mil”. Se não quiser salvar, responda *não*.`
}

export function formatExecutionReceipt(actionType: string, payload: Record<string, unknown>) {
  const lines = getActionReviewLines(actionType, payload)
  const details = lines.map(line => `• ${line}`).join('\n')
  if (actionType === 'cancel_task') {
    return `Pronto. A tarefa foi cancelada:\n\n${details}\n\nO lembrete dessa tarefa também foi retirado.`
  }
  return `Pronto. Salvei ${lines.length === 1 ? 'este registro' : `estes ${lines.length} registros`}:\n\n${details}\n\nVocê pode conferir tudo no sistema.`
}

export function formatAudioUnderstanding(transcription: string) {
  const compact = transcription.replace(/\s+/g, ' ').trim()
  const excerpt = compact.length > 700 ? `${compact.slice(0, 697)}...` : compact
  return `No áudio, entendi:\n“${excerpt}”`
}

function clarificationQuestion(issue: PlanIssue) {
  const description = issue.description.replace(/[?.!]+$/g, '').trim()
  const subject = description ? ` sobre “${description}”` : ''
  const questions: Record<string, string> = {
    amount: `Qual foi o valor${subject}?`,
    description: 'O que foi comprado, pago ou recebido?',
    due_date: `Para quando devo deixar esse serviço marcado${subject}?`,
    purchase_amount: 'Qual foi o valor total da compra dos animais, ou o valor por animal?',
    acquisition_expense: 'Qual valor deve ser lançado como despesa da compra dos animais?',
    amount_consistency: 'Qual é o valor correto da compra dos animais?',
    current_quantity: 'Quantos animais fazem parte desse lote?',
    quantity: `Qual foi a quantidade${subject}?`,
    unit: 'Essa quantidade está em sacos, quilos, litros ou outra unidade?',
    buyer_name: 'Quem comprou os animais?',
    gross_amount: 'Qual foi o valor total da venda?',
    lot_name: `De qual lote estamos falando${subject}?`,
    to_pasture_name: 'Para qual pasto o gado foi levado?',
    average_weight: 'Qual foi o peso médio, ou quais foram os pesos anotados?',
    weighing_consistency: 'Algum peso foi lido errado? Envie novamente os pesos corretos ou outra foto da folha.',
    employee_name: 'Qual é o nome do funcionário?',
    payment_type: 'Esse pagamento foi salário, adiantamento, diária ou outro tipo?',
    origin_location: 'De onde o cascalho foi retirado?',
    volume_or_loads: 'Foram quantas cargas, ou qual foi o volume aproximado?',
    approximate_area: 'Qual foi a área aproximada em hectares?',
    authorization_number: 'Qual é o número da autorização ambiental?',
    task_name: 'Qual tarefa foi concluída?',
    protocol_name: 'Qual manejo sanitário ou reprodutivo foi realizado?',
    next_due_date: 'Para qual data esse manejo deve ficar marcado?',
    parcel_name: 'Qual é o nome da propriedade ou área?',
    counterparty_name: 'Com quem foi feito o contrato?',
    start_date: 'Qual é a data de início do contrato?',
    end_date: 'Qual é a data de término do contrato?',
    area_ha: 'Quantos hectares fazem parte do contrato?',
    payment_amount: 'Qual é o valor do contrato?',
    payment_frequency: 'O pagamento é mensal, anual ou em outra frequência?',
    first_due_date: 'Quando vence o primeiro pagamento?',
    expense_date: 'Qual data deve ser usada para essa despesa?',
    supplier_name: 'Qual é o fornecedor ou emissor desse documento?',
    payment_status: 'Essa nota já foi paga ou ainda está pendente?',
  }
  return questions[issue.field]
    || `Só falta informar ${blockingFieldLabels[issue.field] ?? issue.field}${subject}. Qual é esse dado?`
}

export function formatClarificationReply(plan: AIResponse, issues: PlanIssue[]) {
  const actionCount = 1 + (plan.secondary_actions?.length ?? 0)
  const firstIssue = issues[0]
  if (!firstIssue) return 'Entendi. Já tenho as informações necessárias para continuar.'
  const intro = actionCount === 1
    ? 'Entendi a informação e deixei tudo guardado nesta conversa.'
    : `Entendi e separei as ${actionCount} informações. Deixei tudo guardado nesta conversa.`
  return `${intro}\n\nSó preciso confirmar uma coisa:\n${clarificationQuestion(firstIssue)}\n\nPode responder do seu jeito. O restante continua guardado.`
}

export const conversationMessages = {
  unsupportedMedia: 'Consigo receber texto, áudio, foto e arquivo PDF. Outros tipos de documento ainda não são processados.',
  permissionDenied: 'Seu acesso permite enviar informações, mas a confirmação final precisa ser feita por uma pessoa autorizada.',
  noPending: 'Não encontrei nenhum cadastro esperando confirmação. Pode mandar a informação novamente, do jeito que lembrar.',
  clarificationCancelled: 'Tudo bem. Descartei as informações incompletas e não salvei nada.',
  actionCancelled: 'Tudo bem. Descartei esse cadastro e não salvei nada.',
  correctionNotClear: 'Entendi que você quer corrigir, mas não consegui identificar com segurança o dado certo. Diga diretamente o que muda, por exemplo: “o valor certo é 58 mil”. O cadastro anterior continua esperando sua confirmação.',
  correctionChangesKind: 'Essa correção muda o tipo principal do cadastro. Para evitar erro, cancele este cadastro e mande a informação correta novamente.',
  processingError: 'Não consegui terminar agora. Sua mensagem ficou guardada para uma nova tentativa. Pode tentar novamente em alguns instantes.',
  duplicateProcessed: 'Essa mensagem já foi processada. Você pode conferir o resultado no sistema.',
}
