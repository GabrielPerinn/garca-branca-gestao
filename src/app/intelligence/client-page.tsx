'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, BrainCircuit,
  CheckCircle2, ChevronDown, CircleGauge, Clock3, Database,
  Lightbulb, RefreshCw, ShieldCheck, Sparkles, Target, XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import {
  convertInsightToPendingTask,
  generateStrategicAnalysis,
  updateStrategicInsightStatus,
} from './actions'

type Fact = { key: string; label: string; value: string; source: string; quality: string }
type Insight = {
  id: string
  category: string
  priority: string
  title: string
  finding: string
  why_it_matters: string
  recommendation: string
  estimated_impact: string | null
  evidence_json: Fact[]
  confidence: string
  horizon: string
  action_title: string | null
  status: string
  pending_action_id: string | null
}
type Report = {
  id: string
  executive_summary: string
  maturity_score: number
  maturity_label: string
  window_start: string
  window_end: string
  limitations_json: string[]
  created_at: string
  generation_mode: string
  processing_ms: number | null
  model_name: string | null
}

const categoryLabels: Record<string, string> = {
  finance: 'Financeiro', livestock: 'Rebanho', productivity: 'Produtividade',
  operations: 'Operação', inventory: 'Estoque', people: 'Pessoas',
  compliance: 'Conformidade', data_quality: 'Qualidade dos dados',
}
const horizonLabels: Record<string, string> = {
  immediate: 'Ação imediata', '30_days': 'Próximos 30 dias',
  '90_days': 'Próximos 90 dias', long_term: 'Longo prazo',
}
const priorityStyle: Record<string, string> = {
  critical: 'border-red-300 bg-red-50 text-red-900',
  high: 'border-orange-300 bg-orange-50 text-orange-900',
  medium: 'border-amber-300 bg-amber-50 text-amber-900',
  opportunity: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}
const priorityLabel: Record<string, string> = {
  critical: 'Crítico', high: 'Alta prioridade', medium: 'Acompanhar', opportunity: 'Oportunidade',
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      </div>
    </article>
  )
}

