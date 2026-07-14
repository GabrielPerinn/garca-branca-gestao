'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Leaf, Loader2, Plus } from 'lucide-react';
import { createSuppression, deleteSuppression } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCivilDate, formatNumber } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function SuppressionClientPage({ records, dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createSuppression(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Operação de supressão registrada.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a operação.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteSuppression(id);
    setFeedback({ kind: 'success', message: 'Operação excluída.' });
    router.refresh();
  }

  const totalArea = records.reduce(
    (sum: number, record: any) => sum + Number(record.approximate_area ?? record.area_cleared ?? 0),
    0,
  );
  const createButton = (
    <button type="button" onClick={openModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nova operação
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Conformidade ambiental"
        title="Supressão e limpeza"
        description={`${records.length} operação${records.length === 1 ? '' : 'ões'} · ${formatNumber(totalArea, { maximumFractionDigits: 2 })} ha registrados.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="suppression-list-title">
        <h2 id="suppression-list-title" className="sr-only">Operações de supressão e limpeza</h2>
        {records.length === 0 ? (
          <EmptyState
            icon={<Leaf className="h-12 w-12" aria-hidden="true" />}
            title="Nenhuma operação registrada"
            description="Mantenha o histórico da área aproximada e das observações de cada operação."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[720px] text-left">
              <caption className="sr-only">Histórico de operações de supressão e limpeza</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Data</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Observações</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Área aproximada</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record: any) => {
                  const notes = record.notes || record.location_description || 'Sem observações';
                  const area = record.approximate_area ?? record.area_cleared;
                  return (
                    <tr key={record.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatCivilDate(record.operation_date)}</td>
                      <th scope="row" className="max-w-lg p-4 font-semibold text-foreground">{notes}</th>
                      <td className="whitespace-nowrap p-4 text-right font-bold text-foreground">{formatNumber(area, { maximumFractionDigits: 2 })} ha</td>
                      <td className="p-4 text-right">
                        <ConfirmDeleteButton label={`Excluir operação de ${formatCivilDate(record.operation_date)}`} onConfirm={() => handleDelete(record.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <Modal title="Nova operação de supressão" description="Registre os dados de uma operação de limpeza ou supressão." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="suppression-date" label="Data da operação" required>
              <input id="suppression-date" name="date" type="date" required autoFocus className={fieldClassName} />
            </FormField>
            <FormField htmlFor="suppression-area" label="Área aproximada (ha)" required>
              <input id="suppression-area" name="approximate_area" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
            </FormField>
            <FormField htmlFor="suppression-notes" label="Observações e localização" required hint="Inclua o setor, finalidade e autorizações relacionadas.">
              <textarea id="suppression-notes" name="notes" rows={4} required className={`${fieldClassName} resize-y`} placeholder="Ex.: Limpeza de acesso no setor sul, conforme autorização..." />
            </FormField>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar operação'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
