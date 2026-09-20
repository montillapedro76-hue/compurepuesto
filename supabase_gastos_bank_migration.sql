-- ==============================================================================
-- MIGRACIÓN DE MÓDULOS FINANCIEROS: GASTOS, CUENTAS BANCARIAS, CXC, CXP Y REPORTES
-- Copias Bella Vista, C.A. - Supabase PostgreSQL Schema
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABLA: CUENTAS BANCARIAS Y CAJAS (bank_accounts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    bank_name VARCHAR(100) NOT NULL DEFAULT 'Efectivo',
    account_number VARCHAR(50),
    account_type VARCHAR(50) DEFAULT 'corriente', -- corriente, ahorro, caja, digital, wallet
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',   -- USD, VES, EUR, COP
    balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated/anon on bank_accounts" ON public.bank_accounts;
CREATE POLICY "Allow all for authenticated/anon on bank_accounts" ON public.bank_accounts FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 3. TABLA: TRANSFERENCIAS ENTRE CUENTAS (bank_transfers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bank_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    from_account_name VARCHAR(150),
    to_account_name VARCHAR(150),
    amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    exchange_rate NUMERIC(14, 4) DEFAULT 1.0000,
    converted_amount NUMERIC(14, 2),
    reference VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on bank_transfers" ON public.bank_transfers;
CREATE POLICY "Allow all on bank_transfers" ON public.bank_transfers FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 4. TABLA: GASTOS FIJOS Y VARIABLES (gastos_fijos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Servicios',
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,       -- en USD
    amount_bs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,    -- en VES
    type VARCHAR(20) NOT NULL DEFAULT 'fijo',          -- 'fijo' | 'variable'
    frequency VARCHAR(30) DEFAULT 'mensual',           -- 'semanal', 'quincenal', 'mensual', 'anual', 'unico'
    payment_method VARCHAR(50) DEFAULT 'Transferencia',
    bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    next_due_date DATE,
    last_paid_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',    -- 'pendiente', 'pagado', 'vencido', 'parcial'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on gastos_fijos" ON public.gastos_fijos;
CREATE POLICY "Allow all on gastos_fijos" ON public.gastos_fijos FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. TABLA: PAGOS / HISTORIAL DE GASTOS FIJOS (gastos_fijos_payments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gastos_fijos_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gasto_fijo_id UUID REFERENCES public.gastos_fijos(id) ON DELETE CASCADE,
    gasto_name VARCHAR(200),
    amount NUMERIC(12, 2) NOT NULL,
    amount_bs NUMERIC(14, 2) DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL,
    bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    bank_account_name VARCHAR(150),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.gastos_fijos_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on gastos_fijos_payments" ON public.gastos_fijos_payments;
CREATE POLICY "Allow all on gastos_fijos_payments" ON public.gastos_fijos_payments FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 6. TABLA: CUENTAS POR PAGAR (accounts_payable)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID,
    provider_id UUID,
    provider_name VARCHAR(200) NOT NULL,
    invoice_number VARCHAR(100),
    description TEXT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,      -- en USD
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,       -- en USD
    remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,   -- en USD
    currency VARCHAR(10) DEFAULT 'USD',
    bcv_rate NUMERIC(14, 4) DEFAULT 1.0000,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',         -- 'pendiente', 'parcial', 'pagado', 'vencido'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on accounts_payable" ON public.accounts_payable;
CREATE POLICY "Allow all on accounts_payable" ON public.accounts_payable FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 7. TABLA: ABONOS Y PAGOS DE CUENTAS POR PAGAR (accounts_payable_payments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts_payable_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,                          -- en USD
    amount_bs NUMERIC(14, 2) DEFAULT 0.00,                  -- en VES
    payment_method VARCHAR(50) NOT NULL,
    bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.accounts_payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on accounts_payable_payments" ON public.accounts_payable_payments;
CREATE POLICY "Allow all on accounts_payable_payments" ON public.accounts_payable_payments FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 8. TABLA: CUENTAS POR COBRAR (accounts_receivable)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts_receivable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID,
    invoice_id VARCHAR(100),
    client_id UUID,
    client_name VARCHAR(200) NOT NULL,
    client_phone VARCHAR(50),
    invoice_number VARCHAR(100),
    description TEXT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,      -- en USD
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,       -- en USD
    remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,   -- en USD
    currency VARCHAR(10) DEFAULT 'USD',
    bcv_rate NUMERIC(14, 4) DEFAULT 1.0000,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',         -- 'pendiente', 'parcial', 'cobrado', 'vencido'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on accounts_receivable" ON public.accounts_receivable;
CREATE POLICY "Allow all on accounts_receivable" ON public.accounts_receivable FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 9. TABLA: ABONOS Y COBROS DE CUENTAS POR COBRAR (accounts_receivable_payments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts_receivable_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,                          -- en USD
    amount_bs NUMERIC(14, 2) DEFAULT 0.00,                  -- en VES
    payment_method VARCHAR(50) NOT NULL,
    bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.accounts_receivable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on accounts_receivable_payments" ON public.accounts_receivable_payments;
CREATE POLICY "Allow all on accounts_receivable_payments" ON public.accounts_receivable_payments FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 10. DATOS INICIALES (SEED DATA)
-- ==============================================================================
INSERT INTO public.bank_accounts (name, bank_name, account_number, account_type, currency, balance, is_active)
VALUES
    ('Caja Principal USD (Efectivo)', 'Efectivo', 'CAJA-USD-01', 'caja', 'USD', 350.00, true),
    ('Caja Principal VES (Efectivo)', 'Efectivo', 'CAJA-VES-01', 'caja', 'VES', 12500.00, true),
    ('Banco de Venezuela (Pago Móvil / Transferencia)', 'Banco de Venezuela', '0102-0123-45-0000000000', 'corriente', 'VES', 45800.50, true),
    ('Banesco Banco Universal', 'Banesco', '0134-0987-65-0000000000', 'corriente', 'VES', 32400.00, true),
    ('Zelle Negocio', 'Zelle / Chase', 'pagos@copiasbellavista.com', 'digital', 'USD', 1200.00, true)
ON CONFLICT DO NOTHING;

-- Gastos Fijos de ejemplo
INSERT INTO public.gastos_fijos (name, category, amount, amount_bs, type, frequency, payment_method, next_due_date, status)
VALUES
    ('Alquiler de Local Comercial', 'Alquiler', 180.00, 129841.20, 'fijo', 'mensual', 'Transferencia', CURRENT_DATE + INTERVAL '10 days', 'pendiente'),
    ('Servicio de Internet Fibra Óptica', 'Internet / teléfono', 35.00, 25246.90, 'fijo', 'mensual', 'Pago Móvil', CURRENT_DATE + INTERVAL '5 days', 'pendiente'),
    ('Electricidad y Servicios Básicos', 'Electricidad / luz', 25.00, 18033.50, 'fijo', 'mensual', 'Transferencia', CURRENT_DATE + INTERVAL '15 days', 'pendiente'),
    ('Nómina Quincenal Operadores', 'Sueldos y salarios', 220.00, 158694.80, 'fijo', 'quincenal', 'Pago Móvil', CURRENT_DATE + INTERVAL '7 days', 'pendiente')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 11. HABILITAR REALTIME EN SUPABASE
-- ==============================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_fijos;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_fijos_payments;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_payable;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_payable_payments;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_receivable;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_receivable_payments;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Notice: Tables added to publication or publication already configured.';
END $$;
