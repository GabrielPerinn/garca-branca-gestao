'use client'

import { useState } from "react";
import { approvePendingAction, rejectPendingAction, updatePendingActionPlan } from "@/lib/ai/actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineFeedback } from "@/components/ui/InlineFeedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { CheckCircle, XCircle, Calendar, ClipboardList, AlertCircle, ArrowRight, ChevronDown, ChevronUp, Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatCivilDate, formatDateTime } from "@/lib/formatters";
import { blockingFieldLabels } from "@/lib/ai/action-metadata";
import { getPendingActionPlanIssues } from "@/lib/ai/action-plan";

const intentConfig: Record<string, { label: string; color: string; icon: string }> = {
  create_expense:           { label: 'Lançar Despesa',         color: 'bg-red-50 text-red-800 border-red-200',    icon: '💸' },
  create_revenue:           { label: 'Lançar Receita',         color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: '💰' },
  record_inventory_entry:   { label: 'Entrada de Estoque',     color: 'bg-teal-50 text-teal-800 border-teal-200', icon: '📦' },
  record_cattle_movement:   { label: 'Movimentação de Gado',   color: 'bg-blue-50 text-blue-800 border-blue-200', icon: '🐄' },
  record_cattle_sale:       { label: 'Venda de Gado',          color: 'bg-purple-50 text-purple-800 border-purple-200', icon: '🤝' },
  record_weighing:          { label: 'Pesagem',                color: 'bg-cyan-50 text-cyan-800 border-cyan-200', icon: '⚖️' },
  create_livestock_protocol:{ label: 'Novo protocolo pecuário',color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: '🩺' },
  complete_livestock_protocol:{ label: 'Execução de protocolo',color: 'bg-teal-50 text-teal-800 border-teal-200', icon: '✅' },
  create_task:              { label: 'Criar Tarefa',           color: 'bg-amber-50 text-amber-900 border-amber-200', icon: '✅' },
  complete_task:            { label: 'Concluir Tarefa',        color: 'bg-emerald-50 text-emerald-900 border-emerald-200', icon: '☑️' },
  cancel_task:              { label: 'Cancelar Tarefa',        color: 'bg-red-50 text-red-800 border-red-200', icon: '⊘' },
  record_employee_payment:  { label: 'Pagamento de Funcionário', color: 'bg-orange-50 text-orange-900 border-orange-200', icon: '👤' },
  record_gravel_operation:   { label: 'Operação de Cascalho',    color: 'bg-stone-50 text-stone-800 border-stone-200', icon: '🚜' },
  record_suppression_operation: { label: 'Operação Ambiental',   color: 'bg-lime-50 text-lime-900 border-lime-200', icon: '🌿' },
};

const fieldLabels: Record<string, string> = {
  amount: 'Valor (R$)', price_per_unit: 'Preço por cabeça', quantity: 'Quantidade',
  total_amount: 'Valor total', description: 'Descrição', category: 'Categoria', title: 'Título',
  due_date: 'Prazo', expense_date: 'Data da despesa', movement_date: 'Data da movimentação',
  movement_type: 'Tipo de movimentação', item_name: 'Item', unit: 'Unidade',
  buyer_name: 'Comprador', lot_name: 'Nome do lote', origin: 'Procedência',
  employee_name: 'Funcionário', cause: 'Causa da morte', to_pasture_name: 'Pasto de destino',
  average_weight: 'Peso médio (kg)', quantity_weighed: 'Qtd. pesada', assigned_to: 'Responsável',
  origin_location: 'Local de origem', destination_location: 'Destino', loads_quantity: 'Quantidade de cargas',
  estimated_volume: 'Volume estimado (m³)', approximate_area: 'Área aproximada (ha)',
  authorization_number: 'Autorização ambiental', operation_date: 'Data da operação',
  individual_weights: 'Pesos individuais (kg)', protocol_name: 'Protocolo', protocol_type: 'Tipo do protocolo',
  event_type: 'Tipo do manejo', scope_type: 'Abrangência', land_parcel_name: 'Propriedade',
  animal_category: 'Categoria animal', product_name: 'Produto', dosage: 'Dosagem',
  next_due_date: 'Próxima data', recurrence_days: 'Recorrência (dias)', alert_lead_days: 'Avisar antes (dias)',
  executed_on: 'Data realizada', quantity_treated: 'Quantidade atendida', result_status: 'Resultado',
};

