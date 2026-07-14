import { createAdminClient } from "@/lib/supabase/server";
import { SalesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const supabase = await createAdminClient();
  const [salesResult, lotsResult] = await Promise.all([
    supabase.from('cattle_sales').select('*').neq('status', 'deleted').order('negotiation_date', { ascending: false }),
    supabase.from('cattle_lots').select('id, name, current_quantity').eq('status', 'active').order('name', { ascending: true }),
  ]);

  return (
    <SalesClientPage
      sales={salesResult.data || []}
      lots={lotsResult.data || []}
      dbError={salesResult.error?.message || lotsResult.error?.message}
    />
  );
}
