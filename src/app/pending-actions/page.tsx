import { createClient } from "@/lib/supabase/server";
import { PendingActionsClient } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function PendingActionsPage() {
  const supabase = await createClient();
  const { data: actions, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('confirmation_status', 'pending')
    .order('created_at', { ascending: false });

  return <PendingActionsClient actions={actions || []} dbError={error?.message} />
}