function formatValue(key: string, val: any): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    if (key.includes('amount') || key.includes('price') || key.includes('value')) {
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    if (key.includes('weight')) return `${val} kg`;
    return val.toString();
  }
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return formatCivilDate(val);
  }
  return String(val);
}

const SKIP_KEYS = ['human_summary', 'secondary_actions', 'raw_message', 'raw'];

function parseSecondaryData(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const editableFieldsByIntent: Record<string, string[]> = {
  create_expense: ['amount', 'description', 'category', 'expense_date', 'supplier_name'],
  create_revenue: ['amount', 'description', 'category', 'revenue_date'],
  create_task: ['title', 'description', 'due_date', 'priority', 'assigned_to'],
  complete_task: ['task_name'],
  cancel_task: ['task_name'],
  create_cattle_lot: ['name', 'category', 'current_quantity', 'origin'],
  record_inventory_entry: ['item_name', 'quantity', 'unit', 'category', 'movement_date', 'reason'],
  record_cattle_sale: ['lot_name', 'buyer_name', 'quantity', 'gross_amount', 'negotiation_date', 'shipment_date'],
  record_cattle_movement: ['movement_type', 'quantity', 'lot_name', 'animal_category', 'total_amount', 'price_per_unit', 'movement_date', 'origin', 'to_pasture_name', 'reason'],
  record_weighing: ['lot_name', 'individual_weights', 'average_weight', 'quantity_weighed', 'total_weight', 'weighing_date'],
  create_livestock_protocol: ['name', 'protocol_type', 'event_type', 'scope_type', 'lot_name', 'land_parcel_name', 'animal_category', 'product_name', 'dosage', 'next_due_date', 'recurrence_days', 'alert_lead_days'],
  complete_livestock_protocol: ['protocol_name', 'executed_on', 'quantity_treated', 'result_status', 'next_due_date', 'notes'],
  record_employee_payment: ['employee_name', 'payment_type', 'amount', 'payment_date', 'description'],
  record_gravel_operation: ['origin_location', 'loads_quantity', 'estimated_volume', 'destination_location', 'purpose', 'machine_used', 'responsible_person', 'operation_date', 'notes'],
  record_suppression_operation: ['approximate_area', 'notes', 'authorization_number', 'authorization_expiration_date', 'responsible_technician', 'operation_date'],
};

const numericFields = new Set(['amount', 'quantity', 'current_quantity', 'gross_amount', 'total_amount', 'price_per_unit', 'average_weight', 'quantity_weighed', 'total_weight', 'loads_quantity', 'estimated_volume', 'approximate_area', 'recurrence_days', 'alert_lead_days', 'quantity_treated']);
const dateFields = new Set(['expense_date', 'revenue_date', 'due_date', 'movement_date', 'negotiation_date', 'shipment_date', 'weighing_date', 'payment_date', 'operation_date', 'authorization_expiration_date', 'next_due_date', 'executed_on']);
const longTextFields = new Set(['description', 'reason', 'notes', 'purpose', 'individual_weights']);
const listFields = new Set(['individual_weights']);

function PlanEditor({ action, onClose, onSaved }: { action: any; onClose: () => void; onSaved: () => void }) {
  const initial = action.interpreted_data_json || {};
  const [primary, setPrimary] = useState<Record<string, unknown>>({ ...initial });
  const [secondary, setSecondary] = useState<Array<{ intent: string; description: string; extracted_data: Record<string, unknown> }>>(
    (Array.isArray(initial.secondary_actions) ? initial.secondary_actions : []).map((item: any) => ({
      intent: String(item.intent || ''),
      description: String(item.description || ''),
      extracted_data: parseSecondaryData(item.extracted_data),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function inputFor(intent: string, data: Record<string, unknown>, update: (key: string, value: unknown) => void) {
    return (editableFieldsByIntent[intent] || Object.keys(data)).map((key) => {
      const value = data[key];
      const common = {
        id: `${intent}-${key}`,
        name: key,
        value: value === null || value === undefined ? '' : listFields.has(key) && Array.isArray(value) ? value.join('\n') : String(value),
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
          const raw = event.target.value;
          if (listFields.has(key)) {
            const tokens = raw.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean)
            const parsed = tokens.map(item => Number(item.replace(',', '.')))
            update(key, raw.trim() === '' ? null : parsed.every(Number.isFinite) ? parsed : raw)
          } else update(key, numericFields.has(key) ? (raw === '' ? null : Number(raw)) : raw);
        },
        className: 'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
      };
      return (
        <div key={key} className={longTextFields.has(key) ? 'sm:col-span-2' : ''}>
          <label htmlFor={`${intent}-${key}`} className="mb-1 block text-xs font-semibold text-muted-foreground">{fieldLabels[key] || key.replace(/_/g, ' ')}</label>
          {key === 'priority' ? (
            <select {...common}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select>
          ) : longTextFields.has(key) ? (
            <textarea {...common} rows={3} className={`${common.className} py-2`} />
          ) : (
            <input {...common} type={numericFields.has(key) ? 'number' : dateFields.has(key) ? 'date' : 'text'} step={numericFields.has(key) ? 'any' : undefined} />
          )}
        </div>
      );
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleanPrimary = { ...primary };
      delete cleanPrimary.secondary_actions;
      delete cleanPrimary.missing_fields;
      const plan = {
        ...cleanPrimary,
        secondary_actions: secondary.map(item => ({
          intent: item.intent,
          description: item.description,
          extracted_data: Object.fromEntries(Object.entries(item.extracted_data).filter(([key]) => key !== 'missing_fields')),
        })),
        missing_fields: [],
      };
      await updatePendingActionPlan(action.id, JSON.stringify(plan));
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o plano.');
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Editar plano antes de aprovar" description="Revise os dados estruturados. O sistema validará tudo novamente no momento da execução." onClose={onClose} closeOnBackdrop={!saving}>
      <div className="space-y-6">
        <section><h3 className="mb-3 text-sm font-bold text-foreground">Ação principal</h3><div className="grid gap-3 sm:grid-cols-2">{inputFor(action.action_type, primary, (key, value) => setPrimary(current => ({ ...current, [key]: value })))}</div></section>
        {secondary.map((item, index) => <section key={`${item.intent}-${index}`} className="border-t border-border pt-5"><h3 className="mb-3 text-sm font-bold text-foreground">Ação relacionada {index + 1}: {intentConfig[item.intent]?.label || item.intent}</h3><div className="grid gap-3 sm:grid-cols-2">{inputFor(item.intent, item.extracted_data, (key, value) => setSecondary(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, extracted_data: { ...entry.extracted_data, [key]: value } } : entry)))}</div></section>)}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onClose} disabled={saving} className="app-button-secondary">Cancelar</button><button type="button" onClick={save} disabled={saving} className="app-button-primary"><Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar revisão'}</button></div>
      </div>
    </Modal>
  );
}

export function PendingActionsClient({ actions, dbError }: any) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [editingAction, setEditingAction] = useState<any | null>(null);

  async function handleApprove(id: string) {
    setLoading(id);
    try {
      await approvePendingAction(id);
      setFeedback({ kind: 'success', message: 'Ação executada com sucesso.' });
      router.refresh();
    }
    catch (e: any) { setFeedback({ kind: 'error', message: e.message || 'Não foi possível aprovar a ação.' }); }
    finally { setLoading(null); }
  }

  async function handleReject(id: string) {
    setLoading(`reject-${id}`);
    try {
      await rejectPendingAction(id);
      setFeedback({ kind: 'success', message: 'Ação descartada.' });
      router.refresh();
    }
    catch (e: any) { setFeedback({ kind: 'error', message: e.message || 'Não foi possível rejeitar a ação.' }); }
    finally { setLoading(null); }
  }

  const pending = actions.filter((a: any) => a.confirmation_status === 'pending');
  const processed = actions.filter((a: any) => a.confirmation_status !== 'pending');

  return (
    <div className="app-page max-w-5xl">
      <PageHeader
        eyebrow="Controle e aprovação"
        title="Ações para revisar"
        description={pending.length === 0
          ? 'Nenhuma decisão aguardando aprovação.'
          : `${pending.length} ação${pending.length !== 1 ? 'ões' : ''} aguardando sua aprovação.`}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />
      {editingAction && <PlanEditor action={editingAction} onClose={() => setEditingAction(null)} onSaved={() => { setEditingAction(null); setFeedback({ kind: 'success', message: 'Plano revisado e salvo. Confira os dados antes de aprovar.' }); router.refresh(); }} />}

      {/* Pending actions */}
      <div className="space-y-4">
        {pending.length === 0 ? (
          <div className="app-panel">
            <EmptyState
              icon={<ClipboardList className="h-9 w-9" />}
              title="Nenhuma ação pendente"
              description="Registros propostos pelo assistente operacional aparecerão aqui antes de serem executados."
            />
          </div>
        ) : (
          pending.map((act: any) => {
            const data = act.interpreted_data_json || {};
            const config = intentConfig[act.action_type] || { label: act.action_type, color: 'bg-muted text-muted-foreground border-border', icon: '🤖' };
            const isLoading = loading === act.id;
            const isRejecting = loading === `reject-${act.id}`;
            const isExpanded = expanded === act.id;
            const secondary = data.secondary_actions as any[] | null;
            const planIssues = getPendingActionPlanIssues(act.action_type, data);
            const blockingFields = planIssues.map(issue => issue.field);

            // Dados para exibição (excluindo chaves de sistema)
            const displayData = Object.entries(data).filter(([k]) => !SKIP_KEYS.includes(k) && k !== 'missing_fields');

            return (
              <div key={act.id} className="app-panel overflow-hidden">
                {/* Header */}
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${config.color}`}>
                        {config.label}
                      </span>
                      {act.confidence_score && (
                        <span className="text-xs text-muted-foreground">
                          Confiabilidade {(act.confidence_score * 100).toFixed(0)}%
                        </span>
                      )}
                      {act.input_modality && act.input_modality !== 'text' && (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Origem: {act.input_modality === 'audio' ? 'áudio' : 'imagem'}
                        </span>
                      )}
                      {secondary && secondary.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <ArrowRight className="h-3 w-3" /> {secondary.length} registro{secondary.length > 1 ? 's' : ''} relacionado{secondary.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground leading-snug">{data.human_summary || 'Registro proposto para aprovação'}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateTime(act.created_at)}
                    </p>
                  </div>

                  {/* Approve / Reject */}
                  <div className="flex w-full gap-2 sm:w-auto sm:flex-shrink-0 sm:flex-col">
                    <button
                      type="button"
                      onClick={() => setEditingAction(act)}
                      disabled={!!loading}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(act.id)}
                      disabled={!!loading || blockingFields.length > 0}
                      title={blockingFields.length > 0 ? 'Complete ou descarte esta ação antes de executá-la.' : undefined}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {isLoading ? 'Executando...' : 'Aprovar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(act.id)}
                      disabled={!!loading}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {isRejecting ? 'Descartando...' : 'Rejeitar'}
                    </button>
                  </div>
                </div>

                {/* Missing fields warning */}
                {planIssues.length > 0 && (
                  <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-800" />
                    <div>
                      <p className="mb-0.5 text-xs font-semibold text-amber-900">Dados incompletos na mensagem:</p>
                      <p className="text-xs text-amber-800">
                        {planIssues.map(issue => {
                          const label = blockingFieldLabels[issue.field] || fieldLabels[issue.field] || issue.field;
                          return issue.actionIndex === 0 ? label : `${label} — ${issue.description}`;
                        }).join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Expandable data */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : act.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`pending-action-${act.id}`}
                  className="w-full flex items-center gap-2 px-5 py-3 border-t border-border hover:bg-muted/30 transition-colors text-xs text-muted-foreground"
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {isExpanded ? 'Ocultar dados estruturados' : 'Ver dados estruturados'}
                </button>

                {isExpanded && (
                  <div id={`pending-action-${act.id}`} className="space-y-4 px-5 pb-5">
                    {/* Primary data */}
                    {displayData.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados primários</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {displayData.map(([key, val]) => (
                            <div key={key} className="bg-muted/50 rounded-xl p-3">
                              <p className="text-xs text-muted-foreground capitalize">{fieldLabels[key] || key.replace(/_/g, ' ')}</p>
                              <p className="text-sm font-semibold text-foreground mt-0.5">{formatValue(key, val)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Secondary actions */}
                    {secondary && secondary.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Ações automáticas que também serão executadas:
                        </p>
                        <div className="space-y-2">
                          {secondary.map((sec: any, si: number) => {
                            const secData = parseSecondaryData(sec.extracted_data);
                            const secondaryAmount = Number(secData.amount);
                            const secondaryFields = Object.entries(secData).filter(([key]) => !SKIP_KEYS.includes(key) && key !== 'missing_fields' && key !== 'amount');
                            const secConfig = intentConfig[sec.intent] || { label: sec.intent, color: 'bg-muted text-muted-foreground border-border', icon: '🤖' };
                            return (
                              <div key={si} className="rounded-xl border border-border bg-muted/30 p-3">
                                <div className="flex items-center gap-3">
                                  <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                  <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${secConfig.color}`}>{secConfig.label}</span>
                                  <span className="min-w-0 flex-1 text-sm text-foreground">{sec.description}</span>
                                  {Number.isFinite(secondaryAmount) && secondaryAmount > 0 && (
                                    <span className="text-sm font-semibold text-foreground">
                                      R$ {secondaryAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </div>
                                {secondaryFields.length > 0 && (
                                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 sm:grid-cols-3">
                                    {secondaryFields.map(([key, value]) => (
                                      <div key={key}>
                                        <p className="text-[11px] text-muted-foreground">{fieldLabels[key] || key.replace(/_/g, ' ')}</p>
                                        <p className="text-xs font-medium text-foreground">{formatValue(key, value)}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Processed actions */}
      {processed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico ({processed.length})</p>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {processed.slice(0, 10).map((act: any) => {
              const data = act.interpreted_data_json || {};
              const config = intentConfig[act.action_type] || { label: act.action_type, color: 'bg-muted text-muted-foreground border-border', icon: '🤖' };
              const statusDisplay: Record<string, { label: string; className: string }> = {
                completed: { label: '✓ Executado', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                failed: { label: 'Falhou', className: 'border-red-200 bg-red-50 text-red-800' },
                processing: { label: 'Processando', className: 'border-blue-200 bg-blue-50 text-blue-800' },
                discarded: { label: 'Descartado', className: 'border-border bg-muted text-muted-foreground' },
                expired: { label: 'Expirado', className: 'border-amber-200 bg-amber-50 text-amber-900' },
              };
              const status = statusDisplay[act.confirmation_status] || {
                label: act.confirmation_status,
                className: 'border-border bg-muted text-muted-foreground',
              };
              return (
                <div key={act.id} className="flex items-center gap-4 p-4">
                  <span className="text-lg">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{data.human_summary || config.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(act.created_at)}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
