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

CREATE TABLE IF NOT EXISTS public.app_users (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  email text NOT NULL UNIQUE,
  password_hash text,
  full_name text,
  role text DEFAULT 'user' CHECK (role IN ('superadmin','admin','manager','supervisor','staff')),
  is_active boolean DEFAULT true,
  phone text UNIQUE,
  onboarding_completed boolean DEFAULT false,
  auth_provider text DEFAULT 'phone',
  last_login_at timestamp,
  tenant_id text,
  CONSTRAINT app_users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  industry text,
  status text DEFAULT 'trial' CHECK (status IN ('active','suspended','trial','cancelled')),
  plan text DEFAULT 'free' CHECK (plan IN ('free','starter','professional','enterprise')),
  owner_email text NOT NULL,
  address text,
  phone text,
  country text DEFAULT 'Singapore',
  currency text DEFAULT 'SGD',
  timezone text DEFAULT 'Asia/Singapore',
  settings jsonb,
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  user_email text NOT NULL,
  role_id text,
  role_name text,
  status text DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  is_owner boolean DEFAULT false,
  CONSTRAINT tenant_users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.roles (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  name text NOT NULL,
  slug text,
  permissions jsonb DEFAULT '[]',
  is_system boolean DEFAULT false,
  description text,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  resource text NOT NULL,
  action text NOT NULL CHECK (action IN ('read','create','update','delete','manage')),
  key text NOT NULL UNIQUE,
  description text,
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.super_admins (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'admin' CHECK (role IN ('admin','support','developer')),
  is_active boolean DEFAULT true,
  last_login timestamptz,
  CONSTRAINT super_admins_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  tier text DEFAULT 'free' CHECK (tier IN ('free','starter','growth','pro')),
  billing_cycle text DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status text DEFAULT 'trial' CHECK (status IN ('active','trial','suspended','cancelled','past_due')),
  amount numeric,
  currency text DEFAULT 'SGD',
  features jsonb,
  max_users integer,
  max_products integer,
  max_orders integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  stripe_subscription_id text,
  stripe_price_id text,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  name text NOT NULL,
  slug text,
  description text,
  image_url text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.products (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  category_id text,
  name text NOT NULL,
  slug text,
  description text,
  price numeric NOT NULL,
  cost_price numeric,
  compare_at_price numeric,
  image_url text,
  images jsonb DEFAULT '[]',
  sku text,
  stock_quantity integer DEFAULT 0,
  low_stock_threshold integer DEFAULT 5,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  tags jsonb DEFAULT '[]',
  variants jsonb DEFAULT '[]',
  suggested_category text,
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  type text CHECK (type IN ('size','addon','color','other')),
  price_modifier numeric DEFAULT 0,
  sku text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  CONSTRAINT product_variants_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  current_stock integer DEFAULT 0,
  low_stock_threshold integer DEFAULT 10,
  unit text DEFAULT 'pcs',
  last_restock_date timestamptz,
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tables (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  name text NOT NULL,
  zone text,
  capacity integer DEFAULT 4,
  status text DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')),
  current_order_id text,
  qr_code_url text,
  sort_order integer DEFAULT 0,
  CONSTRAINT tables_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  order_number text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','served','completed','cancelled')),
  type text DEFAULT 'dine_in' CHECK (type IN ('dine_in','takeaway','delivery')),
  table_id text,
  table_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb DEFAULT '[]',
  subtotal numeric,
  tax_amount numeric,
  discount_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL,
  payment_method text DEFAULT 'pending' CHECK (payment_method IN ('cash','card','digital_wallet','pending')),
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','partial')),
  notes text,
  served_by text,
  CONSTRAINT orders_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  order_id text NOT NULL,
  product_id text NOT NULL,
  variant_id text,
  product_name text,
  variant_name text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  special_instructions text,
  CONSTRAINT order_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  order_id text NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','card','digital_wallet','bank_transfer','other')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','partial')),
  amount numeric NOT NULL,
  paid_amount numeric DEFAULT 0,
  change_amount numeric DEFAULT 0,
  reference text,
  notes text,
  paid_at timestamptz,
  refunded_at timestamptz,
  CONSTRAINT payments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.theme_configs (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL UNIQUE,
  color_set_name text DEFAULT 'navy-gold',
  primary_color text DEFAULT '#1e293b',
  primary_dark text DEFAULT '#0f172a',
  accent_color text DEFAULT '#f59e0b',
  background_color text DEFAULT '#f8fafc',
  logo_url text,
  favicon_url text,
  font_family text DEFAULT 'Inter',
  custom_css text,
  CONSTRAINT theme_configs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.business_hours (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  open_time text,
  close_time text,
  is_closed boolean DEFAULT false,
  CONSTRAINT business_hours_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tables (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  name text NOT NULL,
  zone text,
  capacity integer DEFAULT 4,
  status text DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')),
  current_order_id text,
  qr_code_url text,
  sort_order integer DEFAULT 0,
  CONSTRAINT tables_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  table_id text NOT NULL,
  table_name text,
  status text DEFAULT 'active' CHECK (status IN ('active','payment_requested','completed')),
  order_ids jsonb DEFAULT '[]',
  total_amount numeric DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT table_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.table_calls (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text NOT NULL,
  table_id text NOT NULL,
  table_name text,
  type text DEFAULT 'waiter' CHECK (type IN ('waiter','bill','help')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','completed')),
  acknowledged_by text,
  acknowledged_at timestamptz,
  notes text,
  CONSTRAINT table_calls_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  tenant_id text,
  user_email text,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  link text,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  priority text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id text NOT NULL DEFAULT gen_random_uuid(),
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz DEFAULT now(),
  created_by text,
  created_by_id text,
  user_email text,
  tenant_id text,
  preferences jsonb,
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id)
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