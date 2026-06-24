import { createAdminClient } from "@/lib/supabase/server";
import { TasksClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const supabase = await createAdminClient();
  const { data: tasks, error } = await supabase.from('tasks').select('*').neq('status', 'deleted').order('due_date', { ascending: true });
  return <TasksClientPage tasks={tasks || []} dbError={error?.message} />;
}
