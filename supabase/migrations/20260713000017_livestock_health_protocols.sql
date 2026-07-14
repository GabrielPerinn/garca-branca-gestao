-- Collective livestock health and reproduction management. The operation does
-- not identify every animal individually: protocols apply to lots, categories,
-- properties or the whole operation and generate recurring actionable alerts.

BEGIN;

CREATE TABLE public.livestock_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE RESTRICT,
  land_parcel_id UUID REFERENCES public.land_parcels(id) ON DELETE RESTRICT,
  cattle_lot_id UUID REFERENCES public.cattle_lots(id) ON DELETE RESTRICT,
  responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  protocol_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  animal_category TEXT,
  product_name TEXT,
  dosage TEXT,
  withdrawal_days INTEGER,
  instructions TEXT,
  next_due_date DATE NOT NULL,
  recurrence_days INTEGER,
  alert_lead_days INTEGER NOT NULL DEFAULT 7,
  last_executed_at DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT livestock_protocol_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT livestock_protocol_type_valid CHECK (protocol_type IN ('sanitary', 'reproductive')),
  CONSTRAINT livestock_protocol_scope_valid CHECK (scope_type IN ('operation', 'property', 'lot', 'category')),
  CONSTRAINT livestock_protocol_scope_reference CHECK (
    (scope_type = 'operation' AND land_parcel_id IS NULL AND cattle_lot_id IS NULL AND animal_category IS NULL)
    OR (scope_type = 'property' AND land_parcel_id IS NOT NULL AND cattle_lot_id IS NULL)
    OR (scope_type = 'lot' AND cattle_lot_id IS NOT NULL)
    OR (scope_type = 'category' AND animal_category IS NOT NULL AND length(btrim(animal_category)) > 0)
  ),
  CONSTRAINT livestock_protocol_withdrawal_valid CHECK (withdrawal_days IS NULL OR withdrawal_days >= 0),
  CONSTRAINT livestock_protocol_recurrence_valid CHECK (recurrence_days IS NULL OR recurrence_days BETWEEN 1 AND 3650),
  CONSTRAINT livestock_protocol_lead_valid CHECK (alert_lead_days BETWEEN 0 AND 365),
  CONSTRAINT livestock_protocol_status_valid CHECK (status IN ('active', 'paused', 'completed', 'deleted'))
);

CREATE TABLE public.livestock_protocol_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE RESTRICT,
  protocol_id UUID NOT NULL REFERENCES public.livestock_protocols(id) ON DELETE RESTRICT,
  scheduled_due_date DATE NOT NULL,
  executed_on DATE NOT NULL,
  quantity_treated INTEGER,
  result_status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  next_due_date DATE,
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT livestock_execution_quantity_valid CHECK (quantity_treated IS NULL OR quantity_treated >= 0),
  CONSTRAINT livestock_execution_result_valid CHECK (result_status IN ('completed', 'partial', 'skipped'))
);

CREATE INDEX idx_livestock_protocols_due
  ON public.livestock_protocols (next_due_date, status)
  WHERE status = 'active';
CREATE INDEX idx_livestock_protocols_lot
  ON public.livestock_protocols (cattle_lot_id, status);
CREATE INDEX idx_livestock_protocols_property
  ON public.livestock_protocols (land_parcel_id, status);
CREATE INDEX idx_livestock_protocol_executions_history
  ON public.livestock_protocol_executions (protocol_id, executed_on DESC);
CREATE UNIQUE INDEX uq_livestock_protocol_active_alert
  ON public.alerts (related_table, related_id)
  WHERE related_table = 'livestock_protocols' AND status <> 'deleted';

