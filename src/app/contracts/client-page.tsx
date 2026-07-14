'use client'

import type { InputHTMLAttributes } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CircleDollarSign, FileCheck2, LandPlot, Plus, ScrollText } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { fieldClassName, FormField } from '@/components/ui/FormField'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { createRuralContract, receiveContractInstallment, updateRuralContractStatus } from './actions'

type Contract = {
  id: string; land_parcel_id: string; title: string; contract_number: string | null; contract_type: string; farm_role: string;
  counterparty_name: string; start_date: string; end_date: string; area_ha: number | string; activity: string; crop_name: string | null;
  payment_type: string; payment_amount: number | string | null; payment_frequency: string | null; product_name: string | null;
  product_quantity: number | string | null; production_percentage: number | string | null; status: string;
}
type Installment = { id: string; contract_id: string; installment_number: number; due_date: string; amount: number | string | null; product_name: string | null; product_quantity: number | string | null; status: string }
type Parcel = { id: string; name: string; tenure_type: string; total_area_ha: number | string }

const contractTypeLabels: Record<string, string> = { rural_lease: 'Arrendamento rural', rural_partnership: 'Parceria rural', commodatum: 'Comodato', sublease: 'Subarrendamento', other: 'Outro' }
const frequencyLabels: Record<string, string> = { monthly: 'mensal', quarterly: 'trimestral', semiannual: 'semestral', annual: 'anual', harvest: 'por safra', single: 'parcela única', custom: 'personalizado' }

