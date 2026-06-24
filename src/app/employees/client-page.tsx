'use client'

import { useState } from "react";
import { createEmployee, deleteEmployee } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users, Plus, Phone } from "lucide-react";
import { useRouter } from "next/navigation";

export function EmployeesClientPage({ employees, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(fd: FormData) {
    setLoading(true);
    try { await createEmployee(fd); setShowModal(false); router.refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteEmployee(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Funcionários</h1>
          <p className="text-muted-foreground mt-1">{employees.length} funcionário{employees.length !== 1 ? 's' : ''} cadastrado{employees.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo Funcionário
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {employees.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="Nenhum funcionário cadastrado"
            description="Adicione o primeiro funcionário da fazenda para começar."
            action={
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Adicionar Funcionário
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Função</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Telefone</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Salário</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e: any) => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-medium text-foreground">{e.full_name || '—'}</td>
                  <td className="p-4 text-muted-foreground">{e.role_description || '—'}</td>
                  <td className="p-4 text-muted-foreground">
                    {e.phone_number ? (
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{e.phone_number}</span>
                    ) : '—'}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {e.salary_amount ? `R$ ${Number(e.salary_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="p-4"><StatusBadge status={e.status || 'active'} /></td>
                  <td className="p-4 text-right">
                    <ConfirmDeleteButton onConfirm={() => handleDelete(e.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Novo Funcionário" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome Completo *</label>
              <input name="full_name" placeholder="João da Silva" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Função / Cargo *</label>
              <input name="role_description" placeholder="Capataz, Vaqueiro, Motorista..." required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Salário (R$)</label>
                <input name="salary_amount" type="number" step="0.01" placeholder="2500.00" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Dia de Pagamento</label>
                <input name="payment_day" type="number" min="1" max="31" placeholder="5" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Telefone / WhatsApp</label>
              <input name="phone_number" placeholder="(65) 99999-9999" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea name="notes" rows={2} placeholder="Informações adicionais..." className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Funcionário'}
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
