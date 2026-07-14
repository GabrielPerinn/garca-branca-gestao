import { createAdminClient } from "@/lib/supabase/server";
import { PasturesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function PasturesPage() {
  const supabase = await createAdminClient();
  const [pastures, properties] = await Promise.all([
    supabase.from('pastures').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
    supabase.from('land_parcels').select('id, name').neq('status', 'deleted').order('name'),
  ])
  return <PasturesClientPage pastures={pastures.data || []} properties={properties.data || []} dbError={pastures.error?.message || properties.error?.message} />;
}
