-- ==============================================================================
-- SUPABASE SQL CONFIGURATION FOR REPORTS AND REALTIME SYNCHRONIZATION
-- COPIAS BELLA VISTA - REPORTE DE GESTIÓN FINANCIERA EN TIEMPO REAL
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- ==============================================================================

-- 1. TABLA: SESIONES DE CAJA (cash_sessions)
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_nombre TEXT DEFAULT 'Cajero de Turno',
  empleado_id TEXT,
  apertura TEXT NOT NULL,
  cierre TEXT NOT NULL DEFAULT '—',
  apertura_bs NUMERIC NOT NULL DEFAULT 0,
  cierre_bs NUMERIC,
  diferencia_bs NUMERIC,
  estado TEXT NOT NULL CHECK (estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
  apertura_usd NUMERIC NOT NULL DEFAULT 0,
  cierre_usd NUMERIC,
  esperado_bs NUMERIC,
  esperado_usd NUMERIC,
  diferencia_usd NUMERIC,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Habilitar RLS y políticas para cash_sessions
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de cash_sessions" ON public.cash_sessions;
CREATE POLICY "Permitir lectura publica de cash_sessions" ON public.cash_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir modificaciones completas en cash_sessions" ON public.cash_sessions;
CREATE POLICY "Permitir modificaciones completas en cash_sessions" ON public.cash_sessions FOR ALL USING (true);


-- 2. TABLA: OPERACIONES Y GASTOS DE CAJA (cash_ops)
CREATE TABLE IF NOT EXISTS public.cash_ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
  concept TEXT NOT NULL,
  category TEXT DEFAULT 'Otros Gastos Operativos',
  amount NUMERIC NOT NULL DEFAULT 0, -- USD
  amount_bs NUMERIC NOT NULL DEFAULT 0, -- Bs
  time TEXT,
  payment_method TEXT,
  empleado_nombre TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Asegurar que las columnas nuevas existan si la tabla ya estaba creada previamente
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_ops' AND column_name='category') THEN
    ALTER TABLE public.cash_ops ADD COLUMN category TEXT DEFAULT 'Otros Gastos Operativos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_ops' AND column_name='empleado_nombre') THEN
    ALTER TABLE public.cash_ops ADD COLUMN empleado_nombre TEXT;
  END IF;
END $$;

-- Habilitar RLS y políticas para cash_ops
ALTER TABLE public.cash_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de cash_ops" ON public.cash_ops;
CREATE POLICY "Permitir lectura publica de cash_ops" ON public.cash_ops FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir modificaciones completas en cash_ops" ON public.cash_ops;
CREATE POLICY "Permitir modificaciones completas en cash_ops" ON public.cash_ops FOR ALL USING (true);


-- 3. TABLA: CONFIGURACIÓN DE MÓDULOS DE REPORTES (report_modules_config)
CREATE TABLE IF NOT EXISTS public.report_modules_config (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  section TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.report_modules_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de report_modules_config" ON public.report_modules_config;
CREATE POLICY "Permitir lectura de report_modules_config" ON public.report_modules_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir escritura de report_modules_config" ON public.report_modules_config;
CREATE POLICY "Permitir escritura de report_modules_config" ON public.report_modules_config FOR ALL USING (true);

-- Sembrar configuración predeterminada si no existe
INSERT INTO public.report_modules_config (id, title, description, enabled, section, sort_order)
VALUES
  ('tu_ganancia', 'Tu ganancia', 'Cuánto ganaste, costo y margen de ganancia', true, 'graficas', 1),
  ('tus_ventas', 'Tus ventas', 'Monto total de ventas y volumen de transacciones', true, 'graficas', 2),
  ('top_productos', 'Top productos', 'Más vendidos y con más ganancia', true, 'comparativos', 3),
  ('top_clientes', 'Top clientes', 'Clientes que más compraron', true, 'comparativos', 4),
  ('top_empleados', 'Top empleados', 'Los que más vendieron en el negocio', true, 'comparativos', 5),
  ('tus_gastos', 'Tus gastos', 'Egresos categorizados de operación', true, 'detalle', 6)
ON CONFLICT (id) DO NOTHING;


-- 4. TABLA: FACTURAS / VENTAS FLASH (invoices)
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  control_number TEXT,
  customer_name TEXT DEFAULT 'Consumidor final',
  payment_method TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  iva NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  taxes_detail JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de invoices" ON public.invoices;
CREATE POLICY "Permitir lectura publica de invoices" ON public.invoices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion/edicion de invoices" ON public.invoices;
CREATE POLICY "Permitir insercion/edicion de invoices" ON public.invoices FOR ALL USING (true);


-- 5. HABILITAR SUPABASE REALTIME EN TODAS LAS TABLAS PRINCIPALES
-- Esto permite que Supabase envíe eventos en vivo cuando se cree una venta, gasto o producto
BEGIN;
  -- Remover para evitar duplicados si ya existen en la publicación
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    public.orders, 
    public.invoices,
    public.products, 
    public.cash_ops, 
    public.cash_sessions,
    public.report_modules_config,
    public.store_users;
COMMIT;

-- 6. CONFIGURACIÓN DE REPLICACIÓN COMPLETA (FULL REPLICA IDENTITY)
-- Garantiza que los eventos de UPDATE y DELETE contengan toda la fila en tiempo real
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.cash_ops REPLICA IDENTITY FULL;
ALTER TABLE public.cash_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.report_modules_config REPLICA IDENTITY FULL;