CREATE OR REPLACE FUNCTION public.enforce_livestock_protocol_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.land_parcel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.land_parcels
    WHERE id = NEW.land_parcel_id AND farm_id = NEW.farm_id AND status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'A propriedade do protocolo não pertence à operação.' USING ERRCODE = '23514';
  END IF;
  IF NEW.cattle_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cattle_lots
    WHERE id = NEW.cattle_lot_id AND farm_id = NEW.farm_id AND COALESCE(status, 'active') <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'O lote do protocolo não pertence à operação.' USING ERRCODE = '23514';
  END IF;
  IF NEW.responsible_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = NEW.responsible_employee_id AND farm_id = NEW.farm_id AND COALESCE(status, 'active') <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'O responsável do protocolo não pertence à operação.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_livestock_protocol_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope TEXT;
BEGIN
  IF NEW.status <> 'active' THEN
    UPDATE public.alerts
    SET status = CASE WHEN NEW.status = 'completed' THEN 'completed' ELSE 'deleted' END,
        updated_at = clock_timestamp()
    WHERE related_table = 'livestock_protocols' AND related_id = NEW.id AND status <> 'deleted';
    RETURN NEW;
  END IF;

  v_scope := CASE NEW.scope_type
    WHEN 'lot' THEN 'Lote: ' || COALESCE((SELECT name FROM public.cattle_lots WHERE id = NEW.cattle_lot_id), 'não identificado')
    WHEN 'property' THEN 'Propriedade: ' || COALESCE((SELECT name FROM public.land_parcels WHERE id = NEW.land_parcel_id), 'não identificada')
    WHEN 'category' THEN 'Categoria: ' || NEW.animal_category
    ELSE 'Toda a operação pecuária'
  END;

  INSERT INTO public.alerts (
    alert_type, title, message, due_date, related_table, related_id,
    recipient_user_id, status, sent_at
  ) VALUES (
    CASE WHEN NEW.protocol_type = 'sanitary' THEN 'livestock_health' ELSE 'livestock_reproduction' END,
    CASE WHEN NEW.protocol_type = 'sanitary' THEN 'Sanidade: ' ELSE 'Reprodução: ' END || NEW.name,
    v_scope || '. Programado para ' || to_char(NEW.next_due_date, 'DD/MM/YYYY') ||
      CASE WHEN NEW.product_name IS NOT NULL THEN '. Produto: ' || NEW.product_name ELSE '' END ||
      CASE WHEN NEW.responsible_employee_id IS NOT NULL THEN '. Responsável: ' || COALESCE((SELECT full_name FROM public.employees WHERE id = NEW.responsible_employee_id), 'equipe definida') ELSE '' END ||
      '. Após realizar, confirme no sistema para registrar a execução e programar o próximo ciclo.',
    NEW.next_due_date - NEW.alert_lead_days,
    'livestock_protocols', NEW.id, NULL, 'pending', NULL
  )
  ON CONFLICT (related_table, related_id)
    WHERE related_table = 'livestock_protocols' AND status <> 'deleted'
  DO UPDATE SET
    alert_type = EXCLUDED.alert_type,
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    due_date = EXCLUDED.due_date,
    recipient_user_id = EXCLUDED.recipient_user_id,
    status = 'pending',
    sent_at = CASE
      WHEN public.alerts.due_date IS DISTINCT FROM EXCLUDED.due_date THEN NULL
      ELSE public.alerts.sent_at
    END,
    updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_livestock_protocol(
  p_protocol_id UUID,
  p_executed_on DATE,
  p_quantity_treated INTEGER DEFAULT NULL,
  p_result_status TEXT DEFAULT 'completed',
  p_notes TEXT DEFAULT NULL,
  p_next_due_date DATE DEFAULT NULL,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_protocol public.livestock_protocols%ROWTYPE;
  v_execution_id UUID;
  v_next_due DATE;
BEGIN
  SELECT * INTO v_protocol FROM public.livestock_protocols
  WHERE id = p_protocol_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocolo não encontrado, pausado ou já concluído.' USING ERRCODE = 'P0002';
  END IF;
  IF p_executed_on IS NULL OR p_executed_on > current_date + 1 THEN
    RAISE EXCEPTION 'A data de execução é inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_result_status NOT IN ('completed', 'partial', 'skipped') THEN
    RAISE EXCEPTION 'O resultado informado é inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_treated IS NOT NULL AND p_quantity_treated < 0 THEN
    RAISE EXCEPTION 'A quantidade atendida não pode ser negativa.' USING ERRCODE = '22023';
  END IF;

  v_next_due := p_next_due_date;
  IF v_next_due IS NULL AND v_protocol.recurrence_days IS NOT NULL AND p_result_status <> 'skipped' THEN
    v_next_due := GREATEST(v_protocol.next_due_date, p_executed_on) + v_protocol.recurrence_days;
  END IF;
  IF v_next_due IS NOT NULL AND v_next_due <= p_executed_on THEN
    RAISE EXCEPTION 'A próxima data precisa ser posterior à execução.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.livestock_protocol_executions (
    farm_id, protocol_id, scheduled_due_date, executed_on, quantity_treated,
    result_status, notes, next_due_date, created_by
  ) VALUES (
    v_protocol.farm_id, v_protocol.id, v_protocol.next_due_date, p_executed_on,
    p_quantity_treated, p_result_status, NULLIF(btrim(p_notes), ''), v_next_due,
    p_actor_profile_id
  ) RETURNING id INTO v_execution_id;

  UPDATE public.livestock_protocols SET
    last_executed_at = CASE WHEN p_result_status = 'skipped' THEN last_executed_at ELSE p_executed_on END,
    next_due_date = COALESCE(v_next_due, next_due_date),
    status = CASE WHEN v_next_due IS NULL THEN 'completed' ELSE 'active' END,
    updated_at = clock_timestamp()
  WHERE id = v_protocol.id;

  RETURN v_execution_id;
