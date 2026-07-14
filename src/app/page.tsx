import { createAdminClient } from '@/lib/supabase/server';
import { requireUserContext } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/permissions';
import { APP_TIME_ZONE, getCivilDate } from '@/lib/date';
import { DashboardClient, type DashboardData, type MonthlyPoint } from './DashboardClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Visão geral',
};

type AmountRow = { amount: number | string | null; date: string };

function monthStart(date: string, offset: number): string {
  const [year, month] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return shifted.toISOString().slice(0, 10);
}

function sumAmounts(rows: AmountRow[], from: string, until: string): number {
  return rows.reduce((total, row) => {
    if (row.date < from || row.date >= until) return total;
    return total + Number(row.amount || 0);
  }, 0);
}

function buildMonthlySeries(
  expenses: AmountRow[],
  revenues: AmountRow[],
  today: string,
): MonthlyPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    const start = monthStart(today, offset);
    const end = monthStart(today, offset + 1);
    const [year, month] = start.split('-').map(Number);
    const label = new Intl.DateTimeFormat('pt-BR', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '');
    const receita = sumAmounts(revenues, start, end);
    const despesa = sumAmounts(expenses, start, end);

    return {
      month: label.charAt(0).toUpperCase() + label.slice(1),
      receita,
      despesa,
      saldo: receita - despesa,
    };
  });
}

export default async function Dashboard() {
  const { profile } = await requireUserContext();
  const supabase = await createAdminClient();
  const today = getCivilDate();
  const currentMonthStart = monthStart(today, 0);
  const nextMonthStart = monthStart(today, 1);
  const previousMonthStart = monthStart(today, -1);
  const chartStart = monthStart(today, -5);

  const [
    expensesResult,
    revenuesResult,
    cattleResult,
    salesResult,
    pendingActionsResult,
    tasksResult,
    overdueTasksResult,
    alertsResult,
    inventoryResult,
    farmResult,
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, expense_date')
      .neq('status', 'deleted')
      .gte('expense_date', chartStart)
      .lt('expense_date', nextMonthStart),
    supabase
      .from('revenues')
      .select('amount, revenue_date')
      .neq('status', 'deleted')
      .gte('revenue_date', chartStart)
      .lt('revenue_date', nextMonthStart),
    supabase.from('cattle_lots').select('current_quantity').neq('status', 'deleted'),
    supabase
      .from('cattle_sales')
      .select('gross_amount, negotiation_date')
      .neq('status', 'deleted')
      .gte('negotiation_date', currentMonthStart)
      .lt('negotiation_date', nextMonthStart),
    supabase
      .from('pending_actions')
      .select('*', { count: 'exact', head: true })
      .eq('confirmation_status', 'pending'),
    supabase
      .from('tasks')
      .select('id, title, due_date, priority, status', { count: 'exact' })
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('due_date', today),
    supabase
      .from('alerts')
      .select('id, title, alert_type, message, due_date, status', { count: 'exact' })
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('inventory_items')
      .select('id, name, unit, current_quantity, minimum_quantity')
      .neq('status', 'deleted'),
    supabase
      .from('farms')
      .select('name, location_description, setup_completed_at')
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const queryErrors = [
    expensesResult.error,
    revenuesResult.error,
    cattleResult.error,
    salesResult.error,
    pendingActionsResult.error,
    tasksResult.error,
    overdueTasksResult.error,
    alertsResult.error,
    inventoryResult.error,
    farmResult.error,
  ].filter(Boolean);

  const expenses = (expensesResult.data || []).map((row) => ({
    amount: row.amount,
    date: row.expense_date,
  }));
  const revenues = (revenuesResult.data || []).map((row) => ({
    amount: row.amount,
    date: row.revenue_date,
  }));

  const currentExpenses = sumAmounts(expenses, currentMonthStart, nextMonthStart);
  const currentRevenues = sumAmounts(revenues, currentMonthStart, nextMonthStart);
  const previousExpenses = sumAmounts(expenses, previousMonthStart, currentMonthStart);
  const previousRevenues = sumAmounts(revenues, previousMonthStart, currentMonthStart);

  const inventory = inventoryResult.data || [];
  const lowStockItems = inventory
    .filter((item) => (
      item.minimum_quantity !== null &&
      Number(item.current_quantity) <= Number(item.minimum_quantity)
    ))
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      currentQuantity: Number(item.current_quantity || 0),
      minimumQuantity: Number(item.minimum_quantity || 0),
    }));

  const tasks = (tasksResult.data || []).map((task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    priority: task.priority || 'medium',
    overdue: Boolean(task.due_date && task.due_date < today),
  }));

  const data: DashboardData = {
    farmName: farmResult.data?.name || 'Garça Branca',
    farmLocation: farmResult.data?.location_description || null,
    foundationComplete: Boolean(farmResult.data?.setup_completed_at),
    canManageFoundation: hasPermission(profile.role, 'settings.write'),
    referenceDate: new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeZone: APP_TIME_ZONE,
    }).format(new Date()),
    monthExpenses: currentExpenses,
    monthRevenues: currentRevenues,
    previousMonthExpenses: previousExpenses,
    previousMonthRevenues: previousRevenues,
    totalHeads: (cattleResult.data || []).reduce(
      (total, lot) => total + Number(lot.current_quantity || 0),
      0,
    ),
    monthSales: (salesResult.data || []).reduce(
      (total, sale) => total + Number(sale.gross_amount || 0),
      0,
    ),
    pendingActionsCount: pendingActionsResult.count || 0,
    pendingTasksCount: tasksResult.count || 0,
    overdueTasksCount: overdueTasksResult.count || 0,
    tasks,
    activeAlerts: (alertsResult.data || []).map((alert) => ({
      id: alert.id,
      title: alert.title,
      type: alert.alert_type,
      message: alert.message,
      dueDate: alert.due_date,
      status: alert.status,
    })),
    activeAlertsCount: alertsResult.count || 0,
    lowStockItems,
    monthlySeries: buildMonthlySeries(expenses, revenues, today),
    hasDataError: queryErrors.length > 0,
  };

  return <DashboardClient data={data} />;
}
