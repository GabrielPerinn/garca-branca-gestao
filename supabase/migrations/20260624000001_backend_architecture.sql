-- Criação da tabela de Vendas (sales) que faltava no schema inicial
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FUNÇÃO: Bloqueio de DELETE Físico (Força Soft Delete)
CREATE OR REPLACE FUNCTION prevent_physical_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão física proibida nesta tabela. Use UPDATE status = ''deleted''.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Aplicar o bloqueio de Delete nas tabelas críticas
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY['farms', 'pastures', 'cattle_lots', 'inventory_items', 'tasks', 'expenses', 'revenues', 'sales', 'employees']) 
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS prevent_delete_%I ON %I;
            CREATE TRIGGER prevent_delete_%I
            BEFORE DELETE ON %I
            FOR EACH ROW EXECUTE FUNCTION prevent_physical_delete();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- FUNÇÃO: Trigger de Auditoria Automática
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    before_data_json,
    after_data_json,
    changed_by
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_before,
    v_after,
    auth.uid() -- Se a ação vier autenticada do Supabase via Row Level Security
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a Trigger de Auditoria nas tabelas principais
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY['farms', 'cattle_lots', 'expenses', 'revenues']) 
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS audit_%I ON %I;
            CREATE TRIGGER audit_%I
            AFTER INSERT OR UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION log_audit_event();
        ', t, t, t, t);
    END LOOP;
END;
$$;
