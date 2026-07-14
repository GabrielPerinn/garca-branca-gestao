import { createAdminClient } from "@/lib/supabase/server";
import { WeighingsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function WeighingsPage() {
  const supabase = await createAdminClient();
  const [weighingsResult, lotsResult] = await Promise.all([
    supabase.from('weighings').select('*').neq('status', 'deleted').order('weighing_date', { ascending: false }),
    supabase.from('cattle_lots').select('id, name, current_quantity').eq('status', 'active').order('name', { ascending: true }),
  ]);

  return (
    <WeighingsClientPage
      weighings={weighingsResult.data || []}
      lots={lotsResult.data || []}
      dbError={weighingsResult.error?.message || lotsResult.error?.message}
    />
  );
}
