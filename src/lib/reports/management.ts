import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { getCivilDate } from '@/lib/date'
import {
  type ExpenseRow,
  type ManagementReport,
  type ReportMonth,
  type ReportRange,
  type RevenueRow,
} from './report-utils'

export {
  defaultReportRange,
  InvalidReportRangeError,
  managementReportToCsv,
  parseReportRange,
} from './report-utils'
export type { CategoryTotal, ManagementReport, ReportMonth, ReportRange } from './report-utils'

const PAGE_SIZE = 1_000
const MAX_REPORT_ROWS = 10_000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAll<T>(buildPage: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []

  for (let offset = 0; offset < MAX_REPORT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await buildPage(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }

  throw new Error('O relatório excedeu 10.000 registros. Reduza o período selecionado.')
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function sum<T>(rows: T[], select: (row: T) => number) {
  return rows.reduce((total, row) => total + select(row), 0)
}

function categoryTotals<T>(rows: T[], total: number, getCategory: (row: T) => string | null, getAmount: (row: T) => number) {
  const categories = new Map<string, number>()
  rows.forEach((row) => {
    const category = getCategory(row)?.trim() || 'Sem categoria'
    categories.set(category, (categories.get(category) || 0) + getAmount(row))
  })

  return Array.from(categories, ([category, categoryAmount]) => ({
    category,
    amount: categoryAmount,
    share: total > 0 ? (categoryAmount / total) * 100 : 0,
  })).sort((a, b) => b.amount - a.amount)
}

function monthKeys(range: ReportRange) {
  const keys: string[] = []
  const [fromYear, fromMonth] = range.from.split('-').map(Number)
  const [toYear, toMonth] = range.to.split('-').map(Number)
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, 1))
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1))

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}

function monthlySeries(expenses: ExpenseRow[], revenues: RevenueRow[], range: ReportRange): ReportMonth[] {
  const expenseByMonth = new Map<string, number>()
  const revenueByMonth = new Map<string, number>()
  expenses.forEach((row) => expenseByMonth.set(row.expense_date.slice(0, 7), (expenseByMonth.get(row.expense_date.slice(0, 7)) || 0) + amount(row.amount)))
  revenues.forEach((row) => revenueByMonth.set(row.revenue_date.slice(0, 7), (revenueByMonth.get(row.revenue_date.slice(0, 7)) || 0) + amount(row.amount)))

  return monthKeys(range).map((key) => {
    const [year, month] = key.split('-').map(Number)
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)))
      .replace('.', '')
    const despesa = expenseByMonth.get(key) || 0
    const receita = revenueByMonth.get(key) || 0
    return { month: label.charAt(0).toUpperCase() + label.slice(1), receita, despesa, saldo: receita - despesa }
  })
}

export async function getManagementReport(
  range: ReportRange,
  client?: SupabaseClient,
): Promise<ManagementReport> {
  const supabase = client || await createAdminClient()

  const [
    expenses,
    revenues,
    sales,
    payroll,
    cattleLots,
    inventory,
    pendingTasks,
    completedTasks,
    alertsResult,
    farmResult,
  ] = await Promise.all([
    fetchAll<ExpenseRow>((from, to) => supabase.from('expenses')
      .select('id, expense_date, description, category, supplier_name, amount')
      .neq('status', 'deleted').gte('expense_date', range.from).lte('expense_date', range.to)
      .order('expense_date', { ascending: false }).range(from, to)),
    fetchAll<RevenueRow>((from, to) => supabase.from('revenues')
      .select('id, revenue_date, description, category, amount')
      .neq('status', 'deleted').gte('revenue_date', range.from).lte('revenue_date', range.to)
      .order('revenue_date', { ascending: false }).range(from, to)),
    fetchAll<{ net_amount: number | string | null; gross_amount: number | string | null }>((from, to) => supabase.from('cattle_sales')
      .select('net_amount, gross_amount').neq('status', 'deleted')
      .gte('negotiation_date', range.from).lte('negotiation_date', range.to).range(from, to)),
    fetchAll<{ amount: number | string | null }>((from, to) => supabase.from('employee_payments')
      .select('amount').neq('status', 'deleted')
      .gte('payment_date', range.from).lte('payment_date', range.to).range(from, to)),
    fetchAll<{ current_quantity: number | string | null }>((from, to) => supabase.from('cattle_lots')
      .select('current_quantity').neq('status', 'deleted').range(from, to)),
    fetchAll<{ current_quantity: number | string | null; minimum_quantity: number | string | null }>((from, to) => supabase.from('inventory_items')
      .select('current_quantity, minimum_quantity').neq('status', 'deleted').range(from, to)),
    fetchAll<{ due_date: string | null }>((from, to) => supabase.from('tasks')
      .select('due_date').eq('status', 'pending').range(from, to)),
    fetchAll<{ id: string }>((from, to) => supabase.from('tasks')
      .select('id').eq('status', 'completed').gte('completed_at', `${range.from}T00:00:00Z`)
      .lte('completed_at', `${range.to}T23:59:59.999Z`).range(from, to)),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).neq('status', 'deleted'),
    supabase.from('farms').select('name, location_description').neq('status', 'deleted')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  if (alertsResult.error) throw new Error(alertsResult.error.message)
  if (farmResult.error) throw new Error(farmResult.error.message)

  const totalExpenses = sum(expenses, (row) => amount(row.amount))
  const totalRevenues = sum(revenues, (row) => amount(row.amount))
  const totalHeads = sum(cattleLots, (row) => amount(row.current_quantity))
  const today = getCivilDate()

  return {
    range,
    farm: {
      name: farmResult.data?.name || 'Garça Branca',
      location: farmResult.data?.location_description || null,
    },
    finance: {
      expenses: totalExpenses,
      revenues: totalRevenues,
      balance: totalRevenues - totalExpenses,
      expenseCount: expenses.length,
      revenueCount: revenues.length,
      sales: sum(sales, (row) => amount(row.net_amount ?? row.gross_amount)),
      payroll: sum(payroll, (row) => amount(row.amount)),
      expenseCategories: categoryTotals(expenses, totalExpenses, (row) => row.category, (row) => amount(row.amount)),
      revenueCategories: categoryTotals(revenues, totalRevenues, (row) => row.category, (row) => amount(row.amount)),
      monthlySeries: monthlySeries(expenses, revenues, range),
      largestExpenses: [...expenses].sort((a, b) => amount(b.amount) - amount(a.amount)).slice(0, 5),
      expenseRows: expenses,
      revenueRows: revenues,
    },
    operation: {
      totalHeads,
      activeLots: cattleLots.length,
      averageHeadsPerLot: cattleLots.length ? totalHeads / cattleLots.length : 0,
      inventoryItems: inventory.length,
      lowStockItems: inventory.filter((item) => item.minimum_quantity !== null && amount(item.current_quantity) <= amount(item.minimum_quantity)).length,
      pendingTasks: pendingTasks.length,
      overdueTasks: pendingTasks.filter((task) => Boolean(task.due_date && task.due_date < today)).length,
      completedTasks: completedTasks.length,
      activeAlerts: alertsResult.count || 0,
    },
    generatedAt: new Date().toISOString(),
  }
}
