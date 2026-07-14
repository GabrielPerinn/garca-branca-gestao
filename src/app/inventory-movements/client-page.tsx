'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Loader2, Plus } from 'lucide-react';
import { createMovement, deleteMovement } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCivilDate, formatNumber } from '@/lib/formatters';
import { getCivilDate } from '@/lib/date';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function MovementsClientPage({ movements, items, dbError }: any) {
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
      await createMovement(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Movimentação registrada com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a movimentação.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteMovement(id);
    setFeedback({ kind: 'success', message: 'Movimentação excluída.' });
    router.refresh();
  }

  const itemsById = new Map(items.map((item: any) => [item.id, item]));
  const createButton = items.length > 0 ? (
      <button type="button" onClick={openModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nova movimentação
      </button>
    ) : (
      <Link href="/inventory" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
        <Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar item primeiro
      </Link>
    );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Estoque"
        title="Movimentações de estoque"
        description={`${movements.length} movimentação${movements.length === 1 ? '' : 'ões'} registrada${movements.length === 1 ? '' : 's'}.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="movements-list-title">
        <h2 id="movements-list-title" className="sr-only">Movimentações de estoque</h2>
        {movements.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="h-12 w-12" aria-hidden="true" />}
            title="Nenhuma movimentação registrada"
            description="Registre entradas e saídas para manter o estoque atualizado."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[760px] text-left">
              <caption className="sr-only">Histórico de movimentações de estoque</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Data</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Item</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Tipo</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Quantidade</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((movement: any) => {
                  const isEntry = movement.movement_type === 'in';
                  const MovementIcon = isEntry ? ArrowDownToLine : ArrowUpFromLine;
                  const item = itemsById.get(movement.inventory_item_id) as any;
                  return (
                    <tr key={movement.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatCivilDate(movement.movement_date)}</td>
                      <th scope="row" className="p-4 font-semibold text-foreground">{item?.name || 'Item legado não vinculado'}</th>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-2 font-semibold ${isEntry ? 'text-primary' : 'text-red-700'}`}>
                          <MovementIcon className="h-4 w-4" aria-hidden="true" />
                          {isEntry ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-4 text-right font-bold text-foreground">
                        {formatNumber(movement.quantity, { maximumFractionDigits: 2 })}{(movement.unit || item?.unit) ? ` ${movement.unit || item?.unit}` : ''}
                      </td>
                      <td className="p-4 text-right">
                        <ConfirmDeleteButton label={`Excluir movimentação de ${formatCivilDate(movement.movement_date)}`} onConfirm={() => handleDelete(movement.id)} />
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
        <Modal title="Nova movimentação" description="Informe se o registro é uma entrada ou uma saída de estoque." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="movement-item" label="Item" required>
              <select id="movement-item" name="item_id" required defaultValue="" autoFocus className={fieldClassName}>
                <option value="" disabled>Selecione um item</option>
                {items.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — saldo {formatNumber(item.current_quantity, { maximumFractionDigits: 2 })} {item.unit || ''}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="movement-date" label="Data" required>
                <input id="movement-date" name="date" type="date" required defaultValue={getCivilDate()} className={fieldClassName} />
              </FormField>
              <FormField htmlFor="movement-type" label="Tipo" required>
                <select id="movement-type" name="type" required defaultValue="in" className={fieldClassName}>
                  <option value="in">Entrada</option>
                  <option value="out">Saída</option>
                </select>
              </FormField>
            </div>
            <FormField htmlFor="movement-quantity" label="Quantidade" required>
              <input id="movement-quantity" name="quantity" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
            </FormField>
            <FormField htmlFor="movement-reason" label="Motivo">
              <input id="movement-reason" name="reason" className={fieldClassName} placeholder="Ex.: Compra, consumo no curral, ajuste de inventário" />
            </FormField>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar movimentação'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
