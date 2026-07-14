'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Beef,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  PackageOpen,
  Plus,
  Scale,
  WalletCards,
} from 'lucide-react'
import { OverviewChart } from '@/components/OverviewChart'
import { formatCivilDate } from '@/lib/date'

export type MonthlyPoint = {
  month: string
  receita: number
  despesa: number
  saldo: number
}

type DashboardTask = {
  id: string
  title: string
  dueDate: string | null
  priority: string
  overdue: boolean
}

type DashboardAlert = {
  id: string
  title: string
  type: string
  message: string | null
  dueDate: string | null
  status: string
}

type LowStockItem = {
  id: string
  name: string
  unit: string | null
  currentQuantity: number
  minimumQuantity: number
}

export type DashboardData = {
  farmName: string
  farmLocation: string | null
  foundationComplete: boolean
  canManageFoundation: boolean
  referenceDate: string
  monthExpenses: number
  monthRevenues: number
  previousMonthExpenses: number
  previousMonthRevenues: number
  totalHeads: number
  monthSales: number
  pendingActionsCount: number
  pendingTasksCount: number
  overdueTasksCount: number
  tasks: DashboardTask[]
  activeAlerts: DashboardAlert[]
  activeAlertsCount: number
  lowStockItems: LowStockItem[]
  monthlySeries: MonthlyPoint[]
  hasDataError: boolean
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
})

const priorityLabels: Record<string, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

function Trend({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sem base de comparação</span>

  const improved = inverse ? value <= 0 : value >= 0
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${improved ? 'text-emerald-700' : 'text-red-700'}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre o mês anterior
    </span>
  )
}

