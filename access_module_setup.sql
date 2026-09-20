-- SQL Setup Script for Supabase Access Module, Real Authentication & Relationships
-- Copias Bella Vista FP

-- 1. Create or Update `store_users` table with all necessary authentication columns
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
  is_active BOOLEAN DEFAULT true,
  client_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dynamically ensure all missing columns exist in `store_users` if table was created previously
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS document TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'V';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS doc_number TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'V';
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS documento TEXT;
ALTER TABLE public.store_users ADD COLUMN IF NOT EXISTS client_code TEXT;

-- 2. Create or Update `clients` table with email and password support
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
  credit_usd NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dynamically ensure all missing columns exist in `clients`
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'V';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS doc_number TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'V';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS documento TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Create Security Logs Table
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_type TEXT,
  user_email TEXT,
  action TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS) & Define Public Access Policies
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- store_users Policies
DROP POLICY IF EXISTS "Public select store_users" ON public.store_users;
CREATE POLICY "Public select store_users" ON public.store_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert store_users" ON public.store_users;
CREATE POLICY "Public insert store_users" ON public.store_users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update store_users" ON public.store_users;
CREATE POLICY "Public update store_users" ON public.store_users FOR UPDATE USING (true);

-- clients Policies
DROP POLICY IF EXISTS "Public select clients" ON public.clients;
CREATE POLICY "Public select clients" ON public.clients FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert clients" ON public.clients;
CREATE POLICY "Public insert clients" ON public.clients FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update clients" ON public.clients;
CREATE POLICY "Public update clients" ON public.clients FOR UPDATE USING (true);

-- security_logs Policies
DROP POLICY IF EXISTS "Public select security_logs" ON public.security_logs;
CREATE POLICY "Public select security_logs" ON public.security_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert security_logs" ON public.security_logs;
CREATE POLICY "Public insert security_logs" ON public.security_logs FOR INSERT WITH CHECK (true);

-- 5. Seed default admin user into `store_users`
INSERT INTO public.store_users (name, email, password, role, is_active) 
VALUES ('Administrador Principal', 'copiasbellavistafp@gmail.com', 'admin123', 'Admin', true) 
ON CONFLICT (email) DO NOTHING;
