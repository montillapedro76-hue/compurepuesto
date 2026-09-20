-- Marketing Tables for Supabase
-- Execute this script in your Supabase SQL Editor to create the necessary tables for the Marketing module.

-- 1. Discount Codes Table
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  target_type TEXT CHECK (target_type IN ('order', 'specific_products')),
  target_products JSONB, -- array of product ids
  start_date DATE,
  end_date DATE,
  usage_limit_type TEXT CHECK (usage_limit_type IN ('unlimited', 'limited')),
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  min_purchase_amount NUMERIC,
  customer_eligibility TEXT CHECK (customer_eligibility IN ('all', 'new')),
  uses_per_customer TEXT CHECK (uses_per_customer IN ('unlimited', 'once')),
  show_in_digital_menu BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for discount_codes
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.discount_codes;
CREATE POLICY "Enable read access for all users" ON public.discount_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.discount_codes;
CREATE POLICY "Enable insert for authenticated users only" ON public.discount_codes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.discount_codes;
CREATE POLICY "Enable update for authenticated users only" ON public.discount_codes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.discount_codes;
CREATE POLICY "Enable delete for authenticated users only" ON public.discount_codes FOR DELETE USING (true);

-- 2. Loyalty Settings Table
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_active BOOLEAN DEFAULT false,
  points_per_amount NUMERIC,
  amount_for_points NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for loyalty_settings
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.loyalty_settings;
CREATE POLICY "Enable read access for all users" ON public.loyalty_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users only" ON public.loyalty_settings;
CREATE POLICY "Enable all access for authenticated users only" ON public.loyalty_settings FOR ALL USING (true);

-- Insert default loyalty settings
INSERT INTO public.loyalty_settings (is_active, points_per_amount, amount_for_points) VALUES (false, 10, 10) ON CONFLICT DO NOTHING;

-- 3. Loyalty Rewards Table
CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  points_cost INTEGER NOT NULL,
  terms_conditions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for loyalty_rewards
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.loyalty_rewards;
CREATE POLICY "Enable read access for all users" ON public.loyalty_rewards FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users only" ON public.loyalty_rewards;
CREATE POLICY "Enable all access for authenticated users only" ON public.loyalty_rewards FOR ALL USING (true);

-- 4. Customer Loyalty Points Table
CREATE TABLE IF NOT EXISTS public.customer_points (
  phone_number TEXT PRIMARY KEY,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for customer_points
ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.customer_points;
CREATE POLICY "Enable read access for all users" ON public.customer_points FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users only" ON public.customer_points;
CREATE POLICY "Enable all access for authenticated users only" ON public.customer_points FOR ALL USING (true);

-- Add discount tracking to orders table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_code') THEN
    ALTER TABLE public.orders ADD COLUMN discount_code TEXT;
    ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC;
  END IF;
END $$;
