'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Baby, CalendarClock, CheckCircle2, Loader2, Pause, Play, Plus, ShieldPlus } from 'lucide-react'
import { createLivestockProtocol, completeLivestockProtocol, deleteLivestockProtocol, pauseLivestockProtocol } from './actions'
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { fieldClassName, FormField } from '@/components/ui/FormField'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCivilDate } from '@/lib/formatters'
import { saveOfflineProtocolSnapshot } from '@/lib/offline/queue'

type Protocol = {
  id: string; name: string; protocol_type: 'sanitary' | 'reproductive'; event_type: string
  scope_type: 'operation' | 'property' | 'lot' | 'category'; land_parcel_id: string | null
  cattle_lot_id: string | null; responsible_employee_id: string | null; animal_category: string | null
  product_name: string | null; dosage: string | null; withdrawal_days: number | null; instructions: string | null
  next_due_date: string; recurrence_days: number | null; alert_lead_days: number; last_executed_at: string | null
  status: string
}
type Execution = { id: string; protocol_id: string; executed_on: string; quantity_treated: number | null; result_status: string; next_due_date: string | null }
type Lot = { id: string; name: string; category: string | null; current_quantity: number }
type Property = { id: string; name: string }
type Employee = { id: string; full_name: string }

const eventLabels: Record<string, string> = {
  vaccination: 'Vacinação', deworming: 'Vermifugação', mineral_protocol: 'Protocolo mineral',
  parasite_control: 'Controle de parasitas', treatment: 'Tratamento coletivo', examination: 'Exame sanitário',
  breeding_season: 'Estação de monta', pregnancy_check: 'Diagnóstico de gestação', calving: 'Previsão de partos',
  weaning: 'Desmama', bull_evaluation: 'Avaliação de touros', reproductive_exam: 'Exame reprodutivo', other: 'Outro',
}

const recurrenceLabels: Record<number, string> = { 30: 'A cada 30 dias', 60: 'A cada 60 dias', 90: 'A cada 90 dias', 180: 'A cada 6 meses', 365: 'Anual' }

