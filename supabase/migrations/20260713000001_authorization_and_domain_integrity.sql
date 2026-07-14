-- Central authorization metadata, attributable audit events and database-level
-- business invariants. Constraints are NOT VALID so legacy installations can
-- migrate without downtime; PostgreSQL still enforces them for every new row.

BEGIN;

UPDATE public.users_profiles
SET role = 'viewer'
WHERE role IS NULL
   OR lower(btrim(role)) NOT IN ('owner', 'admin', 'manager', 'operator', 'viewer', 'user');

ALTER TABLE public.users_profiles
  ALTER COLUMN role SET DEFAULT 'viewer',
  ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_profiles_role_valid') THEN
    ALTER TABLE public.users_profiles
      ADD CONSTRAINT users_profiles_role_valid
      CHECK (lower(btrim(role)) IN ('owner', 'admin', 'manager', 'operator', 'viewer', 'user')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cattle_lots_quantity_nonnegative') THEN
    ALTER TABLE public.cattle_lots
      ADD CONSTRAINT cattle_lots_quantity_nonnegative
      CHECK (current_quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cattle_sales_quantity_positive') THEN
    ALTER TABLE public.cattle_sales
      ADD CONSTRAINT cattle_sales_quantity_positive
      CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cattle_sales_amount_positive') THEN
    ALTER TABLE public.cattle_sales
      ADD CONSTRAINT cattle_sales_amount_positive
      CHECK (gross_amount IS NULL OR gross_amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_positive') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenues_amount_positive') THEN
    ALTER TABLE public.revenues
      ADD CONSTRAINT revenues_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_payments_amount_positive') THEN
    ALTER TABLE public.employee_payments
      ADD CONSTRAINT employee_payments_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_salary_nonnegative') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_salary_nonnegative
      CHECK (salary_amount IS NULL OR salary_amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_day_valid') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_payment_day_valid
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pastures_capacity_nonnegative') THEN
    ALTER TABLE public.pastures
      ADD CONSTRAINT pastures_capacity_nonnegative
      CHECK (approximate_capacity IS NULL OR approximate_capacity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighings_weight_positive') THEN
    ALTER TABLE public.weighings
      ADD CONSTRAINT weighings_weight_positive
      CHECK (average_weight IS NULL OR average_weight > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_cost_nonnegative') THEN
    ALTER TABLE public.maintenance_records
      ADD CONSTRAINT maintenance_cost_nonnegative
      CHECK (cost_amount IS NULL OR cost_amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gravel_volume_positive') THEN
    ALTER TABLE public.gravel_operations
      ADD CONSTRAINT gravel_volume_positive
      CHECK (estimated_volume IS NULL OR estimated_volume > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppression_area_positive') THEN
    ALTER TABLE public.suppression_operations
      ADD CONSTRAINT suppression_area_positive
      CHECK (approximate_area IS NULL OR approximate_area > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_valid') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_priority_valid
      CHECK (priority IN ('low', 'medium', 'high')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_valid') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_status_valid
      CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'deleted')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_actions_confidence_valid') THEN
    ALTER TABLE public.pending_actions
      ADD CONSTRAINT pending_actions_confidence_valid
      CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%I ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      v_table,
      v_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
  v_record_id UUID;
  v_changed_by UUID;
  v_actor_header TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'Operação de auditoria não suportada: %', TG_OP;
  END IF;

  v_actor_header := NULLIF(current_setting('request.headers', true), '')::jsonb->>'x-actor-profile-id';
  IF v_actor_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT profile.id INTO v_changed_by
    FROM public.users_profiles AS profile
    WHERE profile.id = v_actor_header::UUID AND profile.is_active = true
    LIMIT 1;
  END IF;

  IF v_changed_by IS NULL THEN
    SELECT profile.id INTO v_changed_by
    FROM public.users_profiles AS profile
    WHERE profile.user_id = auth.uid()
    LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, before_data_json, after_data_json, changed_by
  ) VALUES (
    TG_TABLE_NAME, v_record_id, v_action, v_before, v_after, v_changed_by
  );

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.users_profiles.role IS
  'owner/admin: acesso total; manager: gestão sem configurações; operator: operação; viewer: consulta.';
COMMENT ON FUNCTION public.set_updated_at() IS
  'Mantém updated_at confiável para qualquer origem de escrita, inclusive integrações.';

COMMIT;
