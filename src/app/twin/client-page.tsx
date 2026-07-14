'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, Boxes, CheckCircle2, CircleDot, Database, Fingerprint,
  GitBranch, History, Link2, LockKeyhole, Network, Search, ShieldCheck,
  UserRound, XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import type { TwinEntity, TwinEvent, TwinIntegrity, TwinOverview, TwinRelation } from '@/lib/twin/data'
import {
  twinEntityLabel, twinEventLabel, twinFieldLabel, twinRelationLabels, twinStatusLabel,
} from '@/lib/twin/labels'

type Tab = 'timeline' | 'entities' | 'relations' | 'integrity'

function MetricCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      </div>
    </article>
  )
}

function sourceLabel(source: string) {
  return ({ web: 'Sistema web', ai_or_whatsapp: 'IA ou WhatsApp', system: 'Automação', migration: 'Base inicial' } as Record<string, string>)[source] || source
}

function eventTone(eventType: string) {
  if (eventType.includes('deleted')) return 'bg-red-100 text-red-700 ring-red-200'
  if (eventType.includes('completed') || eventType.includes('restored')) return 'bg-emerald-100 text-emerald-700 ring-emerald-200'
  if (eventType === 'baseline_imported') return 'bg-slate-100 text-slate-600 ring-slate-200'
  if (eventType.includes('updated') || eventType === 'status_changed') return 'bg-blue-100 text-blue-700 ring-blue-200'
  return 'bg-primary/10 text-primary ring-primary/20'
}

function displayValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number' && /(amount|cost|price|salary)/.test(field)) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (typeof value === 'string' && /(status|priority|condition)$/.test(field)) return twinStatusLabel(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function TwinTimeline({ events, compact = false }: { events: TwinEvent[]; compact?: boolean }) {
  if (!events.length) return <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">Nenhum evento encontrado neste recorte.</p>
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[1.15rem] before:top-3 before:w-px before:bg-border">
      {events.map(event => (
        <li key={event.id} className="relative pl-12">
          <span className={`absolute left-0 top-4 flex h-9 w-9 items-center justify-center rounded-full ring-1 ${eventTone(event.event_type)}`}><CircleDot className="h-4 w-4" aria-hidden="true" /></span>
          <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{twinEntityLabel(event.entity_type)}</span>
                  {event.visibility === 'restricted' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><LockKeyhole className="h-3 w-3" /> restrito</span>}
                </div>
                <Link href={`/twin/${event.entity_type}/${event.entity_id}`} className="mt-2 block truncate text-base font-bold text-foreground hover:text-primary hover:underline">{event.entity_display_name}</Link>
                <p className="mt-1 text-sm font-medium text-foreground/80">{twinEventLabel(event.event_type)} <span className="font-normal text-muted-foreground">· versão {event.event_sequence}</span></p>
              </div>
              <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right"><p>{formatDateTime(event.occurred_at)}</p><p className="mt-1">{sourceLabel(event.source_channel)}</p></div>
            </div>

            {event.changed_fields.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {event.changed_fields.slice(0, compact ? 5 : 10).map(field => <span key={field} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">{twinFieldLabel(field)}</span>)}
                {event.changed_fields.length > (compact ? 5 : 10) && <span className="px-1 py-1 text-[11px] text-muted-foreground">+{event.changed_fields.length - (compact ? 5 : 10)}</span>}
              </div>
            )}

            {!compact && event.event_type !== 'baseline_imported' && event.changed_fields.length > 0 && (
              <details className="mt-4 rounded-xl border border-border bg-muted/20">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">Ver alterações registradas</summary>
                <dl className="divide-y divide-border border-t border-border px-4">
                  {event.changed_fields.map(field => (
                    <div key={field} className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_1fr_1fr] sm:gap-4">
                      <dt className="font-semibold text-foreground">{twinFieldLabel(field)}</dt>
                      <dd className="break-words text-muted-foreground"><span className="mr-1 text-[10px] font-bold uppercase">Antes</span>{displayValue(event.before_state?.[field], field)}</dd>
                      <dd className="break-words text-foreground"><span className="mr-1 text-[10px] font-bold uppercase text-primary">Depois</span>{displayValue(event.after_state?.[field], field)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {event.actor_name || (event.source_channel === 'migration' ? 'Migração verificada' : 'Processo do sistema')}</span>
              <span className="inline-flex items-center gap-1 font-mono"><Fingerprint className="h-3.5 w-3.5" /> {event.event_hash.slice(0, 12)}…</span>
            </div>
          </article>
        </li>
      ))}
    </ol>
  )
}

export function TwinClientPage({ farm, overview, integrity, events, entities, relations }: {
  farm: { id: string; name: string } | null
  overview: TwinOverview
  integrity: TwinIntegrity
  events: TwinEvent[]
  entities: TwinEntity[]
  relations: TwinRelation[]
}) {
  const [tab, setTab] = useState<Tab>('timeline')
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [source, setSource] = useState('all')

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return events.filter(event =>
      (entityType === 'all' || event.entity_type === entityType)
      && (source === 'all' || event.source_channel === source)
      && (!normalized || `${event.entity_display_name} ${twinEventLabel(event.event_type)} ${twinEntityLabel(event.entity_type)}`.toLocaleLowerCase('pt-BR').includes(normalized))
    )
  }, [entityType, events, query, source])

  const entityNames = useMemo(() => new Map(entities.map(entity => [`${entity.entity_type}:${entity.entity_id}`, entity.display_name])), [entities])
  const types = Object.entries(overview.entities_by_type).sort((left, right) => right[1] - left[1])
  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
    { id: 'timeline', label: 'Linha do tempo', icon: History },
    { id: 'entities', label: 'Entidades', icon: Boxes },
    { id: 'relations', label: 'Conexões', icon: GitBranch },
    { id: 'integrity', label: 'Integridade', icon: ShieldCheck },
  ]

  return (
    <div className="app-page max-w-7xl">
      <PageHeader eyebrow="Garça Twin" title="Gêmeo digital da fazenda" description={<>Histórico operacional automático, temporal e verificável de <strong>{farm?.name || 'toda a propriedade'}</strong>. Cada alteração fica conectada à entidade, origem e responsável.</>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do gêmeo digital">
        <MetricCard icon={Boxes} label="Entidades acompanhadas" value={formatNumber(overview.entity_count)} hint={`${types.length} categorias operacionais`} />
        <MetricCard icon={Activity} label="Eventos preservados" value={formatNumber(overview.event_count)} hint={overview.last_event_at ? `Último em ${formatDateTime(overview.last_event_at)}` : 'Aguardando o primeiro registro'} />
        <MetricCard icon={Link2} label="Conexões ativas" value={formatNumber(overview.active_relation_count)} hint="Vínculos atuais entre cadastros" />
        <MetricCard icon={integrity.is_valid ? ShieldCheck : XCircle} label="Cadeia de integridade" value={integrity.is_valid ? 'Verificada' : 'Atenção'} hint={`${formatNumber(integrity.checked_events)} eventos recalculados`} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/20 p-2" role="tablist" aria-label="Visões do gêmeo digital">
          {tabs.map(item => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${tab === item.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{item.label}</button> })}
        </div>

        {tab === 'timeline' && <div className="p-4 sm:p-6">
          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_14rem_13rem]">
            <label className="relative"><span className="sr-only">Buscar no histórico</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar entidade ou acontecimento..." className="app-input pl-9" /></label>
            <label><span className="sr-only">Filtrar por categoria</span><select value={entityType} onChange={event => setEntityType(event.target.value)} className="app-input"><option value="all">Todas as categorias</option>{types.map(([type]) => <option key={type} value={type}>{twinEntityLabel(type)}</option>)}</select></label>
            <label><span className="sr-only">Filtrar por origem</span><select value={source} onChange={event => setSource(event.target.value)} className="app-input"><option value="all">Todas as origens</option><option value="web">Sistema web</option><option value="ai_or_whatsapp">IA ou WhatsApp</option><option value="system">Automação</option><option value="migration">Base inicial</option></select></label>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="app-kicker">Histórico operacional</p><h2 className="mt-1 text-lg font-bold text-foreground">{filteredEvents.length} acontecimentos neste recorte</h2></div><span className="text-xs text-muted-foreground">Até 300 eventos mais recentes</span></div>
          <TwinTimeline events={filteredEvents} />
        </div>}

        {tab === 'entities' && <div className="p-4 sm:p-6">
          <div className="mb-5"><p className="app-kicker">Estado atual derivado</p><h2 className="mt-1 text-lg font-bold text-foreground">Tudo que o Twin acompanha</h2><p className="mt-1 text-sm text-muted-foreground">O estado atual é reconstruível a partir do histórico; os módulos operacionais continuam sendo a origem transacional.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{entities.map(entity => <Link key={entity.id} href={`/twin/${entity.entity_type}/${entity.entity_id}`} className="rounded-xl border border-border bg-card p-4 outline-none transition hover:border-primary/35 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start justify-between gap-3"><span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{twinEntityLabel(entity.entity_type)}</span><span className="text-[11px] text-muted-foreground">v{entity.current_version}</span></div><h3 className="mt-3 truncate font-bold text-foreground">{entity.display_name}</h3><p className="mt-1 text-xs text-muted-foreground">Status: {twinStatusLabel(entity.lifecycle_status)} · {formatDateTime(entity.last_event_at)}</p></Link>)}</div>
        </div>}

        {tab === 'relations' && <div className="p-4 sm:p-6">
          <div className="mb-5"><p className="app-kicker">Grafo operacional</p><h2 className="mt-1 text-lg font-bold text-foreground">Como os cadastros estão conectados</h2></div>
          <div className="space-y-2">{relations.length ? relations.map(relation => {
            const fromName = entityNames.get(`${relation.from_entity_type}:${relation.from_entity_id}`) || relation.from_entity_id.slice(0, 8)
            const toName = entityNames.get(`${relation.to_entity_type}:${relation.to_entity_id}`) || relation.to_entity_id.slice(0, 8)
            return <div key={relation.id} className="grid items-center gap-2 rounded-xl border border-border p-3 text-sm md:grid-cols-[1fr_auto_1fr]"><Link href={`/twin/${relation.from_entity_type}/${relation.from_entity_id}`} className="min-w-0 truncate font-semibold text-foreground hover:text-primary">{fromName}<span className="ml-2 text-xs font-normal text-muted-foreground">{twinEntityLabel(relation.from_entity_type)}</span></Link><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"><Network className="h-3.5 w-3.5" />{twinRelationLabels[relation.relation_type] || relation.relation_type}</span><Link href={`/twin/${relation.to_entity_type}/${relation.to_entity_id}`} className="min-w-0 truncate font-semibold text-foreground hover:text-primary md:text-right">{toName}<span className="ml-2 text-xs font-normal text-muted-foreground">{twinEntityLabel(relation.to_entity_type)}</span></Link></div>
          }) : <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">As conexões aparecerão conforme lotes, pastos, tarefas e operações forem vinculados.</p>}</div>
        </div>}

        {tab === 'integrity' && <div className="p-4 sm:p-6">
          <div className={`rounded-2xl border p-6 ${integrity.is_valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-start gap-4">{integrity.is_valid ? <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-700" /> : <XCircle className="h-8 w-8 shrink-0 text-red-700" />}<div><h2 className={`text-lg font-bold ${integrity.is_valid ? 'text-emerald-950' : 'text-red-950'}`}>{integrity.is_valid ? 'A cadeia criptográfica está íntegra' : 'Foi encontrada uma divergência de integridade'}</h2><p className={`mt-2 text-sm leading-6 ${integrity.is_valid ? 'text-emerald-900' : 'text-red-900'}`}>Foram recalculados {formatNumber(integrity.checked_events)} eventos. Cada evento contém o hash do anterior na mesma entidade, tornando qualquer alteração retroativa detectável.</p></div></div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Eventos inválidos</p><p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(integrity.invalid_events)}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última verificação</p><p className="mt-2 font-bold text-foreground">{formatDateTime(integrity.checked_at)}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Proteção</p><p className="mt-2 font-bold text-foreground">Imutável no banco</p></div></div>
          <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5"><h3 className="flex items-center gap-2 font-bold text-foreground"><Database className="h-5 w-5 text-primary" /> O que esta verificação garante</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground"><li>• Eventos não podem ser atualizados nem removidos pelas APIs da aplicação.</li><li>• A sequência de cada entidade é serializada para impedir versões concorrentes.</li><li>• Campos pessoais e conteúdos livres sensíveis não são copiados para o livro imutável.</li><li>• Alterações financeiras são visíveis somente para perfis autorizados.</li></ul></div>
        </div>}
      </section>
    </div>
  )
}
