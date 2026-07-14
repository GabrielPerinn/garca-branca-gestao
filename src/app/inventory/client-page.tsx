'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Package, Plus } from 'lucide-react';
import { createInventoryItem, deleteInventoryItem } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatNumber } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function InventoryClientPage({ items, dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const safeItems = items || [];
  const lowStockCount = safeItems.filter(
    (item: any) => item.minimum_quantity !== null && Number(item.current_quantity) <= Number(item.minimum_quantity),
  ).length;

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createInventoryItem(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Insumo cadastrado com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o insumo.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteInventoryItem(id);
    setFeedback({ kind: 'success', message: 'Insumo excluído.' });
    router.refresh();
  }

  const createButton = (
    <button type="button" onClick={openModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Novo insumo
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Recursos"
        title="Estoque de insumos"
        description={`${safeItems.length} item${safeItems.length === 1 ? '' : 's'} cadastrado${safeItems.length === 1 ? '' : 's'}${lowStockCount ? ` · ${lowStockCount} com estoque baixo` : ''}.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="inventory-list-title">
        <h2 id="inventory-list-title" className="sr-only">Itens em estoque</h2>
        {safeItems.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12" aria-hidden="true" />}
            title="Estoque vazio"
            description="Cadastre sal mineral, vacinas, medicamentos, combustível e outros insumos."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[760px] text-left">
              <caption className="sr-only">Itens cadastrados no estoque</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Produto</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Categoria</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Quantidade atual</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Situação</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safeItems.map((item: any) => {
                  const isLow = item.minimum_quantity !== null && Number(item.current_quantity) <= Number(item.minimum_quantity);
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-muted/30">
                      <th scope="row" className="p-4 font-semibold text-foreground">{item.name}</th>
                      <td className="p-4 text-sm text-muted-foreground">{item.category || 'Não informada'}</td>
                      <td className="whitespace-nowrap p-4 text-right font-bold text-foreground">
                        {formatNumber(item.current_quantity, { maximumFractionDigits: 2 })} {item.unit || ''}
                      </td>
                      <td className="p-4">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-700/20 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Estoque baixo
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">Adequado</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <ConfirmDeleteButton label={`Excluir insumo ${item.name}`} onConfirm={() => handleDelete(item.id)} />
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
        <Modal title="Novo insumo" description="Cadastre um item e defina o limite que deve gerar alerta." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="inventory-name" label="Nome do insumo" required>
              <input id="inventory-name" name="name" required autoFocus className={fieldClassName} placeholder="Ex.: Sal mineral" />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="inventory-category" label="Categoria" required>
                <input id="inventory-category" name="category" required className={fieldClassName} placeholder="Ex.: Nutrição" />
              </FormField>
              <FormField htmlFor="inventory-unit" label="Unidade" required>
                <input id="inventory-unit" name="unit" required className={fieldClassName} placeholder="Ex.: sacos" />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="inventory-quantity" label="Quantidade atual" required>
                <input id="inventory-quantity" name="quantity" type="number" min="0" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0" />
              </FormField>
              <FormField htmlFor="inventory-minimum" label="Estoque mínimo" required hint="O item será sinalizado quando atingir este valor.">
                <input id="inventory-minimum" name="min_quantity" type="number" min="0" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0" />
              </FormField>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar insumo'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