function money(value: number | string | null) {
  return value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function date(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function paymentDescription(contract: Contract) {
  if (contract.payment_type === 'per_hectare' && contract.payment_amount) return `${money(contract.payment_amount)} por hectare`
  if (contract.payment_amount) return money(contract.payment_amount)
  if (contract.production_percentage) return `${contract.production_percentage}% da produção`
  if (contract.product_quantity) return `${contract.product_quantity} ${contract.product_name ?? ''}`
  return 'Gratuito'
}

export function ContractsClientPage({ contracts, installments, parcels, databaseError }: { contracts: Contract[]; installments: Installment[]; parcels: Parcel[]; databaseError: string | null }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [paymentType, setPaymentType] = useState('fixed_money')
  const [frequency, setFrequency] = useState('annual')
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  const parcelNames = useMemo(() => new Map(parcels.map(parcel => [parcel.id, parcel.name])), [parcels])
  const contractNames = useMemo(() => new Map(contracts.map(contract => [contract.id, contract.title])), [contracts])
  const active = contracts.filter(contract => contract.status === 'active')
  const scheduled = installments.filter(item => item.status === 'scheduled')
  const today = new Date().toISOString().slice(0, 10)
  const overdue = scheduled.filter(item => item.due_date < today)
  const projected = scheduled.reduce((total, item) => total + Number(item.amount ?? 0), 0)
  const hasMoney = ['fixed_money', 'per_hectare'].includes(paymentType)
  const hasSchedule = paymentType !== 'free'
  const hasProduct = ['product_quantity', 'mixed'].includes(paymentType)
  const hasPercentage = ['production_percentage', 'mixed'].includes(paymentType)

  async function submit(formData: FormData) {
    setPending(true); setFormError(null)
    try {
      await createRuralContract(formData)
      setShowModal(false); setFeedback({ kind: 'success', message: 'Contrato, cronograma e alertas criados com sucesso.' }); router.refresh()
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Não foi possível criar o contrato.') }
    finally { setPending(false) }
  }

  async function receive(id: string) {
    setPending(true)
    try { await receiveContractInstallment(id); setFeedback({ kind: 'success', message: 'Recebimento conciliado e lançado no financeiro.' }); router.refresh() }
    catch (error) { setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível confirmar o recebimento.' }) }
    finally { setPending(false) }
  }

  async function changeStatus(id: string, status: 'terminated' | 'cancelled') {
    setPending(true)
    try { await updateRuralContractStatus(id, status); setFeedback({ kind: 'success', message: status === 'terminated' ? 'Contrato encerrado.' : 'Contrato cancelado.' }); router.refresh() }
    catch (error) { setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível atualizar o contrato.' }) }
    finally { setPending(false) }
  }

  const createButton = <button type="button" onClick={() => { setFormError(null); setShowModal(true) }} disabled={parcels.length === 0} className="app-button-primary disabled:opacity-50"><Plus className="h-4 w-4" /> Novo contrato</button>

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="app-kicker">Governança fundiária</p><h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Contratos rurais</h1><p className="mt-1 text-sm text-muted-foreground">Arrendamentos, parcerias, comodatos, parcelas, obrigações e vencimentos em um único controle.</p></div>{createButton}</div>
      <InlineFeedback kind="error" message={databaseError} /><InlineFeedback kind={feedback?.kind} message={feedback?.message} />
      {parcels.length === 0 && <InlineFeedback kind="info" message="Cadastre ao menos um imóvel ou área em Base da fazenda antes de criar um contrato." />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FileCheck2} label="Contratos ativos" value={String(active.length)} />
        <Metric icon={LandPlot} label="Área contratada" value={`${active.reduce((sum, item) => sum + Number(item.area_ha), 0).toLocaleString('pt-BR')} ha`} />
        <Metric icon={CircleDollarSign} label="A receber" value={money(projected)} />
        <Metric icon={CalendarClock} label="Parcelas vencidas" value={String(overdue.length)} tone={overdue.length ? 'danger' : 'default'} />
      </div>

      <section className="app-panel overflow-hidden">
        {contracts.length === 0 ? <EmptyState icon={<ScrollText className="h-12 w-12" />} title="Nenhum contrato rural" description="Cadastre o vínculo da terra antes de lançar recebimentos isolados." action={createButton} /> : <div className="overflow-x-auto"><table className="app-table min-w-[1120px]"><thead><tr><th>Contrato</th><th>Área</th><th>Contraparte</th><th>Vigência</th><th>Remuneração</th><th>Status</th><th className="text-right">Ações</th></tr></thead><tbody>{contracts.map(contract => <tr key={contract.id}><td><p className="font-semibold">{contract.title}</p><p className="text-xs text-muted-foreground">{contractTypeLabels[contract.contract_type] ?? contract.contract_type}{contract.contract_number ? ` · ${contract.contract_number}` : ''}</p></td><td><p>{parcelNames.get(contract.land_parcel_id) ?? 'Área não encontrada'}</p><p className="text-xs text-muted-foreground">{Number(contract.area_ha).toLocaleString('pt-BR')} ha · {contract.activity}</p></td><td>{contract.counterparty_name}<p className="text-xs text-muted-foreground">{contract.farm_role === 'grantor' ? 'Fazenda cede a terra' : 'Fazenda recebe a terra'}</p></td><td>{date(contract.start_date)} a {date(contract.end_date)}</td><td>{paymentDescription(contract)}<p className="text-xs text-muted-foreground">{contract.payment_frequency ? frequencyLabels[contract.payment_frequency] ?? contract.payment_frequency : ''}</p></td><td><StatusBadge status={contract.status} map={{ active: { label: 'Ativo', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }, expired: { label: 'Vencido', className: 'border-amber-200 bg-amber-50 text-amber-900' }, terminated: { label: 'Encerrado', className: 'border-slate-200 bg-slate-50 text-slate-700' }, cancelled: { label: 'Cancelado', className: 'border-red-200 bg-red-50 text-red-800' }, draft: { label: 'Rascunho', className: 'border-slate-200 bg-slate-50 text-slate-700' } }} /></td><td className="text-right">{contract.status === 'active' && <div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => changeStatus(contract.id, 'terminated')} className="app-button-secondary text-xs">Encerrar</button><button type="button" disabled={pending} onClick={() => changeStatus(contract.id, 'cancelled')} className="app-button-secondary text-xs text-red-700">Cancelar</button></div>}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="app-panel overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-semibold">Cronograma de recebimentos</h2><p className="mt-1 text-sm text-muted-foreground">A baixa cria a receita financeira e conclui o alerta de forma transacional.</p></div>{installments.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhuma parcela monetária programada.</p> : <div className="overflow-x-auto"><table className="app-table min-w-[820px]"><thead><tr><th>Vencimento</th><th>Contrato</th><th>Parcela</th><th className="text-right">Valor / produto</th><th>Status</th><th className="text-right">Ação</th></tr></thead><tbody>{installments.map(item => <tr key={item.id}><td className={item.status === 'scheduled' && item.due_date < today ? 'font-semibold text-red-700' : ''}>{date(item.due_date)}</td><td>{contractNames.get(item.contract_id) ?? 'Contrato'}</td><td>#{item.installment_number}</td><td className="text-right font-semibold">{item.amount ? money(item.amount) : `${item.product_quantity ?? '—'} ${item.product_name ?? ''}`}</td><td><StatusBadge status={item.status} map={{ scheduled: { label: item.due_date < today ? 'Vencida' : 'Programada', className: item.due_date < today ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900' }, received: { label: 'Recebida', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }, overdue: { label: 'Vencida', className: 'border-red-200 bg-red-50 text-red-800' }, cancelled: { label: 'Cancelada', className: 'border-slate-200 bg-slate-50 text-slate-700' } }} /></td><td className="text-right">{item.status === 'scheduled' && item.amount && <button type="button" disabled={pending} onClick={() => receive(item.id)} className="app-button-secondary text-xs">Confirmar recebimento</button>}</td></tr>)}</tbody></table></div>}</section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Arrendamento e parceria rural têm natureza e regras diferentes. O sistema controla execução, parcelas e alertas; a redação e validade jurídica devem ser revisadas por profissional habilitado.</div>

      {showModal && <Modal title="Novo contrato rural" onClose={() => setShowModal(false)}><form action={submit} className="space-y-5"><InlineFeedback kind="error" message={formError} /><div className="grid gap-4 sm:grid-cols-2"><Field name="title" label="Título" placeholder="Arrendamento safra 2026/27" autoFocus /><Field name="contract_number" label="Número / referência" /><Select name="parcel_name" label="Imóvel / área *" required options={parcels.map(parcel => ({ value: parcel.name, label: `${parcel.name} · ${Number(parcel.total_area_ha).toLocaleString('pt-BR')} ha` }))} /><Select name="contract_type" label="Modalidade *" required options={[['rural_lease','Arrendamento rural'],['rural_partnership','Parceria rural'],['commodatum','Comodato'],['sublease','Subarrendamento'],['other','Outro']]} /><Select name="farm_role" label="Papel da fazenda *" required options={[['grantor','Cede a terra'],['grantee','Recebe a terra']]} /><Field name="counterparty_name" label="Contraparte *" required /><Field name="counterparty_document" label="CPF/CNPJ" /><Field name="counterparty_phone" label="Contato" /><Field name="area_ha" label="Área contratada (ha) *" type="number" step="0.01" required /><Field name="activity" label="Atividade autorizada *" placeholder="Cultivo de soja" required /><Field name="crop_name" label="Cultura" /><Field name="start_date" label="Início *" type="date" required /><Field name="end_date" label="Término *" type="date" required /><Select name="payment_type" label="Remuneração *" required value={paymentType} onChange={setPaymentType} options={[['fixed_money','Valor fixo'],['per_hectare','Valor por hectare'],['product_quantity','Quantidade de produto'],['production_percentage','Percentual da produção'],['mixed','Mista'],['free','Gratuito']]} />{hasMoney && <Field name="payment_amount" label={paymentType === 'per_hectare' ? 'Valor por hectare *' : 'Valor por parcela *'} type="number" step="0.01" required />}{hasSchedule && <><Select name="payment_frequency" label="Frequência *" required value={frequency} onChange={setFrequency} options={[['monthly','Mensal'],['quarterly','Trimestral'],['semiannual','Semestral'],['annual','Anual'],['harvest','Por safra'],['single','Parcela única'],['custom','Personalizada']]} /><Field name="first_due_date" label="Primeiro vencimento *" type="date" required /><Field name="installment_count" label="Quantidade de parcelas" type="number" defaultValue={['single','harvest'].includes(frequency) ? '1' : undefined} /></>}{hasProduct && <><Field name="product_name" label="Produto *" required /><Field name="product_quantity" label="Quantidade *" type="number" step="0.01" required /></>}{hasPercentage && <Field name="production_percentage" label="Percentual *" type="number" step="0.01" required />}<Field name="adjustment_index" label="Índice de reajuste" /><Field name="renewal_notice_days" label="Avisar antes (dias)" type="number" defaultValue="90" /></div><FormField htmlFor="contract-conservation" label="Conservação, benfeitorias, impostos e demais responsabilidades"><textarea id="contract-conservation" name="conservation_obligations" rows={3} className={`${fieldClassName} resize-y`} placeholder="Conservação do solo, cercas, estradas, licenças..." /></FormField><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={() => setShowModal(false)} className="app-button-secondary flex-1">Cancelar</button><button type="submit" disabled={pending} className="app-button-primary flex-1 disabled:opacity-50">{pending ? 'Criando...' : 'Criar contrato e cronograma'}</button></div></form></Modal>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone = 'default' }: { icon: typeof ScrollText; label: string; value: string; tone?: 'default' | 'danger' }) { return <div className="app-panel p-5"><div className="flex items-center gap-3"><span className={`rounded-lg p-2 ${tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-primary/10 text-primary'}`}><Icon className="h-4 w-4" /></span><p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p></div><p className={`mt-4 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-red-700' : ''}`}>{value}</p></div> }
function Field({ name, label, ...props }: { name: string; label: string } & InputHTMLAttributes<HTMLInputElement>) { const id = `contract-${name}`; return <FormField htmlFor={id} label={label}><input id={id} name={name} className={fieldClassName} {...props} /></FormField> }
function Select({ name, label, options, value, onChange, required }: { name: string; label: string; options: Array<[string,string] | { value: string; label: string }>; value?: string; onChange?: (value: string) => void; required?: boolean }) { const id = `contract-${name}`; return <FormField htmlFor={id} label={label}><select id={id} name={name} required={required} value={value} defaultValue={value === undefined ? '' : undefined} onChange={onChange ? event => onChange(event.target.value) : undefined} className={fieldClassName}><option value="" disabled>Selecione</option>{options.map(option => { const value = Array.isArray(option) ? option[0] : option.value; const label = Array.isArray(option) ? option[1] : option.label; return <option key={value} value={value}>{label}</option> })}</select></FormField> }
