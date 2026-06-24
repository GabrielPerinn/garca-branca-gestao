import { createAdminClient } from "@/lib/supabase/server";
import { MaintenanceClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
  const supabase = await createAdminClient();
  const { data: records, error } = await supabase.from('maintenance_records').select('*').neq('status', 'deleted').order('maintenance_date', { ascending: false });
  return <MaintenanceClientPage records={records || []} dbError={error?.message} />;
}
