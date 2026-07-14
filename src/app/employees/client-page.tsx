'use client'

import { useState } from "react";
import { createEmployee, deleteEmployee } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users, Plus, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";

export function EmployeesClientPage({ employees, dbError }: any) {
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
      await createEmployee(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Funcionário cadastrado com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o funcionário.');
    }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteEmployee(id);
      setFeedback({ kind: 'success', message: 'Funcionário excluído.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir o funcionário.' });
    }
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Funcionários</h1>
          <p className="text-muted-foreground mt-1">{employees.length} funcionário{employees.length !== 1 ? 's' : ''} cadastrado{employees.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="app-button-primary"
        >
          <Plus className="h-4 w-4" /> Novo Funcionário
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <div className="app-panel overflow-hidden">
        {employees.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="Nenhum funcionário cadastrado"
            description="Adicione o primeiro funcionário da fazenda para começar."
            action={
              <button type="button" onClick={openModal} className="app-button-primary">
                <Plus className="h-4 w-4" /> Adicionar Funcionário
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="app-table min-w-[820px]">
            <caption className="sr-only">Funcionários cadastrados</caption>
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
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Novo Funcionário" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <div>
              <label htmlFor="employee-full-name" className="block text-sm font-medium text-foreground mb-1.5">Nome Completo *</label>
              <input id="employee-full-name" name="full_name" placeholder="João da Silva" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label htmlFor="employee-role" className="block text-sm font-medium text-foreground mb-1.5">Função / Cargo *</label>
              <input id="employee-role" name="role_description" placeholder="Capataz, Vaqueiro, Motorista..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="employee-salary" className="block text-sm font-medium text-foreground mb-1.5">Salário (R$)</label>
                <input id="employee-salary" name="salary_amount" type="number" step="0.01" placeholder="2500.00" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label htmlFor="employee-payment-day" className="block text-sm font-medium text-foreground mb-1.5">Dia de Pagamento</label>
                <input id="employee-payment-day" name="payment_day" type="number" min="1" max="31" placeholder="5" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div>
              <label htmlFor="employee-phone" className="block text-sm font-medium text-foreground mb-1.5">Telefone / WhatsApp</label>
              <input id="employee-phone" name="phone_number" type="tel" placeholder="(65) 99999-9999" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label htmlFor="employee-notes" className="block text-sm font-medium text-foreground mb-1.5">Observações</label>
              <textarea id="employee-notes" name="notes" rows={2} placeholder="Informações adicionais..." className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
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
