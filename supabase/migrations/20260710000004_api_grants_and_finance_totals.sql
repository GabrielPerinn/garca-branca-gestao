-- Supabase projects created with the current API defaults do not auto-expose
-- newly created public objects. Grant only the access used by this application.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_finance_totals()
RETURNS TABLE (
  total_expenses NUMERIC,
  total_revenues NUMERIC,
  expense_count BIGINT,
  revenue_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((
      SELECT SUM(expense.amount)
      FROM public.expenses AS expense
      WHERE COALESCE(expense.status, 'active') <> 'deleted'
    ), 0),
    COALESCE((
      SELECT SUM(revenue.amount)
      FROM public.revenues AS revenue
      WHERE COALESCE(revenue.status, 'active') <> 'deleted'
    ), 0),
    (
      SELECT COUNT(*)
      FROM public.expenses AS expense
      WHERE COALESCE(expense.status, 'active') <> 'deleted'
    ),
    (
      SELECT COUNT(*)
      FROM public.revenues AS revenue
      WHERE COALESCE(revenue.status, 'active') <> 'deleted'
    );
$$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Fail closed for browser roles. The UI reads operational data through
-- authenticated Server Components/Actions backed by the service role.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.users_profiles, public.pending_actions TO authenticated;
GRANT UPDATE (full_name, phone_number) ON public.users_profiles TO authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMENT ON FUNCTION public.get_finance_totals()
  IS 'Retorna totais e contagens financeiros completos, sem depender do limite da listagem.';

COMMIT;
