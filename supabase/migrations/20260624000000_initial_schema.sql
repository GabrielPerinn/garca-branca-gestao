-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users_profiles
CREATE TABLE users_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE, -- linked to auth.users if needed
  full_name TEXT NOT NULL,
  phone_number TEXT,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. farms
CREATE TABLE farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES users_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. areas
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  approximate_size NUMERIC,
  location_description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES users_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. pastures
CREATE TABLE pastures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  approximate_capacity NUMERIC,
  current_condition TEXT,
  rest_status TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. cattle_lots
CREATE TABLE cattle_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner TEXT,
  category TEXT,
  current_quantity INTEGER DEFAULT 0,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  pasture_id UUID REFERENCES pastures(id) ON DELETE SET NULL,
  origin TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. cattle_movements
CREATE TABLE cattle_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cattle_lot_id UUID REFERENCES cattle_lots(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  from_farm_id UUID REFERENCES farms(id),
  from_pasture_id UUID REFERENCES pastures(id),
  to_farm_id UUID REFERENCES farms(id),
  to_pasture_id UUID REFERENCES pastures(id),
  movement_date DATE,
  reason TEXT,
  requires_confirmation BOOLEAN DEFAULT false,
  confirmed_by UUID REFERENCES users_profiles(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  source_message_id TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. weighings
CREATE TABLE weighings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cattle_lot_id UUID REFERENCES cattle_lots(id) ON DELETE CASCADE,
  weighing_date DATE NOT NULL,
  quantity_weighed INTEGER,
  average_weight NUMERIC,
  total_weight NUMERIC,
  individual_weights_json JSONB,
  notes TEXT,
  source_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. cattle_sales
CREATE TABLE cattle_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_name TEXT NOT NULL,
  cattle_lot_id UUID REFERENCES cattle_lots(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  negotiation_date DATE,
  shipment_date DATE,
  average_weight NUMERIC,
  total_weight NUMERIC,
  price_type TEXT,
  price_value NUMERIC,
  gross_amount NUMERIC,
  discounts_amount NUMERIC,
  freight_amount NUMERIC,
  commission_amount NUMERIC,
  net_amount NUMERIC,
  expected_payment_date DATE,
  payment_status TEXT DEFAULT 'pending',
  payment_received_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role_description TEXT,
  salary_amount NUMERIC,
  payment_day INTEGER,
  phone_number TEXT,
  lives_on_farm BOOLEAN DEFAULT false,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. employee_payments
CREATE TABLE employee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payment_date DATE,
  due_date DATE,
  payment_method TEXT,
  description TEXT,
  requires_confirmation BOOLEAN DEFAULT false,
  confirmed_by UUID REFERENCES users_profiles(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  source_message_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. inventory_items
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  current_quantity NUMERIC DEFAULT 0,
  minimum_quantity NUMERIC,
  location_description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to_user_id UUID REFERENCES users_profiles(id),
  assigned_to_employee_id UUID REFERENCES employees(id),
  due_date DATE,
  priority TEXT DEFAULT 'medium',
  task_type TEXT,
  related_farm_id UUID REFERENCES farms(id),
  related_pasture_id UUID REFERENCES pastures(id),
  related_cattle_lot_id UUID REFERENCES cattle_lots(id),
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  source_message_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  subcategory TEXT,
  description TEXT,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL,
  payment_method TEXT,
  supplier_name TEXT,
  related_employee_id UUID REFERENCES employees(id),
  related_inventory_item_id UUID REFERENCES inventory_items(id),
  related_task_id UUID REFERENCES tasks(id),
  related_cattle_lot_id UUID REFERENCES cattle_lots(id),
  related_farm_id UUID REFERENCES farms(id),
  source_message_id TEXT,
  has_receipt BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. revenues
CREATE TABLE revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  description TEXT,
  amount NUMERIC NOT NULL,
  revenue_date DATE NOT NULL,
  payment_method TEXT,
  related_sale_id UUID REFERENCES cattle_sales(id),
  source_message_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. inventory_movements
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT,
  movement_date DATE,
  reason TEXT,
  related_expense_id UUID REFERENCES expenses(id),
  related_task_id UUID REFERENCES tasks(id),
  source_message_id TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  due_date DATE,
  related_table TEXT,
  related_id UUID,
  recipient_user_id UUID REFERENCES users_profiles(id),
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  document_date DATE,
  expiration_date DATE,
  related_table TEXT,
  related_id UUID,
  file_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 18. attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  file_type TEXT,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  uploaded_by UUID REFERENCES users_profiles(id),
  source_message_id TEXT,
  related_table TEXT,
  related_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 19. incoming_messages
CREATE TABLE incoming_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_message_id TEXT UNIQUE NOT NULL,
  provider TEXT,
  sender_phone TEXT,
  sender_user_id UUID REFERENCES users_profiles(id),
  message_type TEXT,
  raw_payload_json JSONB,
  text_content TEXT,
  media_id TEXT,
  media_url TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 20. pending_actions
CREATE TABLE pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id TEXT REFERENCES incoming_messages(external_message_id),
  action_type TEXT NOT NULL,
  interpreted_data_json JSONB,
  confidence_score NUMERIC,
  missing_fields_json JSONB,
  requires_confirmation BOOLEAN DEFAULT true,
  confirmation_status TEXT DEFAULT 'pending',
  confirmed_by UUID REFERENCES users_profiles(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 21. audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  before_data_json JSONB,
  after_data_json JSONB,
  changed_by UUID REFERENCES users_profiles(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  reason TEXT,
  source_message_id TEXT
);

-- 22. gravel_operations
CREATE TABLE gravel_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  operation_date DATE,
  operation_type TEXT,
  loads_quantity INTEGER,
  estimated_volume NUMERIC,
  origin_location TEXT,
  destination_location TEXT,
  purpose TEXT,
  machine_used TEXT,
  responsible_person TEXT,
  related_task_id UUID REFERENCES tasks(id),
  document_id UUID REFERENCES documents(id),
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 23. suppression_operations
CREATE TABLE suppression_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  operation_date DATE,
  operation_type TEXT,
  authorization_number TEXT,
  authorization_expiration_date DATE,
  responsible_technician TEXT,
  approximate_area NUMERIC,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 24. maintenance_records
CREATE TABLE maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name TEXT NOT NULL,
  asset_type TEXT,
  maintenance_type TEXT,
  maintenance_date DATE,
  cost_amount NUMERIC,
  responsible_person TEXT,
  related_expense_id UUID REFERENCES expenses(id),
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
