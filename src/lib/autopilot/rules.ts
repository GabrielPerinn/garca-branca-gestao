import { shiftCivilDate } from '@/lib/date'

export type AutopilotSeverity = 'critical' | 'high' | 'medium' | 'low'
export type AutopilotCategory = 'tasks' | 'inventory' | 'livestock' | 'compliance' | 'finance' | 'operations'

export type AutopilotRule = {
  id: string
  rule_key: string
  enabled: boolean
  config_json: Record<string, unknown> | null
}

export type AutopilotFindingCandidate = {
  ruleKey: string
  fingerprint: string
  category: AutopilotCategory
  severity: AutopilotSeverity
  title: string
  summary: string
  recommendedAction: string
  evidence: Record<string, unknown>
  relatedTable?: string
  relatedId?: string
}

export type AutopilotSnapshot = {
  today: string
  now: string
  tasks: Array<{ id: string; title: string; due_date: string | null; priority: string | null; status: string }>
  inventory: Array<{ id: string; name: string; current_quantity: number | string | null; minimum_quantity: number | string | null; status: string }>
  pastures: Array<{ id: string; name: string; approximate_capacity: number | string | null; status: string }>
  cattleLots: Array<{ id: string; name: string; current_quantity: number | null; pasture_id: string | null; status: string }>
  occurrences: Array<{ id: string; title: string; priority: string | null; status: string; created_at: string }>
  documents: Array<{ id: string; title: string; expiration_date: string | null; status: string }>
  weighings: Array<{ cattle_lot_id: string | null; weighing_date: string }>
  expenses: Array<{ amount: number | string; expense_date: string; status: string }>
  revenues: Array<{ amount: number | string; revenue_date: string; status: string }>
}

export const defaultAutopilotRules = [
  { rule_key: 'overdue_tasks', name: 'Tarefas vencidas', description: 'Detecta tarefas pendentes cujo prazo já terminou.', category: 'tasks', default_severity: 'high', config_json: { critical_days: 7 } },
  { rule_key: 'low_inventory', name: 'Estoque abaixo do mínimo', description: 'Compara o saldo atual de cada item com seu estoque mínimo.', category: 'inventory', default_severity: 'high', config_json: {} },
  { rule_key: 'pasture_overcapacity', name: 'Capacidade dos pastos', description: 'Compara a quantidade nos lotes com a capacidade informada do pasto.', category: 'livestock', default_severity: 'high', config_json: { critical_ratio: 1.2 } },
  { rule_key: 'unreviewed_occurrences', name: 'Ocorrências críticas sem revisão', description: 'Sinaliza ocorrências prioritárias que ainda aguardam revisão.', category: 'operations', default_severity: 'high', config_json: { critical_hours: 48 } },
  { rule_key: 'expiring_documents', name: 'Documentos próximos do vencimento', description: 'Monitora documentos vencidos ou que vencem nos próximos 30 dias.', category: 'compliance', default_severity: 'high', config_json: { warning_days: 30 } },
  { rule_key: 'stale_weighings', name: 'Lotes sem pesagem recente', description: 'Identifica lotes ativos sem pesagem dentro da janela definida.', category: 'livestock', default_severity: 'medium', config_json: { stale_days: 90 } },
  { rule_key: 'expense_acceleration', name: 'Aceleração das despesas', description: 'Compara as despesas dos últimos 30 dias com os 30 dias anteriores.', category: 'finance', default_severity: 'high', config_json: { ratio: 1.5, minimum_delta: 10000 } },
] as const

