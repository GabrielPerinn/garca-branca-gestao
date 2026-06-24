-- Limpar a tabela sales duplicada (usaremos apenas cattle_sales)
DROP TABLE IF EXISTS sales CASCADE;

-- Criar 10 novas tabelas
CREATE TABLE IF NOT EXISTS employee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL, -- 'in' ou 'out'
    quantity DECIMAL(15,2) NOT NULL,
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weighings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID REFERENCES cattle_lots(id) ON DELETE SET NULL,
    average_weight DECIMAL(10,2) NOT NULL,
    weighing_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    document_type TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incoming_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_phone TEXT,
    message_body TEXT,
    processed_status TEXT DEFAULT 'pending',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    alert_type TEXT,
    is_resolved BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gravel_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_description TEXT NOT NULL,
    volume_extracted DECIMAL(15,2) NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppression_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_description TEXT NOT NULL,
    area_cleared DECIMAL(15,2) NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_name TEXT NOT NULL,
    maintenance_cost DECIMAL(15,2),
    maintenance_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS em todas as novas tabelas e cattle_sales
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'cattle_sales', 'employee_payments', 'inventory_movements', 'weighings', 'documents', 'attachments',
            'incoming_messages', 'alerts', 'gravel_operations', 'suppression_operations', 'maintenance_records'
        ]) 
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('
            DROP POLICY IF EXISTS "Allow full access for authenticated users on %I" ON %I;
            CREATE POLICY "Allow full access for authenticated users on %I"
            ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- Aplicar Bloqueio de Deleção Física e Auditoria
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'cattle_sales', 'employee_payments', 'inventory_movements', 'weighings', 'documents', 'attachments',
            'incoming_messages', 'alerts', 'gravel_operations', 'suppression_operations', 'maintenance_records'
        ]) 
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS prevent_delete_%I ON %I;
            CREATE TRIGGER prevent_delete_%I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_physical_delete();
        ', t, t, t, t);
        
        EXECUTE format('
            DROP TRIGGER IF EXISTS audit_%I ON %I;
            CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION log_audit_event();
        ', t, t, t, t);
    END LOOP;
END;
$$;
