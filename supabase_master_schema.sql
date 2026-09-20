-- ==============================================================================
-- COPIAS BELLA VISTA - MASTER DATABASE SCHEMA & PERFORMANCE OPTIMIZATION
-- SUPABASE POSTGRESQL CONSOLIDATED DDL SCRIPT
-- ==============================================================================
-- Este script crea y optimiza toda la estructura de base de datos en Supabase:
-- 1. Extensiones requeridas (uuid-ossp, pg_trgm para búsqueda ultra rápida)
-- 2. Tablas del sistema con restricciones y claves foráneas
-- 3. Índices optimizados (B-Tree + GIN Trigram para catálogo y filtros)
-- 4. Políticas de Seguridad RLS (Row Level Security)
-- 5. Publicación en Supabase Realtime para sincronización instantánea
-- 6. Sembrado de datos iniciales esenciales (Admin, Monedas, Tasas, Módulos)
-- ==============================================================================

-- 0. HABILITAR EXTENSIONES POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==============================================================================
-- 1. CONFIGURACIÓN Y PERFIL DEL NEGOCIO
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.business_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'Copias Bella Vista, C.A.',
  business_type TEXT DEFAULT 'Papelería y libros',
  address TEXT DEFAULT 'Sector bella vista, calle 20 entre carrera 3 y 4',
  city TEXT DEFAULT 'Barinitas',
  phone TEXT DEFAULT '+58 412-5043857',
  email TEXT DEFAULT 'Fotocopiasfyp@gmail.com',
  rif TEXT DEFAULT 'J-50987654-3',
  website TEXT DEFAULT 'https://copiasbellavista.vercel.app/',
  logo_url TEXT DEFAULT '',
  slogan TEXT DEFAULT 'Equipando Tus Proyectos',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  manager_name TEXT,
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_terminals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES public.business_branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  type TEXT DEFAULT 'Caja Principal',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 2. MONEDAS, TASAS Y CONFIGURACIÓN FISCAL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.currency_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL, -- USD, VES, EUR, COP
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  is_base BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bcv_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate NUMERIC(14, 4) NOT NULL,
  date TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT DEFAULT 'BCV / DolarAPI',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.taxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  rate NUMERIC(6, 2) NOT NULL DEFAULT 16.0,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 3. USUARIOS, CLIENTES Y REGISTROS DE SEGURIDAD
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  phone TEXT,
  telefono TEXT,
  document TEXT,
  doc_type TEXT DEFAULT 'V',
  doc_number TEXT,
  tipo_documento TEXT DEFAULT 'V',
  documento TEXT,
  role TEXT NOT NULL DEFAULT 'Cliente' CHECK (role IN ('Admin', 'Gerente', 'Cajero', 'Despachador', 'Repartidor', 'Cliente')),
  permissions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  client_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  password TEXT,
  phone TEXT,
  document TEXT UNIQUE,
  doc_type TEXT DEFAULT 'V',
  doc_number TEXT,
  tipo_documento TEXT DEFAULT 'V',
  documento TEXT,
  type TEXT DEFAULT 'Natural',
  credit_usd NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_type TEXT,
  user_email TEXT,
  action TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 4. CATÁLOGO: CATEGORÍAS, MARCAS, PRODUCTOS E IMÁGENES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  offer_price NUMERIC(12, 2),
  stock INTEGER NOT NULL DEFAULT 0,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  featured BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  technical_sheet_url TEXT,
  barcode_qr TEXT,
  rating_stars NUMERIC(3, 1) DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  cost_price NUMERIC(12, 2) DEFAULT 0,
  unit TEXT DEFAULT 'UND',
  units TEXT DEFAULT 'UND',
  margin_1 NUMERIC(6, 2) DEFAULT 30,
  margin_2 NUMERIC(6, 2) DEFAULT 25,
  margin_3 NUMERIC(6, 2) DEFAULT 20,
  selected_margin_type TEXT DEFAULT '1',
  tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  tax_rate NUMERIC(6, 2) DEFAULT 16,
  expiration_date DATE,
  critical_stock INTEGER DEFAULT 5,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_email, product_id)
);

