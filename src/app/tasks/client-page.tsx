'use client'

import { useState } from "react";
import { createTask, deleteTask, completeTask } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CheckSquare, Plus, Check, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

const priorityColors: Record<string, string> = {
  high:   'border-l-red-500',
  medium: 'border-l-amber-500',
  low:    'border-l-blue-500',
};

export function TasksClientPage({ tasks, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const pending = tasks.filter((t: any) => t.status === 'pending');
  const done = tasks.filter((t: any) => t.status !== 'pending' && t.status !== 'deleted');

  async function handleCreate(fd: FormData) {
    setLoading(true);
    try { await createTask(fd); setShowModal(false); router.refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function handleComplete(id: string) {
    try { await completeTask(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  async function handleDelete(id: string) {
    try { await deleteTask(id); router.refresh(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tarefas</h1>
          <p className="text-muted-foreground mt-1">{pending.length} pendente{pending.length !== 1 ? 's' : ''} · {done.length} concluída{done.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nova Tarefa
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-12 w-12" />}
            title="Nenhuma tarefa cadastrada"
            description="Crie tarefas para organizar o trabalho da fazenda."
            action={
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Criar Tarefa
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {tasks.filter((t: any) => t.status !== 'deleted').map((t: any) => (
              <div key={t.id} className={`flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors border-l-4 ${priorityColors[t.priority] || 'border-l-border'}`}>
                <button
                  onClick={() => t.status === 'pending' && handleComplete(t.id)}
                  className={`flex-shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${t.status !== 'pending' ? 'bg-green-500 border-green-500' : 'border-border hover:border-primary'}`}
                  disabled={t.status !== 'pending'}
                >
                  {t.status !== 'pending' && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${t.status !== 'pending' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{t.title}</p>
                  {t.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                  {t.due_date && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Prazo: {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={t.priority || 'medium'} map={{
                    high: { label: 'Alta', className: 'bg-red-500/15 text-red-500 border-red-500/30' },
                    medium: { label: 'Média', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
                    low: { label: 'Baixa', className: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
                  }} />
                  <ConfirmDeleteButton onConfirm={() => handleDelete(t.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Nova Tarefa" onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Título *</label>
              <input name="title" placeholder="Verificar cerca do pasto 3..." required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
              <textarea name="description" rows={3} placeholder="Detalhes da tarefa..." className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Prioridade</label>
                <select name="priority" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="low">Baixa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Prazo</label>
                <input name="due_date" type="date" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? 'Salvando...' : 'Criar Tarefa'}
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
