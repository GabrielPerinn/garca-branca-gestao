import { createAdminClient } from "@/lib/supabase/server";
import { DocumentsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const supabase = await createAdminClient();
  const { data: documents, error } = await supabase.from('documents').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
  return <DocumentsClientPage documents={documents || []} dbError={error?.message} />;
}
