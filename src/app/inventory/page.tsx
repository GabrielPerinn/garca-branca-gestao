import { createAdminClient } from "@/lib/supabase/server";
import { InventoryClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const supabase = await createAdminClient();
  const { data: items, error } = await supabase.from('inventory_items').select('*').neq('status', 'deleted').order('name', { ascending: true });
  return <InventoryClientPage items={items || []} dbError={error?.message} />;
}