END;
$$;

CREATE TRIGGER enforce_livestock_protocol_scope
  BEFORE INSERT OR UPDATE OF farm_id, land_parcel_id, cattle_lot_id, responsible_employee_id
  ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.enforce_livestock_protocol_scope();
CREATE TRIGGER sync_livestock_protocol_alert
  AFTER INSERT OR UPDATE OF name, protocol_type, scope_type, animal_category,
    product_name, next_due_date, alert_lead_days, responsible_employee_id, status
  ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.sync_livestock_protocol_alert();

CREATE TRIGGER set_updated_at_livestock_protocols BEFORE UPDATE ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_livestock_protocol_executions BEFORE UPDATE ON public.livestock_protocol_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_livestock_protocols AFTER INSERT OR UPDATE ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_livestock_protocol_executions AFTER INSERT OR UPDATE ON public.livestock_protocol_executions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER capture_farm_twin_event AFTER INSERT OR UPDATE ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event();
CREATE TRIGGER capture_farm_twin_event AFTER INSERT OR UPDATE ON public.livestock_protocol_executions
  FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event();
CREATE TRIGGER prevent_delete_livestock_protocols BEFORE DELETE ON public.livestock_protocols
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();
CREATE TRIGGER prevent_delete_livestock_protocol_executions BEFORE DELETE ON public.livestock_protocol_executions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

ALTER TABLE public.livestock_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestock_protocol_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read livestock protocols"
  ON public.livestock_protocols FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read livestock protocol executions"
  ON public.livestock_protocol_executions FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.livestock_protocols, public.livestock_protocol_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.livestock_protocols, public.livestock_protocol_executions TO authenticated;
GRANT ALL ON public.livestock_protocols, public.livestock_protocol_executions TO service_role;
REVOKE ALL ON FUNCTION public.complete_livestock_protocol(UUID, DATE, INTEGER, TEXT, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_livestock_protocol(UUID, DATE, INTEGER, TEXT, TEXT, DATE, UUID)
  TO service_role;

COMMENT ON TABLE public.livestock_protocols IS
  'Protocolos sanitários e reprodutivos coletivos, aplicados por operação, propriedade, lote ou categoria.';
COMMENT ON TABLE public.livestock_protocol_executions IS
  'Histórico verificável das execuções coletivas e reagendamentos dos protocolos pecuários.';

COMMIT;
