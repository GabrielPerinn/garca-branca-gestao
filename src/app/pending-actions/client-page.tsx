'use client'

import { useState } from "react";
import { approvePendingAction, rejectPendingAction } from "@/lib/ai/actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCircle, XCircle, Bot, Calendar, Zap, AlertCircle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

const intentConfig: Record<string, { label: string; color: string; icon: string }> = {
  create_expense:           { label: 'Lançar Despesa',         color: 'bg-red-500/10 text-red-400 border-red-500/20',    icon: '💸' },
  create_revenue:           { label: 'Lançar Receita',         color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: '💰' },
  record_cattle_movement:   { label: 'Movimentação de Gado',   color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: '🐄' },
  record_cattle_sale:       { label: 'Venda de Gado',          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: '🤝' },
  record_weighing:          { label: 'Pesagem',                color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: '⚖️' },
  create_task:              { label: 'Criar Tarefa',           color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '✅' },
  record_employee_payment:  { label: 'Pagamento de Funcionário', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: '👤' },
};

const fieldLabels: Record<string, string> = {
  amount: 'Valor (R$)', price_per_unit: 'Preço por cabeça', quantity: 'Quantidade',
  buyer_name: 'Comprador', lot_name: 'Nome do lote', origin: 'Procedência',
  employee_name: 'Funcionário', cause: 'Causa da morte', to_pasture_name: 'Pasto de destino',
  average_weight: 'Peso médio (kg)', quantity_weighed: 'Qtd. pesada', assigned_to: 'Responsável',
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
    return new Date(val + 'T12:00:00').toLocaleDateString('pt-BR');
  }
  return String(val);
}

const SKIP_KEYS = ['human_summary', 'secondary_actions', 'raw_message', 'raw'];

export function PendingActionsClient({ actions, dbError }: any) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setLoading(id);
    try { await approvePendingAction(id); router.refresh(); }
    catch (e: any) { alert(`Erro: ${e.message}`); }
    finally { setLoading(null); }
  }

  async function handleReject(id: string) {
    setLoading(`reject-${id}`);
    try { await rejectPendingAction(id); router.refresh(); }
    catch (e: any) { alert(`Erro: ${e.message}`); }
    finally { setLoading(null); }
  }

  const pending = actions.filter((a: any) => a.confirmation_status === 'pending');
  const processed = actions.filter((a: any) => a.confirmation_status !== 'pending');

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Ações Pendentes (IA)</h1>
        <p className="text-muted-foreground mt-1">
          {pending.length === 0
            ? 'Nenhuma decisão aguardando aprovação.'
            : `${pending.length} ação${pending.length !== 1 ? 'ões' : ''} aguardando sua aprovação.`
          }
        </p>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      {/* Pending actions */}
      <div className="space-y-4">
        {pending.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border">
            <EmptyState
              icon={<Bot className="h-12 w-12" />}
              title="Nenhuma ação pendente"
              description="Mensagens interpretadas com sucesso pelo Simulador de IA aparecerão aqui para sua aprovação."
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
            const missingFields = data.missing_fields as string[] | null;

            // Dados para exibição (excluindo chaves de sistema)
            const displayData = Object.entries(data).filter(([k]) => !SKIP_KEYS.includes(k) && k !== 'missing_fields');

            return (
              <div key={act.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-5 flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
                        <Zap className="h-3 w-3" /> {config.label}
                      </span>
                      {act.confidence_score && (
                        <span className="text-xs text-muted-foreground">
                          {(act.confidence_score * 100).toFixed(0)}% confiança
                        </span>
                      )}
                      {secondary && secondary.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                          <ArrowRight className="h-3 w-3" /> +{secondary.length} ação{secondary.length > 1 ? 'ões' : ''} automática{secondary.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground leading-snug">{data.human_summary || 'Ação interpretada pela IA'}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(act.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  {/* Approve / Reject */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(act.id)}
                      disabled={!!loading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {isLoading ? 'Executando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleReject(act.id)}
                      disabled={!!loading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {isRejecting ? 'Descartando...' : 'Rejeitar'}
                    </button>
                  </div>
                </div>

                {/* Missing fields warning */}
                {missingFields && missingFields.length > 0 && (
                  <div className="mx-5 mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-500 mb-0.5">Dados incompletos na mensagem:</p>
                      <p className="text-xs text-amber-400/80">
                        {missingFields.map(f => fieldLabels[f] || f).join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Expandable data */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : act.id)}
                  className="w-full flex items-center gap-2 px-5 py-3 border-t border-border hover:bg-muted/30 transition-colors text-xs text-muted-foreground"
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {isExpanded ? 'Ocultar dados extraídos' : 'Ver dados extraídos pela IA'}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4">
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
                            const secData = typeof sec.extracted_data === 'string'
                              ? JSON.parse(sec.extracted_data)
                              : sec.extracted_data;
                            const secConfig = intentConfig[sec.intent] || { label: sec.intent, color: 'bg-muted text-muted-foreground border-border', icon: '🤖' };
                            return (
                              <div key={si} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm text-foreground">{sec.description}</span>
                                {secData.amount && (
                                  <span className="ml-auto text-sm font-semibold text-foreground">
                                    R$ {Number(secData.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
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
              const isDone = act.confirmation_status === 'completed';
              return (
                <div key={act.id} className="flex items-center gap-4 p-4">
                  <span className="text-lg">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{data.human_summary || config.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(act.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${isDone ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                    {isDone ? '✓ Executado' : 'Descartado'}
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