function Metric({
  label,
  value,
  detail,
  href,
  tone = 'green',
}: {
  label: string
  value: string
  detail: React.ReactNode
  href: string
  tone?: 'green' | 'blue' | 'amber' | 'red'
}) {
  const border = {
    green: 'border-t-primary',
    blue: 'border-t-blue-600',
    amber: 'border-t-amber-600',
    red: 'border-t-red-600',
  }[tone]

  return (
    <Link href={href} className={`group rounded-xl border border-border border-t-2 ${border} bg-card p-5 shadow-sm outline-none transition hover:border-x-primary/25 hover:border-b-primary/25 focus-visible:ring-2 focus-visible:ring-primary`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p data-numeric className="mt-2 truncate text-[1.7rem] font-semibold tracking-[-0.035em] text-foreground">{value}</p>
      <div className="mt-3 min-h-5">{detail}</div>
    </Link>
  )
}

function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
      <div>
        <p className="app-kicker">{eyebrow}</p>
        <h2 className="mt-0.5 text-base font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="group flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/35 hover:bg-muted/30">
      <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
      <span>{label}</span>
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  )
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const netIncome = data.monthRevenues - data.monthExpenses
  const previousNetIncome = data.previousMonthRevenues - data.previousMonthExpenses
  const issueCount = data.activeAlertsCount + data.lowStockItems.length + data.overdueTasksCount
  const financeChange = changePercent(netIncome, previousNetIncome)
  const expenseChange = changePercent(data.monthExpenses, data.previousMonthExpenses)

  return (
    <div className="app-page">
      <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="app-kicker">{data.farmName}</p>
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[2.35rem]">Painel de gestão</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{data.referenceDate}</span>
            {data.farmLocation && <span className="before:mr-4 before:text-border before:content-['/']">{data.farmLocation}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/ai-chat" className="app-button-secondary">
            <Bot className="h-4 w-4" aria-hidden="true" /> Falar com a Garça Branca
          </Link>
          <Link href="/finance" className="app-button-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo lançamento
          </Link>
        </div>
      </header>

      {data.hasDataError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><strong>Atualização parcial.</strong> Alguns indicadores não responderam; os dados disponíveis continuam abaixo.</div>
        </div>
      )}

      {!data.foundationComplete && data.canManageFoundation && (
        <section className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/[0.045] px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-labelledby="foundation-title">
          <div>
            <p className="app-kicker">Implantação inicial</p>
            <h2 id="foundation-title" className="mt-1 text-base font-semibold text-foreground">Complete a base da fazenda antes dos lançamentos</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Cadastre os dados legais e operacionais, áreas, pastos, saldo inicial do rebanho, equipe e estoque. Essa base alimenta relatórios, controles e o contexto seguro da IA.</p>
          </div>
          <Link href="/setup" className="app-button-primary shrink-0">
            Configurar base <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      {(issueCount > 0 || data.pendingActionsCount > 0) && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Resumo de pendências">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800"><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>
            <p className="text-sm text-foreground"><strong>{issueCount + data.pendingActionsCount} itens</strong> exigem revisão ou acompanhamento.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
            <Link href="/pending-actions" className="hover:text-primary">{data.pendingActionsCount} para revisar</Link>
            <Link href="/tasks" className="hover:text-primary">{data.overdueTasksCount} tarefas atrasadas</Link>
            <Link href="/alerts" className="hover:text-primary">{data.activeAlertsCount} alertas</Link>
          </div>
        </section>
      )}

      <section aria-labelledby="dashboard-metrics">
        <h2 id="dashboard-metrics" className="sr-only">Indicadores principais</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Rebanho atual" value={`${data.totalHeads.toLocaleString('pt-BR')} cabeças`} detail={<span className="text-xs text-muted-foreground">Total nos lotes ativos</span>} href="/cattle" />
          <Metric label="Resultado do mês" value={formatCurrency(netIncome)} detail={<Trend value={financeChange} />} href="/finance" tone={netIncome >= 0 ? 'green' : 'red'} />
          <Metric label="Vendas no mês" value={formatCurrency(data.monthSales)} detail={<span className="text-xs text-muted-foreground">Negociações registradas</span>} href="/sales" tone="blue" />
          <Metric label="Ações para revisar" value={String(data.pendingActionsCount)} detail={<span className={`text-xs font-medium ${data.pendingActionsCount ? 'text-amber-700' : 'text-emerald-700'}`}>{data.pendingActionsCount ? 'Aguardando confirmação' : 'Nenhuma pendência'}</span>} href="/pending-actions" tone={data.pendingActionsCount ? 'amber' : 'green'} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
        <section className="app-panel overflow-hidden" aria-labelledby="cash-flow-title">
          <PanelTitle eyebrow="Financeiro" title="Fluxo dos últimos seis meses" action={<Link href="/reports" className="text-xs font-semibold text-primary hover:underline">Abrir relatório</Link>} />
          <div className="p-5 sm:p-6">
            <OverviewChart data={data.monthlySeries} />
            <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Receitas no mês</dt><dd data-numeric className="mt-1 text-sm font-semibold text-emerald-700">{formatCurrency(data.monthRevenues)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Despesas no mês</dt><dd data-numeric className="mt-1 text-sm font-semibold text-red-700">{formatCurrency(data.monthExpenses)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Variação das despesas</dt><dd className="mt-1"><Trend value={expenseChange} inverse /></dd></div>
            </dl>
          </div>
        </section>

        <section className="app-panel overflow-hidden" aria-labelledby="operation-title">
          <PanelTitle eyebrow="Operação" title="Situação atual" />
          <dl className="divide-y divide-border px-5 sm:px-6">
            {[
              ['Tarefas pendentes', data.pendingTasksCount, '/tasks'],
              ['Tarefas atrasadas', data.overdueTasksCount, '/tasks'],
              ['Alertas ativos', data.activeAlertsCount, '/alerts'],
              ['Itens com estoque baixo', data.lowStockItems.length, '/inventory'],
            ].map(([label, value, href]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 py-4">
                <dt><Link href={String(href)} className="text-sm text-muted-foreground hover:text-primary">{label}</Link></dt>
                <dd data-numeric className={`text-sm font-semibold ${Number(value) > 0 && (label === 'Tarefas atrasadas' || label === 'Itens com estoque baixo') ? 'text-red-700' : 'text-foreground'}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-border bg-muted/35 px-5 py-4 sm:px-6">
            <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Ver análise consolidada <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="app-panel overflow-hidden" aria-labelledby="tasks-title">
          <PanelTitle eyebrow="Agenda" title="Próximas tarefas" action={<span className="text-xs font-medium text-muted-foreground">{data.pendingTasksCount} pendentes</span>} />
          {data.tasks.length === 0 ? (
            <div className="px-6 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">Agenda em dia</p><p className="mt-1 text-xs text-muted-foreground">Nenhuma tarefa pendente.</p></div>
          ) : (
            <div className="divide-y divide-border">
              {data.tasks.map((task) => (
                <Link key={task.id} href="/tasks" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/35 sm:px-6">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${task.overdue ? 'bg-red-600' : task.priority === 'high' ? 'bg-amber-600' : 'bg-primary'}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{task.title}</p><p className={`mt-0.5 text-xs ${task.overdue ? 'font-medium text-red-700' : 'text-muted-foreground'}`}>{task.dueDate ? `${task.overdue ? 'Atrasada · ' : ''}${formatCivilDate(task.dueDate)}` : 'Sem prazo'} · {priorityLabels[task.priority] || task.priority}</p></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="app-panel overflow-hidden" aria-labelledby="risks-title">
          <PanelTitle eyebrow="Controle" title="Riscos e alertas" action={<span className="text-xs font-medium text-muted-foreground">{issueCount} ocorrências</span>} />
          <div className="divide-y divide-border">
            {data.lowStockItems.slice(0, 3).map((item) => (
              <Link key={item.id} href="/inventory" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/35 sm:px-6">
                <PackageOpen className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.currentQuantity.toLocaleString('pt-BR')} {item.unit || ''} em estoque · mínimo {item.minimumQuantity.toLocaleString('pt-BR')}</p></div>
              </Link>
            ))}
            {data.activeAlerts.slice(0, 3).map((alert) => (
              <Link key={alert.id} href="/alerts" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/35 sm:px-6">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{alert.title}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{alert.message || alert.type}</p></div>
              </Link>
            ))}
            {issueCount === 0 && <div className="px-6 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">Nenhum risco crítico</p><p className="mt-1 text-xs text-muted-foreground">Os controles monitorados estão dentro do esperado.</p></div>}
          </div>
        </section>
      </div>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-3 flex items-center justify-between"><h2 id="quick-actions-title" className="text-sm font-semibold text-foreground">Acessos frequentes</h2><span className="text-xs text-muted-foreground">Rotina operacional</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink href="/finance" label="Financeiro" icon={WalletCards} />
          <QuickLink href="/cattle" label="Gestão do rebanho" icon={Beef} />
          <QuickLink href="/tasks" label="Planejamento de tarefas" icon={ClipboardList} />
          <QuickLink href="/weighings" label="Pesagens" icon={Scale} />
        </div>
      </section>
    </div>
  )
}
