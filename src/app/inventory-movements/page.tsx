import { createAdminClient } from "@/lib/supabase/server";
import { MovementsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function MovementsPage() {
  const supabase = await createAdminClient();
  const { data: movements, error } = await supabase.from('inventory_movements').select('*').neq('status', 'deleted').order('movement_date', { ascending: false });
  return <MovementsClientPage movements={movements || []} dbError={error?.message} />;
}
