'use client'

import Link from 'next/link'
import { ArrowRight, Building2, Map as MapIcon, MapPin, Tractor } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { StatusBadge } from '@/components/ui/StatusBadge'

type OperationRow = {
  id: string
  name: string
  location_description?: string | null
  municipality?: string | null
  state_code?: string | null
  total_area_ha?: number | string | null
  productive_area_ha?: number | string | null
  primary_activity?: string | null
  setup_completed_at?: string | null
}

type PropertyRow = {
  id: string
  name: string
  tenure_type: string
  total_area_ha: number | string
  usable_area_ha?: number | string | null
  municipality?: string | null
  state_code?: string | null
  property_registration?: string | null
  car_code?: string | null
  ccir_code?: string | null
  georeferencing_status?: string | null
}

type PastureRow = { id: string; land_parcel_id?: string | null }

const activityLabels: Record<string, string> = {
  beef_cattle: 'Pecuária de corte',
  dairy_cattle: 'Pecuária leiteira',
  mixed_cattle: 'Pecuária mista',
  other: 'Outra atividade pecuária',
}

const tenureLabels: Record<string, string> = {
  owned: 'Própria', leased_in: 'Arrendada para uso', leased_out: 'Cedida em arrendamento',
  partnership: 'Parceria rural', commodatum: 'Comodato', other: 'Outro vínculo',
}

function hectares(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? 'Não informada'
    : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
}

export function FarmsClientPage({ operation, properties, pastures, dbError }: {
  operation: OperationRow | null
  properties: PropertyRow[]
  pastures: PastureRow[]
  dbError?: string | null
}) {
  const pastureCount = new Map<string, number>()
  for (const pasture of pastures) {
    if (pasture.land_parcel_id) pastureCount.set(pasture.land_parcel_id, (pastureCount.get(pasture.land_parcel_id) ?? 0) + 1)
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-kicker">Cadastro mestre</p>
          <h1 className="mt-1 text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Operação e propriedades</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Uma visão consolidada da pecuária, formada por todas as fazendas físicas utilizadas pelo rebanho.</p>
        </div>
        <Link href="/setup" className="app-button-primary">
          {operation ? 'Revisar base' : 'Implantar operação'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <InlineFeedback kind="error" message={dbError} />

      {!operation ? (
        <div className="app-panel overflow-hidden">
          <EmptyState
            icon={<Tractor className="h-12 w-12" />}
            title="A operação pecuária ainda não foi implantada"
            description="Cadastre a operação consolidada, cada propriedade real, seus pastos e os saldos iniciais do rebanho."
            action={<Link href="/setup" className="app-button-primary">Configurar base <ArrowRight className="h-4 w-4" /></Link>}
          />
        </div>
      ) : (
        <>
          <section className="app-panel p-5 sm:p-6" aria-labelledby="operation-title">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Operação consolidada</p>
                  <h2 id="operation-title" className="mt-1 text-lg font-semibold text-foreground">{operation.name}</h2>
                  {(operation.municipality || operation.location_description) && <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{operation.municipality ? `${operation.municipality}${operation.state_code ? ` - ${operation.state_code}` : ''}` : operation.location_description}</p>}
                </div>
              </div>
              <StatusBadge status={operation.setup_completed_at ? 'active' : 'pending'} />
            </div>
            <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-5">
              <div><dt className="text-xs text-muted-foreground">Propriedades</dt><dd className="mt-1 text-sm font-semibold">{properties.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Pastos</dt><dd className="mt-1 text-sm font-semibold">{pastures.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Área total consolidada</dt><dd className="mt-1 text-sm font-semibold">{hectares(operation.total_area_ha)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Área produtiva</dt><dd className="mt-1 text-sm font-semibold">{hectares(operation.productive_area_ha)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Atividade</dt><dd className="mt-1 text-sm font-semibold">{activityLabels[operation.primary_activity ?? ''] ?? 'Pecuária'}</dd></div>
            </dl>
          </section>

          <section className="mt-6" aria-labelledby="properties-title">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div><h2 id="properties-title" className="text-base font-semibold text-foreground">Propriedades físicas</h2><p className="mt-1 text-xs text-muted-foreground">Cada fazenda possui documentação, área e pastos próprios, mas participa da mesma análise operacional.</p></div>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{properties.length} cadastrada{properties.length === 1 ? '' : 's'}</span>
            </div>
            {properties.length === 0 ? (
              <div className="app-panel overflow-hidden"><EmptyState icon={<MapIcon className="h-10 w-10" />} title="Nenhuma propriedade cadastrada" description="Cadastre a sede e as demais fazendas como propriedades independentes." action={<Link href="/setup" className="app-button-primary">Cadastrar propriedades <ArrowRight className="h-4 w-4" /></Link>} /></div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {properties.map(property => {
                  const documents = [property.property_registration && 'Matrícula', property.car_code && 'CAR', property.ccir_code && 'CCIR', property.georeferencing_status === 'certified' && 'Georreferenciada'].filter(Boolean)
                  return <article key={property.id} className="app-panel p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0"><h3 className="truncate text-base font-semibold text-foreground">{property.name}</h3><p className="mt-1 text-xs text-muted-foreground">{tenureLabels[property.tenure_type] ?? property.tenure_type}</p></div>
                      <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{pastureCount.get(property.id) ?? 0} pasto{(pastureCount.get(property.id) ?? 0) === 1 ? '' : 's'}</span>
                    </div>
                    {(property.municipality || property.state_code) && <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{property.municipality || 'Município não informado'}{property.state_code ? ` / ${property.state_code}` : ''}</p>}
                    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4"><div><dt className="text-xs text-muted-foreground">Área total</dt><dd className="mt-1 text-sm font-semibold">{hectares(property.total_area_ha)}</dd></div><div><dt className="text-xs text-muted-foreground">Área utilizável</dt><dd className="mt-1 text-sm font-semibold">{hectares(property.usable_area_ha)}</dd></div></dl>
                    <div className="mt-4 flex flex-wrap gap-2">{documents.length > 0 ? documents.map(document => <span key={String(document)} className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">{document}</span>) : <span className="text-xs text-amber-700">Documentação ainda não informada</span>}</div>
                  </article>
                })}
              </div>
            )}
          </section>

          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-sm leading-6 text-foreground">
            A operação é o nível consolidado de gestão. Propriedades são as fazendas reais; pastos ficam dentro delas. A IA pode comparar unidades separadamente e também responder pelo resultado do conjunto.
          </div>
        </>
      )}
    </div>
  )
}
