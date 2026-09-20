-- SQL Schema Setup for Dynamic Taxes (Impuestos y Tasas)
-- Ejecutar este código en el editor SQL de Supabase (SQL Editor)

-- 1. Crear tabla de Impuestos
CREATE TABLE IF NOT EXISTS public.taxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL CHECK (rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Habilitar RLS (Row Level Security) para la tabla de Impuestos
ALTER TABLE public.taxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users on taxes" ON public.taxes;
CREATE POLICY "Enable read access for all users on taxes" ON public.taxes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for all users on taxes" ON public.taxes;
CREATE POLICY "Enable all access for all users on taxes" ON public.taxes FOR ALL USING (true);

-- 3. Insertar el impuesto IVA por defecto (16%)
INSERT INTO public.taxes (id, name, rate, is_active)
VALUES ('77777777-7777-7777-7777-777777777777', 'IVA', 16, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Agregar columna taxes_detail a la tabla de Invoices (Facturas) si no existe
-- Esto permite almacenar el detalle desglosado de impuestos aplicados
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS taxes_detail JSONB DEFAULT '[]'::jsonb;

-- 5. Agregar columna taxes_detail a la tabla de Draft Invoices (Espera) si no existe
ALTER TABLE public.draft_invoices 
ADD COLUMN IF NOT EXISTS taxes_detail JSONB DEFAULT '[]'::jsonb;
