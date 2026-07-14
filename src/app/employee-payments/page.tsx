import { createAdminClient } from "@/lib/supabase/server";
import { EmployeePaymentsClient } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function EmployeePaymentsPage() {
  const supabase = await createAdminClient();
  const [paymentsResult, employeesResult] = await Promise.all([
    supabase.from('employee_payments').select('*').neq('status', 'deleted').order('payment_date', { ascending: false }),
    supabase.from('employees').select('id, full_name').eq('status', 'active').order('full_name', { ascending: true }),
  ]);

  return (
    <EmployeePaymentsClient
      payments={paymentsResult.data || []}
      employees={employeesResult.data || []}
      dbError={paymentsResult.error?.message || employeesResult.error?.message}
    />
  );
}
