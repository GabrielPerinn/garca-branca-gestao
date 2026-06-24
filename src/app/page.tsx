import { createAdminClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = await createAdminClient();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // 1. Despesas e Receitas
  const { data: expenses } = await supabase.from('expenses').select('amount, expense_date').neq('status', 'deleted');
  const { data: revenues } = await supabase.from('revenues').select('amount, revenue_date').neq('status', 'deleted');

  let monthExpenses = 0;
  let monthRevenues = 0;

  if (expenses) {
    expenses.forEach(e => {
      const d = new Date(e.expense_date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        monthExpenses += Number(e.amount);
      }
    });
  }

  if (revenues) {
    revenues.forEach(r => {
      const d = new Date(r.revenue_date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        monthRevenues += Number(r.amount);
      }
    });
  }

  // 2. Gado
  const { data: cattle } = await supabase.from('cattle_lots').select('current_quantity').neq('status', 'deleted');
  let totalHeads = 0;
  if (cattle) {
    cattle.forEach(c => {
      totalHeads += Number(c.current_quantity || 0);
    });
  }

  // 3. Vendas do mês
  const { data: sales } = await supabase.from('cattle_sales').select('gross_amount, negotiation_date').neq('status', 'deleted');
  let monthSales = 0;
  if (sales) {
    sales.forEach(s => {
      const d = new Date(s.negotiation_date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        monthSales += Number(s.gross_amount || 0);
      }
    });
  }

  // 4. Pending Actions
  const { count: pendingActionsCount } = await supabase.from('pending_actions').select('*', { count: 'exact', head: true }).eq('confirmation_status', 'pending');

  // 5. Tarefas Pendentes
  const { count: pendingTasksCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending');

  // 6. Alertas e Estoque Baixo
  const { data: alerts } = await supabase.from('alerts').select('*').neq('status', 'deleted');
  const { data: inventory } = await supabase.from('inventory_items').select('*').neq('status', 'deleted');
  const lowStockItems = inventory ? inventory.filter(i => i.minimum_quantity !== null && Number(i.current_quantity) <= Number(i.minimum_quantity)) : [];

  return (
    <DashboardClient 
      monthExpenses={monthExpenses}
      monthRevenues={monthRevenues}
      totalHeads={totalHeads}
      monthSales={monthSales}
      pendingActionsCount={pendingActionsCount || 0}
      pendingTasksCount={pendingTasksCount || 0}
      activeAlerts={alerts || []}
      lowStockItems={lowStockItems}
    />
  )
}
