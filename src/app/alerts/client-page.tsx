'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2, Plus } from 'lucide-react';
import { createAlert, deleteAlert } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCivilDate, formatDateTime } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function AlertsClientPage({ alerts, dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createAlert(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Alerta criado com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível criar o alerta.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteAlert(id);
    setFeedback({ kind: 'success', message: 'Alerta excluído.' });
    router.refresh();
  }

  const createButton = (
    <button type="button" onClick={openModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Novo alerta
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Acompanhamento"
        title="Alertas"
        description={`${alerts.length} alerta${alerts.length === 1 ? '' : 's'} cadastrado${alerts.length === 1 ? '' : 's'}.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="alerts-list-title">
        <h2 id="alerts-list-title" className="sr-only">Lista de alertas</h2>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-12 w-12" aria-hidden="true" />}
            title="Nenhum alerta cadastrado"
            description="Crie alertas para acompanhar prazos, estoque e situações importantes da fazenda."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[880px] text-left">
              <caption className="sr-only">Alertas cadastrados na fazenda</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Criado em</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Título</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Avisar em</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Tipo</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Mensagem</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Status</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.map((alert: any) => (
                  <tr key={alert.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatDateTime(alert.created_at)}</td>
                    <th scope="row" className="p-4 font-semibold text-foreground">{alert.title}</th>
                    <td className="whitespace-nowrap p-4 text-sm font-medium text-foreground">{formatCivilDate(alert.due_date)}</td>
                    <td className="p-4 text-sm text-muted-foreground">{alert.alert_type || 'Geral'}</td>
                    <td className="max-w-sm p-4 text-sm text-muted-foreground">{alert.message || alert.description || '—'}</td>
                    <td className="p-4"><StatusBadge status={alert.status || 'pending'} /></td>
                    <td className="p-4 text-right">
                      <ConfirmDeleteButton label={`Excluir alerta ${alert.title}`} onConfirm={() => handleDelete(alert.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <Modal title="Novo alerta" description="Registre uma situação que precisa de acompanhamento." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="alert-title" label="Título" required>
              <input id="alert-title" name="title" required autoFocus className={fieldClassName} placeholder="Ex.: Estoque de vacina abaixo do mínimo" />
            </FormField>
            <FormField htmlFor="alert-type" label="Tipo" required>
              <select id="alert-type" name="type" required className={fieldClassName} defaultValue="">
                <option value="" disabled>Selecione um tipo</option>
                <option value="Estoque">Estoque</option>
                <option value="Gado">Gado</option>
                <option value="Sanidade">Sanidade</option>
                <option value="Reprodução">Reprodução</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Prazo">Prazo</option>
                <option value="Outro">Outro</option>
              </select>
            </FormField>
            <FormField htmlFor="alert-message" label="Mensagem" required>
              <textarea id="alert-message" name="message" rows={4} required className={`${fieldClassName} resize-y`} placeholder="Descreva o que precisa ser acompanhado." />
            </FormField>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar alerta'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
