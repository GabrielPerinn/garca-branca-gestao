import { createAdminClient } from "@/lib/supabase/server";
import { AlertsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const supabase = await createAdminClient();
  const { data: alerts, error } = await supabase.from('alerts').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <AlertsClientPage alerts={alerts || []} dbError={error?.message} />;
}
