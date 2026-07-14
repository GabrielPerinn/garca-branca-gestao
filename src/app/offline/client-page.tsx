'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, Beef, Camera, CheckCircle2, CloudOff, ListTodo, Loader2, Package, Scale, ShieldCheck, WalletCards } from 'lucide-react'
import { fieldClassName, FormField } from '@/components/ui/FormField'
import { InlineFeedback } from '@/components/ui/InlineFeedback'
import { getOfflineWorkPackage, listOfflineCommands, listOfflineMedia, queueOfflineCommand, queueOfflineMedia, type OfflineCommand, type OfflineCommandType, type OfflineMediaDraft, type OfflineWorkPackage } from '@/lib/offline/queue'
import { formatDateTime } from '@/lib/formatters'

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const emptyPackage: OfflineWorkPackage = { version: 2, saved_at: '', protocols: [], lots: [], pastures: [], tasks: [], inventory: [] }
const modes = [
  { id: 'health', label: 'Sanidade', icon: ShieldCheck },
  { id: 'weighing', label: 'Pesagem', icon: Scale },
  { id: 'cattle', label: 'Rebanho', icon: Beef },
  { id: 'task', label: 'Tarefas', icon: ListTodo },
  { id: 'inventory', label: 'Estoque', icon: Package },
  { id: 'expense', label: 'Despesa', icon: WalletCards },
  { id: 'media', label: 'Foto/áudio', icon: Camera },
] as const
type Mode = typeof modes[number]['id']

const commandLabels: Record<OfflineCommandType, string> = {
  complete_livestock_protocol: 'Manejo concluído', create_task: 'Nova tarefa', complete_task: 'Tarefa concluída',
  record_weighing: 'Pesagem', record_cattle_movement: 'Movimentação do rebanho',
  record_inventory_movement: 'Movimento de estoque', create_expense: 'Despesa',
}
const textValue = (formData: FormData, name: string) => String(formData.get(name) || '').trim()
const nullableText = (formData: FormData, name: string) => textValue(formData, name) || null

