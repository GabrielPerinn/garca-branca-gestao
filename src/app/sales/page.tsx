import { createAdminClient } from "@/lib/supabase/server";
import { SalesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const supabase = await createAdminClient();
  // cattle_sales usa negotiation_date, não sale_date
  const { data: sales, error } = await supabase.from('cattle_sales').select('*').neq('status', 'deleted').order('negotiation_date', { ascending: false });
  return <SalesClientPage sales={sales || []} dbError={error?.message} />;
}
