-- Users and Roles Tables for Supabase
CREATE TABLE IF NOT EXISTS public.store_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Gerente', 'Cajero', 'Despachador', 'Repartidor', 'Cliente')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for store_users
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.store_users;
CREATE POLICY "Enable read access for all users" ON public.store_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users only" ON public.store_users;
CREATE POLICY "Enable all access for authenticated users only" ON public.store_users FOR ALL USING (true);

-- Insert default admin user
INSERT INTO public.store_users (name, email, role, is_active) 
VALUES ('Copias Bella Vista', 'copiasbellavistafp@gmail.com', 'Admin', true) 
ON CONFLICT (email) DO NOTHING;

-- Wishlist Table for Supabase
CREATE TABLE IF NOT EXISTS public.wishlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for wishlist
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for wishlist" ON public.wishlist;
CREATE POLICY "Enable read access for wishlist" ON public.wishlist FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for wishlist" ON public.wishlist;
CREATE POLICY "Enable all access for wishlist" ON public.wishlist FOR ALL USING (true);

