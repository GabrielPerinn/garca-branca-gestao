import { createAdminClient } from "@/lib/supabase/server";
import { PasturesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function PasturesPage() {
  const supabase = await createAdminClient();
  const { data: pastures, error } = await supabase.from('pastures').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <PasturesClientPage pastures={pastures || []} dbError={error?.message} />;
}
