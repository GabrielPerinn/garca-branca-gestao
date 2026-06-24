import { createAdminClient } from "@/lib/supabase/server";
import { EmployeesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const supabase = await createAdminClient();
  const { data: employees, error } = await supabase.from('employees').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <EmployeesClientPage employees={employees || []} dbError={error?.message} />;
}
