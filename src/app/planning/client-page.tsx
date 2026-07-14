'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock3,
  DollarSign,
  Loader2,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { FormField, fieldClassName } from '@/components/ui/FormField'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCivilDate, formatCurrency, formatDateTime, formatNumber } from '@/lib/formatters'
import {
  currentGoalMetricValue,
  defaultPlanningAssumptions,
  goalProgressPercent,
  simulatePlanningScenario,
  type PlanningAssumptions,
  type PlanningBaseline,
  type PlanningSimulationResult,
} from '@/lib/planning/simulator'
import { createFarmGoal, savePlanningScenario, updateFarmGoalStatus, updatePlanningScenarioStatus } from './actions'

type TemplateType = 'custom' | 'herd_growth' | 'cost_reduction' | 'market_stress' | 'capacity_investment'

interface ScenarioRecord {
  id: string
  name: string
  template_type: TemplateType
  assumptions_json: PlanningAssumptions
  result_json: PlanningSimulationResult
  confidence_score: number
  status: 'draft' | 'approved' | 'archived'
  created_at: string
}

interface GoalRecord {
  id: string
  title: string
  metric: string
  target_value: number | string
  unit: string
  target_date: string
  baseline_value: number | string
  status: 'active' | 'completed' | 'paused' | 'cancelled'
}

const templates: Array<{ type: TemplateType; label: string; description: string; assumptions: PlanningAssumptions }> = [
  { type: 'custom', label: 'Personalizado', description: 'Comece com a linha de base e ajuste cada premissa.', assumptions: defaultPlanningAssumptions },
  { type: 'herd_growth', label: 'Expandir rebanho', description: '+50 cabeças com custos de aquisição e manutenção.', assumptions: { ...defaultPlanningAssumptions, herdDelta: 50, purchasePricePerHead: 3_500, monthlyCostPerHead: 80 } },
  { type: 'cost_reduction', label: 'Reduzir custos', description: 'Simule uma redução de 10% nas despesas mensais.', assumptions: { ...defaultPlanningAssumptions, monthlyExpenseChangePercent: -10 } },
  { type: 'market_stress', label: 'Estresse de mercado', description: 'Receita 15% menor e despesas 10% maiores.', assumptions: { ...defaultPlanningAssumptions, monthlyRevenueChangePercent: -15, monthlyExpenseChangePercent: 10 } },
  { type: 'capacity_investment', label: 'Investir em capacidade', description: '+100 cabeças de capacidade com aporte inicial.', assumptions: { ...defaultPlanningAssumptions, capacityExpansion: 100, upfrontInvestment: 50_000 } },
]

const metricOptions = [
  { value: 'monthly_result', label: 'Resultado mensal' },
  { value: 'monthly_revenue', label: 'Receita mensal' },
  { value: 'monthly_expenses', label: 'Despesa mensal' },
  { value: 'herd_size', label: 'Tamanho do rebanho' },
  { value: 'stocking_rate', label: 'Ocupação dos pastos' },
]

