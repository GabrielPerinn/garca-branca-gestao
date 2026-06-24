'use client'

import { useState } from "react";
import { createFarm, deleteFarm } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tractor, Plus, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

export function FarmsClientPage({ farms, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(fd: FormData) {
    setLoading(true);
    try { await createFarm(fd); setShowModal(false); router.refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteFarm(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Fazendas</h1>
          <p className="text-muted-foreground mt-1">{farms.length} fazenda{farms.length !== 1 ? 's' : ''} cadastrada{farms.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nova Fazenda
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {farms.length === 0 ? (
          <EmptyState
            icon={<Tractor className="h-12 w-12" />}
            title="Nenhuma fazenda cadastrada"
            description="Cadastre a primeira fazenda para começar a organizar seus dados."
            action={
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Cadastrar Fazenda
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {farms.map((f: any) => (
              <div key={f.id} className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Tractor className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{f.name}</p>
                    {f.location_description && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {f.location_description}
                      </p>
                    )}
                    {f.notes && <p className="text-xs text-muted-foreground mt-0.5">{f.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={f.status || 'active'} />
                  <ConfirmDeleteButton onConfirm={() => handleDelete(f.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Nova Fazenda" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome da Fazenda *</label>
              <input name="name" placeholder="Fazenda Garça Branca" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Localização / Endereço</label>
              <input name="location_description" placeholder="Rodovia MT-060, Km 12, Cáceres - MT" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea name="notes" rows={3} placeholder="Informações adicionais sobre a fazenda..." className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Fazenda'}
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
