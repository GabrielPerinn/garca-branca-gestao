-- Revogar permissões públicas/anônimas temporárias inseridas para testes
-- e restaurar o Row Level Security (RLS) base para o role `authenticated`.

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
            
            -- Recriamos a policy APENAS para usuários logados (authenticated)
            -- Nota: No futuro, isso será substituído por restrição baseada em auth.uid() e farm_id
            CREATE POLICY "Allow full access for authenticated users on %I"
            ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);
        ', t, t, t, t);
    END LOOP;
END;
$$;