export function IntelligenceClientPage({ latestReport, insights, history, telemetry, dbError }: {
  latestReport: Report | null
  insights: Insight[]
  history: Array<{ id: string; created_at: string; maturity_score: number; maturity_label: string; generation_mode: string; processing_ms: number | null }>
  telemetry: { calls30d: number; successRate: number | null; averageLatencyMs: number | null; tokens30d: number }
  dbError?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  function runAnalysis() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await generateStrategicAnalysis()
        setFeedback({ kind: 'success', message: `Nova análise concluída com ${result.insightCount} achados fundamentados.` })
        router.refresh()
      } catch (error) {
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível gerar a análise.' })
      }
    })
  }

  async function updateStatus(id: string, status: 'open' | 'dismissed' | 'completed') {
    setBusyId(id)
    setFeedback(null)
    try {
      await updateStrategicInsightStatus(id, status)
      setFeedback({ kind: 'success', message: status === 'dismissed' ? 'Achado arquivado.' : status === 'completed' ? 'Melhoria marcada como concluída.' : 'Achado reaberto.' })
      router.refresh()
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível atualizar o achado.' })
    } finally { setBusyId(null) }
  }

  async function createTask(id: string) {
    setBusyId(id)
    setFeedback(null)
    try {
      await convertInsightToPendingTask(id)
      setFeedback({ kind: 'success', message: 'Plano de melhoria preparado. Revise e aprove em Ações para revisar.' })
      router.refresh()
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível preparar a tarefa.' })
    } finally { setBusyId(null) }
  }

  const openInsights = insights.filter(insight => insight.status === 'open')
  const criticalCount = openInsights.filter(insight => ['critical', 'high'].includes(insight.priority)).length

  return (
    <div className="app-page max-w-7xl">
      <PageHeader
        eyebrow="Inteligência estratégica"
        title="Análise integrada da fazenda"
        description="A Garça Branca cruza finanças, rebanho, produtividade, estoque, tarefas e conformidade para revelar riscos e oportunidades com evidências rastreáveis."
        action={
          <button type="button" onClick={runAnalysis} disabled={pending} className="app-button-primary">
            {pending ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="h-4 w-4" />}
            {pending ? 'Analisando toda a fazenda...' : latestReport ? 'Gerar nova análise' : 'Gerar primeira análise'}
          </button>
        }
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      {!latestReport ? (
        <section className="app-panel">
          <EmptyState icon={<BrainCircuit className="h-10 w-10" />} title="A inteligência estratégica está pronta" description="Gere a primeira leitura para cruzar todos os módulos cadastrados e criar uma linha de base da gestão." action={<button type="button" onClick={runAnalysis} disabled={pending} className="app-button-primary"><Sparkles className="h-4 w-4" /> Iniciar análise</button>} />
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores estratégicos">
            <MetricCard icon={CircleGauge} label="Maturidade da gestão" value={`${latestReport.maturity_score}/100`} hint={latestReport.maturity_label} />
            <MetricCard icon={Target} label="Achados em acompanhamento" value={String(openInsights.length)} hint={`${criticalCount} com alta prioridade`} />
            <MetricCard icon={ShieldCheck} label="Confiabilidade da IA" value={telemetry.successRate === null ? 'Iniciando' : percentage(telemetry.successRate)} hint={`${telemetry.calls30d} chamadas monitoradas em 30 dias`} />
            <MetricCard icon={Clock3} label="Latência média" value={telemetry.averageLatencyMs === null ? '—' : `${(telemetry.averageLatencyMs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`} hint="Chamadas concluídas nos últimos 30 dias" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
            <div className="border-b border-border bg-primary/[0.04] px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="app-kicker">Leitura executiva</p><h2 className="mt-1 text-lg font-bold text-foreground">O que os dados estão mostrando agora</h2></div>
                <div className="text-right text-xs text-muted-foreground"><p>{formatDateTime(latestReport.created_at)}</p><p>Janela de 90 dias · {latestReport.generation_mode === 'scheduled' ? 'análise automática' : 'análise solicitada'}</p></div>
              </div>
            </div>
            <div className="p-5 sm:p-6"><p className="max-w-5xl whitespace-pre-wrap text-[15px] leading-7 text-foreground">{latestReport.executive_summary}</p></div>
          </section>

          <section aria-labelledby="strategic-findings-title">
            <div className="mb-4 flex items-end justify-between gap-4"><div><p className="app-kicker">Achados priorizados</p><h2 id="strategic-findings-title" className="mt-1 text-xl font-bold text-foreground">Riscos e oportunidades explicados</h2></div><Link href="/pending-actions" className="text-sm font-semibold text-primary hover:underline">Ver planos para aprovar <ArrowRight className="inline h-4 w-4" /></Link></div>
            <div className="space-y-4">
              {insights.map(insight => (
                <article key={insight.id} className={`rounded-2xl border bg-card shadow-sm ${insight.status === 'dismissed' ? 'opacity-60' : 'border-border'}`}>
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityStyle[insight.priority] || priorityStyle.medium}`}>{priorityLabel[insight.priority] || insight.priority}</span>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{categoryLabels[insight.category] || insight.category}</span>
                          <span className="text-xs text-muted-foreground">{horizonLabels[insight.horizon] || insight.horizon} · confiança {insight.confidence === 'high' ? 'alta' : insight.confidence === 'medium' ? 'média' : 'limitada'}</span>
                        </div>
                        <h3 className="text-lg font-bold text-foreground">{insight.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-foreground">{insight.finding}</p>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-xl bg-muted/50 p-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Por que importa</p><p className="text-sm leading-6 text-foreground">{insight.why_it_matters}</p></div>
                          <div className="rounded-xl bg-primary/[0.05] p-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">Recomendação</p><p className="text-sm leading-6 text-foreground">{insight.recommendation}</p></div>
                        </div>
                        {insight.estimated_impact && <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> <span><strong className="text-foreground">Impacto esperado:</strong> {insight.estimated_impact}</span></p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:w-48 lg:flex-col">
                        {insight.pending_action_id ? <Link href="/pending-actions" className="app-button-primary justify-center"><CheckCircle2 className="h-4 w-4" /> Revisar plano</Link> : insight.status !== 'dismissed' && <button type="button" onClick={() => createTask(insight.id)} disabled={busyId === insight.id} className="app-button-primary justify-center"><Target className="h-4 w-4" /> Transformar em tarefa</button>}
                        {insight.status === 'open' && <button type="button" onClick={() => updateStatus(insight.id, 'completed')} disabled={busyId === insight.id} className="app-button-secondary justify-center"><CheckCircle2 className="h-4 w-4" /> Marcar resolvido</button>}
                        {insight.status === 'dismissed' ? <button type="button" onClick={() => updateStatus(insight.id, 'open')} disabled={busyId === insight.id} className="app-button-secondary justify-center"><RefreshCw className="h-4 w-4" /> Reabrir</button> : insight.status !== 'completed' && <button type="button" onClick={() => updateStatus(insight.id, 'dismissed')} disabled={busyId === insight.id} className="app-button-secondary justify-center"><XCircle className="h-4 w-4" /> Arquivar</button>}
                      </div>
                    </div>

                    <details className="mt-5 rounded-xl border border-border bg-muted/20">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground"><Database className="h-4 w-4 text-primary" /> Evidências usadas ({insight.evidence_json?.length || 0}) <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" /></summary>
                      <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {(insight.evidence_json || []).map(fact => <div key={fact.key} className="rounded-lg bg-card p-3"><p className="text-xs text-muted-foreground">{fact.label}</p><p className="mt-1 font-bold text-foreground">{fact.value}</p><p className="mt-1 text-[11px] text-muted-foreground">Fonte: {fact.source} · qualidade {fact.quality === 'high' ? 'alta' : fact.quality === 'medium' ? 'média' : 'limitada'}</p></div>)}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {latestReport.limitations_json?.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="flex items-center gap-2 font-bold text-amber-950"><AlertTriangle className="h-5 w-5" /> Limites atuais da análise</h2><ul className="mt-3 space-y-2 text-sm text-amber-900">{latestReport.limitations_json.map(item => <li key={item}>• {item}</li>)}</ul></section>}

          <section className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-foreground"><BarChart3 className="h-5 w-5 text-primary" /> Histórico de maturidade</h2><div className="mt-4 space-y-3">{history.map(report => <div key={report.id} className="flex items-center gap-4 rounded-xl bg-muted/40 px-4 py-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{report.maturity_score}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{report.maturity_label}</p><p className="text-xs text-muted-foreground">{formatDateTime(report.created_at)} · {report.generation_mode === 'scheduled' ? 'automática' : 'manual'}</p></div></div>)}</div></div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-foreground"><Activity className="h-5 w-5 text-primary" /> Observabilidade da IA</h2><dl className="mt-4 divide-y divide-border text-sm"><div className="flex justify-between py-3"><dt>Chamadas monitoradas</dt><dd className="font-bold">{telemetry.calls30d}</dd></div><div className="flex justify-between py-3"><dt>Taxa de sucesso</dt><dd className="font-bold">{telemetry.successRate === null ? 'Sem histórico' : percentage(telemetry.successRate)}</dd></div><div className="flex justify-between py-3"><dt>Tokens processados</dt><dd className="font-bold">{formatNumber(telemetry.tokens30d)}</dd></div><div className="flex justify-between py-3"><dt>Tempo da análise atual</dt><dd className="font-bold">{latestReport.processing_ms ? `${(latestReport.processing_ms / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : '—'}</dd></div></dl></div>
          </section>
        </>
      )}
    </div>
  )
}

function percentage(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
