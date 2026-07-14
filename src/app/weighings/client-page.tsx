'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Loader2, Plus } from 'lucide-react';
import { createWeighing, deleteWeighing } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCivilDate, formatNumber } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function WeighingsClientPage({ weighings, lots = [], dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const lotNames = new Map<string, string>(lots.map((lot: any) => [lot.id, lot.name]));

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createWeighing(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Pesagem registrada com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a pesagem.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteWeighing(id);
    setFeedback({ kind: 'success', message: 'Pesagem excluída.' });
    router.refresh();
  }

  const average = weighings.length
    ? weighings.reduce((sum: number, weighing: any) => sum + Number(weighing.average_weight || 0), 0) / weighings.length
    : 0;
  const createButton = (
    <button type="button" onClick={openModal} disabled={lots.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nova pesagem
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Pecuária"
        title="Pesagens"
        description={weighings.length ? `${weighings.length} pesagem${weighings.length === 1 ? '' : 's'} · média de ${formatNumber(average, { maximumFractionDigits: 2 })} kg.` : 'Acompanhe a evolução de peso do rebanho.'}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      {lots.length === 0 && (
        <InlineFeedback kind="info" message="Cadastre ao menos um lote ativo antes de registrar pesagens." />
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="weighings-list-title">
        <h2 id="weighings-list-title" className="sr-only">Histórico de pesagens</h2>
        {weighings.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-12 w-12" aria-hidden="true" />}
            title="Nenhuma pesagem registrada"
            description="Registre o peso médio para acompanhar o desempenho dos animais ao longo do tempo."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[720px] text-left">
              <caption className="sr-only">Pesagens registradas</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Data</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Lote</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Peso médio</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weighings.map((weighing: any) => {
                  const lotName = weighing.lot?.name || lotNames.get(weighing.cattle_lot_id) || 'Lote não encontrado';
                  return (
                  <tr key={weighing.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatCivilDate(weighing.weighing_date)}</td>
                    <th scope="row" className="p-4 font-semibold text-foreground">{lotName}</th>
                    <td className="whitespace-nowrap p-4 text-right text-lg font-bold text-foreground">{formatNumber(weighing.average_weight, { maximumFractionDigits: 2 })} kg</td>
                    <td className="p-4 text-right">
                      <ConfirmDeleteButton label={`Excluir pesagem de ${formatCivilDate(weighing.weighing_date)}`} onConfirm={() => handleDelete(weighing.id)} />
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
        <Modal title="Nova pesagem" description="Registre a data e o peso médio observado." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="weighing-cattle-lot" label="Lote" required>
              <select id="weighing-cattle-lot" name="cattle_lot_id" required defaultValue="" autoFocus className={fieldClassName}>
                <option value="" disabled>Selecione um lote</option>
                {lots.map((lot: any) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name} — {formatNumber(lot.current_quantity)} cabeças
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="weighing-date" label="Data" required>
                <input id="weighing-date" name="date" type="date" required className={fieldClassName} />
              </FormField>
              <FormField htmlFor="weighing-weight" label="Peso médio (kg)" required>
                <input id="weighing-weight" name="weight" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
              </FormField>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar pesagem'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
