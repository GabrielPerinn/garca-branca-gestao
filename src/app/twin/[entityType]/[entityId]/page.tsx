import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, GitBranch, History } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatDateTime } from '@/lib/formatters'
import { getTwinEntityData } from '@/lib/twin/data'
import { twinEntityLabel, twinEntityRoutes, twinRelationLabels, twinStatusLabel } from '@/lib/twin/labels'
import { TwinTimeline } from '../../client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Entidade · Garça Twin' }

export default async function TwinEntityPage({ params }: { params: Promise<{ entityType: string; entityId: string }> }) {
  const { entityType, entityId } = await params
  const data = await getTwinEntityData(entityType, entityId)
  if (!data) notFound()
  const moduleRoute = twinEntityRoutes[entityType]

  return (
    <div className="app-page max-w-6xl">
      <Link href="/twin" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Voltar ao Garça Twin</Link>
      <PageHeader eyebrow={twinEntityLabel(entityType)} title={data.entity.display_name} description={`Histórico completo e relações atuais desta entidade. Versão ${data.entity.current_version}, acompanhada desde ${formatDateTime(data.entity.first_seen_at)}.`} action={moduleRoute ? <Link href={moduleRoute} className="app-button-secondary"><ExternalLink className="h-4 w-4" /> Abrir módulo original</Link> : undefined} />

      <section className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status atual</p><p className="mt-2 font-bold text-foreground">{twinStatusLabel(data.entity.lifecycle_status)}</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Versão atual</p><p className="mt-2 font-bold text-foreground">{data.entity.current_version}</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última alteração</p><p className="mt-2 font-bold text-foreground">{formatDateTime(data.entity.last_event_at)}</p></div></section>

      <section className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div><div className="mb-4"><p className="app-kicker">Linha do tempo</p><h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-foreground"><History className="h-5 w-5 text-primary" /> {data.events.length} versões preservadas</h2></div><TwinTimeline events={data.events} /></div>
        <aside><div className="sticky top-6 rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-foreground"><GitBranch className="h-5 w-5 text-primary" /> Conexões atuais</h2><div className="mt-4 space-y-3">{[...data.outgoing.map(relation => ({ ...relation, direction: 'out' as const })), ...data.incoming.map(relation => ({ ...relation, direction: 'in' as const }))].map(relation => { const targetType = relation.direction === 'out' ? relation.to_entity_type : relation.from_entity_type; const targetId = relation.direction === 'out' ? relation.to_entity_id : relation.from_entity_id; const targetName = data.relatedNames[`${targetType}:${targetId}`] || `${twinEntityLabel(targetType)} · ${targetId.slice(0, 8)}`; return <Link key={`${relation.id}-${relation.direction}`} href={`/twin/${targetType}/${targetId}`} className="block rounded-xl border border-border p-3 hover:border-primary/35"><p className="text-xs text-muted-foreground">{relation.direction === 'out' ? twinRelationLabels[relation.relation_type] || relation.relation_type : 'recebe vínculo de'}</p><p className="mt-1 truncate text-sm font-bold text-foreground">{targetName}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{twinEntityLabel(targetType)}</p></Link> })}{data.outgoing.length + data.incoming.length === 0 && <p className="text-sm leading-6 text-muted-foreground">Nenhum vínculo ativo registrado.</p>}</div></div></aside>
      </section>
    </div>
  )
}