-- ==============================================================================
-- 5. VENTAS, PEDIDOS (B2C / POS) Y FACTURACIÓN
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number BIGSERIAL,
  customer_name TEXT NOT NULL DEFAULT 'Cliente General',
  phone_number TEXT NOT NULL DEFAULT '',
  customer_email TEXT,
  delivery_method TEXT NOT NULL DEFAULT 'b2c' CHECK (delivery_method IN ('b2c', 'retiro', 'pos')),
  address_text TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente',
  comments TEXT,
  payment_method TEXT,
  payment_amount_with NUMERIC(12, 2),
  payment_status TEXT DEFAULT 'pendiente',
  points INTEGER DEFAULT 0,
  discount_code TEXT,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  currency_code TEXT DEFAULT 'USD',
  applied_exchange_rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
  total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  currency_rates_snapshot JSONB,
  totals_by_currency JSONB,
  bcv_rate NUMERIC(14, 4),
  split_payments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  control_number TEXT,
  customer_name TEXT DEFAULT 'Consumidor final',
  payment_method TEXT,
  currency_code VARCHAR(10) DEFAULT 'USD',
  applied_exchange_rate NUMERIC(14, 4) DEFAULT 1.0000,
  total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  iva NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  taxes_detail JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 6. CAJA, SESIONES Y OPERACIONES (POS CASH REGISTER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empleado_nombre TEXT DEFAULT 'Cajero de Turno',
  empleado_id TEXT,
  apertura TEXT NOT NULL,
  cierre TEXT NOT NULL DEFAULT '—',
  apertura_bs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cierre_bs NUMERIC(14, 2),
  diferencia_bs NUMERIC(14, 2),
  estado TEXT NOT NULL CHECK (estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
  apertura_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cierre_usd NUMERIC(12, 2),
  esperado_bs NUMERIC(14, 2),
  esperado_usd NUMERIC(12, 2),
  diferencia_usd NUMERIC(12, 2),
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_ops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
  concept TEXT NOT NULL,
  category TEXT DEFAULT 'Otros Gastos Operativos',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0, -- Monto en USD
  amount_bs NUMERIC(14, 2) NOT NULL DEFAULT 0, -- Monto en VES
  time TEXT,
  payment_method TEXT,
  empleado_nombre TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 7. MARKETING, CUPONES Y PROGRAMA DE LEALTAD (LOYALTY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(12, 2) NOT NULL,
  target_type TEXT CHECK (target_type IN ('order', 'specific_products')),
  target_products JSONB,
  start_date DATE,
  end_date DATE,
  usage_limit_type TEXT CHECK (usage_limit_type IN ('unlimited', 'limited')),
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  min_purchase_amount NUMERIC(12, 2),
  customer_eligibility TEXT CHECK (customer_eligibility IN ('all', 'new')),
  uses_per_customer TEXT CHECK (uses_per_customer IN ('unlimited', 'once')),
  show_in_digital_menu BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_active BOOLEAN DEFAULT false,
  points_per_amount NUMERIC(10, 2) DEFAULT 10,
  amount_for_points NUMERIC(10, 2) DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(12, 2) NOT NULL,
  points_cost INTEGER NOT NULL,
  terms_conditions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_points (
  phone_number TEXT PRIMARY KEY,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 8. COMPRAS, PROVEEDORES, CUENTAS POR PAGAR (CXP) Y POR COBRAR (CXC)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE,
  rif TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Jurídico',
  phone TEXT,
  bank_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number TEXT,
  invoice_number TEXT NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  provider_rif TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pagado',
  due_date DATE,
  installments_count INTEGER DEFAULT 1,
  installments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'completada',
  notes TEXT,
  update_cost_applied BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounts_payable_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_document TEXT,
  total_amount NUMERIC(12, 2) NOT NULL,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounts_receivable_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- ==============================================================================
-- 9. COTIZACIONES Y PRESUPUESTOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_doc TEXT,
  date DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'emitida',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- ==============================================================================
-- 10. MÓDULOS DE REPORTES Y LANDING / CARROUSEL DINÁMICOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.report_modules_config (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  section TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.banner_slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.home_carousel_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  link_text TEXT DEFAULT 'Ver más',
  link_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  badge_text TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.landing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL DEFAULT 'Copias Bella Vista',
  hero_title TEXT DEFAULT 'Los mejores productos al mejor precio',
  hero_subtitle TEXT DEFAULT 'Envíos a todo el país y retiro en tienda',
  hero_image TEXT DEFAULT '',
  whatsapp_number TEXT DEFAULT '+584125043857',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 11. CREACIÓN DE ÍNDICES PARA ALTO RENDIMIENTO (PERFORMANCE INDEXES)
-- ==============================================================================

-- Índices B-Tree para búsquedas y filtros comunes
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active_featured ON public.products(active, featured);
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);

-- Índices GIN Trigram para búsqueda difusa ultra rápida por Nombre y SKU
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);

-- Índices para Pedidos, Facturas y Caja
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone_number);
CREATE INDEX IF NOT EXISTS idx_cash_ops_session ON public.cash_ops(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_estado ON public.cash_sessions(estado);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_created_at ON public.cash_sessions(created_at DESC);

-- Índices para Compras y Cuentas
CREATE INDEX IF NOT EXISTS idx_purchases_provider ON public.purchases(provider_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(date DESC);
CREATE INDEX IF NOT EXISTS idx_cxp_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_cxc_status ON public.accounts_receivable(status);

-- ==============================================================================
-- 12. CONFIGURACIÓN DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public full access %I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Public full access %I" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- 13. CONFIGURACIÓN DE SUPABASE REALTIME (PUBLICACIONES Y REPLICACIÓN)
-- ==============================================================================

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    public.orders, 
    public.invoices,
    public.products, 
    public.cash_ops, 
    public.cash_sessions,
    public.report_modules_config,
    public.store_users,
    public.bcv_rates,
    public.currency_rates;
COMMIT;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.cash_ops REPLICA IDENTITY FULL;
ALTER TABLE public.cash_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.report_modules_config REPLICA IDENTITY FULL;
ALTER TABLE public.store_users REPLICA IDENTITY FULL;
ALTER TABLE public.bcv_rates REPLICA IDENTITY FULL;
ALTER TABLE public.currency_rates REPLICA IDENTITY FULL;

-- ==============================================================================
-- 14. SEMBRADO DE DATOS PREDETERMINADOS (SEEDS)
-- ==============================================================================

-- Usuario Administrador por defecto
INSERT INTO public.store_users (name, email, password, role, is_active) 
VALUES ('Administrador Principal', 'copiasbellavistafp@gmail.com', 'admin123', 'Admin', true) 
ON CONFLICT (email) DO NOTHING;

-- Monedas Predeterminadas
INSERT INTO public.currency_rates (code, name, symbol, rate, is_active, is_base)
VALUES 
  ('USD', 'Dólar Estadounidense', '$', 1.0, true, true),
  ('VES', 'Bolívar Digital (BCV)', 'Bs', 390.0, true, false),
  ('EUR', 'Euro', '€', 0.92, true, false),
  ('COP', 'Peso Colombiano', 'COP$', 4150.0, true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol;

-- Impuesto Predeterminado (IVA 16%)
INSERT INTO public.taxes (name, rate, is_active, is_default)
VALUES ('IVA General (16%)', 16.0, true, true)
ON CONFLICT DO NOTHING;

-- Configuración de Módulos de Reportes
INSERT INTO public.report_modules_config (id, title, description, enabled, section, sort_order)
VALUES
  ('tu_ganancia', 'Tu ganancia', 'Cuánto ganaste, costo y margen de ganancia', true, 'graficas', 1),
  ('tus_ventas', 'Tus ventas', 'Monto total de ventas y volumen de transacciones', true, 'graficas', 2),
  ('top_productos', 'Top productos', 'Más vendidos y con más ganancia', true, 'comparativos', 3),
  ('top_clientes', 'Top clientes', 'Clientes que más compraron', true, 'comparativos', 4),
  ('top_empleados', 'Top empleados', 'Los que más vendieron en el negocio', true, 'comparativos', 5),
  ('tus_gastos', 'Tus gastos', 'Egresos categorizados de operación', true, 'detalle', 6)
ON CONFLICT (id) DO NOTHING;

-- Configuración de Fidelidad Predeterminada
INSERT INTO public.loyalty_settings (is_active, points_per_amount, amount_for_points)
VALUES (true, 10, 10)
ON CONFLICT DO NOTHING;

-- Perfil de Negocio
INSERT INTO public.business_profile (name, business_type, address, city, phone, email, rif, website, slogan)
VALUES (
  'Copias Bella Vista, C.A.',
  'Papelería y libros',
  'Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4',
  'Barinitas',
  '+58 412-5043857',
  'Fotocopiasfyp@gmail.com',
  'J-50987654-3',
  'https://copiasbellavista.vercel.app/',
  'Equipando Tus Proyectos'
)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- FIN DEL SCRIPT MAESTRO DE SUPABASE
-- ==============================================================================
