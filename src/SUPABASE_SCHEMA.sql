-- ============================================================
-- APPTELIER SUITE — SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Auto-update updated_date trigger function
CREATE OR REPLACE FUNCTION update_updated_date_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  industry TEXT CHECK (industry IN ('restaurant','cafe','bar','retail','salon','other')),
  status TEXT DEFAULT 'trial' CHECK (status IN ('active','suspended','trial','cancelled')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','starter','professional','enterprise')),
  owner_email TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  country TEXT DEFAULT 'Singapore',
  currency TEXT DEFAULT 'SGD',
  timezone TEXT DEFAULT 'Asia/Singapore',
  settings JSONB
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  permissions JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  role_id TEXT,
  role_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  is_owner BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone TEXT,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')),
  current_order_id TEXT,
  qr_code_url TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  category_id TEXT,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  price DECIMAL NOT NULL,
  cost_price DECIMAL,
  image_url TEXT,
  sku TEXT,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  tags JSONB DEFAULT '[]',
  variants JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','served','completed','cancelled')),
  type TEXT DEFAULT 'dine_in' CHECK (type IN ('dine_in','takeaway','delivery')),
  table_id TEXT,
  table_name TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  items JSONB DEFAULT '[]',
  subtotal DECIMAL,
  tax_amount DECIMAL,
  discount_amount DECIMAL DEFAULT 0,
  total_amount DECIMAL NOT NULL,
  payment_method TEXT DEFAULT 'pending' CHECK (payment_method IN ('cash','card','digital_wallet','pending')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','partial')),
  notes TEXT,
  served_by TEXT
);

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','support','developer')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free','starter','professional','enterprise')),
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status TEXT DEFAULT 'trial' CHECK (status IN ('active','trial','suspended','cancelled','past_due')),
  amount DECIMAL,
  currency TEXT DEFAULT 'SGD',
  features JSONB,
  max_users INTEGER,
  max_products INTEGER,
  max_orders INTEGER,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read','create','update','delete','manage')),
  key TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('size','addon','color','other')),
  price_modifier DECIMAL DEFAULT 0,
  sku TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  current_stock INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  unit TEXT DEFAULT 'pcs',
  last_restock_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  product_name TEXT,
  variant_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL NOT NULL,
  total_price DECIMAL NOT NULL,
  special_instructions TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','digital_wallet','bank_transfer','other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','partial')),
  amount DECIMAL NOT NULL,
  paid_amount DECIMAL DEFAULT 0,
  change_amount DECIMAL DEFAULT 0,
  reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS theme_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL UNIQUE,
  color_set_name TEXT DEFAULT 'navy-gold',
  primary_color TEXT DEFAULT '#1e293b',
  primary_dark TEXT DEFAULT '#0f172a',
  accent_color TEXT DEFAULT '#f59e0b',
  background_color TEXT DEFAULT '#f8fafc',
  logo_url TEXT,
  favicon_url TEXT,
  font_family TEXT DEFAULT 'Inter',
  custom_css TEXT
);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  open_time TEXT,
  close_time TEXT,
  is_closed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS table_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT,
  type TEXT DEFAULT 'waiter' CHECK (type IN ('waiter','bill','help')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','completed')),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','payment_requested','completed')),
  order_ids JSONB DEFAULT '[]',
  total_amount DECIMAL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  tenant_id TEXT,
  user_email TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  user_email TEXT,
  tenant_id TEXT,
  preferences JSONB
);

-- ============================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_date_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'app_users','tenants','roles','tenant_users','categories','tables',
    'products','orders','super_admins','subscriptions','permissions',
    'product_variants','inventory_items','order_items','payments',
    'theme_configs','business_hours','table_calls','table_sessions',
    'notifications','notification_preferences'
  ]) LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%s_updated_date ON %s;
      CREATE TRIGGER update_%s_updated_date
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_date_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (optional — disable for testing)
-- ============================================================
-- To allow all access during development, run:
-- ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
-- (repeat for each table)
-- Or grant anon access:
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;