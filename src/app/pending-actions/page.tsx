import { createAdminClient } from "@/lib/supabase/server";
import { PendingActionsClient } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function PendingActionsPage() {
  const supabase = await createAdminClient();
  const [pendingResult, historyResult] = await Promise.all([
    supabase
      .from('pending_actions')
      .select('*')
      .eq('confirmation_status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('pending_actions')
      .select('*')
      .neq('confirmation_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const actions = [...(pendingResult.data || []), ...(historyResult.data || [])];
  const error = pendingResult.error || historyResult.error;

  return <PendingActionsClient actions={actions} dbError={error?.message} />
}
