import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  Beef,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  PackageSearch,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { OverviewChart } from '@/components/OverviewChart'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCivilDate, formatCurrency, formatNumber } from '@/lib/formatters'
import { getCivilDate, shiftCivilDate } from '@/lib/date'
import {
  defaultReportRange,
  getManagementReport,
  InvalidReportRangeError,
  parseReportRange,
  type CategoryTotal,
} from '@/lib/reports/management'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Relatórios gerenciais',
  description: 'Indicadores consolidados da operação rural por período.',
}

type ReportsPageProps = {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'green',
}: {
  label: string
  value: string
  hint: string
  icon: typeof Beef
  tone?: 'green' | 'red' | 'blue' | 'amber'
}) {
  const tones = {
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function CategoryList({ title, items, empty }: { title: string; items: CategoryTotal[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-bold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-5 rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-5 space-y-4">
          {items.slice(0, 6).map((item) => (
            <div key={item.category}>
              <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-medium text-foreground">{item.category}</span>
                <span className="shrink-0 font-semibold text-foreground">{formatCurrency(item.amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, item.share))}%` }} />
              </div>
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{formatNumber(item.share, { maximumFractionDigits: 1 })}%</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const query = await searchParams
  let rangeError: string | null = null
  let range = defaultReportRange()

  try {
    range = parseReportRange(singleValue(query.from), singleValue(query.to))
  } catch (error) {
    rangeError = error instanceof InvalidReportRangeError ? error.message : 'Não foi possível aplicar o período informado.'
  }

  const report = await getManagementReport(range)
  const today = getCivilDate()
  const last90Days = shiftCivilDate(today, -89)
  const yearStart = `${today.slice(0, 4)}-01-01`
  const exportHref = `/api/reports/management.csv?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
  const attentionCount = report.operation.lowStockItems + report.operation.overdueTasks + report.operation.activeAlerts

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Inteligência gerencial"
        title="Relatórios da operação"
        description={<>Visão consolidada de <strong>{report.farm.name}</strong> entre {formatCivilDate(range.from)} e {formatCivilDate(range.to)}.</>}
        action={
          <Link href={exportHref} prefetch={false} className="app-button-primary">
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
          </Link>
        }
      />

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="report-filter-title">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 id="report-filter-title" className="flex items-center gap-2 font-bold text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" /> Período analisado
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link href="/reports" className="rounded-full bg-muted px-3 py-1.5 font-semibold text-muted-foreground hover:text-primary">Mês atual</Link>
              <Link href={`/reports?from=${last90Days}&to=${today}`} className="rounded-full bg-muted px-3 py-1.5 font-semibold text-muted-foreground hover:text-primary">Últimos 90 dias</Link>
              <Link href={`/reports?from=${yearStart}&to=${today}`} className="rounded-full bg-muted px-3 py-1.5 font-semibold text-muted-foreground hover:text-primary">Ano atual</Link>
            </div>
          </div>
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs font-semibold text-muted-foreground">Data inicial</label>
              <input id="report-from" name="from" type="date" required defaultValue={range.from} max={range.to} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs font-semibold text-muted-foreground">Data final</label>
              <input id="report-to" name="to" type="date" required defaultValue={range.to} min={range.from} max={today} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" className="min-h-11 rounded-xl border border-primary/30 px-4 text-sm font-bold text-primary transition hover:bg-primary/5">Aplicar período</button>
          </form>
        </div>
        {rangeError && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{rangeError} Exibindo o mês atual.</p>}
      </section>

      <section aria-labelledby="financial-summary-title">
        <h2 id="financial-summary-title" className="mb-3 text-lg font-bold text-foreground">Resumo financeiro</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Receitas" value={formatCurrency(report.finance.revenues)} hint={`${report.finance.revenueCount} lançamentos`} icon={TrendingUp} />
          <MetricCard label="Despesas" value={formatCurrency(report.finance.expenses)} hint={`${report.finance.expenseCount} lançamentos`} icon={TrendingDown} tone="red" />
          <MetricCard label="Resultado" value={formatCurrency(report.finance.balance)} hint={report.finance.balance >= 0 ? 'Período com saldo positivo' : 'Despesas acima das receitas'} icon={CircleDollarSign} tone={report.finance.balance >= 0 ? 'green' : 'amber'} />
          <MetricCard label="Vendas de gado" value={formatCurrency(report.finance.sales)} hint={`Folha registrada: ${formatCurrency(report.finance.payroll)}`} icon={ReceiptText} tone="blue" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-bold text-foreground">Evolução no período</h2>
            <p className="text-sm text-muted-foreground">Receitas, despesas e saldo agrupados por mês.</p>
          </div>
          <OverviewChart data={report.finance.monthlySeries} />
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm ${attentionCount ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <div className="flex items-start gap-3">
            {attentionCount ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-800" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-800" aria-hidden="true" />}
            <div>
              <h2 className={`font-bold ${attentionCount ? 'text-amber-950' : 'text-emerald-950'}`}>Pontos de atenção</h2>
              <p className={`mt-1 text-sm ${attentionCount ? 'text-amber-800' : 'text-emerald-800'}`}>
                {attentionCount ? `${attentionCount} situações pedem acompanhamento.` : 'Nenhuma pendência crítica identificada.'}
              </p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-black/10 text-sm">
            <div className="flex justify-between gap-4 py-3"><dt>Estoque abaixo do mínimo</dt><dd className="font-bold">{report.operation.lowStockItems}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt>Tarefas atrasadas</dt><dd className="font-bold">{report.operation.overdueTasks}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt>Alertas ativos</dt><dd className="font-bold">{report.operation.activeAlerts}</dd></div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="operational-summary-title">
        <h2 id="operational-summary-title" className="mb-3 text-lg font-bold text-foreground">Resumo operacional</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Rebanho" value={`${formatNumber(report.operation.totalHeads)} cabeças`} hint={`${report.operation.activeLots} lotes ativos`} icon={Beef} />
          <MetricCard label="Média por lote" value={`${formatNumber(report.operation.averageHeadsPerLot, { maximumFractionDigits: 1 })} cabeças`} hint="Distribuição atual do rebanho" icon={Users} tone="blue" />
          <MetricCard label="Estoque" value={`${report.operation.inventoryItems} itens`} hint={`${report.operation.lowStockItems} abaixo do mínimo`} icon={PackageSearch} tone={report.operation.lowStockItems ? 'amber' : 'green'} />
          <MetricCard label="Tarefas concluídas" value={String(report.operation.completedTasks)} hint={`${report.operation.pendingTasks} ainda pendentes`} icon={CheckCircle2} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryList title="Despesas por categoria" items={report.finance.expenseCategories} empty="Nenhuma despesa registrada neste período." />
        <CategoryList title="Receitas por categoria" items={report.finance.revenueCategories} empty="Nenhuma receita registrada neste período." />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-bold text-foreground">Maiores despesas do período</h2>
          <p className="text-sm text-muted-foreground">Lançamentos com maior impacto no resultado.</p>
        </div>
        {report.finance.largestExpenses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma despesa para exibir.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[680px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3 text-right">Valor</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.finance.largestExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatCivilDate(expense.expense_date)}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{expense.description || 'Sem descrição'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{expense.category || 'Sem categoria'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-foreground">{formatCurrency(expense.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
