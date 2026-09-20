/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  active?: boolean;
  created_at?: string;
}

export interface Brand {
  id: string;
  name: string;
  logo_url: string;
  active?: boolean;
  created_at?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  offer_price: number | null;
  stock: number;
  category_id: string;
  category?: string;
  brand_id: string;
  featured: boolean;
  active: boolean;
  technical_sheet_url: string | null;
  barcode_qr: string | null;
  rating_stars?: number;
  rating_count?: number;
  cost_price?: number | null;
  unit?: string | null;
  units?: string | null;
  margin_1?: number | null;
  margin_2?: number | null;
  margin_3?: number | null;
  selected_margin_type?: 1 | 2 | 3 | string | number | null;
  tax_id?: string | null;
  tax_rate?: number | null;
  expiration_date?: string | null;
  critical_stock?: number | null;
  location?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductMovementLog {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  type: 'ingreso' | 'egreso' | 'ajuste' | 'venta' | 'compra' | 'nota_entrega' | 'pedido' | 'devolucion';
  quantity: number; // positive for entry, negative for output
  previous_stock: number;
  new_stock: number;
  concept: string;
  reference_id?: string;
  reference_type?: string;
  unit_price?: number;
  total_amount?: number;
  user_name?: string;
  created_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
}

export interface StoreUser {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  telefono?: string;
  document?: string;
  doc_type?: string;
  doc_number?: string;
  tipo_documento?: string;
  documento?: string;
  password?: string;
  role: 'Gerente' | 'Admin' | 'Cajero' | 'Despachador' | 'Repartidor' | string;
  permissions?: string[];
  is_active: boolean;
  client_code?: string;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'vendedor' | 'cliente';
}

export interface SystemSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  useSupabase: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SplitPaymentDetail {
  method: string;
  currency: 'USD' | 'VES' | 'EUR' | 'COP' | string;
  amount: number; // amount in that payment's currency or active currency
  amount_usd: number; // normalized equivalent in USD
  amount_ves?: number; // normalized equivalent in VES
  amount_eur?: number;
  amount_cop?: number;
  rate?: number;
  reference?: string;
  bank_account_id?: string;
  bankAccountId?: string;
  bank_account_name?: string;
}

export interface Order {
  id?: string;
  customer_name: string;
  phone_number: string;
  customer_email?: string | null;
  delivery_method: 'b2c' | 'retiro';
  address_text: string | null;
  items: {
    product_id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    cost_price?: number | null;
  }[];
  seller_name?: string | null;
  total_price: number;
  status: string;
  created_at?: string;
  comments?: string | null;
  payment_method?: 'pagomovil' | 'efectivo' | 'transferencia' | string | null;
  payment_amount_with?: number | null;
  payment_status?: string | null;
  points?: number | null;
  order_number?: number;
  discount_code?: string | null;
  discount_amount?: number | null;
  currency_code?: string | null;
  currency_rates_snapshot?: Record<string, number> | null;
  totals_by_currency?: Record<string, number> | null;
  bcv_rate?: number | null;
  split_payments?: SplitPaymentDetail[] | null;
}

export interface Provider {
  id: string;
  code: string;
  rif: string;
  name: string;      // Razón social
  type: string;      // Tipo (Natural, Jurídico, etc.)
  phone: string;     // Teléfono
  bank_name: string; // Banco
  created_at?: string;
}

export interface PurchaseItem {
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  previous_stock?: number;
  new_stock?: number;
}

export interface PurchaseInstallment {
  id?: string;
  number: number;
  due_date: string;
  amount: number;
  status: 'pendiente' | 'pagado';
  paid_amount?: number;
  paid_at?: string;
  payment_method?: string;
  notes?: string;
}

export interface Purchase {
  id: string;
  purchase_number?: string;
  invoice_number: string;
  provider_id?: string;
  provider_name: string;
  provider_rif?: string;
  date: string;
  items: PurchaseItem[];
  total_amount: number;
  total_items?: number;
  payment_method?: 'Efectivo USD' | 'Efectivo Bs' | 'Transferencia' | 'Pago Móvil' | 'Punto de Venta' | 'Zelle' | 'Crédito / CXP' | string;
  payment_status?: 'pagado' | 'pendiente' | 'parcial' | string;
  paid_amount?: number;
  initial_payment?: number;
  due_date?: string;
  installments_count?: number;
  installments?: PurchaseInstallment[];
  status?: 'completada' | 'anulada' | 'pendiente' | string;
  notes?: string;
  update_cost_applied?: boolean;
  created_at?: string;
  created_by?: string;
}

export interface AccountPayablePayment {
  id: string;
  cxp_id?: string;
  account_payable_id?: string;
  installment_number?: number;
  amount: number;
  amount_bs?: number;
  payment_method: string;
  bank_account_id?: string;
  payment_date: string;
  reference?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export interface AccountPayable {
  id: string;
  purchase_id?: string;
  invoice_number?: string;
  subject?: string;
  entity_name?: string;
  provider_id?: string;
  provider_name: string;
  provider_rif?: string;
  description?: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  currency?: string;
  bcv_rate?: number;
  status: 'pendiente' | 'parcial' | 'pagado' | 'vencido';
  issue_date?: string;
  due_date?: string;
  installments_count?: number;
  installments?: PurchaseInstallment[];
  payments?: AccountPayablePayment[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AccountReceivablePayment {
  id: string;
  cxc_id?: string;
  account_receivable_id?: string;
  installment_number?: number;
  amount: number;
  amount_bs?: number;
  payment_method: string;
  bank_account_id?: string;
  payment_date: string;
  reference?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export interface AccountReceivable {
  id: string;
  order_id?: string;
  quote_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  subject?: string;
  entity_name?: string;
  client_id?: string;
  client_name?: string;
  client_phone?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_document?: string;
  description?: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  currency?: string;
  bcv_rate?: number;
  status: 'pendiente' | 'parcial' | 'pagado' | 'cobrado' | 'vencido';
  issue_date?: string;
  due_date?: string;
  installments_count?: number;
  installments?: PurchaseInstallment[];
  payments?: AccountReceivablePayment[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscountCode {
  id?: string;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  target_type: 'order' | 'specific_products';
  target_products: string[] | null;
  start_date: string | null;
  end_date: string | null;
  usage_limit_type: 'unlimited' | 'limited';
  usage_limit: number | null;
  used_count: number;
  min_purchase_amount: number | null;
  customer_eligibility: 'all' | 'new';
  uses_per_customer: 'unlimited' | 'once';
  show_in_digital_menu: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface LoyaltySettings {
  id?: string;
  is_active: boolean;
  points_per_amount: number;
  amount_for_points: number;
}

export interface QuoteItem {
  product_id?: string | null;
  name: string;
  sku?: string;
  quantity: number;
  price: number;
  is_custom?: boolean;
}

export interface Quote {
  id: string;
  quote_number: string;
  client_id?: string | null;
  client_name: string;
  client_phone: string;
  client_email?: string | null;
  seller_name?: string;
  concept: string;
  creation_type?: 'catalogo' | 'libre' | 'mixto';
  items: QuoteItem[];
  subtotal_price?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_price: number;
  status: 'creada' | 'pendiente' | 'expirada' | 'vendida' | 'facturada' | 'rechazada' | 'aprobada';
  created_at: string;
  expiration_date?: string | null;
  expiration_days?: string;
  updated_at?: string;
  notes?: string | null;
  order_id?: string | null; // Once billed, links to the order
}

export interface LoyaltyReward {
  id?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  points_cost: number;
  terms_conditions: string;
}

export interface CustomerPoints {
  phone_number: string;
  points: number;
}

export interface ClientUser {
  id?: string;
  tipo_documento: 'V' | 'E' | 'J' | 'G' | 'P' | string;
  documento: string;
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  password?: string;
  estado: boolean;
  email_verificado: boolean;
  direccion?: string;
  created_at?: string;
  failed_attempts?: number;
  locked_until?: string | null;
}

export interface AuthSession {
  id: string;
  usuario_tipo: 'interno' | 'cliente';
  usuario_id: string;
  usuario_email: string;
  token: string;
  ip: string;
  navegador: string;
  fecha_inicio: string;
  fecha_expira: string;
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  user_type: 'interno' | 'cliente';
  user_email: string;
  action: 'login' | 'failed_login' | 'register' | 'logout' | 'password_reset' | 'lockout' | string;
  ip: string;
  details: string;
}

export interface CustomerQuote {
  id: string;
  customer_email: string;
  title: string;
  items_description: string;
  estimated_price: number;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  created_at: string;
}

export interface WishlistItem {
  id: string;
  user_email: string;
  product_id: string;
  created_at: string;
}

export interface BannerSlide {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  image_url: string;
  button_text?: string;
  target_category?: string;
  target_offer?: boolean;
  active: boolean;
  sort_order: number;
}

export interface LandingConfig {
  id?: string;
  is_active: boolean;
  title: string;
  subtitle: string;
  badge: string;
  image_url: string;
  button_text: string;
}

export interface HomeCarouselCardItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  enabled?: boolean;
  sort_order: number;
}

export interface Tax {
  id: string;
  name: string;
  rate: number;
  is_active: boolean;
  created_at?: string;
}

export interface PaymentMethodConfig {
  id: string;
  code: string;
  name: string;
  currency: 'VES' | 'USD' | 'EUR' | 'COP' | 'MULTIMONEDA' | string;
  type: 'movil' | 'efectivo' | 'transferencia' | 'punto' | 'digital' | 'otro';
  description?: string;
  instructions?: string;
  account_details?: string;
  bank_account_id?: string;
  bank_account_name?: string;
  incoming_commission?: number;
  outgoing_commission?: number;
  is_active: boolean;
  requires_reference?: boolean;
  allow_pos?: boolean;
  allow_online?: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface CashSession {
  id: string;
  empleado_nombre?: string;
  empleado_id?: string;
  apertura: string;
  cierre?: string;
  apertura_bs: number;
  apertura_usd: number;
  cierre_bs?: number | null;
  cierre_usd?: number | null;
  esperado_bs?: number | null;
  esperado_usd?: number | null;
  diferencia_bs?: number | null;
  diferencia_usd?: number | null;
  estado: 'abierta' | 'cerrada';
  estado_arqueo?: 'cuadrada' | 'descuadre_faltante' | 'descuadre_sobrante' | string | null;
  observaciones?: string | null;
  created_at?: string;
}

export interface CashOp {
  id: string;
  session_id?: string | null;
  empleado_nombre?: string | null;
  type: 'ingreso' | 'egreso';
  concept: string;
  amount: number; // in USD
  amount_bs: number; // in VES
  amount_eur?: number; // in EUR
  amount_cop?: number; // in COP
  currency_code?: string | null;
  currency_rates_snapshot?: Record<string, number> | null;
  payment_method?: string | null;
  split_payments?: SplitPaymentDetail[] | null;
  category?: string | null;
  observation?: string | null;
  time?: string;
  created_at?: string;
}

export interface Invoice {
  id?: string;
  document_type?: 'factura' | 'nota_entrega' | string;
  control_number?: string;
  invoice_number?: string;
  customer_name: string;
  customer_rif?: string;
  customer_phone?: string;
  customer_address?: string;
  payment_method: string;
  subtotal: number;
  discount?: number;
  discount_code?: string | null;
  iva: number;
  igtf?: number;
  total: number;
  items: any[];
  notes?: string;
  taxes_detail?: any[];
  bcv_rate?: number;
  currency_code?: string;
  currency_rates_snapshot?: Record<string, number>;
  totals_by_currency?: Record<string, number>;
  split_payments?: SplitPaymentDetail[];
  bank_account_id?: string;
  bank_account_name?: string;
  created_at?: string;
  created_by?: string;
  status?: string;
  session_id?: string;
}

export interface ReportModuleConfig {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  section: 'graficas' | 'comparativos' | 'detalle';
  sort_order: number;
}

export interface BusinessProfile {
  id?: string;
  name: string;
  business_type: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  rif: string;
  website: string;
  logo_url: string;
  tax_id?: string | null;
  slogan?: string;
  saas_plan?: 'gratuito' | 'basico' | 'pro' | 'enterprise' | string;
  updated_at?: string;
}

export interface BusinessBranch {
  id: string;
  code: string;
  name: string;
  address: string;
}

export interface CashOp {
  id: string;
  session_id?: string | null;
  empleado_nombre?: string | null;
  type: 'ingreso' | 'egreso';
  concept: string;
  amount: number; // in USD
  amount_bs: number; // in VES
  amount_eur?: number; // in EUR
  amount_cop?: number; // in COP
  currency_code?: string | null;
  currency_rates_snapshot?: Record<string, number> | null;
  payment_method?: string | null;
  split_payments?: SplitPaymentDetail[] | null;
  category?: string | null;
  observation?: string | null;
  time?: string;
  created_at?: string;
}

export interface Invoice {
  id?: string;
  document_type?: 'factura' | 'nota_entrega' | string;
  control_number?: string;
  invoice_number?: string;
  customer_name: string;
  customer_rif?: string;
  customer_phone?: string;
  customer_address?: string;
  payment_method: string;
  subtotal: number;
  discount?: number;
  discount_code?: string | null;
  iva: number;
  igtf?: number;
  total: number;
  items: any[];
  notes?: string;
  taxes_detail?: any[];
  bcv_rate?: number;
  currency_code?: string;
  currency_rates_snapshot?: Record<string, number>;
  totals_by_currency?: Record<string, number>;
  split_payments?: SplitPaymentDetail[];
  created_at?: string;
  created_by?: string;
  status?: string;
  session_id?: string;
}

export interface ReportModuleConfig {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  section: 'graficas' | 'comparativos' | 'detalle';
  sort_order: number;
}

export interface BusinessProfile {
  id?: string;
  name: string;
  business_type: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  rif: string;
  website: string;
  logo_url: string;
  tax_id?: string | null;
  slogan?: string;
  saas_plan?: 'gratuito' | 'basico' | 'pro' | 'enterprise' | string;
  updated_at?: string;
}

export interface BusinessBranch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone?: string;
  active: boolean;
  created_at?: string;
}

export interface BusinessTerminal {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  active: boolean;
  created_at?: string;
}

// ─── Financial Interfaces ───────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  account_number?: string;
  account_type?: 'corriente' | 'ahorro' | 'caja' | 'digital' | 'wallet' | string;
  currency: 'USD' | 'VES' | 'EUR' | 'COP' | string;
  balance: number;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  alias_ids?: string[];
}

export interface BankTransfer {
  id?: string;
  from_account_id?: string;
  to_account_id?: string;
  from_account_name?: string;
  to_account_name?: string;
  amount: number;
  amount_bs?: number;
  currency: string;
  exchange_rate?: number;
  converted_amount?: number;
  reference?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export interface GastoFijo {
  id: string;
  name: string;
  category: string;
  description?: string;
  amount: number;      // en USD
  amount_bs?: number;  // en VES
  type: 'fijo' | 'variable';
  frequency?: 'semanal' | 'quincenal' | 'mensual' | 'anual' | 'unico' | string;
  payment_method?: string;
  bank_account_id?: string;
  bank_account_name?: string;
  next_due_date?: string;
  last_paid_date?: string;
  status: 'pendiente' | 'pagado' | 'vencido' | 'parcial';
  reference?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GastoFijoPayment {
  id?: string;
  gasto_fijo_id: string;
  gasto_name?: string;
  amount: number;      // en USD
  amount_bs?: number;  // en VES
  payment_method: string;
  bank_account_id?: string;
  bank_account_name?: string;
  payment_date: string;
  reference?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export interface SystemCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
  is_active: boolean;
  is_main?: boolean;
  country_code?: string;
  decimals?: number;
  position?: 'prefix' | 'suffix';
  created_at?: string;
  updated_at?: string;
}

export type AdminMenuType = 
  | 'indicadores'
  | 'sales' 
  | 'orders' 
  | 'cotizaciones' 
  | 'sales_report'
  | 'products' 
  | 'movimiento'
  | 'compras' 
  | 'caja' 
  | 'cuentas_bancarias' 
  | 'balance' 
  | 'reportes_cuentas'
  | 'gastos' 
  | 'marketing' 
  | 'reportes' 
  | 'reportes_balance' 
  | 'reportes_gastos' 
  | 'reportes_ganancias' 
  | 'clientes' 
  | 'proveedores' 
  | 'clientes_proveedores' 
  | 'settings' 
  | 'users' 
  | 'audit';

