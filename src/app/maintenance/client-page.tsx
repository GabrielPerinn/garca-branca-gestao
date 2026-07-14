'use client'

import { useState } from "react";
import { createMaintenanceRecord, deleteMaintenanceRecord } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Wrench, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";

export function MaintenanceClientPage({ records, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const router = useRouter();

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createMaintenanceRecord(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Manutenção registrada com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a manutenção.');
    }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMaintenanceRecord(id);
      setFeedback({ kind: 'success', message: 'Manutenção excluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir a manutenção.' });
    }
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Manutenções</h1>
          <p className="text-muted-foreground mt-1">{records.length} registro{records.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="app-button-primary"
        >
          <Plus className="h-4 w-4" /> Nova Manutenção
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <div className="app-panel overflow-hidden">
        {records.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-12 w-12" />}
            title="Nenhuma manutenção registrada"
            description="Registre manutenções de equipamentos e infraestrutura."
            action={<button type="button" onClick={openModal} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Registrar Manutenção</button>}
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="app-table min-w-[820px]">
            <caption className="sr-only">Manutenções registradas</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Equipamento</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Data</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Custo</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-medium text-foreground">{r.asset_name}</td>
                  <td className="p-4 text-muted-foreground">{r.maintenance_type || r.asset_type || '—'}</td>
                  <td className="p-4 text-muted-foreground">{r.maintenance_date ? new Date(r.maintenance_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="p-4 text-right text-muted-foreground">{r.cost_amount ? `R$ ${Number(r.cost_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td className="p-4"><StatusBadge status={r.status || 'active'} /></td>
                  <td className="p-4 text-right"><ConfirmDeleteButton onConfirm={() => handleDelete(r.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Nova Manutenção" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <div>
              <label htmlFor="maintenance-asset" className="block text-sm font-medium text-foreground mb-1.5">Equipamento / Ativo *</label>
              <input id="maintenance-asset" name="asset_name" placeholder="Trator Massey, Bomba d'água..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="maintenance-type" className="block text-sm font-medium text-foreground mb-1.5">Tipo de Manutenção</label>
                <select id="maintenance-type" name="maintenance_type" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="Preventiva">Preventiva</option>
                  <option value="Corretiva">Corretiva</option>
                  <option value="Reforma">Reforma</option>
                  <option value="Revisão">Revisão</option>
                </select>
              </div>
              <div>
                <label htmlFor="maintenance-date" className="block text-sm font-medium text-foreground mb-1.5">Data</label>
                <input id="maintenance-date" name="maintenance_date" type="date" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="maintenance-cost" className="block text-sm font-medium text-foreground mb-1.5">Custo (R$)</label>
                <input id="maintenance-cost" name="cost_amount" type="number" step="0.01" placeholder="0.00" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label htmlFor="maintenance-responsible" className="block text-sm font-medium text-foreground mb-1.5">Responsável</label>
                <input id="maintenance-responsible" name="responsible_person" placeholder="Nome do responsável" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label htmlFor="maintenance-notes" className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea id="maintenance-notes" name="notes" rows={2} className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