function parseWeights(value: string) {
  return (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map(item => Number(item.replace(',', '.'))).filter(item => Number.isFinite(item) && item > 0)
}

export function OfflineFieldPage() {
  const [workPackage, setWorkPackage] = useState<OfflineWorkPackage>(emptyPackage)
  const [commands, setCommands] = useState<OfflineCommand[]>([])
  const [mediaDrafts, setMediaDrafts] = useState<OfflineMediaDraft[]>([])
  const [mode, setMode] = useState<Mode>('health')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success' | 'info'; message: string } | null>(null)
  const today = localDate()

  async function loadLocalData() {
    try {
      const [snapshot, queued, media] = await Promise.all([getOfflineWorkPackage(), listOfflineCommands(), listOfflineMedia()])
      setWorkPackage(snapshot ?? emptyPackage); setCommands(queued.sort((a, b) => b.client_created_at.localeCompare(a.client_created_at)))
      setMediaDrafts(media.sort((a, b) => b.client_created_at.localeCompare(a.client_created_at)))
    } catch { setFeedback({ kind: 'error', message: 'O armazenamento offline não está disponível neste navegador.' }) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const refresh = () => { void loadLocalData() }
    const initial = window.setTimeout(refresh, 0)
    window.addEventListener('garca-offline-queue-changed', refresh)
    window.addEventListener('garca-offline-package-changed', refresh)
    return () => {
      window.clearTimeout(initial)
      window.removeEventListener('garca-offline-queue-changed', refresh)
      window.removeEventListener('garca-offline-package-changed', refresh)
    }
  }, [])

  async function protect(type: OfflineCommandType, payload: Record<string, unknown>) {
    setSaving(true); setFeedback(null)
    try {
      await queueOfflineCommand({ type, payload })
      setFeedback({ kind: 'success', message: navigator.onLine
        ? 'Registro protegido no aparelho. A conciliação com o servidor foi iniciada.'
        : 'Registro protegido no aparelho. A sincronização acontecerá automaticamente quando o sinal voltar.' })
    } catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível proteger o lançamento.' })
    } finally { setSaving(false) }
  }

  async function healthAction(formData: FormData) {
    const protocol = workPackage.protocols.find(item => item.id === textValue(formData, 'protocol_id'))
    if (!protocol) return setFeedback({ kind: 'error', message: 'Selecione um protocolo salvo no aparelho.' })
    await protect('complete_livestock_protocol', {
      protocol_id: protocol.id, protocol_name: protocol.name, executed_on: textValue(formData, 'executed_on'),
      quantity_treated: textValue(formData, 'quantity_treated') ? Number(textValue(formData, 'quantity_treated')) : null,
      result_status: textValue(formData, 'result_status'), notes: nullableText(formData, 'notes'), next_due_date: nullableText(formData, 'next_due_date'),
    })
  }

  async function weighingAction(formData: FormData) {
    const lot = workPackage.lots.find(item => item.id === textValue(formData, 'cattle_lot_id'))
    if (!lot) return setFeedback({ kind: 'error', message: 'Selecione o lote pesado.' })
    const weights = parseWeights(textValue(formData, 'individual_weights'))
    const average = textValue(formData, 'average_weight')
    const quantity = textValue(formData, 'quantity_weighed')
    if (!weights.length && !average) return setFeedback({ kind: 'error', message: 'Informe o peso médio ou cole/digite a lista de pesos anotados.' })
    await protect('record_weighing', {
      cattle_lot_id: lot.id, lot_name: lot.name, weighing_date: textValue(formData, 'weighing_date'),
      quantity_weighed: quantity ? Number(quantity) : null, average_weight: average ? Number(average.replace(',', '.')) : null,
      total_weight: null, individual_weights: weights.length ? weights : null, notes: nullableText(formData, 'notes'),
    })
  }

  async function cattleAction(formData: FormData) {
    const lot = workPackage.lots.find(item => item.id === textValue(formData, 'cattle_lot_id'))
    if (!lot) return setFeedback({ kind: 'error', message: 'Selecione o lote movimentado.' })
    const movementType = textValue(formData, 'movement_type') as 'birth' | 'death' | 'pasture_change'
    const quantity = Number(textValue(formData, 'quantity'))
    if (movementType === 'pasture_change' && quantity !== lot.current_quantity) return setFeedback({ kind: 'error', message: `A troca deve levar o lote inteiro (${lot.current_quantity} cabeças). Para separar apenas parte, crie/divida o lote primeiro.` })
    if (movementType === 'pasture_change' && !nullableText(formData, 'to_pasture_id')) return setFeedback({ kind: 'error', message: 'Selecione o pasto de destino para a troca.' })
    await protect('record_cattle_movement', {
      cattle_lot_id: lot.id, lot_name: lot.name, movement_type: movementType, quantity,
      movement_date: textValue(formData, 'movement_date'), to_pasture_id: nullableText(formData, 'to_pasture_id'), reason: nullableText(formData, 'reason'),
    })
  }

  async function taskAction(formData: FormData) {
    const operation = textValue(formData, 'task_operation')
    if (operation === 'complete') {
      const task = workPackage.tasks.find(item => item.id === textValue(formData, 'task_id'))
      if (!task) return setFeedback({ kind: 'error', message: 'Selecione uma tarefa aberta.' })
      await protect('complete_task', { task_id: task.id, task_name: task.title, notes: nullableText(formData, 'description') })
    } else {
      const title = textValue(formData, 'title')
      if (!title) return setFeedback({ kind: 'error', message: 'Informe o título da nova tarefa.' })
      await protect('create_task', {
        title, description: nullableText(formData, 'description'),
        due_date: nullableText(formData, 'due_date'), priority: textValue(formData, 'priority'), notes: null,
      })
    }
  }

  async function inventoryAction(formData: FormData) {
    const item = workPackage.inventory.find(entry => entry.id === textValue(formData, 'inventory_item_id'))
    if (!item) return setFeedback({ kind: 'error', message: 'Selecione um item salvo no aparelho.' })
    await protect('record_inventory_movement', {
      inventory_item_id: item.id, item_name: item.name, movement_type: textValue(formData, 'movement_type'),
      quantity: Number(textValue(formData, 'quantity').replace(',', '.')), unit: item.unit,
      movement_date: textValue(formData, 'movement_date'), reason: nullableText(formData, 'reason'), notes: nullableText(formData, 'notes'),
    })
  }

  async function expenseAction(formData: FormData) {
    await protect('create_expense', {
      description: textValue(formData, 'description'), amount: Number(textValue(formData, 'amount').replace(',', '.')),
      category: nullableText(formData, 'category'), expense_date: textValue(formData, 'expense_date'),
      payment_method: nullableText(formData, 'payment_method'), supplier_name: nullableText(formData, 'supplier_name'), has_receipt: false,
    })
  }

  async function mediaAction(formData: FormData) {
    const file = formData.get('field_media')
    if (!(file instanceof File) || file.size === 0) return setFeedback({ kind: 'error', message: 'Tire ou selecione uma foto/áudio.' })
    setSaving(true); setFeedback(null)
    try {
      await queueOfflineMedia(file, textValue(formData, 'caption'))
      setFeedback({ kind: 'success', message: navigator.onLine
        ? 'Arquivo protegido. A Garça começou a processá-lo e pedirá confirmação antes de qualquer lançamento.'
        : 'Arquivo protegido no aparelho. A Garça processará quando o sinal voltar e pedirá sua confirmação.' })
    } catch (caught) { setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível proteger o arquivo.' }) }
    finally { setSaving(false) }
  }

  const submit = saving ? <><Loader2 className="h-4 w-4 animate-spin" />Protegendo...</> : <><CheckCircle2 className="h-4 w-4" />Guardar para sincronizar</>
  const noPackage = !workPackage.saved_at

  return <div className="app-page max-w-5xl">
    <header className="border-b border-border pb-5"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><CloudOff className="h-5 w-5" /></span><div><p className="app-kicker">Modo campo · Offline 2.0</p><h1 className="text-[1.75rem] font-semibold tracking-tight">Diário operacional offline</h1></div></div><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Pesagens de papel, rebanho, tarefas, estoque, despesas e protocolos ficam protegidos no aparelho e são conciliados uma única vez quando o sinal retorna.</p></header>

    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="app-panel p-4"><p className="text-xs text-muted-foreground">Aguardando conciliação</p><p className="mt-1 text-xl font-semibold tabular-nums">{commands.length + mediaDrafts.length}</p><p className="mt-1 text-[11px] text-muted-foreground">{mediaDrafts.length} foto(s)/áudio(s)</p></div><div className="app-panel p-4"><p className="text-xs text-muted-foreground">Pacote de trabalho</p><p className="mt-1 text-sm font-semibold">{loading ? 'Carregando...' : noPackage ? 'Ainda não preparado' : `${workPackage.lots.length} lote(s) · ${workPackage.tasks.length} tarefa(s)`}</p>{workPackage.saved_at && <p className="mt-1 text-[11px] text-muted-foreground">Atualizado em {formatDateTime(workPackage.saved_at)}</p>}</div><div className="app-panel p-4"><p className="text-xs text-muted-foreground">Regra de integridade</p><p className="mt-1 text-sm font-semibold">Sem duplicar ou sobrescrever</p><p className="mt-1 text-[11px] text-muted-foreground">Conflitos ficam para revisão.</p></div></div>
    <InlineFeedback kind={feedback?.kind} message={feedback?.message} />
    {noPackage && !loading && <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Conecte o aparelho antes de ir ao campo</p><p className="mt-1 text-xs leading-5">Abra esta página uma vez com internet para baixar lotes, tarefas, estoque, pastos e protocolos.</p></div></div>}

    <nav aria-label="Tipo de lançamento offline" className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-7">{modes.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => { setMode(item.id); setFeedback(null) }} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${mode === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{item.label}</button> })}</nav>

    <section className="app-panel mt-4 p-5 sm:p-6">
      {mode === 'health' && <form action={healthAction} className="space-y-4"><FormHeading title="Confirmar manejo coletivo" description="A baixa atualiza o histórico e o próximo alarme." /><FormField htmlFor="off-protocol" label="Protocolo" required><select id="off-protocol" name="protocol_id" required defaultValue="" className={fieldClassName}><option value="" disabled>Selecione</option>{workPackage.protocols.map(item => <option key={item.id} value={item.id}>{item.name} · {item.scope_label}</option>)}</select></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="off-health-date" label="Data realizada" required><input id="off-health-date" name="executed_on" type="date" required defaultValue={today} className={fieldClassName} /></FormField><FormField htmlFor="off-result" label="Resultado" required><select id="off-result" name="result_status" defaultValue="completed" className={fieldClassName}><option value="completed">Concluído</option><option value="partial">Parcial</option><option value="skipped">Não realizado</option></select></FormField><FormField htmlFor="off-treated" label="Quantidade atendida"><input id="off-treated" name="quantity_treated" type="number" min="0" className={fieldClassName} /></FormField><FormField htmlFor="off-next" label="Próxima data"><input id="off-next" name="next_due_date" type="date" className={fieldClassName} /></FormField></div><Notes /><Submit saving={saving}>{submit}</Submit></form>}

      {mode === 'weighing' && <form action={weighingAction} className="space-y-4"><FormHeading title="Registrar pesagem manual" description="Digite a média ou copie todos os pesos anotados no papel; o sistema calcula quantidade, total e média." /><div className="grid gap-4 sm:grid-cols-2"><LotSelect lots={workPackage.lots} /><FormField htmlFor="off-weigh-date" label="Data da pesagem" required><input id="off-weigh-date" name="weighing_date" type="date" required defaultValue={today} className={fieldClassName} /></FormField><FormField htmlFor="off-average" label="Peso médio (kg)"><input id="off-average" name="average_weight" inputMode="decimal" placeholder="Ex.: 438,5" className={fieldClassName} /></FormField><FormField htmlFor="off-weighed" label="Quantidade pesada"><input id="off-weighed" name="quantity_weighed" type="number" min="1" className={fieldClassName} /></FormField></div><FormField htmlFor="off-weight-list" label="Lista de pesos do papel"><textarea id="off-weight-list" name="individual_weights" rows={5} placeholder={'Cole ou digite: 432, 445, 438, 451...\nPode usar vírgula, espaço ou uma linha por peso.'} className={`${fieldClassName} resize-y font-mono`} /></FormField><Notes /><Submit saving={saving}>{submit}</Submit><Link href="/ai-chat" className="app-button-secondary w-full"><Camera className="h-4 w-4" />Com internet, fotografar a folha para a Garça ler</Link></form>}

      {mode === 'cattle' && <form action={cattleAction} className="space-y-4"><FormHeading title="Movimentar rebanho coletivo" description="Nascimentos, mortes ou troca do lote inteiro para outro pasto." /><div className="grid gap-4 sm:grid-cols-2"><LotSelect lots={workPackage.lots} /><FormField htmlFor="off-movement" label="Movimentação" required><select id="off-movement" name="movement_type" required defaultValue="" className={fieldClassName}><option value="" disabled>Selecione</option><option value="birth">Nascimento</option><option value="death">Morte/perda</option><option value="pasture_change">Troca de pasto</option></select></FormField><FormField htmlFor="off-cattle-qty" label="Quantidade" required><input id="off-cattle-qty" name="quantity" type="number" min="1" required className={fieldClassName} /></FormField><FormField htmlFor="off-movement-date" label="Data" required><input id="off-movement-date" name="movement_date" type="date" required defaultValue={today} className={fieldClassName} /></FormField><FormField htmlFor="off-destination" label="Pasto de destino (para troca)"><select id="off-destination" name="to_pasture_id" defaultValue="" className={fieldClassName}><option value="">Não se aplica</option>{workPackage.pastures.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField htmlFor="off-reason" label="Motivo"><input id="off-reason" name="reason" className={fieldClassName} /></FormField></div><Submit saving={saving}>{submit}</Submit></form>}

      {mode === 'task' && <form action={taskAction} className="space-y-4"><FormHeading title="Tarefas de campo" description="Crie uma ordem ou confirme uma tarefa que já estava no pacote." /><FormField htmlFor="off-task-operation" label="Operação" required><select id="off-task-operation" name="task_operation" defaultValue="create" className={fieldClassName}><option value="create">Criar nova tarefa</option><option value="complete">Concluir tarefa existente</option></select></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="off-task-title" label="Título da nova tarefa"><input id="off-task-title" name="title" className={fieldClassName} /></FormField><FormField htmlFor="off-task-existing" label="Tarefa para concluir"><select id="off-task-existing" name="task_id" defaultValue="" className={fieldClassName}><option value="">Selecione se for concluir</option>{workPackage.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField><FormField htmlFor="off-task-due" label="Prazo"><input id="off-task-due" name="due_date" type="date" className={fieldClassName} /></FormField><FormField htmlFor="off-priority" label="Prioridade"><select id="off-priority" name="priority" defaultValue="medium" className={fieldClassName}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></FormField></div><FormField htmlFor="off-task-description" label="Descrição / observação"><textarea id="off-task-description" name="description" rows={3} className={`${fieldClassName} resize-y`} /></FormField><input type="hidden" name="notes" value="" /><Submit saving={saving}>{submit}</Submit></form>}

      {mode === 'inventory' && <form action={inventoryAction} className="space-y-4"><FormHeading title="Movimentar estoque" description="Entrada ou consumo com validação do saldo atual quando sincronizar." /><div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="off-item" label="Item" required><select id="off-item" name="inventory_item_id" required defaultValue="" className={fieldClassName}><option value="" disabled>Selecione</option>{workPackage.inventory.map(item => <option key={item.id} value={item.id}>{item.name} · saldo salvo {item.current_quantity} {item.unit ?? ''}</option>)}</select></FormField><FormField htmlFor="off-stock-type" label="Movimento" required><select id="off-stock-type" name="movement_type" defaultValue="out" className={fieldClassName}><option value="out">Consumo/saída</option><option value="in">Entrada</option></select></FormField><FormField htmlFor="off-stock-qty" label="Quantidade" required><input id="off-stock-qty" name="quantity" inputMode="decimal" required className={fieldClassName} /></FormField><FormField htmlFor="off-stock-date" label="Data" required><input id="off-stock-date" name="movement_date" type="date" required defaultValue={today} className={fieldClassName} /></FormField></div><FormField htmlFor="off-stock-reason" label="Motivo"><input id="off-stock-reason" name="reason" className={fieldClassName} /></FormField><Notes /><Submit saving={saving}>{submit}</Submit></form>}

      {mode === 'expense' && <form action={expenseAction} className="space-y-4"><FormHeading title="Registrar despesa de campo" description="O lançamento financeiro exige permissão própria e será auditado na sincronização." /><div className="grid gap-4 sm:grid-cols-2"><FormField htmlFor="off-expense-description" label="Descrição" required><input id="off-expense-description" name="description" required className={fieldClassName} /></FormField><FormField htmlFor="off-expense-amount" label="Valor (R$)" required><input id="off-expense-amount" name="amount" inputMode="decimal" required className={fieldClassName} /></FormField><FormField htmlFor="off-expense-category" label="Categoria"><input id="off-expense-category" name="category" className={fieldClassName} /></FormField><FormField htmlFor="off-expense-date" label="Data" required><input id="off-expense-date" name="expense_date" type="date" required defaultValue={today} className={fieldClassName} /></FormField><FormField htmlFor="off-supplier" label="Fornecedor"><input id="off-supplier" name="supplier_name" className={fieldClassName} /></FormField><FormField htmlFor="off-payment" label="Forma de pagamento"><input id="off-payment" name="payment_method" className={fieldClassName} /></FormField></div><Submit saving={saving}>{submit}</Submit></form>}

      {mode === 'media' && <form action={mediaAction} className="space-y-4"><FormHeading title="Guardar foto ou áudio de campo" description="O arquivo permanece no aparelho sem sinal. Quando conectar, a Garça lê, separa os fatos e cria um plano para sua confirmação — nunca executa a foto automaticamente." /><FormField htmlFor="off-media" label="Foto da folha, curral ou áudio" required><input id="off-media" name="field_media" type="file" accept="image/jpeg,image/png,image/webp,audio/*" required className={fieldClassName} /></FormField><FormField htmlFor="off-caption" label="Contexto para a Garça"><textarea id="off-caption" name="caption" rows={4} placeholder="Ex.: Pesagem manual do lote Bois Venda feita hoje. Cada número da folha é um peso em kg." className={`${fieldClassName} resize-y`} /></FormField><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950"><p className="font-semibold">Para uma folha de pesagem</p><p className="mt-1">Fotografe de frente, com boa luz, informe o lote e diga se os números são pesos individuais, média ou total. Valores pouco legíveis serão perguntados antes do cadastro.</p></div><Submit saving={saving}>{submit}</Submit></form>}
    </section>

    {(commands.length > 0 || mediaDrafts.length > 0) && <section className="app-panel mt-5 overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Diário protegido neste aparelho</h2><p className="mt-1 text-xs text-muted-foreground">Falhas de conflito permanecem aqui até que os dados sejam revistos.</p></div><div className="divide-y divide-border">{commands.map(command => <article key={command.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{commandLabels[command.type]}</p><span className="text-[11px] text-muted-foreground">{formatDateTime(command.client_created_at)}</span></div><p className={`mt-1 text-xs ${command.last_error ? 'text-red-700' : 'text-muted-foreground'}`}>{command.last_error ? `Precisa revisar: ${command.last_error}` : navigator.onLine ? 'Aguardando conciliação' : 'Protegido sem sinal'}</p></article>)}{mediaDrafts.map(draft => <article key={draft.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{draft.kind === 'image' ? 'Foto para a Garça' : 'Áudio para a Garça'} · {draft.file_name}</p><span className="text-[11px] text-muted-foreground">{formatDateTime(draft.client_created_at)}</span></div><p className={`mt-1 text-xs ${draft.last_error ? 'text-red-700' : 'text-muted-foreground'}`}>{draft.last_error ? `Precisa revisar: ${draft.last_error}` : navigator.onLine ? 'Aguardando processamento' : 'Arquivo protegido sem sinal'}</p></article>)}</div></section>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><p>Os dados locais são criptografados. Nenhum lançamento offline apaga ou substitui registros silenciosamente.</p><Link href="/offline/devices" className="font-semibold text-primary">Gerenciar aparelhos autorizados</Link></div>
  </div>
}

function FormHeading({ title, description }: { title: string; description: string }) { return <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div> }
function Submit({ saving, children }: { saving: boolean; children: React.ReactNode }) { return <button type="submit" disabled={saving} className="app-button-primary w-full disabled:opacity-60">{children}</button> }
function Notes() { return <FormField htmlFor="off-notes" label="Observações"><textarea id="off-notes" name="notes" rows={3} className={`${fieldClassName} resize-y`} /></FormField> }
function LotSelect({ lots }: { lots: OfflineWorkPackage['lots'] }) { return <FormField htmlFor="off-lot" label="Lote" required><select id="off-lot" name="cattle_lot_id" required defaultValue="" className={fieldClassName}><option value="" disabled>Selecione</option>{lots.map(item => <option key={item.id} value={item.id}>{item.name} · {item.current_quantity} cabeças</option>)}</select></FormField> }
