import { createAdminClient } from "@/lib/supabase/server";
import { WeighingsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function WeighingsPage() {
  const supabase = await createAdminClient();
  const { data: weighings, error } = await supabase.from('weighings').select('*').order('weighing_date', { ascending: false });
  return <WeighingsClientPage weighings={weighings || []} dbError={error?.message} />;
}
