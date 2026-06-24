import { createAdminClient } from "@/lib/supabase/server";
import { FarmsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function FarmsPage() {
  const supabase = await createAdminClient();
  const { data: farms, error } = await supabase.from('farms').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <FarmsClientPage farms={farms || []} dbError={error?.message} />;
}
