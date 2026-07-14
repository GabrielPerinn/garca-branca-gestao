'use client'

import { useState } from "react";
import { createExpense, createRevenue, deleteExpense, deleteRevenue } from "./actions";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { DollarSign, TrendingDown, TrendingUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineFeedback } from "@/components/ui/InlineFeedback";

export function FinanceClientPage({ expenses, revenues, totals, expError, revError }: any) {
  const [activeTab, setActiveTab] = useState<'expenses' | 'revenues'>('expenses');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const router = useRouter();

  const totalExpenses = Number(totals?.expenses ?? expenses.reduce((a: number, e: any) => a + Number(e.amount || 0), 0));
  const totalRevenues = Number(totals?.revenues ?? revenues.reduce((a: number, r: any) => a + Number(r.amount || 0), 0));
  const totalExpenseCount = Number(totals?.expenseCount ?? expenses.length);
  const totalRevenueCount = Number(totals?.revenueCount ?? revenues.length);
  const balance = totalRevenues - totalExpenses;

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreateExpense(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createExpense(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Despesa registrada com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a despesa.');
    }
    finally { setLoading(false); }
  }

  async function handleCreateRevenue(fd: FormData) {
    setLoading(true);
    setFormError(null);
    try {
      await createRevenue(fd);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Receita registrada com sucesso.' });
      router.refresh();
    }
    catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a receita.');
    }
    finally { setLoading(false); }
  }

  async function handleDeleteExpense(id: string) {
    try {
      await deleteExpense(id);
      setFeedback({ kind: 'success', message: 'Despesa excluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir a despesa.' });
    }
  }

  async function handleDeleteRevenue(id: string) {
    try {
      await deleteRevenue(id);
      setFeedback({ kind: 'success', message: 'Receita excluída.' });
      router.refresh();
    }
    catch (caught) {
      setFeedback({ kind: 'error', message: caught instanceof Error ? caught.message : 'Não foi possível excluir a receita.' });
    }
  }

  return (
    <div className="app-page">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground">Financeiro</h1>
          <p className="text-muted-foreground mt-1">Controle de receitas e despesas</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="app-button-primary"
        >
          <Plus className="h-4 w-4" /> Novo Lançamento
        </button>
      </div>

      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-red-700" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Despesas</span>
          </div>
          <p className="text-2xl font-bold text-foreground">R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-700" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Receitas</span>
          </div>
          <p className="text-2xl font-bold text-foreground">R$ {totalRevenues.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className={`bg-card rounded-2xl border p-5 shadow-sm ${balance >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${balance >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <DollarSign className={`h-5 w-5 ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`} />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Saldo Total</span>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        <button
          type="button"
          aria-pressed={activeTab === 'expenses'}
          onClick={() => setActiveTab('expenses')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'expenses' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Despesas ({totalExpenseCount})
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'revenues'}
          onClick={() => setActiveTab('revenues')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'revenues' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Receitas ({totalRevenueCount})
        </button>
      </div>

      {(expError || revError) && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{expError || revError}</div>
      )}

      <div className="app-panel overflow-hidden">
        {activeTab === 'expenses' && (
          expenses.length === 0 ? (
            <EmptyState
              icon={<TrendingDown className="h-12 w-12" />}
              title="Nenhuma despesa registrada"
              description="Registre as despesas da fazenda."
              action={<button type="button" onClick={openModal} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Adicionar Despesa</button>}
            />
          ) : (
            <div className="divide-y divide-border">
              {expenses.map((e: any) => (
                <div key={e.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{e.description || 'Sem descrição'}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{e.category || 'Geral'} · {e.expense_date ? new Date(e.expense_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
                    <p className="font-bold text-red-700">− R$ {Number(e.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <ConfirmDeleteButton onConfirm={() => handleDeleteExpense(e.id)} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'revenues' && (
          revenues.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-12 w-12" />}
              title="Nenhuma receita registrada"
              description="Registre as entradas financeiras da fazenda."
              action={<button type="button" onClick={openModal} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:bg-primary/90"><Plus className="h-4 w-4" /> Adicionar Receita</button>}
            />
          ) : (
            <div className="divide-y divide-border">
              {revenues.map((r: any) => (
                <div key={r.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.description || 'Sem descrição'}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{r.category || 'Geral'} · {r.revenue_date ? new Date(r.revenue_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
                    <p className="font-bold text-emerald-700">+ R$ {Number(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <ConfirmDeleteButton onConfirm={() => handleDeleteRevenue(r.id)} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {showModal && (
        <Modal title="Novo Lançamento Financeiro" onClose={() => setShowModal(false)}>
          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6">
            <button type="button" aria-pressed={activeTab === 'expenses'} onClick={() => { setFormError(null); setActiveTab('expenses'); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'expenses' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>Despesa</button>
            <button type="button" aria-pressed={activeTab === 'revenues'} onClick={() => { setFormError(null); setActiveTab('revenues'); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'revenues' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>Receita</button>
          </div>
          <InlineFeedback kind="error" message={formError} className="mb-4" />

          {activeTab === 'expenses' ? (
            <form action={handleCreateExpense} className="space-y-4">
              <div>
                <label htmlFor="expense-description" className="block text-sm font-medium text-foreground mb-1.5">Descrição *</label>
                <input id="expense-description" name="description" placeholder="Compra de ração, combustível..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="expense-amount" className="block text-sm font-medium text-foreground mb-1.5">Valor (R$) *</label>
                  <input id="expense-amount" name="amount" type="number" step="0.01" placeholder="0.00" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label htmlFor="expense-date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
                  <input id="expense-date" name="date" type="date" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label htmlFor="expense-category" className="block text-sm font-medium text-foreground mb-1.5">Categoria</label>
                <select id="expense-category" name="category" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Selecione...</option>
                  <option value="Alimentação Animal">Alimentação Animal</option>
                  <option value="Veterinário">Veterinário</option>
                  <option value="Combustível">Combustível</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Folha de Pagamento">Folha de Pagamento</option>
                  <option value="Insumos">Insumos</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {loading ? 'Salvando...' : 'Salvar Despesa'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors">Cancelar</button>
              </div>
            </form>
          ) : (
            <form action={handleCreateRevenue} className="space-y-4">
              <div>
                <label htmlFor="revenue-description" className="block text-sm font-medium text-foreground mb-1.5">Descrição *</label>
                <input id="revenue-description" name="description" placeholder="Venda de bezerros, leite..." required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="revenue-amount" className="block text-sm font-medium text-foreground mb-1.5">Valor (R$) *</label>
                  <input id="revenue-amount" name="amount" type="number" step="0.01" placeholder="0.00" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label htmlFor="revenue-date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
                  <input id="revenue-date" name="date" type="date" required className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label htmlFor="revenue-category" className="block text-sm font-medium text-foreground mb-1.5">Categoria</label>
                <select id="revenue-category" name="category" className="w-full min-h-10 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Selecione...</option>
                  <option value="Venda de Gado">Venda de Gado</option>
                  <option value="Arrendamento">Arrendamento</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {loading ? 'Salvando...' : 'Salvar Receita'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors">Cancelar</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
