-- Para permitir testes de fumaça (smoke tests) e testes de UI antes da implementação do Login,
-- precisamos garantir que a role 'anon' consiga inserir e ler os dados.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'farms', 'pastures', 'cattle_lots', 'inventory_items', 'tasks', 'expenses', 'revenues', 'employees',
            'cattle_sales', 'employee_payments', 'inventory_movements', 'weighings', 'documents', 'attachments',
            'incoming_messages', 'alerts', 'gravel_operations', 'suppression_operations', 'maintenance_records',
            'pending_actions', 'occurrences', 'audit_logs'
        ]) 
    LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "Allow full access for authenticated users on %I" ON %I;
            CREATE POLICY "Allow full access for authenticated users on %I"
            ON %I FOR ALL TO public USING (true) WITH CHECK (true);
        ', t, t, t, t);
    END LOOP;
END;
$$;
