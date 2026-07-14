import { createAdminClient } from "@/lib/supabase/server";
import { MovementsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function MovementsPage() {
  const supabase = await createAdminClient();
  const [movementsResult, itemsResult] = await Promise.all([
    supabase.from('inventory_movements').select('*').neq('status', 'deleted').order('movement_date', { ascending: false }),
    supabase.from('inventory_items').select('id, name, unit, current_quantity').neq('status', 'deleted').order('name'),
  ]);

  return (
    <MovementsClientPage
      movements={movementsResult.data || []}
      items={itemsResult.data || []}
      dbError={movementsResult.error?.message || itemsResult.error?.message}
    />
  );
}
