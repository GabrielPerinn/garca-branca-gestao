-- Preserve trustworthy audit records and keep profile authorization data from
-- being changed through the public authenticated API.

BEGIN;

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

  -- auth.uid() references auth.users, while audit_logs.changed_by references
  -- users_profiles. Resolve the canonical profile id before writing the log.
  SELECT profile.id
  INTO v_changed_by
  FROM public.users_profiles AS profile
  WHERE profile.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    before_data_json,
    after_data_json,
    changed_by
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_action,
    v_before,
    v_after,
    v_changed_by
  );

  RETURN NEW;
END;
$$;

-- Authenticated clients may inspect the audit trail, but only trusted server
-- code and the security-definer trigger may mutate it.
DROP POLICY IF EXISTS "Allow full access for authenticated users on audit_logs"
  ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can read audit logs"
  ON public.audit_logs;
CREATE POLICY "Authenticated users can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- Profiles contain the active flag and phone number used to authorize the
-- WhatsApp webhook. Users can read the family directory and edit only their
-- own profile; provisioning remains a service-role operation.
DROP POLICY IF EXISTS "Allow full access for authenticated users on users_profiles"
  ON public.users_profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles"
  ON public.users_profiles;
DROP POLICY IF EXISTS "Authenticated users can update their profile"
  ON public.users_profiles;

CREATE POLICY "Authenticated users can read profiles"
  ON public.users_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update their profile"
  ON public.users_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.users_profiles FROM authenticated;
GRANT UPDATE (full_name, phone_number) ON public.users_profiles TO authenticated;

COMMIT;
