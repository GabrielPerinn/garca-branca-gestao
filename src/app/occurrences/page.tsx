import { createAdminClient } from "@/lib/supabase/server";
import { OccurrencesClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function OccurrencesPage() {
  const supabase = await createAdminClient();
  const { data: occurrences, error } = await supabase
    .from('occurrences')
    .select('*')
    .order('created_at', { ascending: false });

  return <OccurrencesClientPage occurrences={occurrences || []} dbError={error?.message} />;
}
