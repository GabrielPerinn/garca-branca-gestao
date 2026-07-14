import { getCivilDate } from '@/lib/date'

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export type ReportRange = { from: string; to: string }

export type ExpenseRow = {
  id: string
  expense_date: string
  description: string | null
  category: string | null
  supplier_name: string | null
  amount: number | string | null
}

export type RevenueRow = {
  id: string
  revenue_date: string
  description: string | null
  category: string | null
  amount: number | string | null
}

export type CategoryTotal = { category: string; amount: number; share: number }
export type ReportMonth = { month: string; receita: number; despesa: number; saldo: number }

export type ManagementReport = {
  range: ReportRange
  farm: { name: string; location: string | null }
  finance: {
    expenses: number
    revenues: number
    balance: number
    expenseCount: number
    revenueCount: number
    sales: number
    payroll: number
    expenseCategories: CategoryTotal[]
    revenueCategories: CategoryTotal[]
    monthlySeries: ReportMonth[]
    largestExpenses: ExpenseRow[]
    expenseRows: ExpenseRow[]
    revenueRows: RevenueRow[]
  }
  operation: {
    totalHeads: number
    activeLots: number
    averageHeadsPerLot: number
    inventoryItems: number
    lowStockItems: number
    pendingTasks: number
    overdueTasks: number
    completedTasks: number
    activeAlerts: number
  }
  generatedAt: string
}

export class InvalidReportRangeError extends Error {}

function isCivilDate(value: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return parsed.toISOString().slice(0, 10) === value
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000)
}

export function defaultReportRange(today = getCivilDate()): ReportRange {
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

export function parseReportRange(
  from: string | null | undefined,
  to: string | null | undefined,
  today = getCivilDate(),
): ReportRange {
  const fallback = defaultReportRange(today)
  const range = { from: from || fallback.from, to: to || fallback.to }

  if (!isCivilDate(range.from) || !isCivilDate(range.to)) {
    throw new InvalidReportRangeError('Informe datas válidas para gerar o relatório.')
  }

  const difference = daysBetween(range.from, range.to)
  if (difference < 0) throw new InvalidReportRangeError('A data inicial deve ser anterior à data final.')
  if (difference > 366) throw new InvalidReportRangeError('O período máximo do relatório é de 12 meses.')
  return range
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function csvCell(value: string | number | null | undefined) {
  let normalized = value === null || value === undefined ? '' : String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(normalized)) normalized = `'${normalized}`
  return `"${normalized.replaceAll('"', '""')}"`
}

export function managementReportToCsv(report: ManagementReport) {
  const rows: Array<Array<string | number | null | undefined>> = [
    ['RELATÓRIO GERENCIAL'],
    ['Fazenda', report.farm.name],
    ['Localização', report.farm.location],
    ['Período', report.range.from, report.range.to],
    [],
    ['RESUMO FINANCEIRO'],
    ['Indicador', 'Valor'],
    ['Receitas', report.finance.revenues],
    ['Despesas', report.finance.expenses],
    ['Saldo', report.finance.balance],
    ['Vendas de gado', report.finance.sales],
    ['Pagamentos de equipe', report.finance.payroll],
    [],
    ['RESUMO OPERACIONAL'],
    ['Cabeças', report.operation.totalHeads],
    ['Lotes ativos', report.operation.activeLots],
    ['Itens de estoque', report.operation.inventoryItems],
    ['Itens com estoque baixo', report.operation.lowStockItems],
    ['Tarefas pendentes', report.operation.pendingTasks],
    ['Tarefas atrasadas', report.operation.overdueTasks],
    ['Alertas ativos', report.operation.activeAlerts],
    [],
    ['DESPESAS POR CATEGORIA'],
    ['Categoria', 'Valor', 'Participação (%)'],
    ...report.finance.expenseCategories.map((item) => [item.category, item.amount, item.share.toFixed(2)]),
    [],
    ['RECEITAS POR CATEGORIA'],
    ['Categoria', 'Valor', 'Participação (%)'],
    ...report.finance.revenueCategories.map((item) => [item.category, item.amount, item.share.toFixed(2)]),
    [],
    ['LANÇAMENTOS DE DESPESA'],
    ['Data', 'Categoria', 'Descrição', 'Fornecedor', 'Valor'],
    ...report.finance.expenseRows.map((item) => [item.expense_date, item.category, item.description, item.supplier_name, amount(item.amount)]),
    [],
    ['LANÇAMENTOS DE RECEITA'],
    ['Data', 'Categoria', 'Descrição', 'Valor'],
    ...report.finance.revenueRows.map((item) => [item.revenue_date, item.category, item.description, amount(item.amount)]),
  ]

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
