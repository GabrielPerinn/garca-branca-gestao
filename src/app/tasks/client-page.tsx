'use client'

import { useState } from "react";
import { createTask, deleteTask, completeTask } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CheckSquare, Plus, Check, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";

const priorityColors: Record<string, string> = {
  high:   'border-l-red-500',
  medium: 'border-l-amber-500',
  low:    'border-l-blue-500',
};

export function TasksClientPage({ tasks, dbError }: any) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const router = useRouter();

  const pending = tasks.filter((t: any) => t.status === 'pending');
  const done = tasks.filter((t: any) => t.status !== 'pending' && t.status !== 'deleted');

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createTask(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Tarefa criada com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível criar a tarefa.');
    }
    finally { setLoading(false); }
  }

  async function handleComplete(id: string) {
    try {
      await completeTask(id);
      setFeedback({ kind: 'success', message: 'Tarefa marcada como concluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível concluir a tarefa.' });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setFeedback({ kind: 'success', message: 'Tarefa excluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir a tarefa.' });
    }
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Tarefas</h1>
          <p className="text-muted-foreground mt-1">{pending.length} pendente{pending.length !== 1 ? 's' : ''} · {done.length} concluída{done.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="app-button-primary"
        >
          <Plus className="h-4 w-4" /> Nova Tarefa
        </button>
      </div>

      {dbError && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{dbError}</div>
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <div className="app-panel overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-12 w-12" />}
            title="Nenhuma tarefa cadastrada"
            description="Crie tarefas para organizar o trabalho da fazenda."
            action={
              <button type="button" onClick={openModal} className="app-button-primary">
                <Plus className="h-4 w-4" /> Criar Tarefa
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {tasks.filter((t: any) => t.status !== 'deleted').map((t: any) => (
              <div key={t.id} className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-l-4 p-5 transition-colors hover:bg-muted/30 sm:flex sm:items-center sm:gap-4 ${priorityColors[t.priority] || 'border-l-border'}`}>
                <button
                  type="button"
                  onClick={() => t.status === 'pending' && handleComplete(t.id)}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={t.status !== 'pending'}
                  aria-label={t.status === 'pending' ? `Marcar tarefa ${t.title} como concluída` : `Tarefa ${t.title} concluída`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${t.status !== 'pending' ? 'border-green-700 bg-green-700' : 'border-border hover:border-primary'}`} aria-hidden="true">
                    {t.status !== 'pending' && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
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
                <div className="col-span-2 ml-14 flex flex-wrap items-center justify-end gap-3 sm:ml-0">
                  <StatusBadge status={t.priority || 'medium'} map={{
                    high: { label: 'Alta', className: 'bg-red-50 text-red-800 border-red-200' },
                    medium: { label: 'Média', className: 'bg-amber-50 text-amber-900 border-amber-200' },
                    low: { label: 'Baixa', className: 'bg-blue-50 text-blue-800 border-blue-200' },
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
            <InlineFeedback kind="error" message={formError} />
            <div>
              <label htmlFor="task-title" className="block text-sm font-medium text-foreground mb-1.5">Título *</label>
              <input id="task-title" name="title" placeholder="Verificar cerca do pasto 3..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label htmlFor="task-description" className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
              <textarea id="task-description" name="description" rows={3} placeholder="Detalhes da tarefa..." className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="task-priority" className="block text-sm font-medium text-foreground mb-1.5">Prioridade</label>
                <select id="task-priority" name="priority" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="low">Baixa</option>
                </select>
              </div>
              <div>
                <label htmlFor="task-due-date" className="block text-sm font-medium text-foreground mb-1.5">Prazo</label>
                <input id="task-due-date" name="due_date" type="date" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
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
