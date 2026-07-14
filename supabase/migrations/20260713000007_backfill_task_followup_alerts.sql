BEGIN;

INSERT INTO public.alerts (
  alert_type, title, message, due_date, related_table, related_id, recipient_user_id, status
)
SELECT
  'task_followup',
  'Acompanhar tarefa: ' || task.title,
  'No prazo, confirme se a tarefa foi concluída. A Garça Branca pode atualizar o sistema pela conversa.',
  task.due_date,
  'tasks',
  task.id,
  task.assigned_to_user_id,
  'pending'
FROM public.tasks AS task
WHERE task.status IN ('pending', 'in_progress')
  AND task.due_date IS NOT NULL
ON CONFLICT (related_table, related_id)
  WHERE related_table = 'tasks' AND status <> 'deleted'
DO UPDATE SET
  title = EXCLUDED.title,
  message = EXCLUDED.message,
  due_date = EXCLUDED.due_date,
  recipient_user_id = EXCLUDED.recipient_user_id,
  status = 'pending',
  updated_at = clock_timestamp();

COMMIT;
