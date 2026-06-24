import { createAdminClient } from "@/lib/supabase/server";
import { GravelClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function GravelPage() {
  const supabase = await createAdminClient();
  const { data: records, error } = await supabase.from('gravel_operations').select('*').neq('status', 'deleted').order('operation_date', { ascending: false });
  return <GravelClientPage records={records || []} dbError={error?.message} />;
}
