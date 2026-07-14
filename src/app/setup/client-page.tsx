'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  ClipboardCheck,
  LoaderCircle,
  Map,
  Package,
  Plus,
  ScrollText,
  Save,
  Sprout,
  Tractor,
  Trash2,
  Users,
} from 'lucide-react'
import { configureFarmFoundation, saveFarmFoundationDraft } from './actions'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { fieldClassName, FormField } from '@/components/ui/FormField'

type ProfileForm = {
  name: string
  legal_name: string
  document_number: string
  state_registration: string
  owner_name: string
  owner_phone: string
  municipality: string
  state_code: string
  postal_code: string
  address: string
  location_description: string
  total_area_ha: string
  productive_area_ha: string
  primary_activity: string
  livestock_system: string
  timezone: string
  notes: string
}

type PastureRow = { id: string; name: string; property_name: string; approximate_capacity: string; current_condition: string }
type CattleRow = { id: string; name: string; category: string; current_quantity: string; pasture_name: string }
type EmployeeRow = { id: string; full_name: string; role_description: string; salary_amount: string; phone_number: string }
type InventoryRow = { id: string; name: string; category: string; current_quantity: string; minimum_quantity: string; unit: string }
type LandParcelRow = { id: string; name: string; tenure_type: string; total_area_ha: string; usable_area_ha: string; municipality: string; state_code: string; property_registration: string; car_code: string; ccir_code: string; cib_nirf: string; georeferencing_status: string; notes: string }
type FarmAssetRow = { id: string; name: string; property_name: string; asset_type: string; identification: string; manufacturer: string; model: string; model_year: string; acquisition_date: string; acquisition_value: string; current_meter: string; meter_unit: string; location_description: string; notes: string }
type RuralContractRow = { id: string; title: string; contract_number: string; parcel_name: string; contract_type: string; farm_role: string; counterparty_name: string; counterparty_document: string; counterparty_phone: string; start_date: string; end_date: string; area_ha: string; activity: string; crop_name: string; payment_type: string; payment_amount: string; payment_frequency: string; first_due_date: string; installment_count: string; product_name: string; product_quantity: string; production_percentage: string; adjustment_index: string; renewal_notice_days: string; conservation_obligations: string; improvement_responsibility: string; tax_responsibility: string; notes: string }

export type ExistingFoundation = {
  farmId: string
  completed: boolean
  profile: ProfileForm
  counts: { pastures: number; cattleLots: number; employees: number; inventoryItems: number; landParcels: number; farmAssets: number; ruralContracts: number }
}

export type FoundationDraft = {
  currentStep: number
  revision: number
  lastSavedAt: string
  payload: {
    profile: ProfileForm
    pastures: PastureRow[]
    cattle_lots: CattleRow[]
    employees: EmployeeRow[]
    inventory_items: InventoryRow[]
    land_parcels: LandParcelRow[]
    farm_assets: FarmAssetRow[]
    rural_contracts: RuralContractRow[]
  }
}

const emptyProfile: ProfileForm = {
  name: '', legal_name: '', document_number: '', state_registration: '', owner_name: '', owner_phone: '',
  municipality: '', state_code: '', postal_code: '', address: '', location_description: '',
  total_area_ha: '', productive_area_ha: '', primary_activity: 'beef_cattle', livestock_system: 'extensive',
  timezone: 'America/Cuiaba', notes: '',
}

const steps = [
  { title: 'Operação pecuária', description: 'Responsáveis e sede', icon: Building2 },
  { title: 'Perfil pecuário', description: 'Área e sistema produtivo', icon: Tractor },
  { title: 'Propriedades', description: 'Fazendas e documentos', icon: Sprout },
  { title: 'Contratos rurais', description: 'Arrendamento e parceria', icon: ScrollText },
  { title: 'Pastos e rebanho', description: 'Estrutura pecuária', icon: Map },
  { title: 'Estrutura e máquinas', description: 'Patrimônio operacional', icon: Tractor },
  { title: 'Equipe', description: 'Pessoas iniciais', icon: Users },
  { title: 'Estoque', description: 'Saldos de abertura', icon: Package },
  { title: 'Revisão', description: 'Concluir implantação', icon: ClipboardCheck },
]

function rowId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function optionalNumber(value: string) {
  return value.trim() === '' ? null : Number(value)
}

function emptyLandParcel(): LandParcelRow {
  return {
    id: rowId(), name: '', tenure_type: 'owned', total_area_ha: '', usable_area_ha: '',
    municipality: '', state_code: '', property_registration: '', car_code: '', ccir_code: '',
    cib_nirf: '', georeferencing_status: 'not_informed', notes: '',
  }
}

function emptyFarmAsset(): FarmAssetRow {
  return {
    id: rowId(), name: '', property_name: '', asset_type: 'machine', identification: '', manufacturer: '', model: '',
    model_year: '', acquisition_date: '', acquisition_value: '', current_meter: '', meter_unit: '',
    location_description: '', notes: '',
  }
}

function emptyRuralContract(): RuralContractRow {
  return {
    id: rowId(), title: '', contract_number: '', parcel_name: '', contract_type: 'rural_lease',
    farm_role: 'grantor', counterparty_name: '', counterparty_document: '', counterparty_phone: '',
    start_date: '', end_date: '', area_ha: '', activity: '', crop_name: '', payment_type: 'fixed_money',
    payment_amount: '', payment_frequency: 'annual', first_due_date: '', installment_count: '1',
    product_name: '', product_quantity: '', production_percentage: '', adjustment_index: '',
    renewal_notice_days: '90', conservation_obligations: '', improvement_responsibility: '',
    tax_responsibility: '', notes: '',
  }
}

function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true"> *</span>
}

function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-border pb-5">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function EmptyFoundation({ label, onAdd, description }: { label: string; onAdd: () => void; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{description ?? `Nenhum ${label} informado. Esta etapa pode ser concluída depois.`}</p>
      <button type="button" onClick={onAdd} className="app-button-secondary mt-4">
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
      </button>
    </div>
  )
}

