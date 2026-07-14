'use client'

import { useState } from "react";
import { createSale, deleteSale, receiveSale } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ArrowRightLeft, Plus, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";
import { formatNumber } from "@/lib/formatters";

export function SalesClientPage({ sales, lots = [], dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const router = useRouter();

  const totalGross = sales.reduce((acc: number, s: any) => acc + Number(s.gross_amount || 0), 0);
  const totalHead = sales.reduce((acc: number, s: any) => acc + Number(s.quantity || 0), 0);
  const lotNames = new Map<string, string>(lots.map((lot: any) => [lot.id, lot.name]));
  const availableLots = lots.filter((lot: any) => Number(lot.current_quantity || 0) > 0);

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createSale(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Venda registrada com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a venda.');
    }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSale(id);
      setFeedback({ kind: 'success', message: 'Venda excluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir a venda.' });
    }
  }

  async function handleReceive(id: string) {
    setLoading(true);
    try {
      await receiveSale(id);
      setFeedback({ kind: 'success', message: 'Recebimento lançado no financeiro.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível dar baixa na venda.' });
    }
    finally { setLoading(false); }
  }

  const createButton = (
    <button
      type="button"
      onClick={openModal}
      disabled={availableLots.length === 0}
      className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-4 w-4" aria-hidden="true" /> Registrar Venda
    </button>
  );

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Vendas de Gado</h1>
          <p className="text-muted-foreground mt-1">{sales.length} venda{sales.length !== 1 ? 's' : ''} · {totalHead} cabeças · R$ {totalGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} total</p>
        </div>
        {createButton}
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}
      {availableLots.length === 0 && (
        <InlineFeedback kind="info" message="Cadastre um lote ativo com saldo antes de registrar uma venda." />
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <div className="app-panel overflow-hidden">
        {sales.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="h-12 w-12" />}
            title="Nenhuma venda registrada"
            description="Registre as vendas de gado para controle financeiro."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="app-table min-w-[980px]">
            <caption className="sr-only">Vendas de gado registradas</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Lote</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Comprador</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Cabeças</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Valor Bruto</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((s: any) => {
                const lotName = s.lot?.name || lotNames.get(s.cattle_lot_id) || 'Lote não encontrado';
                return (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 text-muted-foreground">
                    {s.negotiation_date ? new Date(s.negotiation_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="p-4 font-medium text-foreground">{lotName}</td>
                  <td className="p-4 font-medium text-foreground">{s.buyer_name}</td>
                  <td className="p-4 text-right text-muted-foreground">{Number(s.quantity || 0).toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-right font-bold text-primary">
                    <span className="flex items-center justify-end gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      R$ {Number(s.gross_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="p-4"><StatusBadge status={s.payment_status || 'pending'} map={{
                    pending: { label: 'A Receber', className: 'bg-amber-50 text-amber-900 border-amber-200' },
                    paid: { label: 'Pago', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                  }} /></td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.payment_status !== 'paid' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleReceive(s.id)}
                          className="min-h-9 rounded-lg border border-emerald-700/30 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Dar baixa
                        </button>
                      )}
                      <ConfirmDeleteButton onConfirm={() => handleDelete(s.id)} />
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Registrar Venda de Gado" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <div>
              <label htmlFor="sale-cattle-lot" className="block text-sm font-medium text-foreground mb-1.5">Lote *</label>
              <select id="sale-cattle-lot" name="cattle_lot_id" required defaultValue="" autoFocus className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="" disabled>Selecione um lote</option>
                {lots.map((lot: any) => {
                  const balance = Number(lot.current_quantity || 0);
                  return (
                    <option key={lot.id} value={lot.id} disabled={balance <= 0}>
                      {lot.name} — saldo: {formatNumber(balance)} cabeças{balance <= 0 ? ' (sem saldo)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="sale-buyer" className="block text-sm font-medium text-foreground mb-1.5">Comprador *</label>
              <input id="sale-buyer" name="buyer" placeholder="Nome do comprador / frigorífico" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sale-date" className="block text-sm font-medium text-foreground mb-1.5">Data da Negociação *</label>
                <input id="sale-date" name="date" type="date" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label htmlFor="sale-quantity" className="block text-sm font-medium text-foreground mb-1.5">Qtd. Cabeças *</label>
                <input id="sale-quantity" name="quantity" type="number" min="1" placeholder="50" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sale-amount" className="block text-sm font-medium text-foreground mb-1.5">Valor Bruto (R$) *</label>
                <input id="sale-amount" name="amount" type="number" step="0.01" placeholder="180000.00" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label htmlFor="sale-shipment-date" className="block text-sm font-medium text-foreground mb-1.5">Data do Embarque</label>
                <input id="sale-shipment-date" name="shipment_date" type="date" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label htmlFor="sale-notes" className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea id="sale-notes" name="notes" rows={2} className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Venda'}
              </button>
              <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
