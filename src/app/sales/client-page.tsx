'use client'

import { useState } from "react";
import { createSale, deleteSale } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ArrowRightLeft, Plus, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

export function SalesClientPage({ sales, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const totalGross = sales.reduce((acc: number, s: any) => acc + Number(s.gross_amount || 0), 0);
  const totalHead = sales.reduce((acc: number, s: any) => acc + Number(s.quantity || 0), 0);

  async function handleCreate(fd: FormData) {
    setLoading(true);
    try { await createSale(fd); setShowModal(false); router.refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteSale(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Vendas de Gado</h1>
          <p className="text-muted-foreground mt-1">{sales.length} venda{sales.length !== 1 ? 's' : ''} · {totalHead} cabeças · R$ {totalGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Registrar Venda
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {sales.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="h-12 w-12" />}
            title="Nenhuma venda registrada"
            description="Registre as vendas de gado para controle financeiro."
            action={
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Registrar Venda
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Comprador</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Cabeças</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Valor Bruto</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 text-muted-foreground">
                    {s.negotiation_date ? new Date(s.negotiation_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="p-4 font-medium text-foreground">{s.buyer_name}</td>
                  <td className="p-4 text-right text-muted-foreground">{Number(s.quantity || 0).toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-right font-bold text-primary">
                    <span className="flex items-center justify-end gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      R$ {Number(s.gross_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="p-4"><StatusBadge status={s.payment_status || 'pending'} map={{
                    pending: { label: 'A Receber', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
                    paid: { label: 'Pago', className: 'bg-green-500/15 text-green-500 border-green-500/30' },
                  }} /></td>
                  <td className="p-4 text-right"><ConfirmDeleteButton onConfirm={() => handleDelete(s.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Registrar Venda de Gado" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Comprador *</label>
              <input name="buyer" placeholder="Nome do comprador / frigorífico" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Data da Negociação *</label>
                <input name="date" type="date" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Qtd. Cabeças *</label>
                <input name="quantity" type="number" min="1" placeholder="50" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Valor Bruto (R$) *</label>
                <input name="amount" type="number" step="0.01" placeholder="180000.00" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Data do Embarque</label>
                <input name="shipment_date" type="date" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea name="notes" rows={2} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
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
