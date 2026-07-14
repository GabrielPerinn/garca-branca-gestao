'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2, Plus } from 'lucide-react';
import { createPayment, deletePayment } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCivilDate, formatCurrency } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

const paymentTypeLabels: Record<string, string> = {
  salario: 'Salário',
  salário: 'Salário',
  adiantamento: 'Adiantamento',
  bonus: 'Bônus',
  bônus: 'Bônus',
  ferias: 'Férias',
  férias: 'Férias',
  rescisao: 'Rescisão',
  rescisão: 'Rescisão',
  outro: 'Outro',
};

function paymentTypeLabel(value: string | null | undefined) {
  if (!value) return 'Não informado';
  return paymentTypeLabels[value.toLowerCase()] || value;
}

export function EmployeePaymentsClient({ payments, employees = [], dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const employeeNames = new Map<string, string>(
    employees.map((employee: any) => [employee.id, employee.full_name]),
  );

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createPayment(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Pagamento registrado com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar o pagamento.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePayment(id);
      setFeedback({ kind: 'success', message: 'Pagamento excluído.' });
      router.refresh();
    } catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir o pagamento.' });
    }
  }

  const total = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const createButton = (
    <button type="button" onClick={openModal} disabled={employees.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Novo pagamento
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Pessoas & financeiro"
        title="Pagamentos de funcionários"
        description={`${payments.length} pagamento${payments.length === 1 ? '' : 's'} · ${formatCurrency(total)} no período carregado.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      {employees.length === 0 && (
        <InlineFeedback kind="info" message="Cadastre ao menos um funcionário ativo antes de registrar pagamentos." />
      )}
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="payments-list-title">
        <h2 id="payments-list-title" className="sr-only">Lista de pagamentos</h2>
        {payments.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-12 w-12" aria-hidden="true" />}
            title="Nenhum pagamento registrado"
            description="Registre salários, adiantamentos, bônus e outros pagamentos da equipe."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[900px] text-left">
              <caption className="sr-only">Pagamentos de funcionários registrados</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Data</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Funcionário</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Tipo</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Descrição</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Valor</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment: any) => {
                  const employeeName = payment.employee?.full_name || employeeNames.get(payment.employee_id) || 'Funcionário não encontrado';
                  return (
                    <tr key={payment.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatCivilDate(payment.payment_date)}</td>
                      <th scope="row" className="p-4 font-semibold text-foreground">{employeeName}</th>
                      <td className="p-4 text-sm text-muted-foreground">{paymentTypeLabel(payment.payment_type)}</td>
                      <td className="max-w-sm p-4 text-sm text-muted-foreground">{payment.description || '—'}</td>
                      <td className="whitespace-nowrap p-4 text-right font-bold text-foreground">{formatCurrency(payment.amount)}</td>
                      <td className="p-4 text-right">
                        <ConfirmDeleteButton label={`Excluir pagamento de ${employeeName} no valor de ${formatCurrency(payment.amount)}`} onConfirm={() => handleDelete(payment.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <Modal title="Novo pagamento" description="Registre um pagamento realizado para a equipe." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="payment-employee" label="Funcionário" required>
              <select id="payment-employee" name="employee_id" required defaultValue="" autoFocus className={fieldClassName}>
                <option value="" disabled>Selecione um funcionário</option>
                {employees.map((employee: any) => (
                  <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField htmlFor="payment-date" label="Data do pagamento" required>
                <input id="payment-date" name="date" type="date" required className={fieldClassName} />
              </FormField>
              <FormField htmlFor="payment-amount" label="Valor (R$)" required>
                <input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required className={fieldClassName} placeholder="0,00" />
              </FormField>
            </div>
            <FormField htmlFor="payment-type" label="Tipo de pagamento" required>
              <select id="payment-type" name="payment_type" required defaultValue="" className={fieldClassName}>
                <option value="" disabled>Selecione um tipo</option>
                <option value="salário">Salário</option>
                <option value="adiantamento">Adiantamento</option>
                <option value="bônus">Bônus</option>
                <option value="férias">Férias</option>
                <option value="rescisão">Rescisão</option>
                <option value="outro">Outro</option>
              </select>
            </FormField>
            <FormField htmlFor="payment-description" label="Descrição" required>
              <textarea id="payment-description" name="description" rows={3} required className={`${fieldClassName} resize-y`} placeholder="Ex.: Adiantamento referente ao mês atual" />
            </FormField>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar pagamento'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
