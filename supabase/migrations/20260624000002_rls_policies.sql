-- Habilitar RLS em todas as tabelas
ALTER TABLE users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastures ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Como estamos focando em backend robusto, criaremos políticas de segurança
-- que permitem acesso TOTAL a qualquer usuário autenticado (role = authenticated).
-- Num futuro multitenant real, o filtro seria "auth.uid() = user_id".
-- Por ora, bloqueamos acessos anônimos.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'users_profiles', 'farms', 'areas', 'pastures', 'cattle_lots', 'cattle_movements',
            'expenses', 'revenues', 'employees', 'inventory_items',
            'tasks', 'pending_actions', 'audit_logs', 'sales'
        ]) 
    LOOP
        EXECUTE format('
            CREATE POLICY "Allow full access for authenticated users on %I"
            ON %I
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
        ', t, t);
    END LOOP;
END;
$$;
