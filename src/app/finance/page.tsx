import { createAdminClient } from "@/lib/supabase/server";
import { FinanceClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const supabase = await createAdminClient();
  const { data: expenses, error: expError } = await supabase.from('expenses').select('*').neq('status', 'deleted').order('expense_date', { ascending: false }).limit(50);
  const { data: revenues, error: revError } = await supabase.from('revenues').select('*').neq('status', 'deleted').order('revenue_date', { ascending: false }).limit(50);

  return <FinanceClientPage expenses={expenses || []} revenues={revenues || []} expError={expError?.message} revError={revError?.message} />;
}
