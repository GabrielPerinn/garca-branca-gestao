-- Correção: Adicionar a trigger de auditoria (audit_logs) nas tabelas primárias 
-- que não receberam no script 01_backend_architecture.sql

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY['tasks', 'pastures', 'employees', 'inventory_items']) 
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
