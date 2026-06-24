import { createAdminClient } from "@/lib/supabase/server";
import { SuppressionClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function SuppressionPage() {
  const supabase = await createAdminClient();
  const { data: records, error } = await supabase.from('suppression_operations').select('*').neq('status', 'deleted').order('operation_date', { ascending: false });
  return <SuppressionClientPage records={records || []} dbError={error?.message} />;
}
