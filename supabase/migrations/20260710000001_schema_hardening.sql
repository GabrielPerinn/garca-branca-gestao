-- Schema hardening for list views, dashboard queries and soft deletion.
-- Every statement is safe to run more than once.

BEGIN;

-- The initial weighings table predates the soft-delete convention used by the
-- application. Add and normalize the column without introducing an alternate
-- table shape.
ALTER TABLE public.weighings
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

UPDATE public.weighings
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE public.weighings
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

-- Query-aligned indexes for the most frequent ordered lists and dashboard
-- filters. The partial indexes keep soft-deleted rows out of active datasets.
CREATE INDEX IF NOT EXISTS idx_farms_active_created_at
  ON public.farms (created_at DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_cattle_lots_active_created_at
  ON public.cattle_lots (created_at DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_expenses_active_expense_date
  ON public.expenses (expense_date DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_revenues_active_revenue_date
  ON public.revenues (revenue_date DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_cattle_sales_active_negotiation_date
  ON public.cattle_sales (negotiation_date DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date
  ON public.tasks (status, due_date);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status_created_at
  ON public.pending_actions (confirmation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occurrences_status_created_at
  ON public.occurrences (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incoming_messages_processing_created_at
  ON public.incoming_messages (processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_weighings_active_weighing_date
  ON public.weighings (weighing_date DESC)
  WHERE status <> 'deleted';

COMMIT;
