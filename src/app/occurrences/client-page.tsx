'use client'

import { useState } from "react";
import { convertOccurrence, archiveOccurrence } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { InlineFeedback } from "@/components/ui/InlineFeedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { fieldClassName, FormField } from "@/components/ui/FormField";
import { Inbox, Archive, ArrowRight, Calendar, Loader2, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/formatters";
import { getCivilDate } from "@/lib/date";

const CONVERT_OPTIONS = [
  { label: 'Tarefa', value: 'tasks', defaultPayload: (o: any) => ({ title: o.title || 'Tarefa da Ocorrência', description: o.description, priority: o.priority || 'medium', status: 'pending' }) },
  { label: 'Manutenção', value: 'maintenance_records', defaultPayload: (o: any) => ({ asset_name: o.title || 'Ativo Identificado', notes: o.description, maintenance_date: getCivilDate(), status: 'active' }) },
];

const EXPENSE_OPTION = { label: 'Despesa', value: 'expenses' } as const;

export function OccurrencesClientPage({ occurrences, dbError }: any) {
  const [converting, setConverting] = useState<string | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConvert(
    occurrence: any,
    target: { label: string; value: string },
    payload: Record<string, unknown>,
  ) {
    setLoading(true);
    setModalError(null);
    try {
      await convertOccurrence(occurrence.id, target.value, payload);
      setConverting(null);
      setSelectedOccurrence(null);
      setFeedback({ kind: 'success', message: `Ocorrência convertida em ${target.label.toLowerCase()}.` });
      router.refresh();
    } catch (caught) {
      setModalError(caught instanceof Error ? caught.message : 'Não foi possível converter a ocorrência.');
    }
    finally { setLoading(false); }
  }

  async function handleExpenseConversion(formData: FormData) {
    if (!selectedOccurrence) return;
    await handleConvert(selectedOccurrence, EXPENSE_OPTION, {
      description: selectedOccurrence.description || selectedOccurrence.title || 'Despesa de ocorrência',
      amount: formData.get('amount'),
      expense_date: formData.get('expense_date'),
      category: formData.get('category') || 'Ocorrência',
    });
  }

  async function handleArchive(id: string) {
    try {
      await archiveOccurrence(id);
      setFeedback({ kind: 'success', message: 'Ocorrência arquivada.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível arquivar a ocorrência.' });
    }
  }

  const pending = occurrences.filter((o: any) => o.status === 'pending_review');
  const others = occurrences.filter((o: any) => o.status !== 'pending_review');

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Triagem da IA"
        title="Caixa de entrada e ocorrências"
        description={`${pending.length} aguardando revisão · ${others.length} processada${others.length !== 1 ? 's' : ''}`}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="occurrences-list-title">
        <h2 id="occurrences-list-title" className="sr-only">Ocorrências recebidas</h2>
        {occurrences.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12" aria-hidden="true" />}
            title="Nenhuma ocorrência"
            description="Quando a IA não conseguir classificar uma mensagem com segurança, ela aparecerá aqui para revisão."
          />
        ) : (
          <div className="divide-y divide-border">
            {occurrences.map((o: any) => (
              <div key={o.id} className="p-5 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                      <StatusBadge status={o.status || 'pending_review'} />
                      {o.priority && <StatusBadge status={o.priority} />}
                      {o.suggested_category && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag className="h-3 w-3" aria-hidden="true" /> {o.suggested_category}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground">{o.title || 'Sem título'}</p>
                    {o.description && <p className="text-sm text-muted-foreground mt-1">{o.description}</p>}
                    {o.original_text && o.original_text !== o.description && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-lg border-l-2 border-border">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Mensagem original:</p>
                        <p className="text-sm italic text-foreground">“{o.original_text}”</p>
                      </div>
                    )}
                    {o.converted_to_table && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-blue-700">
                        <ArrowRight className="h-3 w-3" aria-hidden="true" /> Convertido para: {o.converted_to_table}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {formatDateTime(o.created_at)}
                    </p>
                  </div>

                  {o.status === 'pending_review' && (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => { setModalError(null); setConverting(o.id); setSelectedOccurrence(o); }}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary sm:flex-none"
                      >
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Converter
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(o.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Arquivar ocorrência ${o.title || 'sem título'}`}
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {converting && selectedOccurrence && (
        <Modal title="Converter ocorrência" description="Escolha para onde esta ocorrência será convertida." onClose={() => { setConverting(null); setSelectedOccurrence(null); }}>
          <div className="space-y-3">
            <InlineFeedback kind="error" message={modalError} />
            {CONVERT_OPTIONS.map(opt => (
              <button
                type="button"
                key={opt.value}
                onClick={() => handleConvert(selectedOccurrence, opt, opt.defaultPayload(selectedOccurrence))}
                disabled={loading}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                <span className="font-medium text-foreground">{opt.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ou como despesa</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={handleExpenseConversion} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="occurrence-expense-amount" label="Valor (R$)" required>
                <input id="occurrence-expense-amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
              </FormField>
              <FormField htmlFor="occurrence-expense-date" label="Data" required>
                <input id="occurrence-expense-date" name="expense_date" type="date" required defaultValue={getCivilDate()} className={fieldClassName} />
              </FormField>
            </div>
            <FormField htmlFor="occurrence-expense-category" label="Categoria">
              <input id="occurrence-expense-category" name="category" defaultValue="Ocorrência" className={fieldClassName} />
            </FormField>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Registrar como despesa
            </button>
          </form>
          <button
            type="button"
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
