import { createAdminClient } from "@/lib/supabase/server";
import { FinanceClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const supabase = await createAdminClient();
  const [expensesResult, revenuesResult, totalsResult] = await Promise.all([
    supabase.from('expenses').select('*').neq('status', 'deleted').order('expense_date', { ascending: false }).limit(50),
    supabase.from('revenues').select('*').neq('status', 'deleted').order('revenue_date', { ascending: false }).limit(50),
    supabase.rpc('get_finance_totals'),
  ]);

  const totalsRow = totalsResult.data?.[0];
  const totals = {
    expenses: Number(totalsRow?.total_expenses || 0),
    revenues: Number(totalsRow?.total_revenues || 0),
    expenseCount: Number(totalsRow?.expense_count || 0),
    revenueCount: Number(totalsRow?.revenue_count || 0),
  };

  return (
    <FinanceClientPage
      expenses={expensesResult.data || []}
      revenues={revenuesResult.data || []}
      totals={totals}
      expError={expensesResult.error?.message || totalsResult.error?.message}
      revError={revenuesResult.error?.message}
    />
  );
}
