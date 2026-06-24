import { createAdminClient } from "@/lib/supabase/server";
import { CattleClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function CattlePage() {
  const supabase = await createAdminClient();
  const { data: lots, error } = await supabase.from('cattle_lots').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <CattleClientPage lots={lots || []} dbError={error?.message} />;
}
