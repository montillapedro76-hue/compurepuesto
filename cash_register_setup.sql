-- SQL Schema Setup for Cash Register (Caja y Balance)
-- Ejecutar este código en el editor SQL de Supabase (SQL Editor)

-- 1. Crear tabla de Sesiones de Caja (cash_sessions)
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Habilitar RLS (Row Level Security) para cash_sessions
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users on cash_sessions" ON public.cash_sessions;
CREATE POLICY "Enable read access for all users on cash_sessions" ON public.cash_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for all users on cash_sessions" ON public.cash_sessions;
CREATE POLICY "Enable all access for all users on cash_sessions" ON public.cash_sessions FOR ALL USING (true);


-- 2. Crear tabla de Operaciones de Caja (cash_ops)
CREATE TABLE IF NOT EXISTS public.cash_ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
  concept TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0, -- USD
  amount_bs NUMERIC NOT NULL DEFAULT 0, -- Bs
  time TEXT NOT NULL,
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  payment_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Habilitar RLS (Row Level Security) para cash_ops
ALTER TABLE public.cash_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users on cash_ops" ON public.cash_ops;
CREATE POLICY "Enable read access for all users on cash_ops" ON public.cash_ops FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for all users on cash_ops" ON public.cash_ops;
CREATE POLICY "Enable all access for all users on cash_ops" ON public.cash_ops FOR ALL USING (true);
