'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mountain, Plus } from 'lucide-react';
import { createGravel, deleteGravel } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCivilDate, formatNumber } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function GravelClientPage({ records, dbError }: any) {
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
      await createGravel(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Operação de cascalheira registrada.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a operação.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteGravel(id);
    setFeedback({ kind: 'success', message: 'Operação excluída.' });
    router.refresh();
  }

  const totalVolume = records.reduce(
    (sum: number, record: any) => sum + Number(record.estimated_volume ?? record.volume_extracted ?? 0),
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
        eyebrow="Operações"
        title="Cascalheira"
        description={`${records.length} operação${records.length === 1 ? '' : 'ões'} · ${formatNumber(totalVolume, { maximumFractionDigits: 2 })} m³ estimados.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="gravel-list-title">
        <h2 id="gravel-list-title" className="sr-only">Operações de cascalheira</h2>
        {records.length === 0 ? (
          <EmptyState
            icon={<Mountain className="h-12 w-12" aria-hidden="true" />}
            title="Nenhuma operação registrada"
            description="Registre a origem e o volume estimado de cada movimentação de cascalho."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[680px] text-left">
              <caption className="sr-only">Histórico de operações de cascalheira</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Data</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Local de origem</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Volume estimado</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record: any) => {
                  const origin = record.origin_location || record.location_description || 'Não informado';
                  const volume = record.estimated_volume ?? record.volume_extracted;
                  return (
                    <tr key={record.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatCivilDate(record.operation_date)}</td>
                      <th scope="row" className="p-4 font-semibold text-foreground">{origin}</th>
                      <td className="whitespace-nowrap p-4 text-right font-bold text-foreground">{formatNumber(volume, { maximumFractionDigits: 2 })} m³</td>
                      <td className="p-4 text-right">
                        <ConfirmDeleteButton label={`Excluir operação em ${origin}`} onConfirm={() => handleDelete(record.id)} />
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
        <Modal title="Nova operação de cascalheira" description="Informe a origem e o volume estimado extraído." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="gravel-date" label="Data da operação" required>
              <input id="gravel-date" name="date" type="date" required autoFocus className={fieldClassName} />
            </FormField>
            <FormField htmlFor="gravel-origin" label="Local de origem" required>
              <input id="gravel-origin" name="origin_location" required className={fieldClassName} placeholder="Ex.: Cascalheira do setor norte" />
            </FormField>
            <FormField htmlFor="gravel-volume" label="Volume estimado (m³)" required hint="Use uma estimativa decimal quando necessário.">
              <input id="gravel-volume" name="estimated_volume" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
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
