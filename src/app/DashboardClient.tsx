'use client'

import { Tractor, DollarSign, Activity, AlertTriangle, CheckSquare, Bell, ArrowRightLeft } from "lucide-react";
import Link from "next/link";

export function DashboardClient({ 
  monthExpenses, 
  monthRevenues, 
  totalHeads, 
  monthSales, 
  pendingActionsCount, 
  pendingTasksCount, 
  activeAlerts, 
  lowStockItems 
}: any) {
  
  const netIncome = monthRevenues - monthExpenses;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between pb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Total de Cabeças</h3>
            <Tractor className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalHeads}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between pb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Saldo do Mês (Receitas - Despesas)</h3>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className={`text-2xl font-bold ${netIncome >= 0 ? 'text-primary' : 'text-destructive'}`}>
              R$ {netIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex flex-row items-center justify-between pb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Vendas do Mês</h3>
            <ArrowRightLeft className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-primary">R$ {monthSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <Link href="/pending-actions" className="block">
          <div className={`bg-card rounded-xl border p-6 shadow-sm hover:border-primary transition-colors cursor-pointer ${pendingActionsCount > 0 ? 'border-amber-500' : 'border-border'}`}>
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Decisões Pendentes (IA)</h3>
              <Bell className={`h-4 w-4 ${pendingActionsCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{pendingActionsCount}</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Alertas e Pendências */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 pb-2">
            <h3 className="flex items-center gap-2 text-xl font-semibold leading-none tracking-tight"><AlertTriangle className="h-5 w-5 text-amber-500" /> Avisos e Alertas Ativos</h3>
          </div>
          <div className="p-6 pt-0 space-y-4 mt-4">
            {lowStockItems.map((item: any) => (
              <div key={item.id} className="flex justify-between items-center p-3 rounded-lg border border-border bg-destructive/5 text-destructive">
                <span>Estoque baixo: <strong>{item.name}</strong></span>
                <span>{item.current_quantity} / min {item.minimum_quantity}</span>
              </div>
            ))}
            {activeAlerts.map((alert: any) => (
              <div key={alert.id} className="flex justify-between items-center p-3 rounded-lg border border-border bg-destructive/5 text-destructive">
                <span>Alerta ({alert.alert_type}): <strong>{alert.title}</strong></span>
              </div>
            ))}
            {lowStockItems.length === 0 && activeAlerts.length === 0 && (
              <p className="text-muted-foreground">Nenhum alerta ativo.</p>
            )}
          </div>
        </div>

        <Link href="/tasks" className="block h-full">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm hover:border-primary transition-colors h-full flex flex-col">
            <div className="pb-2">
              <h3 className="flex items-center gap-2 text-xl font-semibold leading-none tracking-tight"><CheckSquare className="h-5 w-5 text-primary" /> Tarefas Pendentes</h3>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-center h-24 mt-4">
                <div className="text-4xl font-bold">{pendingTasksCount}</div>
                <div className="ml-4 text-muted-foreground">tarefas aguardando execução</div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