const metricLabels = Object.fromEntries(metricOptions.map(option => [option.value, option.label]))
const classificationConfig = {
  viable: { label: 'Viável nas premissas', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  attention: { label: 'Exige atenção', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  high_risk: { label: 'Risco elevado', classes: 'border-red-200 bg-red-50 text-red-800' },
}
const scenarioStatusLabels = { draft: 'Rascunho', approved: 'Aprovado', archived: 'Arquivado' }
const goalStatusLabels = { active: 'Ativa', completed: 'Concluída', paused: 'Pausada', cancelled: 'Cancelada' }

function nextYear(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1)
  return parsed.toISOString().slice(0, 10)
}

function goalValue(metric: string, value: number) {
  if (metric === 'herd_size') return `${formatNumber(value)} cabeças`
  if (metric === 'stocking_rate') return `${formatNumber(value, { maximumFractionDigits: 1 })}%`
  return formatCurrency(value)
}

export function PlanningClientPage({ baseline, scenarios, goals }: {
  baseline: PlanningBaseline | null
  scenarios: ScenarioRecord[]
  goals: GoalRecord[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [templateType, setTemplateType] = useState<TemplateType>('custom')
  const [scenarioName, setScenarioName] = useState('Cenário personalizado')
  const [linkedGoalId, setLinkedGoalId] = useState('')
  const [assumptions, setAssumptions] = useState<PlanningAssumptions>(defaultPlanningAssumptions)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalMetric, setGoalMetric] = useState('monthly_result')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState(baseline ? nextYear(baseline.today) : '')
  const result = useMemo(() => baseline ? simulatePlanningScenario(baseline, assumptions) : null, [baseline, assumptions])

  function execute(action: () => Promise<unknown>, success: string, id: string) {
    setBusyId(id)
    setFeedback(null)
    startTransition(async () => {
      try {
        await action()
        setFeedback({ kind: 'success', message: success })
        router.refresh()
      } catch (error) {
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' })
      } finally {
        setBusyId(null)
      }
    })
  }

  function chooseTemplate(type: TemplateType) {
    const template = templates.find(item => item.type === type) ?? templates[0]
    setTemplateType(type)
    setAssumptions({ ...template.assumptions })
    setScenarioName(type === 'custom' ? 'Cenário personalizado' : template.label)
  }

  function setNumber(field: keyof PlanningAssumptions, value: string) {
    setAssumptions(current => ({ ...current, [field]: value === '' ? 0 : Number(value) }))
  }

  if (!baseline) return (
    <div className="app-page max-w-5xl">
      <PageHeader eyebrow="Laboratório de decisões" title="O planejamento precisa de uma linha de base" description="Cadastre a propriedade, o rebanho, a capacidade dos pastos e os primeiros movimentos financeiros. O simulador nunca preenche dados ausentes por conta própria." />
      <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Calculator className="mx-auto h-12 w-12 text-primary" />
        <h2 className="mt-4 text-xl font-bold">Configure os dados iniciais da fazenda</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Depois disso, o sistema cria uma fotografia verificável da operação para comparar cenários e acompanhar metas.</p>
        <Link href="/setup" className="app-button-primary mt-5"><Settings2 className="h-4 w-4" /> Configurar base</Link>
      </section>
    </div>
  )

  const tone = result ? classificationConfig[result.classification] : classificationConfig.attention
  return (
    <div className="app-page max-w-7xl">
      <PageHeader eyebrow="Laboratório de decisões" title="Planeje antes de comprometer recursos" description={<>Compare cenários para <strong>{baseline.farmName}</strong> com dados observados, premissas explícitas e rastreabilidade completa no Garça Twin.</>} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Linha de base da fazenda">
        <MetricCard label="Resultado mensal médio" value={formatCurrency(baseline.monthlyResult)} detail="Receitas menos despesas em 90 dias" icon={TrendingUp} />
        <MetricCard label="Receita mensal média" value={formatCurrency(baseline.monthlyRevenue)} detail={`${baseline.coverage.revenueRecords} lançamentos analisados`} icon={DollarSign} />
        <MetricCard label="Despesa mensal média" value={formatCurrency(baseline.monthlyExpenses)} detail={`${baseline.coverage.expenseRecords} lançamentos analisados`} icon={Activity} />
        <MetricCard label="Rebanho atual" value={`${formatNumber(baseline.herdSize)} cabeças`} detail={`${formatNumber(baseline.pastureCapacity)} de capacidade informada`} icon={Users} />
        <MetricCard label="Confiança da base" value={`${baseline.dataConfidence}%`} detail={`Fotografia de ${formatDateTime(baseline.snapshotAt)}`} icon={ShieldCheck} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <p className="app-kicker">Premissas controladas</p>
            <h2 className="mt-1 text-xl font-bold">Construa o cenário</h2>
            <p className="mt-1 text-sm text-muted-foreground">Os dados abaixo alteram somente a simulação. Nenhum cadastro operacional é modificado.</p>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Modelos de cenário">
              {templates.map(template => <button key={template.type} type="button" aria-pressed={templateType === template.type} onClick={() => chooseTemplate(template.type)} className={`rounded-xl border p-3 text-left transition-colors ${templateType === template.type ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/40'}`}><span className="block text-sm font-bold">{template.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{template.description}</span></button>)}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField htmlFor="horizon" label="Horizonte" hint="De 1 a 60 meses."><input id="horizon" className={fieldClassName} type="number" min="1" max="60" value={assumptions.horizonMonths} onChange={event => setNumber('horizonMonths', event.target.value)} /></FormField>
              <FormField htmlFor="herd-delta" label="Variação do rebanho" hint="Use negativo para venda/redução."><input id="herd-delta" className={fieldClassName} type="number" value={assumptions.herdDelta} onChange={event => setNumber('herdDelta', event.target.value)} /></FormField>
              <FormField htmlFor="capacity" label="Expansão da capacidade" hint="Em cabeças."><input id="capacity" className={fieldClassName} type="number" min="0" value={assumptions.capacityExpansion} onChange={event => setNumber('capacityExpansion', event.target.value)} /></FormField>
              <FormField htmlFor="purchase-price" label="Compra por cabeça"><input id="purchase-price" className={fieldClassName} type="number" min="0" step="0.01" value={assumptions.purchasePricePerHead} onChange={event => setNumber('purchasePricePerHead', event.target.value)} /></FormField>
              <FormField htmlFor="sale-price" label="Venda por cabeça"><input id="sale-price" className={fieldClassName} type="number" min="0" step="0.01" value={assumptions.salePricePerHead} onChange={event => setNumber('salePricePerHead', event.target.value)} /></FormField>
              <FormField htmlFor="monthly-cost" label="Custo mensal por cabeça"><input id="monthly-cost" className={fieldClassName} type="number" min="0" step="0.01" value={assumptions.monthlyCostPerHead} onChange={event => setNumber('monthlyCostPerHead', event.target.value)} /></FormField>
              <FormField htmlFor="revenue-change" label="Variação da receita" hint="Percentual mensal."><div className="relative"><input id="revenue-change" className={`${fieldClassName} pr-9`} type="number" min="-100" max="500" step="0.1" value={assumptions.monthlyRevenueChangePercent} onChange={event => setNumber('monthlyRevenueChangePercent', event.target.value)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div></FormField>
              <FormField htmlFor="expense-change" label="Variação da despesa" hint="Percentual mensal."><div className="relative"><input id="expense-change" className={`${fieldClassName} pr-9`} type="number" min="-100" max="500" step="0.1" value={assumptions.monthlyExpenseChangePercent} onChange={event => setNumber('monthlyExpenseChangePercent', event.target.value)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div></FormField>
              <FormField htmlFor="investment" label="Investimento inicial"><input id="investment" className={fieldClassName} type="number" min="0" step="0.01" value={assumptions.upfrontInvestment} onChange={event => setNumber('upfrontInvestment', event.target.value)} /></FormField>
            </div>
          </div>
        </div>

        {result && <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="app-kicker">Resultado calculado</p><h2 className="mt-1 text-xl font-bold">Impacto do cenário</h2></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone.classes}`}>{tone.label}</span></div>
          <div className="mt-5 rounded-xl bg-muted/40 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Impacto de caixa no horizonte</p><p className={`mt-1 text-3xl font-bold ${result.netCashImpact >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(result.netCashImpact)}</p><p className="mt-1 text-xs text-muted-foreground">Após operação, compra/venda e investimento inicial.</p></div>
          <dl className="mt-5 divide-y divide-border text-sm">
            <ResultRow label="Resultado mensal atual" value={formatCurrency(baseline.monthlyResult)} />
            <ResultRow label="Resultado mensal simulado" value={formatCurrency(result.projectedMonthlyResult)} />
            <ResultRow label="Resultado operacional no período" value={formatCurrency(result.scenarioHorizonResult)} />
            <ResultRow label="Rebanho simulado" value={`${formatNumber(result.projectedHerdSize)} cabeças`} />
            <ResultRow label="Ocupação simulada" value={result.projectedOccupancyRate === null ? 'Capacidade não informada' : `${formatNumber(result.projectedOccupancyRate, { maximumFractionDigits: 1 })}%`} />
            <ResultRow label="Payback estimado" value={result.paybackMonths === null ? 'Não calculável' : `${formatNumber(result.paybackMonths, { maximumFractionDigits: 1 })} meses`} />
            <ResultRow label="Confiança dos dados" value={`${result.confidenceScore}%`} />
          </dl>
          {result.warnings.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertTriangle className="h-4 w-4" /> Pontos de atenção</h3><ul className="mt-2 space-y-2 text-xs leading-5 text-amber-900">{result.warnings.map(warning => <li key={warning}>• {warning}</li>)}</ul></div>}
          <div className="mt-5 border-t border-border pt-5">
            <FormField htmlFor="scenario-name" label="Nome do cenário" required><input id="scenario-name" className={fieldClassName} value={scenarioName} maxLength={160} onChange={event => setScenarioName(event.target.value)} /></FormField>
            <FormField htmlFor="scenario-goal" label="Vincular a uma meta" className="mt-3"><select id="scenario-goal" className={fieldClassName} value={linkedGoalId} onChange={event => setLinkedGoalId(event.target.value)}><option value="">Nenhuma meta</option>{goals.filter(goal => goal.status === 'active').map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></FormField>
            <button type="button" disabled={isPending || scenarioName.trim().length < 3} onClick={() => execute(() => savePlanningScenario({ name: scenarioName, templateType, linkedGoalId: linkedGoalId || null, assumptions }), 'Cenário salvo com uma nova fotografia da base.', 'save-scenario')} className="app-button-primary mt-4 w-full"><>{busyId === 'save-scenario' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busyId === 'save-scenario' ? 'Salvando...' : 'Salvar cenário'}</></button>
          </div>
        </aside>}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5"><p className="app-kicker">Governança da decisão</p><h2 className="mt-1 text-xl font-bold">Cenários salvos</h2></div>
          {scenarios.length === 0 ? <div className="p-8 text-center"><Calculator className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum cenário salvo</p><p className="mt-1 text-sm text-muted-foreground">Ajuste as premissas acima e salve a primeira alternativa.</p></div> : <div className="divide-y divide-border">{scenarios.slice(0, 12).map(scenario => {
            const scenarioResult = scenario.result_json
            const scenarioTone = classificationConfig[scenarioResult.classification] ?? classificationConfig.attention
            return <article key={scenario.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{scenario.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${scenarioTone.classes}`}>{scenarioTone.label}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(scenario.created_at)} · {scenario.assumptions_json.horizonMonths} meses · confiança {scenario.confidence_score}%</p></div><span className="text-xs font-semibold text-muted-foreground">{scenarioStatusLabels[scenario.status]}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><SmallResult label="Impacto de caixa" value={formatCurrency(scenarioResult.netCashImpact)} /><SmallResult label="Resultado mensal" value={formatCurrency(scenarioResult.projectedMonthlyResult)} /><SmallResult label="Rebanho" value={`${formatNumber(scenarioResult.projectedHerdSize)} cabeças`} /></div><div className="mt-4 flex flex-wrap gap-2">{scenario.status === 'draft' && <button type="button" disabled={isPending} onClick={() => execute(() => updatePlanningScenarioStatus(scenario.id, 'approved'), 'Cenário aprovado e preservado no histórico.', `scenario-${scenario.id}`)} className="app-button-secondary"><CheckCircle2 className="h-4 w-4" /> Aprovar</button>}{scenario.status !== 'archived' ? <button type="button" disabled={isPending} onClick={() => execute(() => updatePlanningScenarioStatus(scenario.id, 'archived'), 'Cenário arquivado.', `scenario-${scenario.id}`)} className="min-h-10 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">Arquivar</button> : <button type="button" disabled={isPending} onClick={() => execute(() => updatePlanningScenarioStatus(scenario.id, 'draft'), 'Cenário restaurado como rascunho.', `scenario-${scenario.id}`)} className="app-button-secondary">Restaurar</button>}</div></article>
          })}</div>}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="app-kicker">Metas gerenciais</p><h2 className="mt-1 flex items-center gap-2 text-xl font-bold"><Target className="h-5 w-5 text-primary" /> Novo objetivo</h2>
          <div className="mt-5 space-y-4">
            <FormField htmlFor="goal-title" label="Nome da meta" required><input id="goal-title" className={fieldClassName} value={goalTitle} maxLength={160} placeholder="Ex.: Atingir resultado mensal positivo" onChange={event => setGoalTitle(event.target.value)} /></FormField>
            <FormField htmlFor="goal-metric" label="Indicador"><select id="goal-metric" className={fieldClassName} value={goalMetric} onChange={event => setGoalMetric(event.target.value)}>{metricOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FormField>
            <FormField htmlFor="goal-target" label="Valor-alvo" required><input id="goal-target" className={fieldClassName} type="number" step="0.01" value={goalTarget} onChange={event => setGoalTarget(event.target.value)} /></FormField>
            <FormField htmlFor="goal-date" label="Data-alvo" required><input id="goal-date" className={fieldClassName} type="date" min={baseline.today} value={goalDate} onChange={event => setGoalDate(event.target.value)} /></FormField>
            <button type="button" disabled={isPending || !goalTitle.trim() || goalTarget === '' || !goalDate} onClick={() => execute(() => createFarmGoal({ title: goalTitle, metric: goalMetric, targetValue: goalTarget, targetDate: goalDate }), 'Meta criada a partir da linha de base atual.', 'create-goal')} className="app-button-primary w-full"><>{busyId === 'create-goal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{busyId === 'create-goal' ? 'Criando...' : 'Criar meta'}</></button>
          </div>
        </aside>
      </section>

      <section aria-labelledby="active-goals-title">
        <div className="mb-4"><p className="app-kicker">Execução estratégica</p><h2 id="active-goals-title" className="mt-1 text-xl font-bold">Acompanhamento de metas</h2></div>
        {goals.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Crie uma meta mensurável para acompanhar a evolução contra a base atual.</div> : <div className="grid gap-4 lg:grid-cols-2">{goals.map(goal => {
          const base = Number(goal.baseline_value)
          const target = Number(goal.target_value)
          const current = currentGoalMetricValue(goal.metric, baseline)
          const progress = goalProgressPercent(base, target, current)
          return <article key={goal.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-primary">{metricLabels[goal.metric] ?? goal.metric}</p><h3 className="mt-1 font-bold">{goal.title}</h3></div><span className="text-xs font-semibold text-muted-foreground">{goalStatusLabels[goal.status]}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Atual</p><p className="font-bold">{goalValue(goal.metric, current)}</p></div><ArrowRight className="mb-1 h-4 w-4 text-muted-foreground" /><div className="text-right"><p className="text-xs text-muted-foreground">Meta até {formatCivilDate(goal.target_date)}</p><p className="font-bold">{goalValue(goal.metric, target)}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"><span className="mr-auto text-xs text-muted-foreground">{formatNumber(progress, { maximumFractionDigits: 0 })}% do caminho desde {goalValue(goal.metric, base)}</span>{goal.status === 'active' && <><button type="button" disabled={isPending} onClick={() => execute(() => updateFarmGoalStatus(goal.id, 'completed'), 'Meta marcada como concluída.', `goal-${goal.id}`)} className="text-xs font-semibold text-primary hover:underline">Concluir</button><button type="button" disabled={isPending} onClick={() => execute(() => updateFarmGoalStatus(goal.id, 'paused'), 'Meta pausada.', `goal-${goal.id}`)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Pausar</button></>}{goal.status === 'paused' && <button type="button" disabled={isPending} onClick={() => execute(() => updateFarmGoalStatus(goal.id, 'active'), 'Meta reativada.', `goal-${goal.id}`)} className="text-xs font-semibold text-primary hover:underline">Reativar</button>}</div></article>
        })}</div>}
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-bold">Como interpretar este laboratório</h2><p className="mt-1 text-sm leading-6">Os resultados são simulações determinísticas, não previsões garantidas. Cada cenário preserva a fotografia dos dados usada no cálculo; por isso ele pode ser reproduzido e auditado mesmo quando a fazenda mudar depois.</p></div></div></section>
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></article>
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>
}

function SmallResult({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>
}