function dayNumber(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

function daysBetween(from: string, to: string) {
  return Math.floor(dayNumber(to) - dayNumber(from))
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function configNumber(rule: AutopilotRule, key: string, fallback: number) {
  const value = Number(rule.config_json?.[key])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function evaluateAutopilotSnapshot(snapshot: AutopilotSnapshot, rules: AutopilotRule[]) {
  const enabledRules = new Map(rules.filter(rule => rule.enabled).map(rule => [rule.rule_key, rule]))
  const findings: AutopilotFindingCandidate[] = []

  const overdueRule = enabledRules.get('overdue_tasks')
  if (overdueRule) {
    const criticalDays = configNumber(overdueRule, 'critical_days', 7)
    for (const task of snapshot.tasks) {
      if (!task.due_date || !['pending', 'in_progress'].includes(task.status) || task.due_date >= snapshot.today) continue
      const overdueDays = daysBetween(task.due_date, snapshot.today)
      const severity: AutopilotSeverity = overdueDays >= criticalDays || task.priority === 'high' ? 'critical' : 'high'
      findings.push({
        ruleKey: overdueRule.rule_key, fingerprint: task.id, category: 'tasks', severity,
        title: `Tarefa vencida: ${task.title}`,
        summary: `O prazo terminou há ${overdueDays} dia${overdueDays === 1 ? '' : 's'} e a tarefa continua ${task.status === 'in_progress' ? 'em andamento' : 'pendente'}.`,
        recommendedAction: 'Confirmar a situação com o responsável, redefinir um prazo realista ou registrar a conclusão.',
        evidence: { task_id: task.id, due_date: task.due_date, overdue_days: overdueDays, priority: task.priority, status: task.status },
        relatedTable: 'tasks', relatedId: task.id,
      })
    }
  }

  const inventoryRule = enabledRules.get('low_inventory')
  if (inventoryRule) {
    for (const item of snapshot.inventory) {
      if (item.status === 'deleted' || item.minimum_quantity === null) continue
      const current = numeric(item.current_quantity)
      const minimum = numeric(item.minimum_quantity)
      if (current > minimum) continue
      findings.push({
        ruleKey: inventoryRule.rule_key, fingerprint: item.id, category: 'inventory', severity: current <= 0 ? 'critical' : 'high',
        title: `Estoque crítico: ${item.name}`,
        summary: `Saldo atual de ${current} está no ou abaixo do mínimo configurado de ${minimum}.`,
        recommendedAction: 'Conferir o saldo físico, estimar o consumo até a reposição e preparar a compra ou transferência necessária.',
        evidence: { inventory_item_id: item.id, current_quantity: current, minimum_quantity: minimum },
        relatedTable: 'inventory_items', relatedId: item.id,
      })
    }
  }

  const capacityRule = enabledRules.get('pasture_overcapacity')
  if (capacityRule) {
    const criticalRatio = configNumber(capacityRule, 'critical_ratio', 1.2)
    const cattleByPasture = new Map<string, number>()
    for (const lot of snapshot.cattleLots) {
      if (lot.status === 'deleted' || !lot.pasture_id) continue
      cattleByPasture.set(lot.pasture_id, (cattleByPasture.get(lot.pasture_id) || 0) + numeric(lot.current_quantity))
    }
    for (const pasture of snapshot.pastures) {
      const capacity = numeric(pasture.approximate_capacity)
      const quantity = cattleByPasture.get(pasture.id) || 0
      if (pasture.status === 'deleted' || capacity <= 0 || quantity <= capacity) continue
      const ratio = quantity / capacity
      findings.push({
        ruleKey: capacityRule.rule_key, fingerprint: pasture.id, category: 'livestock', severity: ratio >= criticalRatio ? 'critical' : 'high',
        title: `Capacidade excedida no pasto ${pasture.name}`,
        summary: `${quantity} cabeças estão vinculadas a uma capacidade informada de ${capacity}, ocupação de ${(ratio * 100).toFixed(0)}%.`,
        recommendedAction: 'Reavaliar a capacidade informada e planejar imediatamente a redistribuição dos lotes ou o manejo do pasto.',
        evidence: { pasture_id: pasture.id, cattle_quantity: quantity, approximate_capacity: capacity, occupancy_ratio: Number(ratio.toFixed(3)) },
        relatedTable: 'pastures', relatedId: pasture.id,
      })
    }
  }

  const occurrenceRule = enabledRules.get('unreviewed_occurrences')
  if (occurrenceRule) {
    const criticalHours = configNumber(occurrenceRule, 'critical_hours', 48)
    const nowMs = new Date(snapshot.now).getTime()
    for (const occurrence of snapshot.occurrences) {
      if (occurrence.status !== 'pending_review' || !['high', 'critical'].includes(occurrence.priority || '')) continue
      const ageHours = Math.max(0, Math.floor((nowMs - new Date(occurrence.created_at).getTime()) / 3_600_000))
      const priorityLabel = occurrence.priority === 'critical' ? 'crítica' : 'alta'
      findings.push({
        ruleKey: occurrenceRule.rule_key, fingerprint: occurrence.id, category: 'operations', severity: occurrence.priority === 'critical' || ageHours >= criticalHours ? 'critical' : 'high',
        title: `Ocorrência aguardando revisão: ${occurrence.title}`,
        summary: `A ocorrência de prioridade ${priorityLabel} aguarda revisão há aproximadamente ${ageHours} hora${ageHours === 1 ? '' : 's'}.`,
        recommendedAction: 'Revisar a ocorrência, confirmar os fatos e convertê-la em tarefa, manutenção ou outro registro operacional.',
        evidence: { occurrence_id: occurrence.id, priority: occurrence.priority, age_hours: ageHours },
        relatedTable: 'occurrences', relatedId: occurrence.id,
      })
    }
  }

  const documentRule = enabledRules.get('expiring_documents')
  if (documentRule) {
    const warningDays = configNumber(documentRule, 'warning_days', 30)
    for (const document of snapshot.documents) {
      if (!document.expiration_date || document.status === 'deleted') continue
      const remainingDays = daysBetween(snapshot.today, document.expiration_date)
      if (remainingDays > warningDays) continue
      findings.push({
        ruleKey: documentRule.rule_key, fingerprint: document.id, category: 'compliance', severity: remainingDays < 0 ? 'critical' : remainingDays <= 7 ? 'high' : 'medium',
        title: remainingDays < 0 ? `Documento vencido: ${document.title}` : `Documento próximo do vencimento: ${document.title}`,
        summary: remainingDays < 0 ? `O documento venceu há ${Math.abs(remainingDays)} dia${Math.abs(remainingDays) === 1 ? '' : 's'}.` : `Faltam ${remainingDays} dia${remainingDays === 1 ? '' : 's'} para o vencimento.`,
        recommendedAction: 'Confirmar a exigência aplicável, reunir a documentação e iniciar a renovação antes de qualquer impacto operacional.',
        evidence: { document_id: document.id, expiration_date: document.expiration_date, remaining_days: remainingDays },
        relatedTable: 'documents', relatedId: document.id,
      })
    }
  }

  const weighingRule = enabledRules.get('stale_weighings')
  if (weighingRule) {
    const staleDays = configNumber(weighingRule, 'stale_days', 90)
    const latestByLot = new Map<string, string>()
    for (const weighing of snapshot.weighings) {
      if (!weighing.cattle_lot_id) continue
      const current = latestByLot.get(weighing.cattle_lot_id)
      if (!current || weighing.weighing_date > current) latestByLot.set(weighing.cattle_lot_id, weighing.weighing_date.slice(0, 10))
    }
    for (const lot of snapshot.cattleLots) {
      if (lot.status === 'deleted' || numeric(lot.current_quantity) <= 0) continue
      const lastDate = latestByLot.get(lot.id)
      const daysSince = lastDate ? daysBetween(lastDate, snapshot.today) : null
      if (daysSince !== null && daysSince <= staleDays) continue
      findings.push({
        ruleKey: weighingRule.rule_key, fingerprint: lot.id, category: 'livestock', severity: daysSince === null || daysSince >= staleDays * 2 ? 'high' : 'medium',
        title: `Lote sem pesagem recente: ${lot.name}`,
        summary: lastDate ? `A última pesagem registrada foi há ${daysSince} dias.` : 'Não existe pesagem registrada para este lote ativo.',
        recommendedAction: 'Programar uma pesagem representativa e revisar ganho médio, estratégia nutricional e previsão de venda.',
        evidence: { cattle_lot_id: lot.id, last_weighing_date: lastDate || null, days_since_weighing: daysSince, stale_days: staleDays },
        relatedTable: 'cattle_lots', relatedId: lot.id,
      })
    }
  }

  const expenseRule = enabledRules.get('expense_acceleration')
  if (expenseRule) {
    const ratioLimit = configNumber(expenseRule, 'ratio', 1.5)
    const minimumDelta = configNumber(expenseRule, 'minimum_delta', 10000)
    const currentStart = shiftCivilDate(snapshot.today, -29)
    const previousStart = shiftCivilDate(snapshot.today, -59)
    const previousEnd = shiftCivilDate(snapshot.today, -30)
    const activeExpenses = snapshot.expenses.filter(item => item.status !== 'deleted')
    const currentExpenses = activeExpenses.filter(item => item.expense_date >= currentStart && item.expense_date <= snapshot.today).reduce((sum, item) => sum + numeric(item.amount), 0)
    const previousExpenses = activeExpenses.filter(item => item.expense_date >= previousStart && item.expense_date <= previousEnd).reduce((sum, item) => sum + numeric(item.amount), 0)
    const delta = currentExpenses - previousExpenses
    const ratio = previousExpenses > 0 ? currentExpenses / previousExpenses : currentExpenses > 0 ? Number.POSITIVE_INFINITY : 0
    if (currentExpenses > 0 && delta >= minimumDelta && ratio >= ratioLimit) {
      const currentRevenues = snapshot.revenues.filter(item => item.status !== 'deleted' && item.revenue_date >= currentStart && item.revenue_date <= snapshot.today).reduce((sum, item) => sum + numeric(item.amount), 0)
      findings.push({
        ruleKey: expenseRule.rule_key, fingerprint: 'farm', category: 'finance', severity: currentExpenses > currentRevenues && delta >= minimumDelta * 2 ? 'critical' : 'high',
        title: 'Despesas aceleraram nos últimos 30 dias',
        summary: `As despesas chegaram a ${money(currentExpenses)}, aumento de ${money(delta)} sobre os 30 dias anteriores. Receitas no período: ${money(currentRevenues)}.`,
        recommendedAction: 'Revisar as maiores categorias, separar efeitos pontuais de recorrentes e validar o caixa necessário para os próximos 30 dias.',
        evidence: { current_start: currentStart, current_end: snapshot.today, current_expenses: currentExpenses, previous_expenses: previousExpenses, delta, ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(3)) : null, current_revenues: currentRevenues },
      })
    }
  }

  return { findings, evaluatedRuleKeys: [...enabledRules.keys()] }
}
