-- Tabela de Ocorrências e Notas de Campo (Caixa de Entrada / Fallback da IA)

CREATE TABLE IF NOT EXISTS occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    original_text TEXT NOT NULL,
    suggested_category TEXT,
    tags JSONB,
    priority TEXT DEFAULT 'medium',
    
    -- Foreign Keys flexíveis (relacionamentos opcionais se a IA deduzir algo)
    related_farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    related_pasture_id UUID REFERENCES pastures(id) ON DELETE SET NULL,
    related_cattle_lot_id UUID REFERENCES cattle_lots(id) ON DELETE SET NULL,
    related_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    
    source_message_id UUID REFERENCES incoming_messages(id) ON DELETE SET NULL,
    attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
    
    -- Status da Revisão
    status TEXT DEFAULT 'pending_review', -- pending_review, reviewed, converted, archived, deleted
    
    -- Dados de Conversão
    converted_to_table TEXT,
    converted_to_id UUID,
    
    -- Controle de Auditoria e Usuários
    reviewed_by UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access for authenticated users on occurrences"
ON occurrences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers de Bloqueio e Auditoria
CREATE TRIGGER prevent_delete_occurrences BEFORE DELETE ON occurrences FOR EACH ROW EXECUTE FUNCTION prevent_physical_delete();
CREATE TRIGGER audit_occurrences AFTER INSERT OR UPDATE ON occurrences FOR EACH ROW EXECUTE FUNCTION log_audit_event();
