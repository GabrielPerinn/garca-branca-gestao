import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCivilDate } from '@/lib/date'
import { normalizeQuestion, type DatabaseQuestionKind } from '@/lib/ai/question-classifier'

const PAGE_SIZE = 1_000

interface QueryError {
  message: string
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: QueryError | null }>
) {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Falha ao consultar o banco: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export function getCivilMonthRange(today = getCivilDate()) {
  const [year, month] = today.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatMonth(start: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${start}T12:00:00Z`))
}

function sum(rows: Array<{ amount: number | string | null }>) {
  return rows.reduce((total, row) => total + Number(row.amount ?? 0), 0)
}

async function loadMonthlyExpenses(supabase: SupabaseClient, start: string, end: string) {
  return fetchAllRows<{ amount: number | string | null }>(async (from, to) => {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount')
      .neq('status', 'deleted')
      .gte('expense_date', start)
      .lt('expense_date', end)
      .range(from, to)
    return { data, error }
  })
}

async function loadMonthlyRevenues(supabase: SupabaseClient, start: string, end: string) {
  return fetchAllRows<{ amount: number | string | null }>(async (from, to) => {
    const { data, error } = await supabase
      .from('revenues')
      .select('amount')
      .neq('status', 'deleted')
      .gte('revenue_date', start)
      .lt('revenue_date', end)
      .range(from, to)
    return { data, error }
  })
}

export async function answerDatabaseQuestion(
  supabase: SupabaseClient,
  kind: DatabaseQuestionKind
): Promise<string> {
  const today = getCivilDate()
  const { start, end } = getCivilMonthRange(today)
  const monthLabel = formatMonth(start)

  if (kind === 'monthly_finance' || kind === 'monthly_expenses' || kind === 'monthly_revenues') {
    const [expenses, revenues] = await Promise.all([
      kind === 'monthly_revenues' ? Promise.resolve([]) : loadMonthlyExpenses(supabase, start, end),
      kind === 'monthly_expenses' ? Promise.resolve([]) : loadMonthlyRevenues(supabase, start, end),
    ])
    const expensesTotal = sum(expenses)
    const revenuesTotal = sum(revenues)

    if (kind === 'monthly_expenses') {
      return `Em ${monthLabel}, as despesas registradas somam ${formatCurrency(expensesTotal)}.`
    }
    if (kind === 'monthly_revenues') {
      return `Em ${monthLabel}, as receitas registradas somam ${formatCurrency(revenuesTotal)}.`
    }
    return `Em ${monthLabel}, há ${formatCurrency(revenuesTotal)} em receitas e ${formatCurrency(expensesTotal)} em despesas. Saldo: ${formatCurrency(revenuesTotal - expensesTotal)}.`
  }

  if (kind === 'cattle_heads') {
    const lots = await fetchAllRows<{ current_quantity: number | string | null }>(async (from, to) => {
      const { data, error } = await supabase
        .from('cattle_lots')
        .select('current_quantity')
        .neq('status', 'deleted')
        .range(from, to)
      return { data, error }
    })
    const total = lots.reduce((value, lot) => value + Number(lot.current_quantity ?? 0), 0)
    return `O rebanho cadastrado tem ${new Intl.NumberFormat('pt-BR').format(total)} cabeça${total === 1 ? '' : 's'} no total.`
  }

  if (kind === 'pending_tasks' || kind === 'overdue_tasks') {
    const tasks = await fetchAllRows<{ title: string; due_date: string | null }>(async (from, to) => {
      const { data, error } = await supabase
        .from('tasks')
        .select('title, due_date')
        .eq('status', 'pending')
        .order('due_date', { ascending: true, nullsFirst: false })
        .range(from, to)
      return { data, error }
    })
    const overdue = tasks.filter(task => task.due_date && task.due_date < today)

    if (kind === 'pending_tasks') {
      return `Há ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} pendente${tasks.length === 1 ? '' : 's'}, sendo ${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}.`
    }
    const examples = overdue.slice(0, 3).map(task => task.title).join('; ')
    return overdue.length === 0
      ? 'Não há tarefas atrasadas.'
      : `Há ${overdue.length} tarefa${overdue.length === 1 ? '' : 's'} atrasada${overdue.length === 1 ? '' : 's'}${examples ? `: ${examples}` : ''}.`
  }

  if (kind === 'low_stock') {
    const items = await fetchAllRows<{
      name: string
      current_quantity: number | string | null
      minimum_quantity: number | string | null
      unit: string | null
    }>(async (from, to) => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('name, current_quantity, minimum_quantity, unit')
        .neq('status', 'deleted')
        .not('minimum_quantity', 'is', null)
        .order('name')
        .range(from, to)
      return { data, error }
    })
    const lowItems = items.filter(item => Number(item.current_quantity ?? 0) <= Number(item.minimum_quantity))
    if (lowItems.length === 0) return 'Nenhum item está abaixo ou no nível mínimo de estoque.'
    const examples = lowItems.slice(0, 5).map(item =>
      `${item.name} (${Number(item.current_quantity ?? 0).toLocaleString('pt-BR')}${item.unit ? ` ${item.unit}` : ''})`
    ).join('; ')
    return `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} com estoque baixo: ${examples}.`
  }

  const sales = await fetchAllRows<{
    buyer_name: string
    gross_amount: number | string | null
    net_amount: number | string | null
    payment_status: string | null
  }>(async (from, to) => {
    const { data, error } = await supabase
      .from('cattle_sales')
      .select('buyer_name, gross_amount, net_amount, payment_status')
      .neq('status', 'deleted')
      .range(from, to)
    return { data, error }
  })
  const paidStatuses = new Set(['paid', 'received', 'pago', 'recebido', 'completed', 'concluido', 'quitado'])
  const receivables = sales.filter(sale => !paidStatuses.has(normalizeQuestion(sale.payment_status ?? 'pending')))
  const total = receivables.reduce(
    (value, sale) => value + Number(sale.net_amount ?? sale.gross_amount ?? 0),
    0
  )
  return receivables.length === 0
    ? 'Não há vendas pendentes de recebimento.'
    : `Há ${receivables.length} venda${receivables.length === 1 ? '' : 's'} a receber, totalizando ${formatCurrency(total)}.`
}
