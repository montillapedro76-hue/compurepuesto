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
  brand_id: string;
  featured: boolean;
  active: boolean;
  technical_sheet_url: string | null;
  barcode_qr: string | null;
  rating_stars?: number;
  rating_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
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

export interface Order {
  id?: string;
  customer_name: string;
  phone_number: string;
  customer_email?: string | null;
  delivery_method: 'b2c' | 'retiro' | 'pos';
  address_text: string | null;
  items: {
    product_id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
  }[];
  total_price: number;
  currency_code?: string;
  applied_exchange_rate?: number;
  total_usd?: number;
  total_ves?: number;
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
}

export interface LedgerEntry {
  id: string;
  transaction_type: 'VENTA_POS' | 'COBRO_CXC' | 'PAGO_CXP' | 'GASTO_CAJA' | 'TRANSFERENCIA';
  reference_id?: string;
  account_id?: string;
  session_id?: string;
  entry_type: 'DEBITO' | 'CREDITO';
  amount_usd: number;
  amount_ves: number;
  exchange_rate: number;
  concept: string;
  created_by?: string;
  created_at?: string;
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

