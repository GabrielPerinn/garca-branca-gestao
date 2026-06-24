'use client'

import { useState } from "react";
import { convertOccurrence, archiveOccurrence } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Inbox, Archive, ArrowRight, Calendar, Tag } from "lucide-react";
import { useRouter } from "next/navigation";

const CONVERT_OPTIONS = [
  { label: 'Tarefa', value: 'tasks', defaultPayload: (o: any) => ({ title: o.title || 'Tarefa da Ocorrência', description: o.description, priority: o.priority || 'medium', status: 'pending' }) },
  { label: 'Despesa', value: 'expenses', defaultPayload: (o: any) => ({ description: o.description || o.title, amount: 0, expense_date: new Date().toISOString().split('T')[0], category: 'Ocorrência', status: 'active' }) },
  { label: 'Manutenção', value: 'maintenance_records', defaultPayload: (o: any) => ({ asset_name: o.title || 'Ativo Identificado', notes: o.description, maintenance_date: new Date().toISOString().split('T')[0], status: 'active' }) },
];

export function OccurrencesClientPage({ occurrences, dbError }: any) {
  const [converting, setConverting] = useState<string | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleConvert(occurrence: any, target: typeof CONVERT_OPTIONS[0]) {
    setLoading(true);
    try {
      await convertOccurrence(occurrence.id, target.value, target.defaultPayload(occurrence));
      setConverting(null);
      setSelectedOccurrence(null);
      router.refresh();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleArchive(id: string) {
    try { await archiveOccurrence(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  const pending = occurrences.filter((o: any) => o.status === 'pending_review');
  const others = occurrences.filter((o: any) => o.status !== 'pending_review');

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Caixa de Entrada / Ocorrências</h1>
        <p className="text-muted-foreground mt-1">{pending.length} aguardando revisão · {others.length} processada{others.length !== 1 ? 's' : ''}</p>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {occurrences.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12" />}
            title="Nenhuma ocorrência"
            description="Quando a IA não conseguir classificar uma mensagem com segurança, ela aparecerá aqui para revisão."
          />
        ) : (
          <div className="divide-y divide-border">
            {occurrences.map((o: any) => (
              <div key={o.id} className="p-5 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={o.status || 'pending_review'} />
                      {o.priority && <StatusBadge status={o.priority} />}
                      {o.suggested_category && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag className="h-3 w-3" /> {o.suggested_category}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground">{o.title || 'Sem título'}</p>
                    {o.description && <p className="text-sm text-muted-foreground mt-1">{o.description}</p>}
                    {o.original_text && o.original_text !== o.description && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-lg border-l-2 border-border">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Mensagem original:</p>
                        <p className="text-sm text-foreground italic">"{o.original_text}"</p>
                      </div>
                    )}
                    {o.converted_to_table && (
                      <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Convertido para: {o.converted_to_table}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(o.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  {o.status === 'pending_review' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setConverting(o.id); setSelectedOccurrence(o); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition-colors"
                      >
                        <ArrowRight className="h-3.5 w-3.5" /> Converter
                      </button>
                      <button
                        onClick={() => handleArchive(o.id)}
                        className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Arquivar"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {converting && selectedOccurrence && (
        <Modal title="Converter Ocorrência" onClose={() => { setConverting(null); setSelectedOccurrence(null); }}>
          <p className="text-sm text-muted-foreground mb-6">Escolha para onde esta ocorrência será convertida:</p>
          <div className="space-y-3">
            {CONVERT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleConvert(selectedOccurrence, opt)}
                disabled={loading}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                <span className="font-medium text-foreground">{opt.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <button
            onClick={() => { setConverting(null); setSelectedOccurrence(null); }}
            className="w-full mt-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm"
          >
            Cancelar
          </button>
        </Modal>
      )}
    </div>
  );
}
