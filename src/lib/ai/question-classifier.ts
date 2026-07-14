export type DatabaseQuestionKind =
  | 'monthly_finance'
  | 'monthly_expenses'
  | 'monthly_revenues'
  | 'cattle_heads'
  | 'pending_tasks'
  | 'overdue_tasks'
  | 'low_stock'
  | 'sales_receivable'

export interface ConversationalResponse {
  kind: 'test' | 'greeting' | 'acknowledgement' | 'help'
  reply: string
}

export function normalizeQuestion(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyConversationalMessage(text: string): ConversationalResponse | null {
  const normalized = normalizeQuestion(text)

  // A lista após "teste" é intencionalmente restrita: uma frase como
  // "teste de mastite positivo" continua sendo uma informação operacional.
  if (/^(?:ola\s+)?(?:teste|testando|ping)(?:\s+(?:final|garca branca|sistema|whatsapp|canal|do|da|de|[0-9]+))*$/.test(normalized)) {
    return {
      kind: 'test',
      reply: 'Tudo certo por aqui. Sou a Garça Branca e recebi sua mensagem.',
    }
  }

  if (/^(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai)$/.test(normalized)) {
    return {
      kind: 'greeting',
      reply: 'Olá! Sou a Garça Branca. Pode me contar uma informação da fazenda ou fazer uma pergunta do jeito que você costuma falar.',
    }
  }

  if (/^(?:ok|certo|entendi|obrigado|obrigada|valeu|perfeito|beleza)$/.test(normalized)) {
    return {
      kind: 'acknowledgement',
      reply: 'Combinado. Quando precisar, é só me chamar.',
    }
  }

  if (/^(?:ajuda|menu|o que voce faz|como funciona)$/.test(normalized)) {
    return {
      kind: 'help',
      reply: 'Você pode falar ou escrever normalmente. Eu consigo anotar compras, despesas, gado, pesagens, estoque e serviços; também consulto o que já está cadastrado. Por exemplo:\n\n• “Comprei 10 bois por 50 mil.”\n• “Deixa a cerca do lote 2 para sexta.”\n• “Quanto gastamos este mês?”\n\nAntes de salvar qualquer mudança, eu mostro o que entendi para você conferir.',
    }
  }

  return null
}

export function classifyDatabaseQuestion(text: string): DatabaseQuestionKind | null {
  const normalized = normalizeQuestion(text)
  const hasMutationIntent = /\b(registr\w*|anot\w*|lanc\w*|cri\w*|adicion\w*|inclu\w*)\b/.test(normalized)
  const startsAsCompletedStatement = /^(paguei|pagamos|recebi|recebemos|gastei|gastamos|vendi|vendemos|comprei|compramos)\b/.test(normalized)
  const hasConsultativeIntent = /\b(quanto|quantos|quantas|qual|quais|consulte|consultar|liste|listar|mostre|mostrar|me diga|quero saber|gostaria de saber|como esta|como estao|tem alguma|tem algum|ha alguma|ha algum)\b/.test(normalized)
    || /^(tem|ha|existe|existem|esta|estao)\b/.test(normalized)
    || (text.includes('?') && !startsAsCompletedStatement)

  // Não deixe um lançamento declarativo ("paguei...", "recebi...") ser
  // desviado para uma consulta somente porque menciona o período atual.
  if (hasMutationIntent || !hasConsultativeIntent) return null

  const mentionsExpense = /\b(gast\w*|despes\w*|pagu\w*)\b/.test(normalized)
  const mentionsRevenue = /\b(receit\w*|receb\w*|entrada de dinheiro|entrou de dinheiro)\b/.test(normalized)
  const needsContextualPeriod = /\b(mes passado|ultimo mes|mes anterior|ano passado|periodo anterior)\b/.test(normalized)
  const needsCattleBreakdown = /\b(lote|pasto|categoria|por lote|cada lote|em cada)\b/.test(normalized)

  if (
    !needsContextualPeriod && (
      (mentionsExpense && mentionsRevenue)
      || /\b(balanco|financeiro|resultado do mes|saldo do mes)\b/.test(normalized)
    )
  ) return 'monthly_finance'

  if (mentionsExpense && !needsContextualPeriod && /\b(mes|mensal|este mes|desse mes|deste mes)\b/.test(normalized)) {
    return 'monthly_expenses'
  }
  if (mentionsRevenue && !needsContextualPeriod && /\b(mes|mensal|este mes|desse mes|deste mes)\b/.test(normalized)) {
    return 'monthly_revenues'
  }
  if (!needsCattleBreakdown && /\b(quantas|quantos|total de|temos|tenho)\b.*\b(cabecas|gado|animais|bois|rebanho)\b/.test(normalized)) {
    return 'cattle_heads'
  }
  if (/\b(taref\w*|servic\w*)\b.*\b(atrasad\w*|vencid\w*)\b/.test(normalized)) {
    return 'overdue_tasks'
  }
  if (/\b(taref\w*|servic\w*)\b.*\b(pendent\w*|abert\w*|fazer)\b/.test(normalized)) {
    return 'pending_tasks'
  }
  if (/\b(estoqu\w*|insum\w*|produt\w*)\b.*\b(baix\w*|acaban\w*|falt\w*|minim\w*)\b/.test(normalized)) {
    return 'low_stock'
  }
  if (/\b(vend\w*)\b.*\b(receber|a receber|pendent\w*|nao pag\w*|nao recebid\w*)\b/.test(normalized)) {
    return 'sales_receivable'
  }

  return null
}

export function isLikelyKnowledgeQuestion(text: string) {
  const normalized = normalizeQuestion(text)
  const completedStatement = /^(paguei|pagamos|recebi|recebemos|gastei|gastamos|vendi|vendemos|comprei|compramos|nasceu|nasceram|morreu|morreram)\b/.test(normalized)
  const requestsMutation = /\b(registr\w*|anot\w*|lanc\w*|cri\w*|adicion\w*|inclu\w*|confirma\w*)\b/.test(normalized)
  if (completedStatement || requestsMutation) return false

  return text.includes('?')
    || /^(quanto|quantos|quantas|qual|quais|como|quando|onde|quem|por que|porque|o que)\b/.test(normalized)
    || /\b(me diga|quero saber|gostaria de saber|consulte|consultar|liste|listar|mostre|mostrar|explique)\b/.test(normalized)
}
