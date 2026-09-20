-- ==============================================================================
-- MIGRACIÓN DE ENDURECIMIENTO FINANCIERO, INMUTABILIDAD Y MULTIMONEDA
-- Copias Bella Vista, C.A. - Supabase PostgreSQL Schema
-- ==============================================================================

-- 1. TRAZABILIDAD MULTIMONEDA DUAL (DÓLARES Y BOLÍVARES CON TASA HISTÓRICA)
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS applied_exchange_rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS applied_exchange_rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.purchases 
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS applied_exchange_rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

-- 2. LIBRO MAYOR CENTRALIZADO E INMUTABLE (LEDGER ENTRIES)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(50) NOT NULL, -- 'VENTA_POS', 'COBRO_CXC', 'PAGO_CXP', 'GASTO_CAJA', 'TRANSFERENCIA'
    reference_id UUID,                     -- ID de la orden, pago o transferencia relacionada
    account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBITO', 'CREDITO')),
    amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_ves NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    exchange_rate NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
    concept TEXT NOT NULL,
    created_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read all on ledger_entries" ON public.ledger_entries;
CREATE POLICY "Allow read all on ledger_entries" ON public.ledger_entries FOR SELECT USING (true);

-- 3. TRIGGERS DE INMUTABILIDAD HISTÓRICA (PREVENCION DE ALTERACION DE AUDITORÍA)
CREATE OR REPLACE FUNCTION public.prevent_financial_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'OPERACIÓN RESTRINGIDA: Los asientos financieros, pagos y movimientos de caja son inmutables. Realice un contra-asiento o ajuste contable registrado.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_cash_ops ON public.cash_ops;
CREATE TRIGGER trg_immutable_cash_ops
BEFORE UPDATE OR DELETE ON public.cash_ops
FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_mutation();

DROP TRIGGER IF EXISTS trg_immutable_cxc_payments ON public.accounts_receivable_payments;
CREATE TRIGGER trg_immutable_cxc_payments
BEFORE UPDATE OR DELETE ON public.accounts_receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_mutation();

DROP TRIGGER IF EXISTS trg_immutable_cxp_payments ON public.accounts_payable_payments;
CREATE TRIGGER trg_immutable_cxp_payments
BEFORE UPDATE OR DELETE ON public.accounts_payable_payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_mutation();

DROP TRIGGER IF EXISTS trg_immutable_ledger ON public.ledger_entries;
CREATE TRIGGER trg_immutable_ledger
BEFORE UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_mutation();

-- 4. ÍNDICES DE ALTO RENDIMIENTO Y BÚSQUEDA RÁPIDA
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode_qr) WHERE barcode_qr IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_critical_stock 
ON public.products (stock, critical_stock) 
WHERE active = true AND stock <= critical_stock;

CREATE INDEX IF NOT EXISTS idx_orders_created_status 
ON public.orders (created_at DESC, status) 
INCLUDE (total_price, currency_code, bcv_rate);

CREATE INDEX IF NOT EXISTS idx_cash_ops_session_type 
ON public.cash_ops (session_id, type) 
INCLUDE (amount, amount_bs);

CREATE INDEX IF NOT EXISTS idx_cxc_pending_due 
ON public.accounts_receivable (due_date, status) 
WHERE status IN ('pendiente', 'parcial');

CREATE INDEX IF NOT EXISTS idx_cxp_pending_due 
ON public.accounts_payable (due_date, status) 
WHERE status IN ('pendiente', 'parcial');