export function HerdHealthClientPage({ protocols, executions, lots, properties, employees, today, nextThirtyDays, dbError }: {
  protocols: Protocol[]; executions: Execution[]; lots: Lot[]; properties: Property[]; employees: Employee[]
  today: string; nextThirtyDays: string; dbError?: string | null
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [scopeType, setScopeType] = useState<Protocol['scope_type']>('lot')
  const [protocolType, setProtocolType] = useState<Protocol['protocol_type']>('sanitary')
  const [selected, setSelected] = useState<Protocol | null>(null)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  const lotNames = useMemo(() => new Map(lots.map(lot => [lot.id, lot.name])), [lots])
  const propertyNames = useMemo(() => new Map(properties.map(property => [property.id, property.name])), [properties])
  const employeeNames = useMemo(() => new Map(employees.map(employee => [employee.id, employee.full_name])), [employees])
  const active = protocols.filter(protocol => protocol.status === 'active')
  const overdue = active.filter(protocol => protocol.next_due_date < today)
  const upcoming = active.filter(protocol => protocol.next_due_date >= today && protocol.next_due_date <= nextThirtyDays)

  function scopeLabel(protocol: Protocol) {
    if (protocol.scope_type === 'lot') return `Lote ${lotNames.get(protocol.cattle_lot_id || '') || 'não localizado'}`
    if (protocol.scope_type === 'property') return propertyNames.get(protocol.land_parcel_id || '') || 'Propriedade não localizada'
    if (protocol.scope_type === 'category') return `Categoria ${protocol.animal_category}`
    return 'Toda a operação'
  }

  useEffect(() => {
    const snapshots = protocols.filter(protocol => protocol.status === 'active').map(protocol => {
      const scope = protocol.scope_type === 'lot'
        ? `Lote ${lotNames.get(protocol.cattle_lot_id || '') || 'não localizado'}`
        : protocol.scope_type === 'property'
          ? propertyNames.get(protocol.land_parcel_id || '') || 'Propriedade não localizada'
          : protocol.scope_type === 'category' ? `Categoria ${protocol.animal_category}` : 'Toda a operação'
      return { id: protocol.id, name: protocol.name, next_due_date: protocol.next_due_date, recurrence_days: protocol.recurrence_days, scope_label: scope }
    })
    void saveOfflineProtocolSnapshot(snapshots).catch(() => undefined)
  }, [protocols, lotNames, propertyNames])

  async function run(action: () => Promise<unknown>, success: string, close: () => void) {
    setPending(true); setFormError(null)
    try { await action(); close(); setFeedback({ kind: 'success', message: success }); router.refresh() }
    catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.') }
    finally { setPending(false) }
  }

  async function handleCreate(formData: FormData) {
    await run(() => createLivestockProtocol(formData), 'Protocolo criado e alarme programado.', () => setShowCreate(false))
  }

  async function handleComplete(formData: FormData) {
    await run(() => completeLivestockProtocol(formData), 'Execução registrada e próximo alarme recalculado.', () => setSelected(null))
  }

  async function handlePause(protocol: Protocol) {
    try {
      await pauseLivestockProtocol(protocol.id, protocol.status === 'active')
      setFeedback({ kind: 'success', message: protocol.status === 'active' ? 'Protocolo pausado e alarme suspenso.' : 'Protocolo reativado.' })
      router.refresh()
    } catch (caught) { setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível alterar o protocolo.' }) }
  }

  return <div className="app-page">
    <PageHeader eyebrow="Manejo coletivo" title="Sanidade e reprodução" description="Protocolos por lote, categoria, propriedade ou operação inteira, com alarmes antecipados e confirmação de execução." action={<button type="button" onClick={() => { setFormError(null); setShowCreate(true) }} className="app-button-primary"><Plus className="h-4 w-4" /> Novo protocolo</button>} />
    <InlineFeedback kind="error" message={dbError} />
    <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo dos protocolos">
      <Metric icon={<CalendarClock className="h-5 w-5" />} label="Vencidos" value={overdue.length} tone={overdue.length ? 'danger' : 'neutral'} />
      <Metric icon={<CalendarClock className="h-5 w-5" />} label="Próximos 30 dias" value={upcoming.length} tone="warning" />
      <Metric icon={<ShieldPlus className="h-5 w-5" />} label="Sanitários ativos" value={active.filter(item => item.protocol_type === 'sanitary').length} tone="success" />
      <Metric icon={<Baby className="h-5 w-5" />} label="Reprodutivos ativos" value={active.filter(item => item.protocol_type === 'reproductive').length} tone="neutral" />
    </section>

    <section className="mt-6 space-y-3" aria-labelledby="protocols-title">
      <div><h2 id="protocols-title" className="text-base font-semibold">Agenda de manejo</h2><p className="mt-1 text-xs text-muted-foreground">A data do alerta considera a antecedência configurada; a data abaixo é a execução planejada.</p></div>
      {protocols.length === 0 ? <div className="app-panel overflow-hidden"><EmptyState icon={<ShieldPlus className="h-12 w-12" />} title="Nenhum protocolo programado" description="Cadastre vacinação, vermifugação, estação de monta, diagnóstico de gestação, partos ou outro manejo coletivo." action={<button type="button" onClick={() => setShowCreate(true)} className="app-button-primary"><Plus className="h-4 w-4" /> Criar primeiro protocolo</button>} /></div> :
        <div className="grid gap-4 lg:grid-cols-2">{protocols.map(protocol => {
          const isOverdue = protocol.status === 'active' && protocol.next_due_date < today
          return <article key={protocol.id} className={`app-panel p-5 ${isOverdue ? 'border-red-300' : ''}`}>
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${protocol.protocol_type === 'sanitary' ? 'bg-emerald-50 text-emerald-800' : 'bg-violet-50 text-violet-800'}`}>{protocol.protocol_type === 'sanitary' ? 'Sanidade' : 'Reprodução'}</span><StatusBadge status={isOverdue ? 'overdue' : protocol.status} /></div><h3 className="mt-3 text-base font-semibold">{protocol.name}</h3><p className="mt-1 text-sm text-muted-foreground">{eventLabels[protocol.event_type] || protocol.event_type} · {scopeLabel(protocol)}</p></div><div className="text-right"><p className={`text-sm font-semibold tabular-nums ${isOverdue ? 'text-red-700' : ''}`}>{formatCivilDate(protocol.next_due_date)}</p><p className="mt-1 text-[11px] text-muted-foreground">{isOverdue ? 'Vencido' : 'Programado'}</p></div></div>
            {(protocol.product_name || protocol.dosage || protocol.instructions) && <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">{protocol.product_name && <span className="font-semibold text-foreground">{protocol.product_name}</span>}{protocol.dosage && ` · ${protocol.dosage}`}{protocol.withdrawal_days !== null && ` · carência ${protocol.withdrawal_days} dia(s)`}{protocol.instructions && <p className="mt-1">{protocol.instructions}</p>}</div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div className="text-xs text-muted-foreground">{protocol.recurrence_days ? recurrenceLabels[protocol.recurrence_days] || `A cada ${protocol.recurrence_days} dias` : 'Evento único'}{protocol.responsible_employee_id ? ` · ${employeeNames.get(protocol.responsible_employee_id) || 'Responsável definido'}` : ''}</div><div className="flex items-center gap-2">{protocol.status === 'active' && <button type="button" onClick={() => { setFormError(null); setSelected(protocol) }} className="app-button-primary px-3 py-2"><CheckCircle2 className="h-4 w-4" /> Registrar execução</button>}<button type="button" onClick={() => handlePause(protocol)} className="app-button-secondary px-3 py-2" aria-label={protocol.status === 'active' ? `Pausar ${protocol.name}` : `Reativar ${protocol.name}`}>{protocol.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><ConfirmDeleteButton label={`Excluir protocolo ${protocol.name}`} onConfirm={() => deleteLivestockProtocol(protocol.id).then(() => router.refresh())} /></div></div>
          </article>
        })}</div>}
    </section>

    {executions.length > 0 && <section className="app-panel mt-6 overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Histórico recente</h2></div><div className="overflow-x-auto"><table className="app-table min-w-[700px]"><thead><tr><th className="p-4 text-left">Data</th><th className="p-4 text-left">Protocolo</th><th className="p-4 text-left">Resultado</th><th className="p-4 text-left">Quantidade</th><th className="p-4 text-left">Próximo ciclo</th></tr></thead><tbody>{executions.slice(0, 20).map(execution => <tr key={execution.id}><td className="p-4">{formatCivilDate(execution.executed_on)}</td><td className="p-4 font-medium">{protocols.find(item => item.id === execution.protocol_id)?.name || 'Protocolo arquivado'}</td><td className="p-4"><StatusBadge status={execution.result_status} /></td><td className="p-4">{execution.quantity_treated ?? 'Não informada'}</td><td className="p-4">{formatCivilDate(execution.next_due_date)}</td></tr>)}</tbody></table></div></section>}

    {showCreate && <Modal title="Novo protocolo coletivo" description="O sistema criará automaticamente um alarme e poderá repetir o ciclo após cada execução." onClose={() => setShowCreate(false)}><form action={handleCreate} className="space-y-4"><InlineFeedback kind="error" message={formError} />
      <div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="protocol-type" label="Área" required><select id="protocol-type" name="protocol_type" value={protocolType} onChange={event => setProtocolType(event.target.value as Protocol['protocol_type'])} className={fieldClassName}><option value="sanitary">Sanidade</option><option value="reproductive">Reprodução</option></select></FormField><FormField htmlFor="protocol-event" label="Tipo de manejo" required><select id="protocol-event" name="event_type" required className={fieldClassName} defaultValue=""><option value="" disabled>Selecione</option>{protocolType === 'sanitary' ? <><option value="vaccination">Vacinação</option><option value="deworming">Vermifugação</option><option value="parasite_control">Controle de parasitas</option><option value="mineral_protocol">Protocolo mineral</option><option value="treatment">Tratamento coletivo</option><option value="examination">Exame sanitário</option></> : <><option value="breeding_season">Estação de monta</option><option value="pregnancy_check">Diagnóstico de gestação</option><option value="calving">Previsão de partos</option><option value="weaning">Desmama</option><option value="bull_evaluation">Avaliação de touros</option><option value="reproductive_exam">Exame reprodutivo</option></>}<option value="other">Outro</option></select></FormField></div>
      <FormField htmlFor="protocol-name" label="Nome do protocolo" required><input id="protocol-name" name="name" required className={fieldClassName} placeholder="Ex.: Vacinação anual do lote de matrizes" /></FormField>
      <FormField htmlFor="protocol-scope" label="Aplicar em" required><select id="protocol-scope" name="scope_type" value={scopeType} onChange={event => setScopeType(event.target.value as Protocol['scope_type'])} className={fieldClassName}><option value="lot">Um lote específico</option><option value="category">Uma categoria de animais</option><option value="property">Uma propriedade</option><option value="operation">Toda a operação</option></select></FormField>
      {scopeType === 'lot' && <FormField htmlFor="protocol-lot" label="Lote" required><select id="protocol-lot" name="cattle_lot_id" required className={fieldClassName} defaultValue=""><option value="" disabled>Selecione o lote</option>{lots.map(lot => <option key={lot.id} value={lot.id}>{lot.name} · {lot.current_quantity} cabeças</option>)}</select></FormField>}
      {scopeType === 'property' && <FormField htmlFor="protocol-property" label="Propriedade" required><select id="protocol-property" name="land_parcel_id" required className={fieldClassName} defaultValue=""><option value="" disabled>Selecione a propriedade</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select></FormField>}
      {scopeType === 'category' && <FormField htmlFor="protocol-category" label="Categoria" required><input id="protocol-category" name="animal_category" required className={fieldClassName} placeholder="Ex.: Matrizes, bezerros, garrotes" /></FormField>}
      <div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="protocol-date" label="Data prevista" required><input id="protocol-date" name="next_due_date" type="date" min={today} required className={fieldClassName} /></FormField><FormField htmlFor="protocol-lead" label="Avisar com antecedência"><input id="protocol-lead" name="alert_lead_days" type="number" min="0" max="365" defaultValue="7" className={fieldClassName} /></FormField><FormField htmlFor="protocol-recurrence" label="Repetir a cada"><select id="protocol-recurrence" name="recurrence_days" defaultValue="" className={fieldClassName}><option value="">Não repetir automaticamente</option><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="180">6 meses</option><option value="365">1 ano</option></select></FormField><FormField htmlFor="protocol-responsible" label="Responsável"><select id="protocol-responsible" name="responsible_employee_id" defaultValue="" className={fieldClassName}><option value="">Administração da fazenda</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></FormField></div>
      <div className="grid gap-4 sm:grid-cols-3"><FormField htmlFor="protocol-product" label="Produto / vacina"><input id="protocol-product" name="product_name" className={fieldClassName} /></FormField><FormField htmlFor="protocol-dose" label="Dosagem"><input id="protocol-dose" name="dosage" className={fieldClassName} placeholder="Ex.: 5 ml/cabeça" /></FormField><FormField htmlFor="protocol-withdrawal" label="Carência (dias)"><input id="protocol-withdrawal" name="withdrawal_days" type="number" min="0" className={fieldClassName} /></FormField></div>
      <FormField htmlFor="protocol-instructions" label="Instruções"><textarea id="protocol-instructions" name="instructions" rows={3} className={`${fieldClassName} resize-y`} /></FormField>
      <ModalActions pending={pending} onCancel={() => setShowCreate(false)} submit="Criar protocolo e alarme" />
    </form></Modal>}

    {selected && <Modal title={`Registrar execução: ${selected.name}`} description="Essa confirmação entra no histórico e programa o próximo ciclo quando houver recorrência." onClose={() => setSelected(null)}><form action={handleComplete} className="space-y-4"><InlineFeedback kind="error" message={formError} /><input type="hidden" name="protocol_id" value={selected.id} /><div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="execution-date" label="Data realizada" required><input id="execution-date" name="executed_on" type="date" max={today} defaultValue={today} required className={fieldClassName} /></FormField><FormField htmlFor="execution-result" label="Resultado" required><select id="execution-result" name="result_status" defaultValue="completed" className={fieldClassName}><option value="completed">Concluído</option><option value="partial">Parcial</option><option value="skipped">Não realizado</option></select></FormField><FormField htmlFor="execution-quantity" label="Quantidade atendida"><input id="execution-quantity" name="quantity_treated" type="number" min="0" className={fieldClassName} /></FormField><FormField htmlFor="execution-next" label="Próxima data (opcional)"><input id="execution-next" name="next_due_date" type="date" min={today} className={fieldClassName} /></FormField></div><FormField htmlFor="execution-notes" label="Observações"><textarea id="execution-notes" name="notes" rows={3} className={`${fieldClassName} resize-y`} /></FormField><ModalActions pending={pending} onCancel={() => setSelected(null)} submit="Confirmar execução" /></form></Modal>}
  </div>
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'danger' | 'warning' | 'success' | 'neutral' }) {
  const toneClass = tone === 'danger' ? 'bg-red-50 text-red-700' : tone === 'warning' ? 'bg-amber-50 text-amber-700' : tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-primary/10 text-primary'
  return <div className="app-panel flex items-center gap-4 p-4"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div></div>
}

function ModalActions({ pending, onCancel, submit }: { pending: boolean; onCancel: () => void; submit: string }) {
  return <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={pending} className="app-button-secondary">Cancelar</button><button type="submit" disabled={pending} className="app-button-primary disabled:opacity-60">{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? 'Salvando...' : submit}</button></div>
}
