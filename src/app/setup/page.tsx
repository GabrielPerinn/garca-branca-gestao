import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SetupClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const supabase = await createAdminClient();
  
  // Se já tem fazenda, não precisa de setup
  const { data: farms } = await supabase.from('farms').select('id').neq('status', 'deleted').limit(1);
  if (farms && farms.length > 0) {
    redirect('/');
  }

  return <SetupClientPage />;
}
