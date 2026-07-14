'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Bot, CheckCircle2, Clock3, ListChecks, Loader2, Play, Settings2, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import { convertAutopilotFindingToTask, runAutopilotNow, setAutopilotEnabled, setAutopilotRuleEnabled, updateAutopilotFindingStatus } from './actions'

const severityConfig: Record<string, { label: string; classes: string }> = {
  critical: { label: 'Crítico', classes: 'border-red-200 bg-red-50 text-red-800' },
  high: { label: 'Alto', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  medium: { label: 'Médio', classes: 'border-blue-200 bg-blue-50 text-blue-800' },
  low: { label: 'Baixo', classes: 'border-slate-200 bg-slate-50 text-slate-700' },
}
const categoryLabels: Record<string, string> = { tasks: 'Tarefas', inventory: 'Estoque', livestock: 'Pecuária', compliance: 'Conformidade', finance: 'Financeiro', operations: 'Operação' }
const statusLabels: Record<string, string> = { open: 'Aberto', acknowledged: 'Em acompanhamento', resolved: 'Resolvido automaticamente', dismissed: 'Descartado', completed: 'Concluída', failed: 'Falhou', running: 'Em execução', skipped: 'Ignorada' }

export function AutopilotClientPage({ farm, settings, rules, findings, runs, canConfigure }: {
  farm: { id: string; name: string } | null
  settings: Record<string, unknown> | null
  rules: Array<Record<string, unknown>>
  findings: Array<Record<string, unknown>>
  runs: Array<Record<string, unknown>>
  canConfigure: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const openFindings = findings.filter(finding => finding.status === 'open' || finding.status === 'acknowledged')
  const criticalCount = openFindings.filter(finding => finding.severity === 'critical').length
  const activeRules = rules.filter(rule => rule.enabled).length
  const lastRun = runs[0]

  function execute(action: () => Promise<unknown>, success: string, id = 'global') {
    setBusyId(id)
    setFeedback(null)
    startTransition(async () => {
      try { await action(); setFeedback({ kind: 'success', message: success }); router.refresh() }
      catch (error) { setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' }) }
      finally { setBusyId(null) }
    })
  }

  if (!farm) return (
    <div className="app-page max-w-5xl">
      <PageHeader eyebrow="Autopiloto operacional" title="A fazenda ainda não possui uma base operacional" description="O Autopiloto precisa da propriedade e dos dados iniciais para avaliar riscos reais sem inventar informações." />
      <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm"><Bot className="mx-auto h-12 w-12 text-primary" /><h2 className="mt-4 text-xl font-bold">Configure a base da fazenda</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Depois da implantação inicial, as regras serão criadas automaticamente e o monitoramento poderá começar.</p><Link href="/setup" className="app-button-primary mt-5"><Settings2 className="h-4 w-4" /> Configurar base</Link></section>
    </div>
  )

  return (
    <div className="app-page max-w-7xl">
      <PageHeader eyebrow="Autopiloto operacional" title="Supervisão contínua da fazenda" description={<>O sistema verifica <strong>{farm.name}</strong> com regras determinísticas, explica cada risco e só prepara ações para aprovação humana.</>} action={<button type="button" disabled={isPending} onClick={() => execute(runAutopilotNow, 'Verificação concluída.', 'run')} className="app-button-primary"><>{busyId === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{busyId === 'run' ? 'Verificando...' : 'Verificar agora'}</></button>} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do Autopiloto">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">Situação</p><p className="mt-2 flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-primary" />{settings?.enabled !== false ? 'Monitorando' : 'Pausado'}</p>{canConfigure && <button type="button" disabled={isPending} onClick={() => execute(() => setAutopilotEnabled(settings?.enabled === false), settings?.enabled === false ? 'Autopiloto ativado.' : 'Autopiloto pausado.', 'settings')} className="mt-3 text-xs font-semibold text-primary hover:underline">{settings?.enabled === false ? 'Ativar monitoramento' : 'Pausar monitoramento'}</button>}</article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">Achados ativos</p><p className="mt-2 text-2xl font-bold">{formatNumber(openFindings.length)}</p><p className="mt-1 text-xs text-muted-foreground">{criticalCount} crítico{criticalCount === 1 ? '' : 's'}</p></article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">Regras habilitadas</p><p className="mt-2 text-2xl font-bold">{activeRules}/{rules.length}</p><p className="mt-1 text-xs text-muted-foreground">Todas explicáveis e configuráveis</p></article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">Última execução</p><p className="mt-2 text-lg font-bold">{lastRun ? statusLabels[String(lastRun.status)] || String(lastRun.status) : 'Ainda não executado'}</p><p className="mt-1 text-xs text-muted-foreground">{lastRun ? formatDateTime(String(lastRun.started_at)) : 'Aguardando a primeira verificação'}</p></article>
      </section>

      <section aria-labelledby="autopilot-findings-title">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="app-kicker">Prioridade operacional</p><h2 id="autopilot-findings-title" className="mt-1 text-xl font-bold">O que precisa de atenção</h2></div><span className="text-xs text-muted-foreground">Nunca executa mudanças críticas sozinho</span></div>
        {openFindings.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" /><div><h3 className="font-bold text-emerald-950">Nenhum risco ativo detectado</h3><p className="mt-1 text-sm leading-6 text-emerald-900">Execute uma verificação sempre que houver alterações relevantes ou aguarde a rotina diária.</p></div></div></div> : <div className="grid gap-4 lg:grid-cols-2">{openFindings.map(finding => { const id = String(finding.id); const title = String(finding.title); const tone = severityConfig[String(finding.severity)] || severityConfig.medium; return <article key={id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${tone.classes}`}>{tone.label}</span><span className="text-xs text-muted-foreground">{categoryLabels[String(finding.category)] || String(finding.category)}</span><span className="ml-auto text-xs text-muted-foreground">{statusLabels[String(finding.status)]}</span></div><h3 className="mt-3 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(finding.summary)}</p><div className="mt-4 rounded-xl bg-muted/40 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recomendação</p><p className="mt-1 text-sm leading-6">{String(finding.recommended_action)}</p></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" aria-label={`Preparar tarefa para ${title}`} disabled={isPending} onClick={() => execute(() => convertAutopilotFindingToTask(id), 'Tarefa preparada para aprovação.', `task-${id}`)} className="app-button-primary"><ListChecks className="h-4 w-4" />{busyId === `task-${id}` ? 'Preparando...' : 'Preparar tarefa'}</button><button type="button" aria-label={`${finding.status === 'acknowledged' ? 'Reabrir' : 'Acompanhar'} ${title}`} disabled={isPending} onClick={() => execute(() => updateAutopilotFindingStatus(id, finding.status === 'acknowledged' ? 'open' : 'acknowledged'), 'Situação atualizada.', `review-${id}`)} className="app-button-secondary">{finding.status === 'acknowledged' ? 'Reabrir' : 'Acompanhar'}</button><button type="button" aria-label={`Descartar ${title}`} disabled={isPending} onClick={() => execute(() => updateAutopilotFindingStatus(id, 'dismissed'), 'Achado descartado.', `dismiss-${id}`)} className="min-h-10 px-3 text-sm font-semibold text-muted-foreground hover:text-destructive">Descartar</button></div></article> })}</div>}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="border-b border-border p-5"><p className="app-kicker">Motor de decisão</p><h2 className="mt-1 text-lg font-bold">Regras operacionais</h2></div><div className="divide-y divide-border">{rules.map(rule => { const ruleName = String(rule.name); return <div key={String(rule.id)} className="flex items-start gap-4 p-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} /><div className="min-w-0 flex-1"><p className="font-semibold">{ruleName}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{String(rule.description)}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{categoryLabels[String(rule.category)]}</p></div>{canConfigure && <button type="button" aria-label={`${rule.enabled ? 'Desativar' : 'Ativar'} regra ${ruleName}`} disabled={isPending} onClick={() => execute(() => setAutopilotRuleEnabled(String(rule.id), !rule.enabled), rule.enabled ? 'Regra desativada.' : 'Regra ativada.', `rule-${rule.id}`)} className="shrink-0 text-xs font-semibold text-primary hover:underline">{rule.enabled ? 'Desativar' : 'Ativar'}</button>}</div> })}</div></div>
        <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5 text-primary" /> Execuções recentes</h2><div className="mt-4 space-y-3">{runs.slice(0, 8).map(run => <div key={String(run.id)} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{statusLabels[String(run.status)] || String(run.status)}</span>{run.status === 'failed' ? <XCircle className="h-4 w-4 text-red-600" /> : run.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}</div><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(String(run.started_at))}</p><p className="mt-2 text-xs text-muted-foreground">{String(run.findings_detected)} achados · {String(run.findings_resolved)} resolvidos</p></div>)}{runs.length === 0 && <p className="text-sm leading-6 text-muted-foreground">O histórico aparecerá após a primeira verificação.</p>}</div><div className="mt-5 rounded-xl bg-primary/5 p-4"><Sparkles className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-semibold">Rotina diária</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A execução agendada reconcilia os riscos e resolve automaticamente o que deixou de ocorrer.</p></div></aside>
      </section>
    </div>
  )
}
