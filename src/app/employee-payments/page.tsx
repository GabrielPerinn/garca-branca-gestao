import { createAdminClient } from "@/lib/supabase/server";
import { EmployeePaymentsClient } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function EmployeePaymentsPage() {
  const supabase = await createAdminClient();
  const { data: payments, error } = await supabase.from('employee_payments').select('*').neq('status', 'deleted').order('payment_date', { ascending: false });
  return <EmployeePaymentsClient payments={payments || []} dbError={error?.message} />;
}
