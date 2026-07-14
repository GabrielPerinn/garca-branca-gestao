'use client'

import { useState } from "react";
import { createPasture, deletePasture } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Map as MapIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";

export function PasturesClientPage({ pastures, properties = [], dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const router = useRouter();
  const propertyNames = new Map<string, string>(properties.map((property: any) => [property.id, property.name]));

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createPasture(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Pasto cadastrado com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o pasto.');
    }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deletePasture(id);
      setFeedback({ kind: 'success', message: 'Pasto excluído.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir o pasto.' });
    }
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Pastos</h1>
          <p className="text-muted-foreground mt-1">{pastures.length} pasto{pastures.length !== 1 ? 's' : ''} em {properties.length} propriedade{properties.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={properties.length === 0}
          className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Novo Pasto
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />
      {properties.length === 0 && <InlineFeedback kind="info" message="Cadastre as propriedades da operação antes de adicionar pastos." />}

      <div className="app-panel overflow-hidden">
        {pastures.length === 0 ? (
          <EmptyState
            icon={<MapIcon className="h-12 w-12" />}
            title="Nenhum pasto cadastrado"
            description="Cadastre os pastos dentro da propriedade correta para controle de rotação, capacidade e lotação."
            action={
              <button type="button" onClick={openModal} disabled={properties.length === 0} className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-4 w-4" /> Cadastrar Pasto
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="app-table min-w-[820px]">
            <caption className="sr-only">Pastos cadastrados</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Propriedade</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Capacidade</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Condição</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pastures.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-medium text-foreground">{p.name}</td>
                  <td className="p-4 text-muted-foreground">{propertyNames.get(p.land_parcel_id) || 'Não vinculada'}</td>
                  <td className="p-4 text-muted-foreground">{p.approximate_capacity ? `${p.approximate_capacity} cabeças` : '—'}</td>
                  <td className="p-4 text-muted-foreground">{p.current_condition || '—'}</td>
                  <td className="p-4"><StatusBadge status={p.status || 'active'} /></td>
                  <td className="p-4 text-right"><ConfirmDeleteButton onConfirm={() => handleDelete(p.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Novo Pasto" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <div>
              <label htmlFor="pasture-property" className="block text-sm font-medium text-foreground mb-1.5">Propriedade *</label>
              <select id="pasture-property" name="land_parcel_id" required defaultValue="" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="" disabled>Selecione onde o pasto está localizado</option>
                {properties.map((property: any) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pasture-name" className="block text-sm font-medium text-foreground mb-1.5">Nome do Pasto *</label>
              <input id="pasture-name" name="name" placeholder="Pasto 1, Braquiaria Sul..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pasture-capacity" className="block text-sm font-medium text-foreground mb-1.5">Capacidade (cabeças)</label>
                <input id="pasture-capacity" name="approximate_capacity" type="number" placeholder="150" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label htmlFor="pasture-rest-status" className="block text-sm font-medium text-foreground mb-1.5">Status de Descanso</label>
                <select id="pasture-rest-status" name="rest_status" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Em uso</option>
                  <option value="resting">Em descanso</option>
                  <option value="recovering">Recuperando</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pasture-condition" className="block text-sm font-medium text-foreground mb-1.5">Condição atual</label>
              <input id="pasture-condition" name="current_condition" placeholder="Boa, Média, Necessita reforma..." className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label htmlFor="pasture-notes" className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea id="pasture-notes" name="notes" rows={2} className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Pasto'}
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