export function SetupClientPage({
  existing,
  draft,
  databaseError,
}: {
  existing: ExistingFoundation | null
  draft: FoundationDraft | null
  databaseError: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState(draft?.currentStep ?? 0)
  const [profile, setProfile] = useState<ProfileForm>(draft?.payload.profile ?? existing?.profile ?? emptyProfile)
  const [pastures, setPastures] = useState<PastureRow[]>(draft?.payload.pastures ?? [])
  const [cattleLots, setCattleLots] = useState<CattleRow[]>(draft?.payload.cattle_lots ?? [])
  const [employees, setEmployees] = useState<EmployeeRow[]>(draft?.payload.employees ?? [])
  const [inventoryItems, setInventoryItems] = useState<InventoryRow[]>(draft?.payload.inventory_items ?? [])
  const [landParcels, setLandParcels] = useState<LandParcelRow[]>(draft?.payload.land_parcels ?? [])
  const [farmAssets, setFarmAssets] = useState<FarmAssetRow[]>(draft?.payload.farm_assets ?? [])
  const [ruralContracts, setRuralContracts] = useState<RuralContractRow[]>(draft?.payload.rural_contracts ?? [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(databaseError)
  const [saveState, setSaveState] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>(draft ? 'saved' : 'idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(draft?.lastSavedAt ?? null)
  const revisionRef = useRef<number | null>(draft?.revision ?? null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveRequestRef = useRef(0)
  const firstAutosaveRenderRef = useRef(true)
  const canSeed = !existing?.completed

  const completion = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step])
  const propertiesTotalArea = useMemo(
    () => landParcels.reduce((total, property) => total + (Number(property.total_area_ha) || 0), 0),
    [landParcels],
  )
  const draftPayload = useMemo<FoundationDraft['payload']>(() => ({
    profile,
    pastures,
    cattle_lots: cattleLots,
    employees,
    inventory_items: inventoryItems,
    land_parcels: landParcels,
    farm_assets: farmAssets,
    rural_contracts: ruralContracts,
  }), [profile, pastures, cattleLots, employees, inventoryItems, landParcels, farmAssets, ruralContracts])
  const lastSavedFingerprintRef = useRef<string | null>(draft
    ? JSON.stringify({ payload: draft.payload, currentStep: draft.currentStep })
    : null)

  const persistDraft = useCallback((payload: FoundationDraft['payload'], targetStep: number) => {
    const fingerprint = JSON.stringify({ payload, currentStep: targetStep })
    if (fingerprint === lastSavedFingerprintRef.current) return Promise.resolve()

    const requestId = ++saveRequestRef.current
    setSaveState('saving')
    const task = saveQueueRef.current.then(async () => {
      const formData = new FormData()
      formData.set('farm_id', existing?.farmId ?? '')
      formData.set('payload', JSON.stringify(payload))
      formData.set('current_step', String(targetStep))
      formData.set('expected_revision', revisionRef.current === null ? '' : String(revisionRef.current))
      const saved = await saveFarmFoundationDraft(formData)
      revisionRef.current = saved.revision
      lastSavedFingerprintRef.current = fingerprint
      setLastSavedAt(saved.savedAt)
      if (requestId === saveRequestRef.current) setSaveState('saved')
    })
    saveQueueRef.current = task.then(() => undefined, () => undefined)
    return task.catch((caught) => {
      if (requestId === saveRequestRef.current) setSaveState('error')
      throw caught
    })
  }, [existing?.farmId])

  useEffect(() => {
    if (firstAutosaveRenderRef.current) {
      firstAutosaveRenderRef.current = false
      return
    }
    setSaveState('unsaved')
    const timeout = window.setTimeout(() => {
      void persistDraft(draftPayload, step).catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho automaticamente.')
      })
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [draftPayload, step, persistDraft])

  const savedTimeLabel = useMemo(() => {
    if (!lastSavedAt) return null
    const date = new Date(lastSavedAt)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
  }, [lastSavedAt])

  function updateProfile(field: keyof ProfileForm, value: string) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  async function moveToStep(targetStep: number) {
    setError(null)
    setPending(true)
    try {
      await persistDraft(draftPayload, targetStep)
      setStep(targetStep)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar esta etapa.')
    } finally {
      setPending(false)
    }
  }

  async function saveNow() {
    setError(null)
    setPending(true)
    try {
      await persistDraft(draftPayload, step)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho.')
    } finally {
      setPending(false)
    }
  }

  async function submitFoundation() {
    setPending(true)
    setError(null)
    const formData = new FormData()
    formData.set('farm_id', existing?.farmId ?? '')
    formData.set('profile', JSON.stringify({
      ...profile,
      total_area_ha: canSeed ? propertiesTotalArea : Number(profile.total_area_ha),
      productive_area_ha: optionalNumber(profile.productive_area_ha),
    }))
    formData.set('pastures', JSON.stringify(canSeed ? pastures.map(({ id: _id, ...row }) => ({
      ...row,
      approximate_capacity: optionalNumber(row.approximate_capacity),
    })) : []))
    formData.set('cattle_lots', JSON.stringify(canSeed ? cattleLots.map(({ id: _id, ...row }) => ({
      ...row,
      current_quantity: Number(row.current_quantity),
    })) : []))
    formData.set('employees', JSON.stringify(canSeed ? employees.map(({ id: _id, ...row }) => ({
      ...row,
      salary_amount: optionalNumber(row.salary_amount),
    })) : []))
    formData.set('inventory_items', JSON.stringify(canSeed ? inventoryItems.map(({ id: _id, ...row }) => ({
      ...row,
      current_quantity: Number(row.current_quantity),
      minimum_quantity: optionalNumber(row.minimum_quantity),
    })) : []))
    formData.set('land_parcels', JSON.stringify(landParcels.map(({ id: _id, ...row }) => ({ ...row, total_area_ha: Number(row.total_area_ha), usable_area_ha: optionalNumber(row.usable_area_ha) }))))
    formData.set('farm_assets', JSON.stringify(farmAssets.map(({ id: _id, ...row }) => ({ ...row, model_year: optionalNumber(row.model_year), acquisition_value: optionalNumber(row.acquisition_value), current_meter: optionalNumber(row.current_meter) }))))
    formData.set('rural_contracts', JSON.stringify(ruralContracts.map(({ id: _id, ...row }) => ({ ...row, area_ha: Number(row.area_ha), payment_amount: optionalNumber(row.payment_amount), installment_count: optionalNumber(row.installment_count), product_quantity: optionalNumber(row.product_quantity), production_percentage: optionalNumber(row.production_percentage), renewal_notice_days: Number(row.renewal_notice_days || 90) }))))

    try {
      await persistDraft(draftPayload, step)
      await configureFarmFoundation(formData)
      router.push('/?setup=completed')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a implantação.')
      setPending(false)
    }
  }

  return (
    <div className="app-page max-w-[1280px]">
      <header className="border-b border-border pb-6">
        <p className="app-kicker">Configuração administrativa</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Base da operação pecuária</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Cadastre a operação consolidada e todas as propriedades usadas pelo rebanho. Dashboard, relatórios e IA analisam o conjunto e preservam o detalhamento por propriedade.
            </p>
          </div>
          {existing?.completed && (
            <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <Check className="h-4 w-4" aria-hidden="true" /> Implantação concluída
            </span>
          )}
          {!existing?.completed && (
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground" role="status" aria-live="polite">
              {saveState === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Cloud className="h-4 w-4" aria-hidden="true" />}
              {saveState === 'saving' ? 'Salvando automaticamente...'
                : saveState === 'unsaved' ? 'Alterações aguardando salvamento'
                  : saveState === 'error' ? 'Rascunho não salvo'
                    : savedTimeLabel ? `Rascunho salvo em ${savedTimeLabel}`
                      : 'Salvamento automático ativo'}
            </div>
          )}
        </div>
      </header>

      <InlineFeedback kind="error" message={error} />
      <InlineFeedback
        kind="info"
        message={draft ? `Seu preenchimento anterior foi restaurado na etapa “${steps[step]?.title}”. Você pode continuar agora e completar os dados obrigatórios depois.` : 'Cada etapa é salva automaticamente. Você pode avançar mesmo sem ter todas as informações e concluir a implantação quando a base estiver completa.'}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="app-panel h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Implantação</span><span className="tabular-nums text-muted-foreground">{completion}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <ol className="p-2">
            {steps.map((item, index) => {
              const Icon = item.icon
              return (
                <li key={item.title}>
                  <button
                    type="button"
                    onClick={() => void moveToStep(index)}
                    disabled={pending}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${index === step ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-[11px] opacity-75">{item.description}</span></span>
                    {index < step && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        <section className="app-panel min-w-0 p-5 sm:p-7">
          {step === 0 && (
            <div className="space-y-6">
              <SectionIntro title="Identificação da operação pecuária" description="Nome do conjunto administrado, responsáveis e endereço da sede. As fazendas físicas serão cadastradas separadamente na etapa Propriedades." />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField htmlFor="foundation-name" label={<>Nome da operação / grupo<RequiredMark /></>}><input id="foundation-name" value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} className={fieldClassName} placeholder="Ex.: Pecuária Família Silva" autoFocus /></FormField>
                <FormField htmlFor="foundation-legal-name" label="Razão social / nome legal"><input id="foundation-legal-name" value={profile.legal_name} onChange={(event) => updateProfile('legal_name', event.target.value)} className={fieldClassName} /></FormField>
                <FormField htmlFor="foundation-document" label="CPF ou CNPJ"><input id="foundation-document" value={profile.document_number} onChange={(event) => updateProfile('document_number', event.target.value)} className={fieldClassName} inputMode="numeric" /></FormField>
                <FormField htmlFor="foundation-state-registration" label="Inscrição estadual"><input id="foundation-state-registration" value={profile.state_registration} onChange={(event) => updateProfile('state_registration', event.target.value)} className={fieldClassName} /></FormField>
                <FormField htmlFor="foundation-owner" label="Proprietário / responsável"><input id="foundation-owner" value={profile.owner_name} onChange={(event) => updateProfile('owner_name', event.target.value)} className={fieldClassName} /></FormField>
                <FormField htmlFor="foundation-owner-phone" label="Telefone do responsável"><input id="foundation-owner-phone" value={profile.owner_phone} onChange={(event) => updateProfile('owner_phone', event.target.value)} className={fieldClassName} inputMode="tel" /></FormField>
                <FormField htmlFor="foundation-municipality" label={<>Município da sede<RequiredMark /></>}><input id="foundation-municipality" value={profile.municipality} onChange={(event) => updateProfile('municipality', event.target.value)} className={fieldClassName} /></FormField>
                <div className="grid grid-cols-[90px_1fr] gap-3">
                  <FormField htmlFor="foundation-state" label={<>UF<RequiredMark /></>}><input id="foundation-state" value={profile.state_code} onChange={(event) => updateProfile('state_code', event.target.value.toUpperCase().slice(0, 2))} className={fieldClassName} maxLength={2} /></FormField>
                  <FormField htmlFor="foundation-postal" label="CEP"><input id="foundation-postal" value={profile.postal_code} onChange={(event) => updateProfile('postal_code', event.target.value)} className={fieldClassName} inputMode="numeric" /></FormField>
                </div>
                <div className="md:col-span-2"><FormField htmlFor="foundation-address" label="Endereço / acesso principal"><input id="foundation-address" value={profile.address} onChange={(event) => updateProfile('address', event.target.value)} className={fieldClassName} placeholder="Rodovia, km, estrada vicinal e referências" /></FormField></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <SectionIntro title="Perfil consolidado da pecuária" description="Defina o modelo produtivo da operação. A área total será calculada automaticamente pela soma das propriedades na próxima etapa." />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField htmlFor="foundation-productive-area" label="Área produtiva consolidada (ha)"><input id="foundation-productive-area" type="number" min="0" step="0.01" value={profile.productive_area_ha} onChange={(event) => updateProfile('productive_area_ha', event.target.value)} className={fieldClassName} /></FormField>
                <FormField htmlFor="foundation-activity" label="Atividade principal"><select id="foundation-activity" value={profile.primary_activity} onChange={(event) => updateProfile('primary_activity', event.target.value)} className={fieldClassName}><option value="beef_cattle">Pecuária de corte</option><option value="dairy_cattle">Pecuária leiteira</option><option value="mixed_cattle">Pecuária mista</option><option value="other">Outra atividade pecuária</option></select></FormField>
                <FormField htmlFor="foundation-system" label="Sistema pecuário"><select id="foundation-system" value={profile.livestock_system} onChange={(event) => updateProfile('livestock_system', event.target.value)} className={fieldClassName}><option value="extensive">Extensivo</option><option value="semi_intensive">Semi-intensivo</option><option value="intensive">Intensivo / confinamento</option><option value="not_applicable">Não se aplica</option></select></FormField>
                <FormField htmlFor="foundation-timezone" label="Fuso operacional"><select id="foundation-timezone" value={profile.timezone} onChange={(event) => updateProfile('timezone', event.target.value)} className={fieldClassName}><option value="America/Cuiaba">Mato Grosso</option><option value="America/Campo_Grande">Mato Grosso do Sul</option><option value="America/Porto_Velho">Rondônia</option><option value="America/Manaus">Amazonas</option><option value="America/Sao_Paulo">Brasília / Sudeste</option></select></FormField>
                <FormField htmlFor="foundation-location" label="Descrição da localização"><input id="foundation-location" value={profile.location_description} onChange={(event) => updateProfile('location_description', event.target.value)} className={fieldClassName} placeholder="Região, coordenadas ou referências" /></FormField>
                <div className="md:col-span-2"><FormField htmlFor="foundation-notes" label="Contexto permanente da operação"><textarea id="foundation-notes" rows={5} value={profile.notes} onChange={(event) => updateProfile('notes', event.target.value)} className={`${fieldClassName} resize-y`} placeholder="Objetivos, características do solo, regime de chuvas, particularidades sanitárias e operacionais." /></FormField></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <SectionIntro title="Propriedades rurais da operação" description="Cadastre a sede e cada uma das outras fazendas como propriedades independentes. Nenhuma delas deve ser cadastrada como pasto: cada propriedade poderá conter vários pastos." />
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                <span className="font-semibold">Área das propriedades informadas:</span>{' '}
                <span className="tabular-nums">{propertiesTotalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</span>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Esse total alimenta automaticamente os indicadores consolidados. Áreas utilizáveis permanecem separadas para cálculo de lotação e produtividade.</p>
              </div>
              <FoundationListHeader title="Fazendas / propriedades" onAdd={() => setLandParcels(rows => [...rows, emptyLandParcel()])} />
              {landParcels.length === 0 ? <EmptyFoundation label="propriedade rural" description="Nenhuma propriedade rural informada. Cadastre pelo menos uma fazenda física para continuar a implantação." onAdd={() => setLandParcels([emptyLandParcel()])} /> : landParcels.map(row => <LandParcelEditor key={row.id} row={row} onChange={next => setLandParcels(rows => rows.map(item => item.id === row.id ? next : item))} onRemove={() => setLandParcels(rows => rows.filter(item => item.id !== row.id))} />)}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <SectionIntro title="Arrendamentos, parcerias e comodatos" description="Cadastre o vínculo da terra, a contraparte, o período, a forma de pagamento e as responsabilidades. Arrendamento e parceria permanecem contratos distintos." />
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">O sistema organiza dados, parcelas e alertas, mas não substitui a revisão jurídica do contrato. Não informe apenas “alugamos a terra”: período, área, contraparte, atividade e remuneração são necessários.</div>
              <FoundationListHeader title="Contratos rurais" onAdd={() => setRuralContracts(rows => [...rows, emptyRuralContract()])} />
              {ruralContracts.length === 0 ? <EmptyFoundation label="contrato rural" onAdd={() => setRuralContracts([emptyRuralContract()])} /> : ruralContracts.map(row => <RuralContractEditor key={row.id} row={row} parcelNames={landParcels.map(parcel => parcel.name).filter(Boolean)} onChange={next => setRuralContracts(rows => rows.map(item => item.id === row.id ? next : item))} onRemove={() => setRuralContracts(rows => rows.filter(item => item.id !== row.id))} />)}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8">
              <SectionIntro title="Pastos e rebanho inicial" description={canSeed ? 'Cadastre a estrutura atual e os saldos de animais. Depois da implantação, alterações serão feitas nos módulos operacionais.' : 'A implantação já foi concluída. Use os módulos específicos para manter esses cadastros.'} />
              {!canSeed ? (
                <div className="grid gap-4 sm:grid-cols-2"><FoundationLink href="/pastures" label="Pastos" count={existing?.counts.pastures ?? 0} /><FoundationLink href="/cattle" label="Lotes de gado" count={existing?.counts.cattleLots ?? 0} /></div>
              ) : (
                <>
                  <FoundationListHeader title="Pastos por propriedade" onAdd={() => setPastures((rows) => [...rows, { id: rowId(), name: '', property_name: landParcels[0]?.name ?? '', approximate_capacity: '', current_condition: '' }])} />
                  {pastures.length === 0 ? <EmptyFoundation label="pasto" onAdd={() => setPastures([{ id: rowId(), name: '', property_name: landParcels[0]?.name ?? '', approximate_capacity: '', current_condition: '' }])} /> : pastures.map((row) => <PastureEditor key={row.id} row={row} propertyNames={landParcels.map(property => property.name).filter(Boolean)} onChange={(next) => setPastures((rows) => rows.map((item) => item.id === row.id ? next : item))} onRemove={() => setPastures((rows) => rows.filter((item) => item.id !== row.id))} />)}
                  <FoundationListHeader title="Lotes de gado" onAdd={() => setCattleLots((rows) => [...rows, { id: rowId(), name: '', category: '', current_quantity: '', pasture_name: '' }])} />
                  {cattleLots.length === 0 ? <EmptyFoundation label="lote" onAdd={() => setCattleLots([{ id: rowId(), name: '', category: '', current_quantity: '', pasture_name: '' }])} /> : cattleLots.map((row) => <CattleEditor key={row.id} row={row} pastureNames={pastures.map((pasture) => pasture.name).filter(Boolean)} onChange={(next) => setCattleLots((rows) => rows.map((item) => item.id === row.id ? next : item))} onRemove={() => setCattleLots((rows) => rows.filter((item) => item.id !== row.id))} />)}
                </>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <SectionIntro title="Estruturas, máquinas e recursos" description="Identifique máquinas, veículos, implementos, currais, cercas, armazéns, fontes de água e energia usados pela operação." />
              <FoundationListHeader title="Ativos operacionais" onAdd={() => setFarmAssets(rows => [...rows, { ...emptyFarmAsset(), property_name: landParcels[0]?.name ?? '' }])} />
              {farmAssets.length === 0 ? <EmptyFoundation label="ativo operacional" onAdd={() => setFarmAssets([{ ...emptyFarmAsset(), property_name: landParcels[0]?.name ?? '' }])} /> : farmAssets.map(row => <FarmAssetEditor key={row.id} row={row} propertyNames={landParcels.map(property => property.name).filter(Boolean)} onChange={next => setFarmAssets(rows => rows.map(item => item.id === row.id ? next : item))} onRemove={() => setFarmAssets(rows => rows.filter(item => item.id !== row.id))} />)}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <SectionIntro title="Equipe inicial" description={canSeed ? 'Informe as pessoas já vinculadas à propriedade. Salário e telefone são opcionais.' : 'A equipe passa a ser mantida no módulo de funcionários.'} />
              {!canSeed ? <FoundationLink href="/employees" label="Funcionários" count={existing?.counts.employees ?? 0} /> : <><FoundationListHeader title="Funcionários" onAdd={() => setEmployees((rows) => [...rows, { id: rowId(), full_name: '', role_description: '', salary_amount: '', phone_number: '' }])} />{employees.length === 0 ? <EmptyFoundation label="funcionário" onAdd={() => setEmployees([{ id: rowId(), full_name: '', role_description: '', salary_amount: '', phone_number: '' }])} /> : employees.map((row) => <EmployeeEditor key={row.id} row={row} onChange={(next) => setEmployees((rows) => rows.map((item) => item.id === row.id ? next : item))} onRemove={() => setEmployees((rows) => rows.filter((item) => item.id !== row.id))} />)}</>}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <SectionIntro title="Estoque de abertura" description={canSeed ? 'Registre os saldos físicos existentes antes de começar a lançar entradas e saídas.' : 'Os saldos atuais são mantidos pelo módulo de estoque e suas movimentações.'} />
              {!canSeed ? <FoundationLink href="/inventory" label="Itens de estoque" count={existing?.counts.inventoryItems ?? 0} /> : <><FoundationListHeader title="Itens" onAdd={() => setInventoryItems((rows) => [...rows, { id: rowId(), name: '', category: '', current_quantity: '', minimum_quantity: '', unit: '' }])} />{inventoryItems.length === 0 ? <EmptyFoundation label="item" onAdd={() => setInventoryItems([{ id: rowId(), name: '', category: '', current_quantity: '', minimum_quantity: '', unit: '' }])} /> : inventoryItems.map((row) => <InventoryEditor key={row.id} row={row} onChange={(next) => setInventoryItems((rows) => rows.map((item) => item.id === row.id ? next : item))} onRemove={() => setInventoryItems((rows) => rows.filter((item) => item.id !== row.id))} />)}</>}
            </div>
          )}

          {step === 8 && (
            <div className="space-y-6">
              <SectionIntro title="Revisão da base" description="Confira o resumo. A gravação é transacional: ou todas as etapas são concluídas, ou nenhuma alteração parcial permanece." />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Summary label="Operação pecuária" value={profile.name || 'Não informada'} />
                <Summary label="Localização" value={`${profile.municipality || '—'}${profile.state_code ? ` / ${profile.state_code}` : ''}`} />
                <Summary label="Área total consolidada" value={`${(canSeed ? propertiesTotalArea : Number(profile.total_area_ha || 0)).toLocaleString('pt-BR')} ha`} />
                <Summary label="Propriedades" value={`${landParcels.length || existing?.counts.landParcels || 0} fazenda(s)`} />
                <Summary label="Contratos rurais" value={String(ruralContracts.length || existing?.counts.ruralContracts || 0)} />
                <Summary label="Pastos" value={String(canSeed ? pastures.length : existing?.counts.pastures ?? 0)} />
                <Summary label="Lotes" value={String(canSeed ? cattleLots.length : existing?.counts.cattleLots ?? 0)} />
                <Summary label="Estruturas / máquinas" value={String(farmAssets.length || existing?.counts.farmAssets || 0)} />
                <Summary label="Equipe / estoque" value={`${canSeed ? employees.length : existing?.counts.employees ?? 0} pessoas · ${canSeed ? inventoryItems.length : existing?.counts.inventoryItems ?? 0} itens`} />
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 text-sm leading-6 text-foreground">
                {existing?.completed ? 'Os dados cadastrais serão atualizados. Pastos, lotes, funcionários e estoque existentes não serão duplicados.' : 'Ao concluir, estes registros passam a ser a referência inicial da operação e do assistente.'}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => void moveToStep(Math.max(0, step - 1))} disabled={step === 0 || pending} className="app-button-secondary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Voltar</button>
            <button type="button" onClick={() => void saveNow()} disabled={pending || saveState === 'saving'} className="app-button-secondary sm:ml-auto disabled:opacity-40"><Save className="h-4 w-4" /> Salvar agora</button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => void moveToStep(Math.min(step + 1, steps.length - 1))} disabled={pending} className="app-button-primary disabled:opacity-60">{pending ? 'Salvando etapa...' : 'Salvar e continuar'} <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" onClick={submitFoundation} disabled={pending} className="app-button-primary disabled:opacity-60">{pending ? 'Salvando base...' : existing?.completed ? 'Atualizar dados mestres' : 'Concluir implantação'} <Check className="h-4 w-4" /></button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function FoundationListHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">{title}</h3><button type="button" onClick={onAdd} className="app-button-secondary"><Plus className="h-4 w-4" /> Adicionar</button></div>
}

function FoundationLink({ href, label, count }: { href: string; label: string; count: number }) {
  return <Link href={href} className="flex items-center justify-between rounded-xl border border-border p-5 hover:border-primary/30 hover:bg-muted/30"><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">Abrir módulo para editar</span></span><span className="font-mono text-lg font-semibold tabular-nums">{count}</span></Link>
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label="Remover linha"><Trash2 className="h-4 w-4" /></button>
}

function EditorCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</p>
        <RemoveButton onClick={onRemove} />
      </div>
      {children}
    </div>
  )
}

function LandParcelEditor({ row, onChange, onRemove }: { row: LandParcelRow; onChange: (row: LandParcelRow) => void; onRemove: () => void }) {
  return (
    <EditorCard title={row.name || 'Nova propriedade rural'} onRemove={onRemove}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField htmlFor={`${row.id}-parcel-name`} label={<>Nome da propriedade<RequiredMark /></>}><input id={`${row.id}-parcel-name`} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} className={fieldClassName} placeholder="Ex.: Fazenda Sede, Fazenda Santa Luzia" /></FormField>
        <FormField htmlFor={`${row.id}-tenure`} label="Vínculo da terra"><select id={`${row.id}-tenure`} value={row.tenure_type} onChange={(e) => onChange({ ...row, tenure_type: e.target.value })} className={fieldClassName}><option value="owned">Própria</option><option value="leased_in">Arrendada pela fazenda</option><option value="leased_out">Cedida em arrendamento</option><option value="partnership">Em parceria rural</option><option value="commodatum">Em comodato</option><option value="other">Outro vínculo</option></select></FormField>
        <FormField htmlFor={`${row.id}-parcel-total`} label={<>Área total (ha)<RequiredMark /></>}><input id={`${row.id}-parcel-total`} type="number" min="0.01" step="0.01" value={row.total_area_ha} onChange={(e) => onChange({ ...row, total_area_ha: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-parcel-usable`} label="Área utilizável (ha)"><input id={`${row.id}-parcel-usable`} type="number" min="0" step="0.01" value={row.usable_area_ha} onChange={(e) => onChange({ ...row, usable_area_ha: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-parcel-city`} label="Município"><input id={`${row.id}-parcel-city`} value={row.municipality} onChange={(e) => onChange({ ...row, municipality: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-parcel-state`} label="UF"><input id={`${row.id}-parcel-state`} maxLength={2} value={row.state_code} onChange={(e) => onChange({ ...row, state_code: e.target.value.toUpperCase().slice(0, 2) })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-registration`} label="Matrícula / transcrição"><input id={`${row.id}-registration`} value={row.property_registration} onChange={(e) => onChange({ ...row, property_registration: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-car`} label="CAR"><input id={`${row.id}-car`} value={row.car_code} onChange={(e) => onChange({ ...row, car_code: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-ccir`} label="CCIR"><input id={`${row.id}-ccir`} value={row.ccir_code} onChange={(e) => onChange({ ...row, ccir_code: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-cib`} label="CIB / NIRF"><input id={`${row.id}-cib`} value={row.cib_nirf} onChange={(e) => onChange({ ...row, cib_nirf: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-geo`} label="Georreferenciamento"><select id={`${row.id}-geo`} value={row.georeferencing_status} onChange={(e) => onChange({ ...row, georeferencing_status: e.target.value })} className={fieldClassName}><option value="not_informed">Não informado</option><option value="pending">Pendente</option><option value="certified">Certificado</option><option value="not_applicable">Não se aplica</option></select></FormField>
        <div className="md:col-span-2 xl:col-span-3"><FormField htmlFor={`${row.id}-parcel-notes`} label="Observações fundiárias"><textarea id={`${row.id}-parcel-notes`} rows={3} value={row.notes} onChange={(e) => onChange({ ...row, notes: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField></div>
      </div>
    </EditorCard>
  )
}

function FarmAssetEditor({ row, propertyNames, onChange, onRemove }: { row: FarmAssetRow; propertyNames: string[]; onChange: (row: FarmAssetRow) => void; onRemove: () => void }) {
  return (
    <EditorCard title={row.name || 'Novo ativo operacional'} onRemove={onRemove}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField htmlFor={`${row.id}-asset-name`} label={<>Nome do ativo<RequiredMark /></>}><input id={`${row.id}-asset-name`} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} className={fieldClassName} placeholder="Ex.: Trator John Deere 6110J" /></FormField>
        <FormField htmlFor={`${row.id}-asset-property`} label="Propriedade-base"><select id={`${row.id}-asset-property`} value={row.property_name} onChange={(e) => onChange({ ...row, property_name: e.target.value })} className={fieldClassName}><option value="">Uso móvel / sem base fixa</option>{propertyNames.map(name => <option key={name} value={name}>{name}</option>)}</select></FormField>
        <FormField htmlFor={`${row.id}-asset-type`} label="Tipo"><select id={`${row.id}-asset-type`} value={row.asset_type} onChange={(e) => onChange({ ...row, asset_type: e.target.value })} className={fieldClassName}><option value="machine">Máquina</option><option value="vehicle">Veículo</option><option value="implement">Implemento</option><option value="building">Edificação</option><option value="storage">Armazenagem</option><option value="water">Recurso hídrico</option><option value="energy">Energia</option><option value="corral">Curral</option><option value="fence">Cerca</option><option value="other">Outro</option></select></FormField>
        <FormField htmlFor={`${row.id}-asset-id`} label="Patrimônio / identificação"><input id={`${row.id}-asset-id`} value={row.identification} onChange={(e) => onChange({ ...row, identification: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-manufacturer`} label="Fabricante"><input id={`${row.id}-manufacturer`} value={row.manufacturer} onChange={(e) => onChange({ ...row, manufacturer: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-model`} label="Modelo"><input id={`${row.id}-model`} value={row.model} onChange={(e) => onChange({ ...row, model: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-year`} label="Ano"><input id={`${row.id}-year`} type="number" min="1900" max="2200" value={row.model_year} onChange={(e) => onChange({ ...row, model_year: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-acquisition-date`} label="Data de aquisição"><input id={`${row.id}-acquisition-date`} type="date" value={row.acquisition_date} onChange={(e) => onChange({ ...row, acquisition_date: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-acquisition-value`} label="Valor de aquisição"><input id={`${row.id}-acquisition-value`} type="number" min="0" step="0.01" value={row.acquisition_value} onChange={(e) => onChange({ ...row, acquisition_value: e.target.value })} className={fieldClassName} /></FormField>
        <div className="grid grid-cols-2 gap-3"><FormField htmlFor={`${row.id}-meter`} label="Medidor atual"><input id={`${row.id}-meter`} type="number" min="0" step="0.01" value={row.current_meter} onChange={(e) => onChange({ ...row, current_meter: e.target.value })} className={fieldClassName} /></FormField><FormField htmlFor={`${row.id}-meter-unit`} label="Unidade"><input id={`${row.id}-meter-unit`} value={row.meter_unit} onChange={(e) => onChange({ ...row, meter_unit: e.target.value })} className={fieldClassName} placeholder="horas, km" /></FormField></div>
        <div className="md:col-span-2 xl:col-span-3"><FormField htmlFor={`${row.id}-asset-location`} label="Localização"><input id={`${row.id}-asset-location`} value={row.location_description} onChange={(e) => onChange({ ...row, location_description: e.target.value })} className={fieldClassName} /></FormField></div>
        <div className="md:col-span-2 xl:col-span-3"><FormField htmlFor={`${row.id}-asset-notes`} label="Estado, especificações e observações"><textarea id={`${row.id}-asset-notes`} rows={3} value={row.notes} onChange={(e) => onChange({ ...row, notes: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField></div>
      </div>
    </EditorCard>
  )
}

function RuralContractEditor({ row, parcelNames, onChange, onRemove }: { row: RuralContractRow; parcelNames: string[]; onChange: (row: RuralContractRow) => void; onRemove: () => void }) {
  const hasMoney = ['fixed_money', 'per_hectare'].includes(row.payment_type)
  const hasSchedule = row.payment_type !== 'free'
  const hasProduct = ['product_quantity', 'mixed'].includes(row.payment_type)
  const hasPercentage = ['production_percentage', 'mixed'].includes(row.payment_type)
  return (
    <EditorCard title={row.title || row.counterparty_name || 'Novo contrato rural'} onRemove={onRemove}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField htmlFor={`${row.id}-contract-title`} label="Título do contrato"><input id={`${row.id}-contract-title`} value={row.title} onChange={(e) => onChange({ ...row, title: e.target.value })} className={fieldClassName} placeholder="Ex.: Arrendamento safra 2026/27" /></FormField>
        <FormField htmlFor={`${row.id}-contract-number`} label="Número / referência"><input id={`${row.id}-contract-number`} value={row.contract_number} onChange={(e) => onChange({ ...row, contract_number: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-contract-parcel`} label={<>Imóvel / área<RequiredMark /></>}><select id={`${row.id}-contract-parcel`} value={row.parcel_name} onChange={(e) => onChange({ ...row, parcel_name: e.target.value })} className={fieldClassName}><option value="">Selecione</option>{parcelNames.map(name => <option key={name} value={name}>{name}</option>)}</select></FormField>
        <FormField htmlFor={`${row.id}-contract-type`} label="Modalidade"><select id={`${row.id}-contract-type`} value={row.contract_type} onChange={(e) => onChange({ ...row, contract_type: e.target.value })} className={fieldClassName}><option value="rural_lease">Arrendamento rural</option><option value="rural_partnership">Parceria rural</option><option value="commodatum">Comodato</option><option value="sublease">Subarrendamento</option><option value="other">Outro</option></select></FormField>
        <FormField htmlFor={`${row.id}-farm-role`} label="Papel da fazenda"><select id={`${row.id}-farm-role`} value={row.farm_role} onChange={(e) => onChange({ ...row, farm_role: e.target.value })} className={fieldClassName}><option value="grantor">Cede a terra a terceiro</option><option value="grantee">Recebe a terra para explorar</option></select></FormField>
        <FormField htmlFor={`${row.id}-counterparty`} label={<>Contraparte<RequiredMark /></>}><input id={`${row.id}-counterparty`} value={row.counterparty_name} onChange={(e) => onChange({ ...row, counterparty_name: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-counterparty-document`} label="CPF/CNPJ da contraparte"><input id={`${row.id}-counterparty-document`} value={row.counterparty_document} onChange={(e) => onChange({ ...row, counterparty_document: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-counterparty-phone`} label="Contato"><input id={`${row.id}-counterparty-phone`} value={row.counterparty_phone} onChange={(e) => onChange({ ...row, counterparty_phone: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-contract-area`} label={<>Área contratada (ha)<RequiredMark /></>}><input id={`${row.id}-contract-area`} type="number" min="0.01" step="0.01" value={row.area_ha} onChange={(e) => onChange({ ...row, area_ha: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-start-date`} label={<>Início<RequiredMark /></>}><input id={`${row.id}-start-date`} type="date" value={row.start_date} onChange={(e) => onChange({ ...row, start_date: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-end-date`} label={<>Término<RequiredMark /></>}><input id={`${row.id}-end-date`} type="date" value={row.end_date} onChange={(e) => onChange({ ...row, end_date: e.target.value })} className={fieldClassName} /></FormField>
        <FormField htmlFor={`${row.id}-activity`} label={<>Atividade autorizada<RequiredMark /></>}><input id={`${row.id}-activity`} value={row.activity} onChange={(e) => onChange({ ...row, activity: e.target.value })} className={fieldClassName} placeholder="Cultivo de grãos, pecuária..." /></FormField>
        <FormField htmlFor={`${row.id}-crop`} label="Cultura"><input id={`${row.id}-crop`} value={row.crop_name} onChange={(e) => onChange({ ...row, crop_name: e.target.value })} className={fieldClassName} placeholder="Soja, milho..." /></FormField>
        <FormField htmlFor={`${row.id}-payment-type`} label="Forma de remuneração"><select id={`${row.id}-payment-type`} value={row.payment_type} onChange={(e) => onChange({ ...row, payment_type: e.target.value })} className={fieldClassName}><option value="fixed_money">Valor fixo em dinheiro</option><option value="per_hectare">Valor por hectare</option><option value="product_quantity">Quantidade de produto</option><option value="production_percentage">Percentual da produção</option><option value="mixed">Composição mista</option><option value="free">Gratuito</option></select></FormField>
        {hasMoney && <FormField htmlFor={`${row.id}-payment-amount`} label={row.payment_type === 'per_hectare' ? <>Valor por hectare<RequiredMark /></> : <>Valor por parcela<RequiredMark /></>}><input id={`${row.id}-payment-amount`} type="number" min="0.01" step="0.01" value={row.payment_amount} onChange={(e) => onChange({ ...row, payment_amount: e.target.value })} className={fieldClassName} /></FormField>}
        {hasSchedule && <><FormField htmlFor={`${row.id}-frequency`} label={<>Frequência<RequiredMark /></>}><select id={`${row.id}-frequency`} value={row.payment_frequency} onChange={(e) => onChange({ ...row, payment_frequency: e.target.value, installment_count: ['single', 'harvest'].includes(e.target.value) ? '1' : row.installment_count })} className={fieldClassName}><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option><option value="annual">Anual</option><option value="harvest">Por safra</option><option value="single">Parcela única</option><option value="custom">Personalizada</option></select></FormField><FormField htmlFor={`${row.id}-first-due`} label={<>Primeiro vencimento<RequiredMark /></>}><input id={`${row.id}-first-due`} type="date" value={row.first_due_date} onChange={(e) => onChange({ ...row, first_due_date: e.target.value })} className={fieldClassName} /></FormField><FormField htmlFor={`${row.id}-installments`} label="Número de parcelas"><input id={`${row.id}-installments`} type="number" min="1" max="120" value={row.installment_count} onChange={(e) => onChange({ ...row, installment_count: e.target.value })} className={fieldClassName} /></FormField></>}
        {hasProduct && <><FormField htmlFor={`${row.id}-product-name`} label={<>Produto<RequiredMark /></>}><input id={`${row.id}-product-name`} value={row.product_name} onChange={(e) => onChange({ ...row, product_name: e.target.value })} className={fieldClassName} placeholder="Sacas de soja" /></FormField><FormField htmlFor={`${row.id}-product-quantity`} label={<>Quantidade<RequiredMark /></>}><input id={`${row.id}-product-quantity`} type="number" min="0.01" step="0.01" value={row.product_quantity} onChange={(e) => onChange({ ...row, product_quantity: e.target.value })} className={fieldClassName} /></FormField></>}
        {hasPercentage && <FormField htmlFor={`${row.id}-percentage`} label={<>Percentual da produção<RequiredMark /></>}><input id={`${row.id}-percentage`} type="number" min="0.01" max="100" step="0.01" value={row.production_percentage} onChange={(e) => onChange({ ...row, production_percentage: e.target.value })} className={fieldClassName} /></FormField>}
        <FormField htmlFor={`${row.id}-adjustment`} label="Índice de reajuste"><input id={`${row.id}-adjustment`} value={row.adjustment_index} onChange={(e) => onChange({ ...row, adjustment_index: e.target.value })} className={fieldClassName} placeholder="IPCA, preço da saca..." /></FormField>
        <FormField htmlFor={`${row.id}-renewal`} label="Avisar antes do término (dias)"><input id={`${row.id}-renewal`} type="number" min="0" max="730" value={row.renewal_notice_days} onChange={(e) => onChange({ ...row, renewal_notice_days: e.target.value })} className={fieldClassName} /></FormField>
        <div className="md:col-span-2 xl:col-span-3 grid gap-4 md:grid-cols-3"><FormField htmlFor={`${row.id}-conservation`} label="Conservação e uso"><textarea id={`${row.id}-conservation`} rows={3} value={row.conservation_obligations} onChange={(e) => onChange({ ...row, conservation_obligations: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField><FormField htmlFor={`${row.id}-improvements`} label="Benfeitorias"><textarea id={`${row.id}-improvements`} rows={3} value={row.improvement_responsibility} onChange={(e) => onChange({ ...row, improvement_responsibility: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField><FormField htmlFor={`${row.id}-tax`} label="Impostos e taxas"><textarea id={`${row.id}-tax`} rows={3} value={row.tax_responsibility} onChange={(e) => onChange({ ...row, tax_responsibility: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField></div>
        <div className="md:col-span-2 xl:col-span-3"><FormField htmlFor={`${row.id}-contract-notes`} label="Demais cláusulas e observações"><textarea id={`${row.id}-contract-notes`} rows={3} value={row.notes} onChange={(e) => onChange({ ...row, notes: e.target.value })} className={`${fieldClassName} resize-y`} /></FormField></div>
      </div>
    </EditorCard>
  )
}

function PastureEditor({ row, propertyNames, onChange, onRemove }: { row: PastureRow; propertyNames: string[]; onChange: (row: PastureRow) => void; onRemove: () => void }) {
  return <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1.2fr_1.2fr_.8fr_1fr_auto]"><input aria-label="Nome do pasto" placeholder="Nome do pasto" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} className={fieldClassName} /><select aria-label="Propriedade do pasto" value={row.property_name} onChange={(e) => onChange({ ...row, property_name: e.target.value })} className={fieldClassName}><option value="">Selecione a propriedade</option>{propertyNames.map(name => <option key={name} value={name}>{name}</option>)}</select><input aria-label="Capacidade aproximada" type="number" min="0" placeholder="Capacidade (cabeças)" value={row.approximate_capacity} onChange={(e) => onChange({ ...row, approximate_capacity: e.target.value })} className={fieldClassName} /><input aria-label="Condição atual" placeholder="Condição atual" value={row.current_condition} onChange={(e) => onChange({ ...row, current_condition: e.target.value })} className={fieldClassName} /><RemoveButton onClick={onRemove} /></div>
}

function CattleEditor({ row, pastureNames, onChange, onRemove }: { row: CattleRow; pastureNames: string[]; onChange: (row: CattleRow) => void; onRemove: () => void }) {
  return <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1.2fr_1fr_.8fr_1fr_auto]"><input aria-label="Nome do lote" placeholder="Nome do lote" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} className={fieldClassName} /><input aria-label="Categoria do lote" placeholder="Categoria" value={row.category} onChange={(e) => onChange({ ...row, category: e.target.value })} className={fieldClassName} /><input aria-label="Quantidade inicial" type="number" min="0" placeholder="Cabeças" value={row.current_quantity} onChange={(e) => onChange({ ...row, current_quantity: e.target.value })} className={fieldClassName} /><select aria-label="Pasto do lote" value={row.pasture_name} onChange={(e) => onChange({ ...row, pasture_name: e.target.value })} className={fieldClassName}><option value="">Sem pasto definido</option>{pastureNames.map((name) => <option key={name} value={name}>{name}</option>)}</select><RemoveButton onClick={onRemove} /></div>
}

function EmployeeEditor({ row, onChange, onRemove }: { row: EmployeeRow; onChange: (row: EmployeeRow) => void; onRemove: () => void }) {
  return <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"><input aria-label="Nome do funcionário" placeholder="Nome completo" value={row.full_name} onChange={(e) => onChange({ ...row, full_name: e.target.value })} className={fieldClassName} /><input aria-label="Função" placeholder="Função" value={row.role_description} onChange={(e) => onChange({ ...row, role_description: e.target.value })} className={fieldClassName} /><input aria-label="Salário" type="number" min="0" step="0.01" placeholder="Salário" value={row.salary_amount} onChange={(e) => onChange({ ...row, salary_amount: e.target.value })} className={fieldClassName} /><input aria-label="Telefone" placeholder="Telefone" value={row.phone_number} onChange={(e) => onChange({ ...row, phone_number: e.target.value })} className={fieldClassName} /><RemoveButton onClick={onRemove} /></div>
}

function InventoryEditor({ row, onChange, onRemove }: { row: InventoryRow; onChange: (row: InventoryRow) => void; onRemove: () => void }) {
  return <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1.2fr_1fr_.8fr_.8fr_.7fr_auto]"><input aria-label="Nome do item" placeholder="Item" value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} className={fieldClassName} /><input aria-label="Categoria" placeholder="Categoria" value={row.category} onChange={(e) => onChange({ ...row, category: e.target.value })} className={fieldClassName} /><input aria-label="Saldo inicial" type="number" min="0" step="0.01" placeholder="Saldo" value={row.current_quantity} onChange={(e) => onChange({ ...row, current_quantity: e.target.value })} className={fieldClassName} /><input aria-label="Estoque mínimo" type="number" min="0" step="0.01" placeholder="Mínimo" value={row.minimum_quantity} onChange={(e) => onChange({ ...row, minimum_quantity: e.target.value })} className={fieldClassName} /><input aria-label="Unidade" placeholder="Unidade" value={row.unit} onChange={(e) => onChange({ ...row, unit: e.target.value })} className={fieldClassName} /><RemoveButton onClick={onRemove} /></div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-sm font-semibold text-foreground">{value}</p></div>
}
