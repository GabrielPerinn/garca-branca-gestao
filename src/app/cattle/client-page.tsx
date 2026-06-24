'use client'

import { useState } from "react";
import { createCattleLot, deleteCattleLot } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Activity, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export function CattleClientPage({ lots, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const totalHeads = lots.reduce((acc: number, l: any) => acc + Number(l.current_quantity || 0), 0);

  async function handleCreate(fd: FormData) {
    setLoading(true);
    try { await createCattleLot(fd); setShowModal(false); router.refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteCattleLot(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gado / Lotes</h1>
          <p className="text-muted-foreground mt-1">{lots.length} lote{lots.length !== 1 ? 's' : ''} — {totalHeads} cabeças no total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo Lote
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {lots.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-12 w-12" />}
            title="Nenhum lote cadastrado"
            description="Cadastre os lotes de gado para controle de rebanho."
            action={
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Cadastrar Lote
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Lote</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Categoria</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Proprietário</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Cabeças</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lots.map((l: any) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-semibold text-foreground">{l.name}</td>
                  <td className="p-4 text-muted-foreground">{l.category || '—'}</td>
                  <td className="p-4 text-muted-foreground">{l.owner || '—'}</td>
                  <td className="p-4 text-right font-bold text-foreground">{Number(l.current_quantity || 0).toLocaleString('pt-BR')}</td>
                  <td className="p-4"><StatusBadge status={l.status || 'active'} /></td>
                  <td className="p-4 text-right"><ConfirmDeleteButton onConfirm={() => handleDelete(l.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Novo Lote de Gado" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome do Lote *</label>
              <input name="name" placeholder="Lote Boi Gordo 2024, Matrizes..." required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Categoria</label>
                <select name="category" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Selecione...</option>
                  <option value="Boi Gordo">Boi Gordo</option>
                  <option value="Novilho">Novilho</option>
                  <option value="Bezerro">Bezerro</option>
                  <option value="Vaca">Vaca</option>
                  <option value="Matriz">Matriz</option>
                  <option value="Touro">Touro</option>
                  <option value="Misto">Misto</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Quantidade *</label>
                <input name="current_quantity" type="number" min="0" placeholder="0" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Proprietário</label>
              <input name="owner" placeholder="Nome do proprietário" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Origem</label>
              <input name="origin" placeholder="Onde o gado veio" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea name="notes" rows={2} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Lote'}
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
