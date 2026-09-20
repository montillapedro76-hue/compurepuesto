/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { 
  Category, Brand, Product, ProductImage, SystemSettings, Order, Provider, Purchase, PurchaseItem, PurchaseInstallment,
  AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment,
  BankAccount, BankTransfer, GastoFijo, GastoFijoPayment,
  DiscountCode, LoyaltySettings, LoyaltyReward, StoreUser, WishlistItem, 
  BannerSlide, LandingConfig, HomeCarouselCardItem, Quote, QuoteItem, Tax, 
  PaymentMethodConfig, Invoice,
  ReportModuleConfig, BusinessProfile, BusinessBranch, BusinessTerminal,
  ProductMovementLog, SystemCurrency 
} from '../types';
import { sortProductsByPriority } from './searchUtils';
import { notifyProcedureExecuted } from './bcvRateChecker';
import { getCachedCurrencyRates, saveCachedCurrencyRates, DEFAULT_RATES, registerDynamicCurrency } from './currency';

// Helper to robustly parse items that may be stringified or double-stringified, and normalize all product/item fields
export const parseInvoiceItems = (itemsVal: any, fallbackInvoice?: any): any[] => {
  let list: any[] = [];
  if (Array.isArray(itemsVal)) {
    list = itemsVal;
  } else if (itemsVal) {
    try {
      let parsed = typeof itemsVal === 'string' ? JSON.parse(itemsVal) : itemsVal;
      let limit = 5; // Prevent infinite loop in case of weird cycles
      while (typeof parsed === 'string' && limit > 0) {
        parsed = JSON.parse(parsed);
        limit--;
      }
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        list = [parsed];
      }
    } catch (e) {
      console.error("Error parsing invoice items:", e);
    }
  }

  // Normalize each item to ensure all name/sku/price/total fields are consistently populated
  let normalized = list.map((it: any, index: number) => {
    if (!it || typeof it !== 'object') {
      return {
        id: `item-${index}`,
        product_id: `prod-${index}`,
        name: String(it || 'Producto / Servicio'),
        sku: '',
        qty: 1,
        price: 0,
        price_usd: 0,
        total: 0,
        subtotal: 0,
        tax_id: 'exento',
        tax_rate: 0,
        tax_amount: 0
      };
    }
    const name = it.name || it.product_name || it.nombre || it.concept || it.description || it.descripcion || it.title || `Producto ${index + 1}`;
    const qty = Number(it.qty ?? it.quantity ?? it.cantidad ?? it.cant ?? 1) || 1;
    const price = Number(it.price ?? it.price_usd ?? it.precio ?? it.precio_usd ?? it.unit_price ?? it.cost ?? (it.total && qty ? it.total / qty : 0)) || 0;
    const total = Number(it.total ?? it.subtotal ?? it.monto ?? (price * qty)) || (price * qty);
    const sku = it.sku || it.code || it.codigo || it.product_id || '';
    const taxRate = Number(it.tax_rate ?? (it.tax_id && it.tax_id !== 'exento' ? 16 : 0)) || 0;
    const taxId = it.tax_id || (taxRate > 0 ? 'iva-16' : 'exento');
    const taxAmount = Number(it.tax_amount ?? (total * (taxRate / 100))) || 0;

    return {
      id: it.id || `item-${index}-${Date.now()}`,
      product_id: it.product_id || it.id || `item-${index}`,
      name,
      sku,
      qty,
      price,
      price_usd: price,
      total,
      subtotal: total,
      tax_id: taxId,
      tax_rate: taxRate,
      tax_amount: taxAmount
    };
  });

  // If no items were parsed but we have invoice metadata (e.g. from cash register or summary flash sales), generate a fallback line item
  if (normalized.length === 0 && fallbackInvoice) {
    const totalVal = Number(fallbackInvoice.total ?? fallbackInvoice.subtotal ?? fallbackInvoice.amount ?? 0);
    const subtotalVal = Number(fallbackInvoice.subtotal ?? fallbackInvoice.total ?? totalVal);
    const isNota = fallbackInvoice.document_type === 'nota_entrega' || (fallbackInvoice.control_number && String(fallbackInvoice.control_number).startsWith('NE-'));
    const rawConcept = fallbackInvoice.notes || fallbackInvoice.concept || fallbackInvoice.description || '';
    
    // Clean concept if it's a technical cash op string like "Venta Flash - Factura FAC-1408 (Consumidor final)"
    let conceptName = rawConcept;
    const matchTech = conceptName.match(/^Venta Flash\s*-\s*(?:Factura|Nota de Entrega)\s+[A-Z0-9-]+\s*(?:\([^)]*\))?\s*(?:-\s*(.*))?$/i);
    if (matchTech) {
      conceptName = matchTech[1]?.trim() || (isNota ? 'Servicios de Copiado e Impresión' : 'Venta de Productos y Papelería');
    } else if (conceptName.toLowerCase().startsWith('venta factura') || conceptName.toLowerCase().startsWith('venta nota')) {
      conceptName = isNota ? 'Servicios de Copiado e Impresión' : 'Venta de Productos y Papelería';
    }
    if (!conceptName) {
      conceptName = isNota ? 'Nota de Entrega - Servicios / Productos' : 'Factura de Venta - Papelería y Servicios';
    }

    if (totalVal > 0 || conceptName) {
      normalized = [{
        id: `fallback-item-1`,
        product_id: 'flash-default',
        name: conceptName,
        sku: 'VENTA-FLASH',
        qty: 1,
        price: subtotalVal || totalVal,
        price_usd: subtotalVal || totalVal,
        total: totalVal,
        subtotal: subtotalVal,
        tax_id: Number(fallbackInvoice.iva || 0) > 0 ? 'iva-16' : 'exento',
        tax_rate: Number(fallbackInvoice.iva || 0) > 0 ? 16 : 0,
        tax_amount: Number(fallbackInvoice.iva || 0)
      }];
    }
  }

  return normalized;
};

// Helper to validate whether a string is a valid HTTP or HTTPS URL
export const isValidHttpUrl = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
};

// Helper to sanitize Supabase URL (strips trailing slashes, /rest/v1, and ensures http/https scheme)
export const sanitizeSupabaseUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  let cleaned = url.trim();
  if (!cleaned) return '';

  // If missing protocol, prepend https://
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  if (cleaned.endsWith('/rest/v1')) {
    cleaned = cleaned.slice(0, -8);
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
};

const DEFAULT_SUPABASE_URL = 'https://absmxrciaasihyqpinlm.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_rn_0iwmTGj_z1ZaneXBdpw_eSvlUIU_';

// Read configuration from localStorage or initial environment
const getInitialSettings = (): SystemSettings => {
  try {
    const saved = localStorage.getItem('copias_bellavista_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const rawUrl = parsed.supabaseUrl ? String(parsed.supabaseUrl).trim() : '';
      const sanitized = sanitizeSupabaseUrl(rawUrl);
      const validUrl = isValidHttpUrl(sanitized) ? sanitized : DEFAULT_SUPABASE_URL;
      const rawKey = parsed.supabaseAnonKey ? String(parsed.supabaseAnonKey).trim() : '';
      const validKey = rawKey || DEFAULT_SUPABASE_KEY;

      return {
        supabaseUrl: validUrl,
        supabaseAnonKey: validKey,
        useSupabase: parsed.useSupabase !== undefined ? parsed.useSupabase === true : true
      };
    }
  } catch (e) {
    console.error("Error reading settings", e);
  }

  const envUrl = (import.meta as any).env.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
  const sanitizedEnv = envUrl ? sanitizeSupabaseUrl(String(envUrl).trim()) : '';

  return {
    supabaseUrl: isValidHttpUrl(sanitizedEnv) ? sanitizedEnv : DEFAULT_SUPABASE_URL,
    supabaseAnonKey: envKey ? String(envKey).trim() : DEFAULT_SUPABASE_KEY,
    useSupabase: true
  };
};

export const currentSettings = getInitialSettings();

// Safe initialization of Supabase client preventing uncaught errors if URL is invalid
const createSafeSupabaseClient = () => {
  if (!currentSettings.useSupabase) return null;

  const targetUrl = sanitizeSupabaseUrl(currentSettings.supabaseUrl);
  const targetKey = (currentSettings.supabaseAnonKey || '').trim();

  if (isValidHttpUrl(targetUrl) && targetKey) {
    try {
      return createClient(targetUrl, targetKey);
    } catch (e) {
      console.warn("Error creating Supabase client with configured URL, falling back to default:", e);
    }
  }

  // Fallback to default verified URL and key
  if (isValidHttpUrl(DEFAULT_SUPABASE_URL) && DEFAULT_SUPABASE_KEY) {
    try {
      return createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
    } catch (fallbackError) {
      console.error("Critical error creating fallback Supabase client:", fallbackError);
    }
  }

  return null;
};

// Initialize actual Supabase client safely
export const supabase = createSafeSupabaseClient();

// Setup real-time listener for currency_rates and bcv_rates to update in real time across the app
if (supabase && typeof window !== 'undefined') {
  try {
    supabase
      .channel('realtime_bcv_and_currency_rates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'currency_rates' }, (payload: any) => {
        if (payload.new && payload.new.code === 'VES' && payload.new.rate) {
          const newRate = Number(payload.new.rate);
          const cached = getCachedCurrencyRates();
          cached.VES = newRate;
          saveCachedCurrencyRates(cached);
          window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: newRate } }));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bcv_rates' }, (payload: any) => {
        if (payload.new && payload.new.rate) {
          const newRate = Number(payload.new.rate);
          const cached = getCachedCurrencyRates();
          cached.VES = newRate;
          saveCachedCurrencyRates(cached);
          window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: newRate } }));
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('Could not initialize realtime listener for BCV rates:', err);
  }
}

// Initial Local Storage setup for settings and repair if corrupted
const initializeLocalDb = () => {
  try {
    const saved = localStorage.getItem('copias_bellavista_settings');
    if (!saved) {
      localStorage.setItem('copias_bellavista_settings', JSON.stringify({
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseAnonKey: DEFAULT_SUPABASE_KEY,
        useSupabase: true
      }));
    } else {
      const parsed = JSON.parse(saved);
      const sanitized = sanitizeSupabaseUrl(parsed.supabaseUrl || '');
      if (!isValidHttpUrl(sanitized)) {
        console.warn("Invalid supabaseUrl found in localStorage, repairing with default credentials.");
        parsed.supabaseUrl = DEFAULT_SUPABASE_URL;
        if (!parsed.supabaseAnonKey) parsed.supabaseAnonKey = DEFAULT_SUPABASE_KEY;
        localStorage.setItem('copias_bellavista_settings', JSON.stringify(parsed));
      }
    }
  } catch (e) {
    console.warn("Notice checking settings in localStorage:", e);
  }
};

initializeLocalDb();

// Helper to rebuild address_text with parsed extras serialized cleanly
const rebuildAddressWithExtras = (
  currentAddress: string,
  extras: {
    payment_method?: string;
    payment_amount_with?: number;
    comments?: string;
    payment_status?: string;
    customer_email?: string;
  }
) => {
  let cleanAddress = (currentAddress || '')
    .replace(/\[Método Pago:[^\]\n]+\]/g, '')
    .replace(/\[Paga con:[^\]\n]+\]/g, '')
    .replace(/\[Comentarios:[^\]\n]+\]/g, '')
    .replace(/\[Estado Pago:[^\]\n]+\]/g, '')
    .replace(/\[Email:[^\]\n]+\]/g, '')
    .trim();

  let serializedExtra = '';
  if (extras.payment_method) serializedExtra += `\n[Método Pago: ${extras.payment_method}]`;
  if (extras.payment_amount_with) serializedExtra += `\n[Paga con: US$ ${extras.payment_amount_with}]`;
  if (extras.comments) serializedExtra += `\n[Comentarios: ${extras.comments}]`;
  if (extras.payment_status) serializedExtra += `\n[Estado Pago: ${extras.payment_status}]`;
  if (extras.customer_email) serializedExtra += `\n[Email: ${extras.customer_email}]`;

  return `${cleanAddress}${serializedExtra}`.trim();
};

// Helpers to serialize and deserialize client email and address within the phone field
const parsePhoneExtras = (phoneStr: string) => {
  const raw = (phoneStr || '').trim();
  let phone = raw;
  let email = '';
  let address = '';

  const emailMatch = raw.match(/\|\s*email:\s*([^|\n]+)/i);
  if (emailMatch) {
    email = emailMatch[1].trim().toLowerCase();
  }

  const addressMatch = raw.match(/\|\s*address:\s*([^|\n]+)/i);
  if (addressMatch) {
    address = addressMatch[1].trim();
  }

  // Clean phone by removing any "| email:..." and "| address:..."
  phone = raw
    .replace(/\|\s*email:[^|]*/gi, '')
    .replace(/\|\s*address:[^|]*/gi, '')
    .trim();

  return { phone, email, address };
};

const serializePhoneWithExtras = (phone: string, email?: string, address?: string) => {
  const parsed = parsePhoneExtras(phone || '');
  const cleanPhone = (parsed.phone || '').trim();
  const cleanEmail = (email !== undefined ? email : parsed.email || '').trim().toLowerCase();
  const cleanAddress = (address !== undefined ? address : parsed.address || '').trim();

  let res = cleanPhone;
  if (cleanEmail) {
    res += ` | email:${cleanEmail}`;
  }
  if (cleanAddress) {
    res += ` | address:${cleanAddress}`;
  }
  return res;
};

// ==========================================
// DB SERVICE METHODS (REAL DATABASE)
// ==========================================

export function isUUID(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function getDefaultPermissionsForRole(role?: string): string[] {
  const r = (role || '').toLowerCase();
  if (r === 'gerente' || r === 'admin' || r === 'administrador' || r === 'propietario') {
    return ['orders', 'sales', 'products', 'caja', 'clientes', 'proveedores', 'compras', 'reportes', 'settings', 'marketing'];
  }
  if (r === 'cajero' || r === 'vendedor') {
    return ['orders', 'sales', 'caja', 'clientes'];
  }
  if (r === 'despachador') {
    return ['products'];
  }
  if (r === 'repartidor') {
    return ['orders'];
  }
  return ['orders', 'sales', 'products', 'caja', 'clientes'];
}

export const dbService = {
  supabase,

  getDefaultPermissionsForRole(role?: string): string[] {
    return getDefaultPermissionsForRole(role);
  },

  // Get active settings
  getSettings(): SystemSettings {
    return getInitialSettings();
  },

  // Save active settings
  saveSettings(settings: SystemSettings) {
    localStorage.setItem('copias_bellavista_settings', JSON.stringify(settings));
    // Reload page to re-evaluate Supabase client creation
    window.location.reload();
  },

  // Helper for offline data
  _getLocalFallback<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem('copias_bellavista_' + key);
      if (stored) return JSON.parse(stored) as T;
    } catch (e) {
      console.warn(`Error reading local fallback for ${key}:`, e);
    }
    return defaultValue;
  },

  // Category Operations
  async getCategories(): Promise<Category[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) {
        console.warn("Notice fetching categories:", error.message || error);
        return [];
      }
      return (data || []) as Category[];
    } catch (e) {
      console.warn("getCategories exception:", e);
      return [];
    }
  },

  async createCategory(category: Omit<Category, 'id'>): Promise<Category> {
    if (!supabase) throw new Error('Supabase is not configured');
    const newCategory: Category = {
      ...category,
      id: crypto.randomUUID()
    };
    const { data, error } = await supabase.from('categories').insert([newCategory]).select();
    if (error) throw error;
    return data[0] as Category;
  },

  async updateCategory(id: string, category: Partial<Category>): Promise<Category> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.from('categories').update(category).eq('id', id).select();
    if (error) throw error;
    return data[0] as Category;
  },

  async deleteCategory(id: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // Brand Operations
  async getBrands(): Promise<Brand[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('brands').select('*').order('name');
      if (error) {
        console.warn("Notice fetching brands:", error.message || error);
        return [];
      }
      return (data || []) as Brand[];
    } catch (e) {
      console.warn("getBrands exception:", e);
      return [];
    }
  },

  async createBrand(brand: Omit<Brand, 'id'>): Promise<Brand> {
    if (!supabase) throw new Error('Supabase is not configured');
    const newBrand: Brand = {
      ...brand,
      id: crypto.randomUUID()
    };
    const { data, error } = await supabase.from('brands').insert([newBrand]).select();
    if (error) throw error;
    return data[0] as Brand;
  },

  async updateBrand(id: string, brand: Partial<Brand>): Promise<Brand> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.from('brands').update(brand).eq('id', id).select();
    if (error) throw error;
    return data[0] as Brand;
  },

  async deleteBrand(id: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async getProductsPaginated(params: {
    page: number;
    pageSize: number;
    searchTerm?: string;
    categoryId?: string;
    brandId?: string;
    onlyAvailable?: boolean;
    onlyFeatured?: boolean;
    onlyOffers?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<{ data: Product[], count: number }> {
    if (!supabase) return { data: [], count: 0 };
    
    let categoriesList: Category[] = [];
    let brandsList: Brand[] = [];
    let matchedCategoryIds: string[] = [];
    let matchedBrandIds: string[] = [];

    const term = (params.searchTerm || '').trim();

    if (term) {
      try {
        const [{ data: cats }, { data: brs }] = await Promise.all([
          supabase.from('categories').select('*'),
          supabase.from('brands').select('*')
        ]);
        categoriesList = (cats || []) as Category[];
        brandsList = (brs || []) as Brand[];

        matchedCategoryIds = categoriesList
          .filter(c => (c.name || '').toLowerCase().includes(term.toLowerCase()))
          .map(c => c.id);

        matchedBrandIds = brandsList
          .filter(b => (b.name || '').toLowerCase().includes(term.toLowerCase()))
          .map(b => b.id);
      } catch (err) {
        console.warn("Could not load categories/brands for search expansion:", err);
      }
    }

    const buildQuery = (includeBarcode: boolean) => {
      let query = supabase.from('products').select('*', { count: 'exact' });
      query = query.eq('active', true);

      if (term) {
        const orParts = [
          `name.ilike.%${term}%`,
          `description.ilike.%${term}%`,
          `sku.ilike.%${term}%`
        ];

        if (includeBarcode) {
          orParts.push(`barcode_qr.ilike.%${term}%`);
        }

        matchedCategoryIds.forEach(id => {
          orParts.push(`category_id.eq.${id}`);
        });

        matchedBrandIds.forEach(id => {
          orParts.push(`brand_id.eq.${id}`);
        });

        query = query.or(orParts.join(','));
      }
      if (params.categoryId && params.categoryId !== 'all') {
        query = query.eq('category_id', params.categoryId);
      }
      if (params.brandId && params.brandId !== 'all') {
        query = query.eq('brand_id', params.brandId);
      }
      if (params.onlyAvailable) {
        query = query.gt('stock', 0);
      }
      if (params.onlyFeatured) {
        query = query.eq('featured', true);
      }
      if (params.onlyOffers) {
        query = query.not('offer_price', 'is', null);
      }
      if (params.minPrice !== undefined && params.minPrice > 0) {
        query = query.gte('price', params.minPrice);
      }
      if (params.maxPrice !== undefined && params.maxPrice < 1000) {
        query = query.lte('price', params.maxPrice);
      }

      query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });

      const from = params.page * params.pageSize;
      const to = from + params.pageSize - 1;
      return query.range(from, to);
    };

    try {
      let { data, error, count } = await buildQuery(true);
      if (error) {
        if (error.code === '42703' || error.message?.includes('barcode_qr')) {
          // Retry without barcode_qr column
          const retry = await buildQuery(false);
          if (!retry.error) {
            data = retry.data;
            count = retry.count;
          }
        } else {
          console.error("Error in getProductsPaginated:", error);
          return { data: [], count: 0 };
        }
      }

      const storedMeta = this.getStoredProductMeta();
      const isForbiddenLoc = (loc?: string | null): boolean => {
        if (!loc) return true;
        const l = loc.toLowerCase().trim();
        return l.includes('caja principal') || l.includes('caja copias') || l.includes('sede principal - almacen') || l.includes('sede principal - almacén');
      };

      const productsList = (data || []).map((p: any) => {
        const meta = storedMeta[p.id] || {};
        const metaLoc = (meta.location && !isForbiddenLoc(meta.location)) ? meta.location : null;
        const dbLoc = (p.location && !isForbiddenLoc(p.location)) ? p.location : null;

        const dbCost = (p.cost_price !== undefined && p.cost_price !== null && Number(p.cost_price) > 0) ? Number(p.cost_price) : null;
        const metaCost = (meta.cost_price !== undefined && meta.cost_price !== null) ? Number(meta.cost_price) : null;
        const costPrice = dbCost ?? metaCost ?? (p.cost_price !== undefined && p.cost_price !== null ? Number(p.cost_price) : 0);

        const dbMargin1 = (p.margin_1 !== undefined && p.margin_1 !== null && Number(p.margin_1) > 0) ? Number(p.margin_1) : null;
        const metaMargin1 = (meta.margin_1 !== undefined && meta.margin_1 !== null) ? Number(meta.margin_1) : null;
        const margin1 = dbMargin1 ?? metaMargin1 ?? (p.margin_1 !== undefined && p.margin_1 !== null ? Number(p.margin_1) : 30);

        const dbMargin2 = (p.margin_2 !== undefined && p.margin_2 !== null && Number(p.margin_2) > 0) ? Number(p.margin_2) : null;
        const metaMargin2 = (meta.margin_2 !== undefined && meta.margin_2 !== null) ? Number(meta.margin_2) : null;
        const margin2 = dbMargin2 ?? metaMargin2 ?? (p.margin_2 !== undefined && p.margin_2 !== null ? Number(p.margin_2) : 30);

        const dbMargin3 = (p.margin_3 !== undefined && p.margin_3 !== null && Number(p.margin_3) > 0) ? Number(p.margin_3) : null;
        const metaMargin3 = (meta.margin_3 !== undefined && meta.margin_3 !== null) ? Number(meta.margin_3) : null;
        const margin3 = dbMargin3 ?? metaMargin3 ?? (p.margin_3 !== undefined && p.margin_3 !== null ? Number(p.margin_3) : 30);

        return {
          ...p,
          cost_price: costPrice,
          margin_1: margin1,
          margin_2: margin2,
          margin_3: margin3,
          selected_margin_type: p.selected_margin_type || meta.selected_margin_type || 1,
          unit: p.unit || (p as any).units || meta.unit || meta.units || 'Unidad',
          units: (p as any).units || p.unit || meta.units || meta.unit || 'Unidad',
          barcode_qr: p.barcode_qr || meta.barcode_qr || '',
          location: metaLoc || dbLoc || 'Tienda Bella Vista (SP-01)',
          critical_stock: meta.critical_stock !== undefined ? meta.critical_stock : (p.critical_stock !== undefined && p.critical_stock !== null ? p.critical_stock : 5),
          expiration_date: meta.expiration_date !== undefined ? meta.expiration_date : (p.expiration_date || null),
          tax_id: meta.tax_id || p.tax_id || (p.tax_rate && p.tax_rate > 0 ? 'default-iva' : 'exento'),
          tax_rate: meta.tax_rate !== undefined ? meta.tax_rate : (p.tax_rate !== undefined && p.tax_rate !== null ? parseFloat(p.tax_rate) : 0)
        };
      }) as Product[];

      if (term) {
        const sorted = sortProductsByPriority(productsList, term, categoriesList, brandsList);
        return { data: sorted, count: count || 0 };
      }

      return { data: productsList, count: count || 0 };
    } catch (e) {
      console.error("getProductsPaginated exception:", e);
      return { data: [], count: 0 };
    }
  },

  getStoredProductMeta(): Record<string, Partial<Product>> {
    try {
      const saved = localStorage.getItem('copias_bellavista_prod_meta');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  },

  saveStoredProductMeta(id: string, meta: Partial<Product>): void {
    try {
      const current = this.getStoredProductMeta();
      current[id] = { ...current[id], ...meta };
      localStorage.setItem('copias_bellavista_prod_meta', JSON.stringify(current));
    } catch (e) {
      console.warn("Error saving local product metadata:", e);
    }
  },

  // Product Operations
  async getProducts(): Promise<Product[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
      if (error) {
        console.warn("Notice fetching products:", error.message || error);
        return [];
      }
      const storedMeta = this.getStoredProductMeta();
      const isForbiddenLoc = (loc?: string | null): boolean => {
        if (!loc) return true;
        const l = loc.toLowerCase().trim();
        return l.includes('caja principal') || l.includes('caja copias') || l.includes('sede principal - almacen') || l.includes('sede principal - almacén');
      };

      return (data || []).map((p: any) => {
        const meta = storedMeta[p.id] || {};
        const metaLoc = (meta.location && !isForbiddenLoc(meta.location)) ? meta.location : null;
        const dbLoc = (p.location && !isForbiddenLoc(p.location)) ? p.location : null;

        const dbCost = (p.cost_price !== undefined && p.cost_price !== null && Number(p.cost_price) > 0) ? Number(p.cost_price) : null;
        const metaCost = (meta.cost_price !== undefined && meta.cost_price !== null) ? Number(meta.cost_price) : null;
        const costPrice = dbCost ?? metaCost ?? (p.cost_price !== undefined && p.cost_price !== null ? Number(p.cost_price) : 0);

        const dbMargin1 = (p.margin_1 !== undefined && p.margin_1 !== null && Number(p.margin_1) > 0) ? Number(p.margin_1) : null;
        const metaMargin1 = (meta.margin_1 !== undefined && meta.margin_1 !== null) ? Number(meta.margin_1) : null;
        const margin1 = dbMargin1 ?? metaMargin1 ?? (p.margin_1 !== undefined && p.margin_1 !== null ? Number(p.margin_1) : 30);

        const dbMargin2 = (p.margin_2 !== undefined && p.margin_2 !== null && Number(p.margin_2) > 0) ? Number(p.margin_2) : null;
        const metaMargin2 = (meta.margin_2 !== undefined && meta.margin_2 !== null) ? Number(meta.margin_2) : null;
        const margin2 = dbMargin2 ?? metaMargin2 ?? (p.margin_2 !== undefined && p.margin_2 !== null ? Number(p.margin_2) : 30);

        const dbMargin3 = (p.margin_3 !== undefined && p.margin_3 !== null && Number(p.margin_3) > 0) ? Number(p.margin_3) : null;
        const metaMargin3 = (meta.margin_3 !== undefined && meta.margin_3 !== null) ? Number(meta.margin_3) : null;
        const margin3 = dbMargin3 ?? metaMargin3 ?? (p.margin_3 !== undefined && p.margin_3 !== null ? Number(p.margin_3) : 30);

        return {
          ...p,
          cost_price: costPrice,
          margin_1: margin1,
          margin_2: margin2,
          margin_3: margin3,
          selected_margin_type: p.selected_margin_type || meta.selected_margin_type || 1,
          unit: p.unit || (p as any).units || meta.unit || meta.units || 'Unidad',
          units: (p as any).units || p.unit || meta.units || meta.unit || 'Unidad',
          barcode_qr: p.barcode_qr || meta.barcode_qr || '',
          location: metaLoc || dbLoc || 'Tienda Bella Vista (SP-01)',
          critical_stock: meta.critical_stock !== undefined ? meta.critical_stock : (p.critical_stock !== undefined && p.critical_stock !== null ? p.critical_stock : 5),
          expiration_date: meta.expiration_date !== undefined ? meta.expiration_date : (p.expiration_date || null),
          tax_id: meta.tax_id || p.tax_id || (p.tax_rate && p.tax_rate > 0 ? 'default-iva' : 'exento'),
          tax_rate: meta.tax_rate !== undefined ? meta.tax_rate : (p.tax_rate !== undefined && p.tax_rate !== null ? parseFloat(p.tax_rate) : 0)
        };
      }) as Product[];
    } catch (e) {
      console.warn("getProducts exception:", e);
      return [];
    }
  },

  async createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    if (!supabase) throw new Error('Supabase is not configured');
    const sanitizedProduct = {
      ...product,
      category_id: product.category_id === '' ? null : product.category_id,
      brand_id: product.brand_id === '' ? null : product.brand_id,
      tax_id: product.tax_id || 'exento',
      tax_rate: product.tax_rate !== undefined && product.tax_rate !== null ? Number(product.tax_rate) : 0
    };
    
    // rating_stars and rating_count do not exist in database products table
    delete (sanitizedProduct as any).rating_stars;
    delete (sanitizedProduct as any).rating_count;

    const newProduct = {
      ...sanitizedProduct,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // If barcode_qr is empty or null, remove it from the payload to avoid error if column does not exist
    if (!newProduct.barcode_qr || newProduct.barcode_qr.trim() === '') {
      delete (newProduct as any).barcode_qr;
    }
    
    if (newProduct.id) {
      this.saveStoredProductMeta(newProduct.id, {
        cost_price: newProduct.cost_price !== undefined && newProduct.cost_price !== null ? Number(newProduct.cost_price) : 0,
        margin_1: newProduct.margin_1 !== undefined && newProduct.margin_1 !== null ? Number(newProduct.margin_1) : 30,
        margin_2: newProduct.margin_2 !== undefined && newProduct.margin_2 !== null ? Number(newProduct.margin_2) : 30,
        margin_3: newProduct.margin_3 !== undefined && newProduct.margin_3 !== null ? Number(newProduct.margin_3) : 30,
        selected_margin_type: newProduct.selected_margin_type ?? 1,
        barcode_qr: (newProduct as any).barcode_qr || '',
        unit: (newProduct as any).unit || (newProduct as any).units || 'Unidad',
        units: (newProduct as any).units || (newProduct as any).unit || 'Unidad',
        location: newProduct.location,
        critical_stock: newProduct.critical_stock,
        expiration_date: newProduct.expiration_date,
        tax_id: newProduct.tax_id,
        tax_rate: newProduct.tax_rate
      });
    }

    try {
      const { data, error } = await supabase.from('products').insert([newProduct]).select();
      if (error) throw error;
      const returnedCost = (data[0].cost_price !== undefined && data[0].cost_price !== null && Number(data[0].cost_price) > 0)
        ? Number(data[0].cost_price)
        : (newProduct.cost_price !== undefined && newProduct.cost_price !== null ? Number(newProduct.cost_price) : 0);

      return {
        ...data[0],
        cost_price: returnedCost,
        margin_1: (data[0].margin_1 !== undefined && data[0].margin_1 !== null && Number(data[0].margin_1) > 0) ? Number(data[0].margin_1) : (newProduct.margin_1 ?? 30),
        unit: data[0].unit || (newProduct as any).unit || (newProduct as any).units || 'Unidad',
        units: data[0].units || (newProduct as any).units || (newProduct as any).unit || 'Unidad'
      } as Product;
    } catch (err: any) {
      if (err && (err.code === '42703' || (err.message && (err.message.includes('barcode_qr') || err.message.includes('cost_price') || err.message.includes('margin') || err.message.includes('unit') || err.message.includes('tax_id') || err.message.includes('tax_rate') || err.message.includes('expiration_date') || err.message.includes('critical_stock') || err.message.includes('location'))))) {
        const fallback = { ...newProduct };
        delete (fallback as any).cost_price;
        delete (fallback as any).margin_1;
        delete (fallback as any).margin_2;
        delete (fallback as any).margin_3;
        delete (fallback as any).selected_margin_type;
        delete (fallback as any).barcode_qr;
        delete (fallback as any).unit;
        delete (fallback as any).units;
        delete (fallback as any).tax_id;
        delete (fallback as any).tax_rate;
        delete (fallback as any).expiration_date;
        delete (fallback as any).critical_stock;
        delete (fallback as any).location;
        
        const { data: fbData, error: fbErr } = await supabase.from('products').insert([fallback]).select();
        if (!fbErr && fbData && fbData[0]) {
          return {
            ...fbData[0],
            cost_price: newProduct.cost_price ?? 0,
            margin_1: newProduct.margin_1 ?? 30,
            margin_2: newProduct.margin_2 ?? 30,
            margin_3: newProduct.margin_3 ?? 30,
            selected_margin_type: newProduct.selected_margin_type ?? 1,
            barcode_qr: (newProduct as any).barcode_qr || null,
            tax_id: newProduct.tax_id,
            tax_rate: newProduct.tax_rate,
            expiration_date: newProduct.expiration_date,
            critical_stock: newProduct.critical_stock,
            location: newProduct.location,
            unit: (newProduct as any).unit || (newProduct as any).units || 'Unidad',
            units: (newProduct as any).units || (newProduct as any).unit || 'Unidad'
          } as Product;
        }

        throw new Error('Se requiere actualizar el esquema de la base de datos en Supabase (campos cost_price, margin_1, unit, tax_id, tax_rate, expiration_date). Por favor, ejecuta la consulta SQL disponible en Configuración en el SQL Editor de Supabase.');
      }
      throw err;
    }
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
    if (!supabase) throw new Error('Supabase is not configured');
    const sanitizedProduct = { ...product };
    if (product.category_id === '') sanitizedProduct.category_id = null;
    if (product.brand_id === '') sanitizedProduct.brand_id = null;
    
    // rating_stars and rating_count do not exist in database products table
    delete (sanitizedProduct as any).rating_stars;
    delete (sanitizedProduct as any).rating_count;

    const updatedFields = {
      ...sanitizedProduct,
      updated_at: new Date().toISOString()
    };

    // If barcode_qr is empty or null, remove it from the payload to avoid error if column does not exist
    if (!updatedFields.barcode_qr || String(updatedFields.barcode_qr).trim() === '') {
      delete (updatedFields as any).barcode_qr;
    }

    if (id) {
      this.saveStoredProductMeta(id, {
        cost_price: updatedFields.cost_price !== undefined && updatedFields.cost_price !== null ? Number(updatedFields.cost_price) : undefined,
        margin_1: updatedFields.margin_1 !== undefined && updatedFields.margin_1 !== null ? Number(updatedFields.margin_1) : undefined,
        margin_2: updatedFields.margin_2 !== undefined && updatedFields.margin_2 !== null ? Number(updatedFields.margin_2) : undefined,
        margin_3: updatedFields.margin_3 !== undefined && updatedFields.margin_3 !== null ? Number(updatedFields.margin_3) : undefined,
        selected_margin_type: updatedFields.selected_margin_type,
        barcode_qr: (updatedFields as any).barcode_qr,
        unit: (updatedFields as any).unit || (updatedFields as any).units,
        units: (updatedFields as any).units || (updatedFields as any).unit,
        location: updatedFields.location,
        critical_stock: updatedFields.critical_stock,
        expiration_date: updatedFields.expiration_date,
        tax_id: updatedFields.tax_id,
        tax_rate: updatedFields.tax_rate
      });
    }

    try {
      const { data, error } = await supabase.from('products').update(updatedFields).eq('id', id).select();
      if (error) throw error;
      const returnedCost = (data[0].cost_price !== undefined && data[0].cost_price !== null && Number(data[0].cost_price) > 0)
        ? Number(data[0].cost_price)
        : (updatedFields.cost_price !== undefined && updatedFields.cost_price !== null ? Number(updatedFields.cost_price) : (data[0].cost_price ? Number(data[0].cost_price) : 0));

      return {
        ...data[0],
        cost_price: returnedCost,
        margin_1: (data[0].margin_1 !== undefined && data[0].margin_1 !== null && Number(data[0].margin_1) > 0) ? Number(data[0].margin_1) : (updatedFields.margin_1 !== undefined ? Number(updatedFields.margin_1) : (data[0].margin_1 ? Number(data[0].margin_1) : 30)),
        unit: data[0].unit || (updatedFields as any).unit || (updatedFields as any).units || 'Unidad',
        units: data[0].units || (updatedFields as any).units || (updatedFields as any).unit || 'Unidad'
      } as Product;
    } catch (err: any) {
      if (err && (err.code === '42703' || (err.message && (err.message.includes('barcode_qr') || err.message.includes('cost_price') || err.message.includes('margin') || err.message.includes('unit') || err.message.includes('tax_id') || err.message.includes('tax_rate') || err.message.includes('expiration_date') || err.message.includes('critical_stock') || err.message.includes('location'))))) {
        const fallback = { ...updatedFields };
        delete (fallback as any).cost_price;
        delete (fallback as any).margin_1;
        delete (fallback as any).margin_2;
        delete (fallback as any).margin_3;
        delete (fallback as any).selected_margin_type;
        delete (fallback as any).barcode_qr;
        delete (fallback as any).unit;
        delete (fallback as any).units;
        delete (fallback as any).tax_id;
        delete (fallback as any).tax_rate;
        delete (fallback as any).expiration_date;
        delete (fallback as any).critical_stock;
        delete (fallback as any).location;

        const { data: fbData, error: fbErr } = await supabase.from('products').update(fallback).eq('id', id).select();
        if (!fbErr && fbData && fbData[0]) {
          return {
            ...fbData[0],
            cost_price: updatedFields.cost_price !== undefined && updatedFields.cost_price !== null ? Number(updatedFields.cost_price) : (fbData[0].cost_price ? Number(fbData[0].cost_price) : 0),
            margin_1: updatedFields.margin_1 !== undefined && updatedFields.margin_1 !== null ? Number(updatedFields.margin_1) : (fbData[0].margin_1 ? Number(fbData[0].margin_1) : 30),
            margin_2: updatedFields.margin_2 !== undefined && updatedFields.margin_2 !== null ? Number(updatedFields.margin_2) : (fbData[0].margin_2 ? Number(fbData[0].margin_2) : 30),
            margin_3: updatedFields.margin_3 !== undefined && updatedFields.margin_3 !== null ? Number(updatedFields.margin_3) : (fbData[0].margin_3 ? Number(fbData[0].margin_3) : 30),
            selected_margin_type: updatedFields.selected_margin_type,
            barcode_qr: (updatedFields as any).barcode_qr || null,
            tax_id: updatedFields.tax_id,
            tax_rate: updatedFields.tax_rate,
            expiration_date: updatedFields.expiration_date,
            critical_stock: updatedFields.critical_stock,
            location: updatedFields.location,
            unit: (updatedFields as any).unit || (updatedFields as any).units || 'Unidad',
            units: (updatedFields as any).units || (updatedFields as any).unit || 'Unidad'
          } as Product;
        }

        throw new Error('Se requiere actualizar el esquema de la base de datos en Supabase (campos cost_price, margin_1, unit, tax_id, tax_rate, expiration_date). Por favor, ejecuta la consulta SQL disponible en Configuración en el SQL Editor de Supabase.');
      }
      throw err;
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    // Also delete associated images
    await supabase.from('product_images').delete().eq('product_id', id);
    return true;
  },

  // Product Images Operations
  async getProductImages(productId?: string): Promise<ProductImage[]> {
    if (!supabase) return [];
    try {
      let query = supabase.from('product_images').select('*').order('sort_order');
      if (productId) {
        query = query.eq('product_id', productId);
      }
      const { data, error } = await query;
      if (error) {
        console.warn("Notice fetching product_images:", error.message || error);
        return [];
      }
      return (data || []) as ProductImage[];
    } catch (e) {
      console.warn("getProductImages exception:", e);
      return [];
    }
  },

  async addProductImage(productImage: Omit<ProductImage, 'id'>): Promise<ProductImage> {
    if (!supabase) throw new Error('Supabase is not configured');
    const newImage: ProductImage = {
      ...productImage,
      id: crypto.randomUUID()
    };
    const { data, error } = await supabase.from('product_images').insert([newImage]).select();
    if (error) throw error;
    return data[0] as ProductImage;
  },

  async removeProductImage(id: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('product_images').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async setProductImagesForProduct(productId: string, imageUrls: string[]): Promise<ProductImage[]> {
    if (!supabase) return [];
    try {
      // 1. Delete previous images for this product
      const { error: delError } = await supabase.from('product_images').delete().eq('product_id', productId);
      if (delError) {
        console.warn("Notice deleting existing product images:", delError);
      }

      // 2. Insert new images
      const imagesToInsert = imageUrls
        .map(u => u.trim())
        .filter(u => u !== '')
        .slice(0, 3)
        .map((url, idx) => ({
          id: crypto.randomUUID(),
          product_id: productId,
          image_url: url,
          sort_order: idx + 1
        }));

      if (imagesToInsert.length === 0) {
        return [];
      }

      const { data, error: insError } = await supabase.from('product_images').insert(imagesToInsert).select();
      if (insError) {
        console.error("Error inserting product images:", insError);
        return [];
      }
      return (data || []) as ProductImage[];
    } catch (err) {
      console.error("setProductImagesForProduct error:", err);
      return [];
    }
  },

  async uploadProductImageFile(file: File): Promise<string> {
    if (supabase) {
      try {
        const fileExt = file.name.split('.').pop() || 'png';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `products/${fileName}`;
        const { data, error } = await supabase.storage.from('products').upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from('products').getPublicUrl(filePath);
          if (publicUrlData?.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      } catch (err) {
        console.warn("Supabase Storage bucket upload fallback to local canvas optimization:", err);
      }
    }

    // Client-side image optimization to high quality webp/jpeg Data URI
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) {
          resolve('');
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL('image/webp', 0.85);
            resolve(optimized);
          } else {
            resolve(result);
          }
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Product Inventory Movements & Audit Log Operations
  async getProductMovements(productId?: string): Promise<ProductMovementLog[]> {
    let list: ProductMovementLog[] = [];
    try {
      const local = localStorage.getItem('copias_bellavista_product_movements');
      if (local) {
        list = JSON.parse(local);
      }
    } catch (e) {
      list = [];
    }

    if (supabase) {
      try {
        let query = supabase.from('product_movements').select('*').order('created_at', { ascending: false });
        if (productId) {
          query = query.eq('product_id', productId);
        }
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          // Merge with local movements to guarantee no loss
          const remoteIds = new Set(data.map((m: any) => m.id));
          const combined = [...data, ...list.filter(m => !remoteIds.has(m.id))];
          combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return productId ? combined.filter(m => m.product_id === productId) : combined;
        }
      } catch (err) {
        // Table may not exist yet in Supabase, gracefully use local list
      }
    }

    if (productId) {
      return list.filter(m => m.product_id === productId);
    }
    return list;
  },

  async recordProductMovement(movement: ProductMovementLog): Promise<ProductMovementLog> {
    const logItem: ProductMovementLog = {
      ...movement,
      id: movement.id || crypto.randomUUID(),
      created_at: movement.created_at || new Date().toISOString()
    };

    try {
      const current = await this.getProductMovements();
      const updated = [logItem, ...current.filter(m => m.id !== logItem.id)];
      localStorage.setItem('copias_bellavista_product_movements', JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save product movement to localStorage:", e);
    }

    if (supabase) {
      try {
        await supabase.from('product_movements').insert([logItem]);
      } catch (err) {
        // Fallback silently if table doesn't exist
      }
    }

    return logItem;
  },

  // Helper for offline orders fallback
  getLocalOrders(): Order[] {
    try {
      const saved = localStorage.getItem('copias_bellavista_local_orders');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  saveLocalOrders(orders: Order[]): void {
    try {
      localStorage.setItem('copias_bellavista_local_orders', JSON.stringify(orders));
    } catch (e) {
      console.error("Error saving local orders:", e);
    }
  },

  // Order Operations
  async createOrder(order: Omit<Order, 'id' | 'created_at'>): Promise<Order> {
    const localOrders = this.getLocalOrders();
    const calculatedOrderNumber = localOrders.length + 1;

    const newOrder: Order = {
      ...order,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      order_number: calculatedOrderNumber
    };

    // Save locally as backup / immediate fallback
    localOrders.push(newOrder);
    this.saveLocalOrders(localOrders);

    if (!supabase) {
      console.warn("Supabase is not configured. Saving order locally only.");
      return newOrder;
    }
    
    try {
      const { data, error } = await supabase.from('orders').insert([newOrder]).select();
      if (error) {
        // If column doesn't exist error (42703 or undefined_column), fall back to serialized data in address_text
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn("New columns not found in orders table. Retrying with self-healing serialized fallback inside address_text.");
          
          const fallbackOrder = {
            id: newOrder.id,
            customer_name: newOrder.customer_name,
            phone_number: newOrder.phone_number,
            delivery_method: newOrder.delivery_method,
            total_price: newOrder.total_price,
            status: newOrder.status,
            created_at: newOrder.created_at,
            items: newOrder.items,
            address_text: rebuildAddressWithExtras(newOrder.address_text || '', {
              payment_method: order.payment_method,
              payment_amount_with: order.payment_amount_with,
              comments: order.comments,
              payment_status: order.payment_status || 'pendiente',
              customer_email: order.customer_email || undefined
            })
          };
          
          const { data: fallbackData, error: fallbackError } = await supabase.from('orders').insert([fallbackOrder]).select();
          if (fallbackError) throw fallbackError;
          
          const returnedOrder = fallbackData[0] as Order;
          returnedOrder.order_number = calculatedOrderNumber;
          returnedOrder.payment_method = order.payment_method;
          returnedOrder.payment_amount_with = order.payment_amount_with;
          returnedOrder.comments = order.comments;
          returnedOrder.payment_status = order.payment_status || 'pendiente';
          returnedOrder.points = order.points;
          returnedOrder.customer_email = order.customer_email;

          // Sync client from order
          try {
            await this.syncClientFromOrder(returnedOrder.customer_name, returnedOrder.phone_number, order.customer_email || '');
          } catch (syncErr) {
            console.error("Failed to sync client during order fallback:", syncErr);
          }

          // Update local copy with synced metadata
          const latestLocals = this.getLocalOrders();
          const idx = latestLocals.findIndex(o => o.id === newOrder.id);
          if (idx !== -1) {
            latestLocals[idx] = returnedOrder;
            this.saveLocalOrders(latestLocals);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
          }
          return returnedOrder;
        }
        throw error;
      }
      
      const resultOrder = data[0] as Order;
      if (!resultOrder.order_number) resultOrder.order_number = calculatedOrderNumber;

      // Sync client from order
      try {
        await this.syncClientFromOrder(resultOrder.customer_name, resultOrder.phone_number, order.customer_email || '');
      } catch (syncErr) {
        console.error("Failed to sync client during order creation:", syncErr);
      }

      // Update local copy with synced metadata
      const latestLocals = this.getLocalOrders();
      const idx = latestLocals.findIndex(o => o.id === newOrder.id);
      if (idx !== -1) {
        latestLocals[idx] = resultOrder;
        this.saveLocalOrders(latestLocals);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
      }

      return resultOrder;
    } catch (err) {
      console.warn("Supabase order creation failed, but order was saved in local storage fallback:", err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
      }
      return newOrder;
    }
  },

  async getOrder(id: string): Promise<Order | null> {
    // Validate that id is a valid UUID, or handle 'temp-last-order' gracefully
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      if (id !== 'temp-last-order') {
        console.warn(`Invalid UUID format for order ID: ${id}`);
      }
      // Check local storage fallback first
      return this.getLocalOrders().find(o => o.id === id) || null;
    }

    if (!supabase) {
      return this.getLocalOrders().find(o => o.id === id) || null;
    }

    try {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.warn("Error fetching order by ID from Supabase. Falling back to local storage:", error);
        return this.getLocalOrders().find(o => o.id === id) || null;
      }
      if (!data) {
        return this.getLocalOrders().find(o => o.id === id) || null;
      }

      const order = data as Order;
      
      // Parse the self-healing serialized extra information from address_text if columns are missing
      if (order && order.address_text) {
        const addr = order.address_text;
        const methodMatch = addr.match(/\[Método Pago:\s*([^\]\n]+)\]/);
        const amountMatch = addr.match(/\[Paga con:\s*US\$\s*([\d\.]+)\]/);
        const commentsMatch = addr.match(/\[Comentarios:\s*([^\]\n]+)\]/);
        const paymentStatusMatch = addr.match(/\[Estado Pago:\s*([^\]\n]+)\]/);
        const emailMatch = addr.match(/\[Email:\s*([^\]\n]+)\]/);
        
        if (methodMatch && !order.payment_method) order.payment_method = methodMatch[1];
        if (amountMatch && !order.payment_amount_with) order.payment_amount_with = parseFloat(amountMatch[1]);
        if (commentsMatch && !order.comments) order.comments = commentsMatch[1];
        if (paymentStatusMatch && !order.payment_status) order.payment_status = paymentStatusMatch[1];
        if (emailMatch && !order.customer_email) order.customer_email = emailMatch[1];
      }
      
      // Calculate sequential order number on the fly if it is not saved or null
      if (order && !order.order_number) {
        try {
          const { count } = await supabase
            .from('orders')
            .select('*', { head: true, count: 'exact' })
            .lte('created_at', order.created_at || '');
          order.order_number = count || 1;
        } catch (e) {
          order.order_number = 1;
        }
      }
      
      // Default values
      if (order && !order.payment_status) {
        order.payment_status = 'pendiente';
      }
      if (order && (order.points === undefined || order.points === null)) {
        order.points = 0;
      }

      return order;
    } catch (err) {
      console.warn("Exception fetching order by ID. Falling back to local storage:", err);
      return this.getLocalOrders().find(o => o.id === id) || null;
    }
  },

  async getOrders(): Promise<Order[]> {
    if (!supabase) {
      return this.getLocalOrders();
    }

    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) {
        console.warn("Error fetching orders from Supabase. Falling back to local storage:", error);
        return this.getLocalOrders();
      }
      if (!data || data.length === 0) {
        return this.getLocalOrders();
      }
      
      // Map self-healing attributes and missing fields
      const parsedOrders = data.map((order: any, index: number, array: any[]) => {
        // Parse items if string
        if (typeof order.items === 'string') {
          try {
            order.items = JSON.parse(order.items);
          } catch (e) {
            order.items = [];
          }
        }
        if (!Array.isArray(order.items)) {
          order.items = [];
        }

        // Parse numerical totals safely
        if (order.total_price !== undefined && order.total_price !== null) {
          order.total_price = parseFloat(String(order.total_price)) || 0;
        } else if (order.total !== undefined && order.total !== null) {
          order.total_price = parseFloat(String(order.total)) || 0;
        } else if (order.items && order.items.length > 0) {
          order.total_price = order.items.reduce((acc: number, it: any) => acc + (parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 1), 0);
        } else {
          order.total_price = 0;
        }

        if (order.address_text) {
          const addr = order.address_text;
          const methodMatch = addr.match(/\[Método Pago:\s*([^\]\n]+)\]/);
          const amountMatch = addr.match(/\[Paga con:\s*US\$\s*([\d\.]+)\]/);
          const commentsMatch = addr.match(/\[Comentarios:\s*([^\]\n]+)\]/);
          const paymentStatusMatch = addr.match(/\[Estado Pago:\s*([^\]\n]+)\]/);
          const emailMatch = addr.match(/\[Email:\s*([^\]\n]+)\]/);
          const sellerMatch = addr.match(/\[Vendedor:\s*([^\]\n]+)\]/);
          
          if (methodMatch && !order.payment_method) order.payment_method = methodMatch[1];
          if (amountMatch && !order.payment_amount_with) order.payment_amount_with = parseFloat(amountMatch[1]);
          if (commentsMatch && !order.comments) order.comments = commentsMatch[1];
          if (paymentStatusMatch && !order.payment_status) order.payment_status = paymentStatusMatch[1];
          if (emailMatch && !order.customer_email) order.customer_email = emailMatch[1];
          if (sellerMatch && !order.seller_name) order.seller_name = sellerMatch[1];
        }

        // Check if comments contains seller info (e.g. "Vendedor: Carlos")
        if (order.comments && !order.seller_name) {
          const vMatch = order.comments.match(/Vendedor:\s*([^.|,\n]+)/i);
          if (vMatch) {
            order.seller_name = vMatch[1].trim();
          }
        }
        
        if (!order.order_number) {
          order.order_number = array.length - index;
        }
        
        if (!order.payment_status) {
          order.payment_status = 'pendiente';
        }
        if (order.points === undefined || order.points === null) {
          order.points = 0;
        }
        
        return order as Order;
      });

      // Synchronize with local storage copy
      this.saveLocalOrders(parsedOrders);
      return parsedOrders;
    } catch (err) {
      console.warn("Exception fetching orders. Falling back to local storage:", err);
      return this.getLocalOrders();
    }
  },

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    // 1. Update in local storage first
    const localOrders = this.getLocalOrders();
    const localIdx = localOrders.findIndex(o => o.id === id);
    let updatedLocalOrder: Order | null = null;
    if (localIdx !== -1) {
      localOrders[localIdx] = { ...localOrders[localIdx], ...updates };
      updatedLocalOrder = localOrders[localIdx];
      this.saveLocalOrders(localOrders);
    }

    if (!supabase) {
      if (updatedLocalOrder) return updatedLocalOrder;
      throw new Error('Supabase is not configured and order not found in local storage.');
    }
    
    const sanitizedUpdates: any = { ...updates };
    
    try {
      const { data, error } = await supabase.from('orders').update(sanitizedUpdates).eq('id', id).select();
      if (error) {
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          const currentOrder = await dbService.getOrder(id);
          if (!currentOrder) throw new Error('Order not found to update');

          const mergedExtras = {
            payment_method: updates.payment_method !== undefined ? updates.payment_method : currentOrder.payment_method,
            payment_amount_with: updates.payment_amount_with !== undefined ? updates.payment_amount_with : currentOrder.payment_amount_with,
            comments: updates.comments !== undefined ? updates.comments : currentOrder.comments,
            payment_status: updates.payment_status !== undefined ? updates.payment_status : currentOrder.payment_status
          };

          const updatedAddress = rebuildAddressWithExtras(currentOrder.address_text || '', mergedExtras);

          const safeUpdates: any = {};
          if (updates.status !== undefined) safeUpdates.status = updates.status;
          safeUpdates.address_text = updatedAddress;
          
          const { data: safeData, error: safeError } = await supabase.from('orders').update(safeUpdates).eq('id', id).select();
          if (safeError) throw safeError;
          
          if (!safeData || safeData.length === 0) {
            if (updatedLocalOrder) return updatedLocalOrder;
            throw new Error('La base de datos Supabase rechazó la actualización.');
          }
          
          const returnedOrder = { ...safeData[0], ...updates } as Order;
          returnedOrder.payment_status = mergedExtras.payment_status || 'pendiente';
          returnedOrder.payment_method = mergedExtras.payment_method;
          returnedOrder.payment_amount_with = mergedExtras.payment_amount_with;
          returnedOrder.comments = mergedExtras.comments;

          if (localIdx !== -1) {
            localOrders[localIdx] = returnedOrder;
            this.saveLocalOrders(localOrders);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
          }
          return returnedOrder;
        }
        throw error;
      }
      
      if (!data || data.length === 0) {
        if (updatedLocalOrder) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
          }
          return updatedLocalOrder;
        }
        throw new Error('La base de datos Supabase rechazó la actualización.');
      }
      
      const returnedOrder = data[0] as Order;
      if (localIdx !== -1) {
        localOrders[localIdx] = returnedOrder;
        this.saveLocalOrders(localOrders);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
      }
      return returnedOrder;
    } catch (err) {
      console.warn("Supabase update failed, but updated local copy:", err);
      if (updatedLocalOrder) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
        }
        return updatedLocalOrder;
      }
      throw err;
    }
  },

  async getLatestBcvRate(): Promise<{ id: string; rate: number; created_at: string; created_by: string } | null> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('bcv_rates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Error fetching latest BCV rate:', error);
      return null;
    }
    return data;
  },

  async updateBcvRate(rate: number, createdBy: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured');
    const newRate = {
      id: crypto.randomUUID(),
      rate: rate,
      created_by: createdBy || 'Sistema',
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('bcv_rates').insert([newRate]).select();
    if (error) throw error;
    return data ? data[0] : null;
  },

  async getBcvRatesHistory(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('bcv_rates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15);
    if (error) {
      console.error('Error fetching BCV rates history:', error);
      return [];
    }
    return data || [];
  },

  async getBcvRateForDate(targetDateStr?: string, fallbackRate: number = 36.5): Promise<number> {
    if (!supabase) return fallbackRate;
    try {
      if (!targetDateStr) {
        const latest = await this.getLatestBcvRate();
        return latest && latest.rate ? Number(latest.rate) : fallbackRate;
      }
      const targetDate = new Date(targetDateStr);
      if (isNaN(targetDate.getTime())) {
        const latest = await this.getLatestBcvRate();
        return latest && latest.rate ? Number(latest.rate) : fallbackRate;
      }

      // 1. Try finding the rate recorded on or before the target timestamp
      const { data, error } = await supabase
        .from('bcv_rates')
        .select('*')
        .lte('created_at', targetDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0 && data[0].rate) {
        return Number(data[0].rate);
      }

      // 2. Try finding any rate recorded on the exact same day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: sameDayData, error: sameDayErr } = await supabase
        .from('bcv_rates')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!sameDayErr && sameDayData && sameDayData.length > 0 && sameDayData[0].rate) {
        return Number(sameDayData[0].rate);
      }

      // 3. Fallback to latest available rate
      const latest = await this.getLatestBcvRate();
      return latest && latest.rate ? Number(latest.rate) : fallbackRate;
    } catch (e) {
      console.warn('Error fetching BCV rate for date:', e);
      return fallbackRate;
    }
  },

  async getAllCurrencyRates(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*');
      if (error) {
        // Fallback or retry using legacy bcv_rates for VES
        console.warn('Could not fetch currency_rates table, using fallbacks', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error('Error getting currency rates:', e);
      return [];
    }
  },

  async updateCurrencyRate(code: string, rate: number, updatedBy: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured');
    
    // First, sync to bcv_rates legacy if code is VES
    if (code === 'VES') {
      try {
        await this.updateBcvRate(rate, updatedBy);
      } catch (err) {
        console.error('Failed to sync to legacy bcv_rates:', err);
      }
    }

    const { data, error } = await supabase
      .from('currency_rates')
      .upsert({
        code: code,
        rate: rate,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || 'Sistema'
      }, { onConflict: 'code' })
      .select();

    if (error) {
      throw error;
    }

    // Persist to local cache immediately and trigger application-wide real-time event
    if (code === 'VES') {
      const cached = getCachedCurrencyRates();
      cached.VES = rate;
      saveCachedCurrencyRates(cached);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate, code } }));
      }
    }

    return data ? data[0] : null;
  },

  async getInvoices(): Promise<any[]> {
    let apiInvoices: any[] = [];
    if (supabase) {
      try {
        let fetchedData: any[] | null = null;
        // 1. Try querying 'invoices' table
        try {
          const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false });
          if (!error && data && data.length > 0) {
            fetchedData = data;
          } else if (error) {
            const retry = await supabase.from('invoices').select('*');
            if (!retry.error && retry.data && retry.data.length > 0) {
              fetchedData = retry.data;
            }
          }
        } catch (e) {
          console.warn('Error fetching from invoices table:', e);
        }

        // 2. Fallback to 'facturas' if empty
        if (!fetchedData || fetchedData.length === 0) {
          try {
            const { data: dFacturas, error: errFacturas } = await supabase.from('facturas').select('*');
            if (!errFacturas && dFacturas && dFacturas.length > 0) {
              fetchedData = dFacturas;
            }
          } catch (e) {
            // Ignore
          }
        }

        if (fetchedData && fetchedData.length > 0) {
          apiInvoices = fetchedData.map(inv => {
            const rawItems = inv.items || inv.products || inv.detalles || inv.line_items || inv.items_detail;
            const meta = (inv.taxes_detail && typeof inv.taxes_detail === 'object' && inv.taxes_detail.meta) ? inv.taxes_detail.meta : {};
            const taxesArr = Array.isArray(inv.taxes_detail) 
              ? inv.taxes_detail 
              : (inv.taxes_detail && Array.isArray(inv.taxes_detail.taxes) ? inv.taxes_detail.taxes : []);

            return {
              ...inv,
              id: inv.id || inv.control_number || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `inv-${Date.now()}`),
              control_number: inv.control_number || inv.numero || inv.invoice_number || `FAC-${inv.id}`,
              document_type: inv.document_type || (inv.control_number && inv.control_number.toString().startsWith('NE-') ? 'nota_entrega' : 'factura'),
              customer_name: inv.customer_name || inv.cliente || inv.nombre_cliente || 'Consumidor final',
              customer_document: inv.customer_document || meta.customer_document || '',
              customer_phone: inv.customer_phone || meta.customer_phone || '',
              customer_email: inv.customer_email || meta.customer_email || '',
              customer_address: inv.customer_address || meta.customer_address || '',
              payment_method: inv.payment_method || inv.metodo_pago || 'Efectivo',
              subtotal: parseFloat(String(inv.subtotal ?? inv.total ?? 0)) || 0,
              discount: parseFloat(String(inv.discount ?? meta.discount ?? 0)) || 0,
              discount_code: inv.discount_code || meta.discount_code || '',
              iva: parseFloat(String(inv.iva ?? 0)) || 0,
              igtf: parseFloat(String(inv.igtf ?? meta.igtf ?? 0)) || 0,
              total: parseFloat(String(inv.total ?? inv.subtotal ?? 0)) || 0,
              items: parseInvoiceItems(rawItems, inv),
              taxes_detail: taxesArr,
              notes: inv.notes || meta.notes || inv.notas || '',
              created_at: inv.created_at || inv.fecha || new Date().toISOString()
            };
          });
        }
      } catch (e) {
        console.warn('Error in getInvoices (Supabase):', e);
      }
    }

    // Load from localStorage
    let localInvoices: any[] = [];
    try {
      const saved = localStorage.getItem('copias_bellavista_local_invoices');
      if (saved) {
        localInvoices = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading local invoices:', e);
    }

    // Merge both lists, preserving full product items and avoiding duplicates by control_number or id
    const mergedMap = new Map<string, any>();
    localInvoices.forEach(inv => {
      const key = (inv.control_number || inv.id || '').toString().trim().toUpperCase();
      if (key) {
        mergedMap.set(key, {
          ...inv,
          items: parseInvoiceItems(inv.items, inv)
        });
      }
    });

    const isFallbackItems = (items: any[]) => {
      if (!items || items.length === 0) return true;
      const first = items[0];
      if (!first) return true;
      if (first.sku === 'VENTA-FLASH') return true;
      const n = (first.name || '').toLowerCase();
      if (n.includes('venta flash -') || n.startsWith('venta factura') || n.startsWith('venta nota')) return true;
      return false;
    };

    apiInvoices.forEach(inv => {
      const key = (inv.control_number || inv.id || '').toString().trim().toUpperCase();
      if (key) {
        const existing = mergedMap.get(key);
        if (existing) {
          const existingItems = parseInvoiceItems(existing.items, existing);
          const newItems = parseInvoiceItems(inv.items, inv);
          // Prefer whichever has real, non-fallback product items
          const bestItems = !isFallbackItems(newItems) ? newItems : (!isFallbackItems(existingItems) ? existingItems : newItems);
          
          mergedMap.set(key, {
            ...existing,
            ...inv,
            items: bestItems
          });
        } else {
          mergedMap.set(key, {
            ...inv,
            items: parseInvoiceItems(inv.items, inv)
          });
        }
      }
    });

    // 3. Scan cash operations (cash_ops) to recover any historical POS invoices that were registered in Cash but missing from table
    try {
      let cashOpsList: any[] = [];
      const savedOps = localStorage.getItem('copias_bellavista_cash_ops');
      if (savedOps) cashOpsList = JSON.parse(savedOps);

      cashOpsList.forEach((op: any) => {
        const concept = op.concept || '';
        // Match e.g. "Venta Flash - Factura FAC-1045 (Consumidor final)" or "Venta Flash - Nota de Entrega NE-1002 (Juan)"
        const match = concept.match(/(?:Factura|Nota de Entrega)\s+(FAC-\d+|NE-\d+|[A-Z0-9-]+)\s*(?:\((.*?)\))?/i);
        if (match) {
          const docCode = match[1].toUpperCase().trim();
          let clientName = match[2] ? match[2].trim() : 'Consumidor final';
          if (!mergedMap.has(docCode)) {
            const isNota = docCode.startsWith('NE-');
            const recoveredInvoice = {
              id: `recovered-${docCode}`,
              control_number: docCode,
              document_type: isNota ? 'nota_entrega' : 'factura',
              customer_name: clientName || 'Consumidor final',
              payment_method: op.payment_method || 'Efectivo',
              subtotal: parseFloat(String(op.amount || 0)) || 0,
              iva: 0,
              total: parseFloat(String(op.amount || 0)) || 0,
              items: parseInvoiceItems([], {
                total: op.amount,
                notes: isNota ? 'Servicios de Copiado e Impresión' : 'Venta de Productos y Papelería',
                document_type: isNota ? 'nota_entrega' : 'factura'
              }),
              notes: `${concept} (Sincronizado)`,
              created_at: op.created_at || new Date().toISOString()
            };
            mergedMap.set(docCode, recoveredInvoice);
          }
        }
      });
    } catch (recoverErr) {
      console.warn("Notice recovering invoices from cash ops:", recoverErr);
    }

    const resultList = Array.from(mergedMap.values()).map(inv => ({
      ...inv,
      items: parseInvoiceItems(inv.items, inv)
    })).sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    // Keep localStorage cache completely in sync with the consolidated list
    try {
      localStorage.setItem('copias_bellavista_local_invoices', JSON.stringify(resultList));
    } catch (saveErr) {
      // Ignore
    }

    return resultList;
  },

  async getInvoiceByControlOrId(identifier: string): Promise<any | null> {
    if (!identifier) return null;
    const cleanId = identifier.toString().trim();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .or(`control_number.eq.${cleanId},id.eq.${cleanId}`)
          .limit(1);
        if (!error && data && data.length > 0) {
          const inv = data[0];
          const rawItems = inv.items || inv.products || inv.detalles || inv.line_items;
          const meta = (inv.taxes_detail && typeof inv.taxes_detail === 'object' && inv.taxes_detail.meta) ? inv.taxes_detail.meta : {};
          return {
            ...inv,
            id: inv.id,
            control_number: inv.control_number || cleanId,
            document_type: inv.document_type || (cleanId.startsWith('NE-') ? 'nota_entrega' : 'factura'),
            customer_name: inv.customer_name || 'Consumidor final',
            customer_document: inv.customer_document || meta.customer_document || '',
            customer_phone: inv.customer_phone || meta.customer_phone || '',
            customer_email: inv.customer_email || meta.customer_email || '',
            customer_address: inv.customer_address || meta.customer_address || '',
            payment_method: inv.payment_method || 'Efectivo',
            subtotal: parseFloat(String(inv.subtotal ?? inv.total ?? 0)) || 0,
            discount: parseFloat(String(inv.discount ?? meta.discount ?? 0)) || 0,
            discount_code: inv.discount_code || meta.discount_code || '',
            iva: parseFloat(String(inv.iva ?? 0)) || 0,
            igtf: parseFloat(String(inv.igtf ?? meta.igtf ?? 0)) || 0,
            total: parseFloat(String(inv.total ?? inv.subtotal ?? 0)) || 0,
            items: parseInvoiceItems(rawItems, inv),
            notes: inv.notes || meta.notes || '',
            created_at: inv.created_at || new Date().toISOString()
          };
        }
      } catch (err) {
        console.warn('Error fetching invoice by identifier:', err);
      }
    }
    return null;
  },

  getNextInvoiceControlNumber(docType: string = 'factura'): string {
    try {
      let localInvoicesList: any[] = [];
      try {
        const saved = localStorage.getItem('copias_bellavista_local_invoices');
        if (saved) localInvoicesList = JSON.parse(saved);
      } catch (e) {}

      let cashOpsList: any[] = [];
      try {
        const savedOps = localStorage.getItem('copias_bellavista_cash_ops');
        if (savedOps) cashOpsList = JSON.parse(savedOps);
      } catch (e) {}

      let configuredBase = 1000;
      try {
        const sysCfg = localStorage.getItem('copias_bellavista_sys_config');
        if (sysCfg) {
          const parsed = JSON.parse(sysCfg);
          if (docType === 'nota_entrega') {
            configuredBase = Number(parsed.facturacionCorrelativoTicket || 1000);
          } else {
            configuredBase = Number(parsed.facturacionCorrelativoFactura || 1000);
          }
        }
      } catch (e) {}

      let maxExistingNum = 0;

      if (docType === 'nota_entrega') {
        localInvoicesList.forEach((i: any) => {
          const code = (i.control_number || i.invoice_number || '').toString().toUpperCase();
          const match = code.match(/(?:NE-?|\b)(\d+)/);
          if (match && (code.includes('NE') || i.document_type === 'nota_entrega')) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxExistingNum) maxExistingNum = val;
          }
        });
        cashOpsList.forEach(op => {
          const concept = (op.concept || '').toString().toUpperCase();
          const match = concept.match(/NE-?(\d+)/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxExistingNum) maxExistingNum = val;
          }
        });

        const nextNum = maxExistingNum >= configuredBase ? maxExistingNum + 1 : configuredBase;
        return `NE-${nextNum}`;
      } else {
        localInvoicesList.forEach((i: any) => {
          const code = (i.control_number || i.invoice_number || '').toString().toUpperCase();
          const match = code.match(/(?:FAC-?|\b)(\d+)/);
          if (match && (code.includes('FAC') || i.document_type !== 'nota_entrega')) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxExistingNum) maxExistingNum = val;
          }
        });
        cashOpsList.forEach(op => {
          const concept = (op.concept || '').toString().toUpperCase();
          const match = concept.match(/FAC-?(\d+)/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxExistingNum) maxExistingNum = val;
          }
        });

        const nextNum = maxExistingNum >= configuredBase ? maxExistingNum + 1 : configuredBase;
        return `FAC-${nextNum}`;
      }
    } catch (e) {
      const prefix = docType === 'nota_entrega' ? 'NE' : 'FAC';
      return `${prefix}-1001`;
    }
  },

  async createInvoice(invoice: any): Promise<any> {
    const docType = invoice.document_type || 'factura';
    const calculatedControlNumber = invoice.control_number || this.getNextInvoiceControlNumber(docType);
    const normalizedItems = parseInvoiceItems(invoice.items, invoice);

    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
    const validId = (invoice.id && isUuid(invoice.id))
      ? invoice.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'f' + Math.random().toString(16).substring(2, 10) + '-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12));

    const newInvoice = {
      id: validId,
      ...invoice,
      document_type: docType,
      control_number: calculatedControlNumber,
      items: normalizedItems,
      created_at: invoice.created_at || new Date().toISOString()
    };

    let savedInvoice = newInvoice;

    // Notificar procedimiento para chequeo horario de tasa BCV futura
    notifyProcedureExecuted();

    // Immediately save locally to guarantee zero latency and no data loss
    try {
      const saved = localStorage.getItem('copias_bellavista_local_invoices');
      const localInvoices = saved ? JSON.parse(saved) : [];
      const updatedLocals = [newInvoice, ...localInvoices.filter((i: any) => (i.control_number || i.id) !== (newInvoice.control_number || newInvoice.id))];
      localStorage.setItem('copias_bellavista_local_invoices', JSON.stringify(updatedLocals));
    } catch (localErr) {
      console.error("Failed to save invoice to localStorage:", localErr);
    }

    if (supabase) {
      try {
        const taxesDetailObj = {
          taxes: Array.isArray(invoice.taxes_detail) ? invoice.taxes_detail : [],
          meta: {
            customer_document: invoice.customer_document || '',
            customer_phone: invoice.customer_phone || '',
            customer_email: invoice.customer_email || '',
            customer_address: invoice.customer_address || '',
            notes: invoice.notes || '',
            discount: Number(invoice.discount || 0),
            discount_code: invoice.discount_code || '',
            igtf: Number(invoice.igtf || 0),
            bcv_rate: Number(invoice.bcv_rate || 0)
          }
        };

        const supabasePayload = {
          id: validId,
          control_number: calculatedControlNumber,
          customer_name: newInvoice.customer_name || 'Consumidor final',
          payment_method: newInvoice.payment_method || 'Efectivo',
          subtotal: Number(newInvoice.subtotal ?? newInvoice.total ?? 0),
          iva: Number(newInvoice.iva ?? 0),
          total: Number(newInvoice.total ?? newInvoice.subtotal ?? 0),
          items: normalizedItems,
          taxes_detail: taxesDetailObj,
          document_type: docType,
          currency_code: newInvoice.currency_code || 'USD',
          currency_rates_snapshot: newInvoice.currency_rates_snapshot || null,
          totals_by_currency: newInvoice.totals_by_currency || null,
          split_payments: newInvoice.split_payments || null,
          bcv_rate: Number(newInvoice.bcv_rate || 0),
          created_at: newInvoice.created_at
        };

        const { data, error } = await supabase.from('invoices').upsert([supabasePayload], { onConflict: 'id' }).select();
        
        if (!error && data && data[0]) {
          savedInvoice = {
            ...newInvoice,
            ...data[0],
            customer_document: newInvoice.customer_document || taxesDetailObj.meta.customer_document,
            customer_phone: newInvoice.customer_phone || taxesDetailObj.meta.customer_phone,
            customer_email: newInvoice.customer_email || taxesDetailObj.meta.customer_email,
            customer_address: newInvoice.customer_address || taxesDetailObj.meta.customer_address,
            notes: newInvoice.notes || taxesDetailObj.meta.notes,
            discount: newInvoice.discount ?? taxesDetailObj.meta.discount,
            discount_code: newInvoice.discount_code || taxesDetailObj.meta.discount_code,
            igtf: newInvoice.igtf ?? taxesDetailObj.meta.igtf
          };
        } else if (error) {
          console.warn("Supabase upsert invoice notice:", error);
        }
      } catch (e) {
        console.warn("Supabase insert invoice exception:", e);
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_invoices_updated'));
      }
    } catch (evErr) {}

    // 📋 Auto-registrar cuenta por cobrar (CxC) si la venta contiene pago a crédito / Cuentas por Cobrar
    try {
      const isSplit = Array.isArray(newInvoice.split_payments) && newInvoice.split_payments.length > 0;
      let creditUsd = 0;
      let immediatePaidUsd = 0;
      let immediatePaidVes = 0;

      if (isSplit) {
        newInvoice.split_payments.forEach((p: any) => {
          const isCxCPart = p.bankAccountId === 'cxc-virtual' || 
                            p.bank_account_id === 'cxc-virtual' ||
                            p.bankAccountId === 'cxc' ||
                            (p.method && (p.method.toLowerCase().includes('cuentas por cobrar') || p.method.toLowerCase().includes('crédito') || p.method.toLowerCase().includes('credito')));
          if (isCxCPart) {
            creditUsd += Number(p.amount_usd || p.amount || 0);
          } else {
            immediatePaidUsd += Number(p.amount_usd || (p.currency === 'USD' ? p.amount : 0) || 0);
            immediatePaidVes += Number(p.amount_ves || (p.currency === 'VES' ? p.amount : 0) || 0);
          }
        });
      } else {
        const methodStr = (newInvoice.payment_method || '').toLowerCase();
        if (methodStr.includes('crédito') || methodStr.includes('credito') || methodStr.includes('cuentas por cobrar') || methodStr.includes('cxc')) {
          creditUsd = Number(newInvoice.total) || 0;
        }
      }

      if (creditUsd > 0.001) {
        const invNum = newInvoice.control_number || `FAC-${newInvoice.id.substring(0, 6)}`;
        const clientName = (newInvoice.customer_name || 'Cliente').trim();
        const clientPhone = (newInvoice.customer_phone || '').trim();
        const clientDoc = (newInvoice.customer_document || '').trim();
        const entityName = clientPhone ? `${clientName} ${clientPhone}` : clientName;

        const cxcRecord: AccountReceivable = {
          id: `cxc-${newInvoice.id}`,
          invoice_id: newInvoice.id,
          invoice_number: invNum,
          subject: `Crédito por Venta - Factura #${invNum}`,
          entity_name: entityName || 'Consumidor final',
          client_name: entityName || 'Consumidor final',
          customer_name: clientName || 'Consumidor final',
          customer_phone: clientPhone,
          customer_document: clientDoc,
          description: `Crédito registrado vía ${newInvoice.document_type === 'nota_entrega' ? 'Nota de Entrega' : 'Factura'} #${invNum}`,
          total_amount: Number(newInvoice.total) || creditUsd,
          paid_amount: Number(immediatePaidUsd.toFixed(2)),
          remaining_amount: Number(creditUsd.toFixed(2)),
          currency: 'USD',
          bcv_rate: newInvoice.bcv_rate || 40,
          status: (creditUsd <= 0.001 ? 'cobrado' : (immediatePaidUsd > 0 ? 'parcial' : 'pendiente')) as any,
          issue_date: newInvoice.created_at || new Date().toISOString(),
          due_date: new Date(new Date(newInvoice.created_at || Date.now()).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: newInvoice.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await this.saveAccountReceivable(cxcRecord).catch(err => console.warn("Error saving auto CxC:", err));

        if (immediatePaidUsd > 0) {
          const initPay: AccountReceivablePayment = {
            id: `pay-init-${newInvoice.id}`,
            account_receivable_id: cxcRecord.id,
            cxc_id: cxcRecord.id,
            amount: Number(immediatePaidUsd.toFixed(2)),
            amount_bs: Number(immediatePaidVes.toFixed(2)) || null,
            payment_method: 'Abono Inicial Venta',
            payment_date: newInvoice.created_at || new Date().toISOString(),
            reference: `ABONO-INICIAL #${invNum}`,
            notes: `Abono inicial al procesar factura #${invNum}`,
            created_by: 'Sistema',
            created_at: newInvoice.created_at || new Date().toISOString()
          };
          await this.recordInitialAccountReceivablePayment(initPay).catch(() => {});
        }
      }
    } catch (cxcErr) {
      console.warn("Notice checking CxC from invoice:", cxcErr);
    }

    // Sync client asynchronously (non-blocking)
    this.syncClientFromOrder(newInvoice.customer_name, '').catch(syncErr => {
      console.warn("Async error syncing client from invoice:", syncErr);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_invoices_updated'));
      window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
      window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
    }

    return savedInvoice;
  },

  async getDraftInvoices(): Promise<any[]> {
    let apiDrafts: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('draft_invoices')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          apiDrafts = data;
        } else {
          console.warn('Error fetching draft invoices from Supabase:', error);
        }
      } catch (e) {
        console.warn('Error in getDraftInvoices (Supabase):', e);
      }
    }

    // Load from localStorage
    let localDrafts: any[] = [];
    try {
      const saved = localStorage.getItem('copias_bellavista_local_drafts');
      if (saved) {
        localDrafts = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading local drafts:', e);
    }

    // Merge both
    const mergedMap = new Map<string, any>();
    localDrafts.forEach(d => {
      mergedMap.set(d.id, d);
    });
    apiDrafts.forEach(d => {
      mergedMap.set(d.id, d);
    });

    // Filter out blacklisted/deleted drafts
    let allDrafts = Array.from(mergedMap.values()).map(d => ({
      ...d,
      items: parseInvoiceItems(d.items)
    }));
    try {
      const deletedSaved = localStorage.getItem('copias_bellavista_deleted_drafts');
      if (deletedSaved) {
        const deletedIds = JSON.parse(deletedSaved);
        if (Array.isArray(deletedIds)) {
          allDrafts = allDrafts.filter(d => !deletedIds.includes(d.id));
        }
      }
    } catch (e) {
      console.error("Error filtering deleted drafts:", e);
    }

    return allDrafts.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  },

  async createDraftInvoice(draft: any): Promise<any> {
    const newDraft = {
      id: draft.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-draft-${Math.floor(Math.random() * 1000000)}`),
      ...draft,
      created_at: new Date().toISOString()
    };

    let savedDraft = newDraft;

    if (supabase) {
      try {
        const { data, error } = await supabase.from('draft_invoices').insert([newDraft]).select();
        if (!error && data && data[0]) {
          savedDraft = data[0];
        } else {
          console.warn("Supabase insert draft invoice failed. Saving to localStorage fallback:", error);
          const saved = localStorage.getItem('copias_bellavista_local_drafts');
          const localDrafts = saved ? JSON.parse(saved) : [];
          localDrafts.push(newDraft);
          localStorage.setItem('copias_bellavista_local_drafts', JSON.stringify(localDrafts));
        }
      } catch (e) {
        console.warn("Supabase insert draft error. Saving to localStorage fallback:", e);
        try {
          const saved = localStorage.getItem('copias_bellavista_local_drafts');
          const localDrafts = saved ? JSON.parse(saved) : [];
          localDrafts.push(newDraft);
          localStorage.setItem('copias_bellavista_local_drafts', JSON.stringify(localDrafts));
        } catch (localErr) {
          console.error("Failed to save draft to localStorage:", localErr);
        }
      }
    } else {
      try {
        const saved = localStorage.getItem('copias_bellavista_local_drafts');
        const localDrafts = saved ? JSON.parse(saved) : [];
        localDrafts.push(newDraft);
        localStorage.setItem('copias_bellavista_local_drafts', JSON.stringify(localDrafts));
      } catch (localErr) {
        console.error("Failed to save draft to localStorage:", localErr);
      }
    }

    // Remove from blacklist if recreating or updating
    try {
      const deletedSaved = localStorage.getItem('copias_bellavista_deleted_drafts');
      if (deletedSaved) {
        let deletedIds = JSON.parse(deletedSaved);
        if (Array.isArray(deletedIds) && deletedIds.includes(newDraft.id)) {
          deletedIds = deletedIds.filter(id => id !== newDraft.id);
          localStorage.setItem('copias_bellavista_deleted_drafts', JSON.stringify(deletedIds));
        }
      }
    } catch (e) {
      console.error("Failed to clean blacklist during draft creation:", e);
    }

    return savedDraft;
  },

  async deleteDraftInvoice(id: string): Promise<boolean> {
    // 1. Add to local blacklist to hide instantly and permanently
    try {
      const deletedSaved = localStorage.getItem('copias_bellavista_deleted_drafts');
      const deletedIds = deletedSaved ? JSON.parse(deletedSaved) : [];
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('copias_bellavista_deleted_drafts', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Failed to save deleted draft to blacklist:", e);
    }

    // 2. Try deleting from Supabase
    if (supabase && id && !String(id).startsWith('local-')) {
      try {
        const { error } = await supabase.from('draft_invoices').delete().eq('id', id);
        if (error) {
          console.warn("Supabase delete draft failed (likely RLS). Relying on blacklist fallback:", error);
        }
      } catch (e) {
        console.warn("Supabase delete draft error. Relying on blacklist fallback:", e);
      }
    }

    // 3. Try deleting from local storage drafts list
    try {
      const saved = localStorage.getItem('copias_bellavista_local_drafts');
      if (saved) {
        let localDrafts = JSON.parse(saved);
        localDrafts = localDrafts.filter((d: any) => d.id !== id);
        localStorage.setItem('copias_bellavista_local_drafts', JSON.stringify(localDrafts));
      }
    } catch (e) {
      console.error("Failed to delete draft from localStorage:", e);
    }
    return true;
  },

  async getClients(): Promise<any[]> {
    const clientsList: any[] = [];
    const clientDebtMap = new Map<string, number>();
    let arDataLoaded = false;

    // Helper functions for matching
    const normalizeDocKey = (d?: string): string => {
      if (!d) return '';
      return String(d).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    };

    const normalizeNameKey = (n?: string): string => {
      if (!n) return '';
      return String(n).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const normalizePhoneKey = (p?: string): string => {
      if (!p) return '';
      const digits = String(p).replace(/\D/g, '');
      return digits.length >= 7 ? digits.slice(-7) : digits;
    };

    // Load set of permanently deleted clients
    let deletedClientsSet = new Set<string>();
    try {
      const deletedRaw = localStorage.getItem('copias_bellavista_deleted_clients');
      if (deletedRaw) {
        const deletedArr = JSON.parse(deletedRaw);
        if (Array.isArray(deletedArr)) {
          deletedArr.forEach((item: any) => {
            if (typeof item === 'string') {
              deletedClientsSet.add(item.toLowerCase().trim());
              deletedClientsSet.add(normalizeDocKey(item));
            } else if (item && typeof item === 'object') {
              if (item.id) deletedClientsSet.add(String(item.id).trim().toLowerCase());
              if (item.name) deletedClientsSet.add(normalizeNameKey(item.name));
              if (item.document) deletedClientsSet.add(normalizeDocKey(item.document));
            }
          });
        }
      }
    } catch (e) {
      console.warn("Error reading deleted clients list:", e);
    }

    const isClientDeleted = (candidate: any): boolean => {
      if (!candidate) return false;
      const cId = candidate.id ? String(candidate.id).trim().toLowerCase() : '';
      const cDoc = normalizeDocKey(candidate.document || candidate.doc_number || candidate.documento || candidate.rif);
      const cName = normalizeNameKey(candidate.name || candidate.nombre);
      if (cId && deletedClientsSet.has(cId)) return true;
      if (cDoc && deletedClientsSet.has(cDoc)) return true;
      if (cName && deletedClientsSet.has(cName)) return true;
      return false;
    };

    // Find existing client in list by ID, Document, Name, or Phone
    const findExisting = (item: any): any | undefined => {
      const targetId = item.id ? String(item.id).trim() : '';
      const targetDoc = normalizeDocKey(item.document || item.doc_number || item.documento || item.rif);
      const targetName = normalizeNameKey(item.name || item.nombre);
      const targetPhone = normalizePhoneKey(item.phone || item.telefono);

      return clientsList.find(c => {
        if (targetId && c.id && String(c.id).trim() === targetId) return true;
        const cDoc = normalizeDocKey(c.document || c.doc_number || c.documento || c.rif);
        if (targetDoc && cDoc && targetDoc === cDoc) return true;
        const cName = normalizeNameKey(c.name || c.nombre);
        if (targetName && cName && targetName === cName) return true;
        const cPhone = normalizePhoneKey(c.phone || c.telefono);
        if (targetPhone && cPhone && targetPhone.length >= 7 && targetPhone === cPhone && (!targetName || !cName || targetName === cName)) return true;
        return false;
      });
    };

    // Add or merge into clientsList
    const addOrMerge = (candidate: any, isAuthoritativeDb: boolean) => {
      if (isClientDeleted(candidate)) return;
      const rawName = (candidate.name || candidate.nombre || '').trim();
      if (!rawName || rawName.toLowerCase() === 'consumidor final') return;

      const parsedExtras = parsePhoneExtras(candidate.raw_phone || candidate.phone || candidate.telefono || '');
      const phone = parsedExtras.phone || candidate.phone || candidate.telefono || '';
      const email = (candidate.email || candidate.correo || parsedExtras.email || '').trim().toLowerCase();
      const address = (candidate.address || candidate.direccion || parsedExtras.address || '').trim();
      const docStr = (candidate.document || candidate.doc_number || candidate.documento || candidate.rif || '').trim();

      const existing = findExisting({ ...candidate, name: rawName, document: docStr, phone });

      if (existing) {
        // Merge fields: prioritize DB data or fill missing fields
        if (isAuthoritativeDb && candidate.id) {
          existing.id = candidate.id;
        }
        if (!existing.document && docStr) existing.document = docStr;
        if (!existing.phone && phone) existing.phone = phone;
        if (!existing.email && email) {
          existing.email = email;
          existing.correo = email;
        }
        if (!existing.address && address) {
          existing.address = address;
          existing.direccion = address;
        }
        if (candidate.type && !existing.type) existing.type = candidate.type;
        if (candidate.code && !existing.code) existing.code = candidate.code;
        if (candidate.credit_usd !== undefined && candidate.credit_usd !== null) {
          existing.credit_usd = Number(candidate.credit_usd);
        }
      } else {
        clientsList.push({
          id: candidate.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`),
          name: rawName,
          document: docStr,
          phone,
          email,
          correo: email,
          address,
          direccion: address,
          type: candidate.type || 'Natural',
          credit_usd: Number(candidate.credit_usd || 0),
          code: candidate.code || '',
          is_active: candidate.is_active !== false,
          created_at: candidate.created_at || new Date().toISOString()
        });
      }
    };

    // 1. Load authoritative 'clients' table from Supabase
    if (supabase) {
      try {
        const { data: cData } = await supabase.from('clients').select('*');
        if (cData && Array.isArray(cData) && cData.length > 0) {
          cData.forEach(c => addOrMerge(c, true));
        }
      } catch (e) {
        console.warn('Error fetching from clients table:', e);
      }
    }

    // 2. Load from local clients cache (filtering out synthetic ghosts)
    try {
      const saved = localStorage.getItem('copias_bellavista_local_clients');
      if (saved) {
        const localClients = JSON.parse(saved);
        if (Array.isArray(localClients)) {
          localClients.forEach(c => {
            if (c.id && (String(c.id).startsWith('inv-cli-') || String(c.id).startsWith('ord-cli-'))) {
              return; // Skip old synthetic duplicates
            }
            addOrMerge(c, false);
          });
        }
      }
    } catch (e) {
      console.warn('Error loading local clients cache:', e);
    }

    // 3. Load from 'store_users' (role = 'Cliente')
    if (supabase) {
      try {
        const { data: suData } = await supabase.from('store_users').select('*').eq('role', 'Cliente');
        if (suData && Array.isArray(suData)) {
          suData.forEach(u => addOrMerge(u, false));
        }
      } catch (e) {
        console.warn('Error fetching from store_users:', e);
      }
    }

    // 4. Query 'accounts_receivable' table to calculate real active debt per client
    if (supabase) {
      try {
        const { data: arData } = await supabase.from('accounts_receivable').select('*');
        if (arData && Array.isArray(arData)) {
          arDataLoaded = true;
          arData.forEach(ar => {
            const rawName = (ar.customer_name || ar.client_name || ar.entity_name || '').trim();
            if (!rawName || rawName.toLowerCase() === 'consumidor final') return;

            const phoneMatch = rawName.match(/(\+?\d{10,14})/);
            const cleanName = phoneMatch ? rawName.replace(phoneMatch[1], '').trim() : rawName;
            const phone = ar.customer_phone || ar.client_phone || (phoneMatch ? phoneMatch[1] : '');
            const doc = (ar.customer_document || ar.client_document || '').trim();
            const debt = (ar.status !== 'cobrado' && Number(ar.remaining_amount) > 0) ? Number(ar.remaining_amount) : 0;

            const nameKey = normalizeNameKey(cleanName);
            const docKey = normalizeDocKey(doc);
            const phoneKey = normalizePhoneKey(phone);

            if (nameKey) clientDebtMap.set(nameKey, (clientDebtMap.get(nameKey) || 0) + debt);
            if (docKey) clientDebtMap.set(docKey, (clientDebtMap.get(docKey) || 0) + debt);
            if (phoneKey) clientDebtMap.set(phoneKey, (clientDebtMap.get(phoneKey) || 0) + debt);
          });
        }
      } catch (e) {
        console.warn('Error fetching clients from accounts_receivable:', e);
      }
    }

    // Sort clients deterministically by created_at or name so codes and IDs remain stable
    clientsList.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      return (a.name || '').localeCompare(b.name || '');
    });

    // REORGANIZATION ENGINE: Strictly enforce 100% Unique IDs and Sequential Unique Codes (CLI-1001, CLI-1002...)
    const usedIds = new Set<string>();
    const usedCodes = new Set<string>();
    let nextCodeNum = 1001;

    const normalizedClients = clientsList.map((c) => {
      const parsedExtras = parsePhoneExtras(c.raw_phone || c.phone || c.telefono || '');
      const phone = parsedExtras.phone || c.phone || '';
      const email = (c.email || c.correo || parsedExtras.email || '').trim().toLowerCase();
      const address = (c.address || c.direccion || parsedExtras.address || '').trim();

      let docType = c.doc_type || c.tipo_documento || '';
      let docNumber = c.doc_number || c.documento || '';
      let docStr = c.document || c.rif || '';

      if (docStr && (!docType || !docNumber)) {
        if (docStr.includes('-')) {
          const parts = docStr.split('-');
          docType = parts[0].toUpperCase();
          docNumber = parts.slice(1).join('-');
        } else {
          const match = docStr.match(/^([a-zA-Z])[-_\s]?(.*)$/);
          if (match && match[2]) {
            docType = match[1].toUpperCase();
            docNumber = match[2];
          } else {
            docType = 'V';
            docNumber = docStr;
          }
        }
      }

      // 1. Guaranteed strictly unique internal ID
      let finalId = c.id ? String(c.id).trim() : '';
      if (!finalId || usedIds.has(finalId)) {
        finalId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : `cli-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      }
      usedIds.add(finalId);

      // 2. Guaranteed strictly unique sequential Code (CLI-1001, CLI-1002...)
      let assignedCode = '';
      if (c.code && typeof c.code === 'string' && /^CLI-\d+$/i.test(c.code.trim())) {
        const candidateCode = c.code.trim().toUpperCase();
        if (!usedCodes.has(candidateCode)) {
          assignedCode = candidateCode;
        }
      }

      if (!assignedCode) {
        while (usedCodes.has(`CLI-${nextCodeNum}`)) {
          nextCodeNum++;
        }
        assignedCode = `CLI-${nextCodeNum}`;
        nextCodeNum++;
      }
      usedCodes.add(assignedCode);

      const determinedType = c.type || (docType === 'J' || docType === 'G' ? 'Jurídico' : 'Natural');

      const nameKey = normalizeNameKey(c.name);
      const docKey = normalizeDocKey(docStr);
      const phoneKey = normalizePhoneKey(phone);

      let calculatedDebt = Number(c.credit_usd || 0);
      if (arDataLoaded) {
        calculatedDebt = (docKey ? clientDebtMap.get(docKey) : undefined) ??
                         clientDebtMap.get(nameKey) ??
                         (phoneKey ? clientDebtMap.get(phoneKey) : undefined) ??
                         Number(c.credit_usd || 0);
      }

      return {
        id: finalId,
        name: c.name,
        document: docStr,
        doc_type: docType || (docStr ? 'V' : ''),
        doc_number: docNumber || docStr,
        tipo_documento: docType || (docStr ? 'V' : ''),
        documento: docNumber || docStr,
        rif: docStr,
        type: determinedType,
        phone,
        email,
        correo: email,
        address,
        direccion: address,
        credit_usd: Number(calculatedDebt.toFixed(2)),
        code: assignedCode,
        is_active: c.is_active !== false,
        created_at: c.created_at || new Date().toISOString()
      };
    }).sort((a, b) => (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name));

    // Cache clean deduplicated & reorganized list to localStorage
    try {
      localStorage.setItem('copias_bellavista_local_clients', JSON.stringify(normalizedClients));
    } catch (e) {
      console.warn('Failed to cache clients to localStorage:', e);
    }

    return normalizedClients;
  },

  async createClient(client: any): Promise<any> {
    const rawName = (client.name || '').trim();
    if (!rawName || rawName.toLowerCase() === 'consumidor final') {
      return {
        id: 'cf',
        name: 'Consumidor final',
        document: 'V-99999999',
        type: 'Natural',
        phone: '',
        email: '',
        address: 'Mostrador',
        credit_usd: 0,
        code: 'CLI-0000'
      };
    }

    const cleanClientEmail = (client.email || client.correo || '').trim().toLowerCase();
    const cleanClientAddress = (client.address || client.direccion || '').trim();
    const cleanClientPhone = parsePhoneExtras(client.phone || client.telefono || '').phone.trim();

    let docType = client.doc_type || client.tipo_documento || '';
    let docNumber = client.doc_number || client.documento || '';
    let docStr = (client.document || client.rif || '').trim();

    if (!docStr && docNumber) {
      docStr = `${docType || 'V'}-${docNumber}`;
    } else if (docStr && (!docType || !docNumber)) {
      if (docStr.includes('-')) {
        const parts = docStr.split('-');
        docType = parts[0].toUpperCase();
        docNumber = parts.slice(1).join('-');
      } else {
        const match = docStr.match(/^([a-zA-Z])[-_\s]?(.*)$/);
        if (match && match[2]) {
          docType = match[1].toUpperCase();
          docNumber = match[2];
        } else {
          docType = 'V';
          docNumber = docStr;
        }
      }
    }

    // 🔍 REAL-TIME DUPLICATE & COLLISION VERIFICATION: Check all existing clients in real time
    const allClients = await this.getClients();
    const normDoc = docStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const normName = rawName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const existingMatch = allClients.find(c => {
      const cDoc = (c.document || c.doc_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const cName = (c.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normDoc && cDoc && normDoc === cDoc) return true;
      if (normName && cName && normName === cName) return true;
      return false;
    });

    if (existingMatch) {
      // Client already exists: update existing client record in real-time without duplicating ID or Code
      return await this.updateClient(existingMatch.id, {
        name: rawName || existingMatch.name,
        document: docStr || existingMatch.document,
        doc_type: docType || existingMatch.doc_type,
        doc_number: docNumber || existingMatch.doc_number,
        phone: cleanClientPhone || existingMatch.phone,
        email: cleanClientEmail || existingMatch.email,
        address: cleanClientAddress || existingMatch.address,
        type: client.type || existingMatch.type,
        credit_usd: client.credit_usd ?? existingMatch.credit_usd
      });
    }

    // Real-time unique sequential Code generation: scan all existing codes to prevent collision
    const existingCodesSet = new Set<string>(allClients.map(c => (c.code || '').toUpperCase()));
    let nextCodeNum = 1001;
    while (existingCodesSet.has(`CLI-${nextCodeNum}`)) {
      nextCodeNum++;
    }
    const calculatedCode = client.code && !existingCodesSet.has(client.code.toUpperCase()) 
      ? client.code.toUpperCase() 
      : `CLI-${nextCodeNum}`;

    // Real-time unique ID generation: ensure the UUID does not collide with any existing ID
    const existingIdsSet = new Set<string>(allClients.map(c => String(c.id).trim()));
    let newId = client.id ? String(client.id).trim() : '';
    if (!newId || existingIdsSet.has(newId)) {
      newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cli-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }

    const phoneWithExtras = serializePhoneWithExtras(
      cleanClientPhone,
      cleanClientEmail,
      cleanClientAddress
    );

    const newClient = {
      id: newId,
      name: rawName,
      document: docStr,
      doc_type: docType || (docStr ? 'V' : ''),
      doc_number: docNumber || docStr,
      tipo_documento: docType || (docStr ? 'V' : ''),
      documento: docNumber || docStr,
      type: client.type || (docType === 'J' || docType === 'G' ? 'Jurídico' : 'Natural'),
      phone: cleanClientPhone,
      email: cleanClientEmail,
      correo: cleanClientEmail,
      address: cleanClientAddress,
      direccion: cleanClientAddress,
      password: client.password || '',
      credit_usd: client.credit_usd || 0,
      code: calculatedCode,
      is_active: client.is_active !== false,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        const supabasePayload = {
          id: newClient.id,
          name: newClient.name,
          document: newClient.document,
          phone: phoneWithExtras,
          type: newClient.type,
          credit_usd: newClient.credit_usd || 0,
          code: newClient.code
        };
        const { data, error } = await supabase.from('clients').insert([supabasePayload]).select();
        if (!error && data && data[0]) {
          newClient.id = data[0].id;
        } else {
          console.warn("Supabase insert client notice (saving locally):", error?.message || error);
        }
      } catch (e) {
        console.warn("Supabase insert client error:", e);
      }
    }

    // Save to localStorage ensuring real-time deduplication
    try {
      const saved = localStorage.getItem('copias_bellavista_local_clients');
      const localClients = saved ? JSON.parse(saved) : [];
      const filtered = localClients.filter((c: any) => 
        c.id !== newClient.id && 
        (!normDoc || (c.document || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() !== normDoc) &&
        (c.name || '').toLowerCase().trim() !== normName
      );
      filtered.push({
        ...newClient,
        phone: cleanClientPhone,
        raw_phone: phoneWithExtras,
        email: cleanClientEmail,
        correo: cleanClientEmail,
        address: cleanClientAddress,
        direccion: cleanClientAddress
      });
      localStorage.setItem('copias_bellavista_local_clients', JSON.stringify(filtered));
    } catch (e) {
      console.error("Failed to save client to localStorage:", e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_clients_updated'));
    }

    return newClient;
  },

  async updateClient(id: string, updates: any): Promise<any> {
    // 1. Extract current client in real-time
    const allClients = await this.getClients();
    const currentClient = allClients.find(c => c.id === id) ||
      allClients.find(c => updates.document && c.document === updates.document) ||
      allClients.find(c => updates.name && c.name.toLowerCase() === updates.name.toLowerCase());

    const existingPhone = currentClient ? currentClient.phone : '';
    const existingEmail = currentClient ? (currentClient.email || currentClient.correo) : '';
    const existingAddress = currentClient ? (currentClient.address || currentClient.direccion) : '';

    const newEmail = 'email' in updates ? (updates.email ?? '') : ('correo' in updates ? (updates.correo ?? '') : existingEmail);
    const newPhone = 'phone' in updates ? (updates.phone ?? '') : ('telefono' in updates ? (updates.telefono ?? '') : existingPhone);
    const newAddress = 'address' in updates ? (updates.address ?? '') : ('direccion' in updates ? (updates.direccion ?? '') : existingAddress);

    const cleanEmail = (typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : '');
    const cleanAddress = (typeof newAddress === 'string' ? newAddress.trim() : '');
    const cleanPhone = (typeof newPhone === 'string' ? parsePhoneExtras(newPhone).phone.trim() : '');

    const phoneWithExtras = serializePhoneWithExtras(cleanPhone, cleanEmail, cleanAddress);

    // Verify Code uniqueness in real time if code is provided in updates
    let finalCode = updates.code || (currentClient ? currentClient.code : '');
    if (updates.code) {
      const isCodeTaken = allClients.some(c => c.id !== id && c.code && c.code.toUpperCase() === updates.code.toUpperCase());
      if (isCodeTaken) {
        console.warn(`Code ${updates.code} is taken. Keeping current code or generating next.`);
        finalCode = currentClient ? currentClient.code : `CLI-${1001 + allClients.length}`;
      }
    }

    if (supabase && id && !String(id).startsWith('local-') && !String(id).startsWith('ord-cli-') && !String(id).startsWith('inv-cli-') && !String(id).startsWith('ar-cli-')) {
      try {
        const supabaseUpdatePayload: any = {};
        if ('name' in updates) supabaseUpdatePayload.name = updates.name;
        if ('document' in updates) supabaseUpdatePayload.document = updates.document;
        if ('type' in updates) supabaseUpdatePayload.type = updates.type;
        if ('credit_usd' in updates) supabaseUpdatePayload.credit_usd = Number(updates.credit_usd);
        if (finalCode) supabaseUpdatePayload.code = finalCode;
        supabaseUpdatePayload.phone = phoneWithExtras;

        const { error } = await supabase
          .from('clients')
          .update(supabaseUpdatePayload)
          .eq('id', id);

        if (error) {
          console.warn("Supabase update client notice:", error.message);
        }
      } catch (e) {
        console.warn("Supabase update client error:", e);
      }
    }

    // Update in store_users if linked
    if (cleanEmail) {
      try {
        const storeUsers = await this.getStoreUsers();
        const matchingUser = storeUsers.find(u => 
          (u.id === id) || 
          (currentClient && currentClient.email && u.email && u.email.toLowerCase() === currentClient.email.toLowerCase()) ||
          (currentClient && currentClient.document && u.document && u.document === currentClient.document)
        );
        if (matchingUser) {
          await this.updateStoreUser(matchingUser.id, {
            name: updates.name || matchingUser.name,
            email: cleanEmail,
            phone: cleanPhone || matchingUser.phone,
            address: cleanAddress || matchingUser.address
          });
        }
      } catch (e) {
        console.warn("Notice syncing client update to store_users:", e);
      }
    }

    // Update in local storage
    let updatedResult: any = null;
    try {
      const saved = localStorage.getItem('copias_bellavista_local_clients');
      let localClients = saved ? JSON.parse(saved) : [];
      let foundIndex = localClients.findIndex((c: any) => c.id === id);

      if (foundIndex < 0 && currentClient) {
        foundIndex = localClients.findIndex((c: any) => 
          (c.document && c.document === currentClient.document) ||
          (c.code && c.code === currentClient.code) ||
          (c.name && c.name.toLowerCase() === currentClient.name.toLowerCase())
        );
      }

      const mergedClient = {
        ...(currentClient || {}),
        ...(foundIndex >= 0 ? localClients[foundIndex] : {}),
        ...updates,
        id: id || (currentClient ? currentClient.id : `local-${Date.now()}`),
        code: finalCode,
        phone: cleanPhone,
        raw_phone: phoneWithExtras,
        email: cleanEmail,
        correo: cleanEmail,
        address: cleanAddress,
        direccion: cleanAddress
      };

      if (foundIndex >= 0) {
        localClients[foundIndex] = mergedClient;
      } else {
        localClients.push(mergedClient);
      }

      localStorage.setItem('copias_bellavista_local_clients', JSON.stringify(localClients));
      updatedResult = mergedClient;
    } catch (e) {
      console.error("Failed to update client in localStorage:", e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_clients_updated'));
    }

    return updatedResult || {
      ...(currentClient || {}),
      ...updates,
      id,
      code: finalCode,
      phone: cleanPhone,
      email: cleanEmail,
      correo: cleanEmail,
      address: cleanAddress,
      direccion: cleanAddress
    };
  },

  async deleteClient(id: string, name?: string, document?: string): Promise<boolean> {
    // 1. Record in permanently deleted clients set to prevent reappearance from caches
    try {
      const deletedRaw = localStorage.getItem('copias_bellavista_deleted_clients');
      const deletedArr: any[] = deletedRaw ? JSON.parse(deletedRaw) : [];
      deletedArr.push({
        id: id || '',
        name: name || '',
        document: document || '',
        deleted_at: new Date().toISOString()
      });
      localStorage.setItem('copias_bellavista_deleted_clients', JSON.stringify(deletedArr));
    } catch (e) {
      console.warn("Failed to persist deleted client record:", e);
    }

    // 2. Remove from local storage cache
    try {
      const saved = localStorage.getItem('copias_bellavista_local_clients');
      if (saved) {
        let localClients = JSON.parse(saved);
        const normDoc = (document || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const normName = (name || '').trim().toLowerCase();

        localClients = localClients.filter((c: any) => {
          if (id && c.id === id) return false;
          if (normDoc && (c.document || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === normDoc) return false;
          if (normName && (c.name || '').trim().toLowerCase() === normName) return false;
          return true;
        });
        localStorage.setItem('copias_bellavista_local_clients', JSON.stringify(localClients));
      }
    } catch (e) {
      console.error("Failed to delete client from localStorage:", e);
    }

    // 3. Delete from Supabase 'clients' and 'store_users'
    if (supabase) {
      try {
        if (id && !String(id).startsWith('local-')) {
          await supabase.from('clients').delete().eq('id', id);
        }
        if (name && name.trim()) {
          await supabase.from('clients').delete().ilike('name', name.trim());
        }
        if (document && document.trim()) {
          await supabase.from('clients').delete().eq('document', document.trim());
        }
      } catch (e) {
        console.warn("Supabase delete client notice:", e);
      }
    }

    // 4. Real-time broadcast notification across all open tabs/modules
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_clients_updated', {
        detail: { deletedId: id, name, document }
      }));
    }

    return true;
  },

  // --- CASH REGISTER (CAJA) OPERATIONS ---
  async getCashSessions(): Promise<any[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('cash_sessions').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          localStorage.setItem('copias_bellavista_cash_sessions', JSON.stringify(data));
          return data;
        } else {
          console.warn("Notice fetching cash_sessions from Supabase, loading localStorage:", error);
        }
      } catch (err) {
        console.warn("Exception fetching cash_sessions, loading localStorage:", err);
      }
    }
    try {
      const saved = localStorage.getItem('copias_bellavista_cash_sessions');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading cash sessions:", e);
    }
    // Seed default session matching Image 1
    const defaultSessions = [
      {
        id: "seed-session-1",
        apertura: "20/7/2026, 12:26:48 a. m.",
        cierre: "20/7/2026, 08:00:00 p. m.",
        apertura_bs: 10.00,
        cierre_bs: 10.00,
        diferencia_bs: 0,
        estado: "cerrada",
        apertura_usd: 0.22,
        cierre_usd: 0.22,
        observaciones: "Fondo inicial de apertura"
      }
    ];
    localStorage.setItem('copias_bellavista_cash_sessions', JSON.stringify(defaultSessions));
    return defaultSessions;
  },

  async createCashSession(session: any): Promise<any> {
    const newSession = {
      id: crypto.randomUUID(),
      empleado_nombre: session.empleado_nombre || session.user_name || 'Cajero de Turno',
      empleado_id: session.empleado_id || null,
      apertura: new Date().toLocaleString('es-VE'),
      cierre: '—',
      apertura_bs: session.apertura_bs || 0,
      cierre_bs: null,
      esperado_bs: session.apertura_bs || 0,
      esperado_usd: session.apertura_usd || 0,
      diferencia_bs: null,
      estado: 'abierta',
      estado_arqueo: null,
      apertura_usd: session.apertura_usd || 0,
      cierre_usd: null,
      observaciones: session.observaciones || '',
      created_at: new Date().toISOString()
    };

    // Save to local storage first for resilience
    try {
      const sessions = await this.getCashSessions();
      // Mark any other open sessions as closed just in case
      const updatedSessions = sessions.map(s => s.estado === 'abierta' ? { ...s, estado: 'cerrada', cierre: new Date().toLocaleString('es-VE') } : s);
      updatedSessions.unshift(newSession);
      localStorage.setItem('copias_bellavista_cash_sessions', JSON.stringify(updatedSessions));
    } catch (e) {
      console.error("Error saving cash session locally:", e);
    }

    if (supabase) {
      try {
        // Also update open sessions in Supabase if any to closed
        await supabase.from('cash_sessions').update({ estado: 'cerrada', cierre: new Date().toLocaleString('es-VE') }).eq('estado', 'abierta');
        const { data, error } = await supabase.from('cash_sessions').insert([newSession]).select();
        if (!error && data && data[0]) {
          return data[0];
        } else {
          console.warn("Failed to create cash_session in Supabase, trying core payload fallback:", error);
          if (error && (error.code === '42703' || String(error.message).includes('column') || String(error.message).includes('does not exist'))) {
            const corePayload = {
              id: newSession.id,
              apertura: newSession.apertura,
              cierre: newSession.cierre,
              apertura_bs: newSession.apertura_bs,
              cierre_bs: newSession.cierre_bs,
              diferencia_bs: newSession.diferencia_bs,
              estado: newSession.estado,
              apertura_usd: newSession.apertura_usd,
              cierre_usd: newSession.cierre_usd,
              esperado_bs: newSession.esperado_bs,
              esperado_usd: newSession.esperado_usd,
              observaciones: newSession.observaciones,
              created_at: newSession.created_at
            };
            const { data: retryData, error: retryError } = await supabase.from('cash_sessions').insert([corePayload]).select();
            if (!retryError && retryData && retryData[0]) {
              return { ...newSession, ...retryData[0] };
            } else {
              console.warn("Failed retry with core payload cash_session:", retryError);
            }
          }
        }
      } catch (err) {
        console.warn("Exception creating cash_session in Supabase:", err);
      }
    }
    return newSession;
  },

  async updateCashSession(id: string, updates: any): Promise<any> {
    let localResult: any = null;
    try {
      const sessions = await this.getCashSessions();
      const updatedSessions = sessions.map(s => {
        if (s.id === id) {
          const u = { ...s, ...updates };
          localResult = u;
          return u;
        }
        return s;
      });
      localStorage.setItem('copias_bellavista_cash_sessions', JSON.stringify(updatedSessions));
    } catch (e) {
      console.error("Error updating cash session locally:", e);
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.from('cash_sessions').update(updates).eq('id', id).select();
        if (!error && data && data[0]) {
          return data[0];
        } else {
          console.warn("Failed to update cash_session in Supabase, trying core payload fallback:", error);
          if (error && (error.code === '42703' || String(error.message).includes('column') || String(error.message).includes('does not exist'))) {
            // Remove non-standard keys
            const coreUpdates: any = { ...updates };
            delete coreUpdates.empleado_nombre;
            delete coreUpdates.empleado_id;
            delete coreUpdates.estado_arqueo;

            const { data: retryData, error: retryError } = await supabase.from('cash_sessions').update(coreUpdates).eq('id', id).select();
            if (!retryError && retryData && retryData[0]) {
              return { ...localResult, ...retryData[0] };
            } else {
              console.warn("Failed retry with core updates cash_session:", retryError);
            }
          }
        }
      } catch (err) {
        console.warn("Exception updating cash_session in Supabase:", err);
      }
    }
    return localResult || { id, ...updates };
  },

  async getActiveCashSession(): Promise<any | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('cash_sessions').select('*').eq('estado', 'abierta').order('created_at', { ascending: false }).limit(1);
        if (!error && data && data.length > 0) {
          return data[0];
        }
      } catch (err) {
        console.warn("Exception fetching active cash session from Supabase:", err);
      }
    }
    const sessions = await this.getCashSessions();
    return sessions.find(s => s.estado === 'abierta') || null;
  },

  async getCashOps(): Promise<any[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('cash_ops').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          const parsed = data.map((op: any) => ({
            ...op,
            amount: parseFloat(String(op.amount)) || 0,
            amount_bs: parseFloat(String(op.amount_bs)) || 0,
            created_at: op.created_at || new Date().toISOString()
          }));
          localStorage.setItem('copias_bellavista_cash_ops', JSON.stringify(parsed));
          return parsed;
        } else {
          console.warn("Notice fetching cash_ops from Supabase, loading localStorage:", error);
        }
      } catch (err) {
        console.warn("Exception fetching cash_ops from Supabase, loading localStorage:", err);
      }
    }
    try {
      const saved = localStorage.getItem('copias_bellavista_cash_ops');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading cash operations:", e);
    }
    // Seed default operations corresponding to the open seed session
    const defaultOps = [
      { id: "1", type: "ingreso", concept: "Apertura de Caja - Fondo Inicial", amount: 0.22, amount_bs: 10.00, time: "12:26 a. m.", session_id: "seed-session-1", created_at: "2026-07-20T00:26:48.000Z" }
    ];
    localStorage.setItem('copias_bellavista_cash_ops', JSON.stringify(defaultOps));
    return defaultOps;
  },

  async addCashOp(op: any): Promise<any> {
    const activeSession = await this.getActiveCashSession();
    const newOp = {
      id: crypto.randomUUID(),
      type: op.type, // 'ingreso' | 'egreso'
      concept: op.concept,
      amount: op.amount || 0, // in USD
      amount_bs: op.amount_bs || 0, // in Bs
      amount_eur: op.amount_eur || 0,
      amount_cop: op.amount_cop || 0,
      currency_code: op.currency_code || 'USD',
      currency_rates_snapshot: op.currency_rates_snapshot || null,
      split_payments: op.split_payments || null,
      time: op.time || new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
      session_id: op.session_id || (activeSession ? activeSession.id : null),
      empleado_nombre: op.empleado_nombre || op.user_name || (activeSession ? activeSession.empleado_nombre : null) || 'Cajero',
      payment_method: op.payment_method || null,
      category: op.category || null,
      observation: op.observation || op.notes || null,
      created_at: op.created_at || new Date().toISOString()
    };

    // Save locally first with zero latency
    try {
      const savedOps = localStorage.getItem('copias_bellavista_cash_ops');
      const ops = savedOps ? JSON.parse(savedOps) : [];
      const updated = [newOp, ...ops.filter((existing: any) => existing.id !== newOp.id)];
      localStorage.setItem('copias_bellavista_cash_ops', JSON.stringify(updated));
    } catch (e) {
      console.error("Error adding cash operation locally:", e);
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.from('cash_ops').insert([newOp]).select();
        if (error) {
          console.warn("Notice adding cash_op in Supabase, trying core payload fallback:", error.message);
          const corePayload = {
            id: newOp.id,
            type: newOp.type,
            concept: newOp.concept,
            amount: newOp.amount,
            amount_bs: newOp.amount_bs,
            time: newOp.time,
            session_id: newOp.session_id,
            payment_method: newOp.payment_method,
            created_at: newOp.created_at
          };
          const { data: fbData } = await supabase.from('cash_ops').insert([corePayload]).select();
          if (fbData && fbData[0]) {
            window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
            return { ...newOp, ...fbData[0] };
          }
        } else if (data && data[0]) {
          window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
          return data[0];
        }
      } catch (err) {
        console.warn("Exception adding cash_op in Supabase:", err);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
    return newOp;
  },

  async deleteCashOp(id: string): Promise<boolean> {
    try {
      const ops = await this.getCashOps();
      const updatedOps = ops.filter((op: any) => op.id !== id);
      localStorage.setItem('copias_bellavista_cash_ops', JSON.stringify(updatedOps));
    } catch (e) {
      console.error("Error deleting cash operation locally:", e);
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('cash_ops').delete().eq('id', id);
        if (error) {
          console.warn("Failed to delete cash_op from Supabase:", error);
        }
      } catch (err) {
        console.warn("Exception deleting cash_op in Supabase:", err);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
    return true;
  },

  async syncClientFromOrder(customerName: string, phoneNumber: string, email: string = ''): Promise<any> {
    try {
      const cleanName = (customerName || '').trim();
      const cleanPhone = (phoneNumber || '').trim();
      const cleanEmail = (email || '').trim();
      if (!cleanName || cleanName === 'Consumidor final') return null;

      // Fetch all clients (from both Supabase and localStorage) to find matches
      const allClients = await this.getClients();
      
      // Look for match by exact/similar name or phone
      const existing = allClients.find(c => 
        (c.name && c.name.toLowerCase().includes(cleanName.toLowerCase())) || 
        (c.phone && c.phone === cleanPhone)
      );

      if (existing) {
        // Update client phone/email if changed
        let currentPhone = existing.phone || '';
        let currentEmail = existing.email || '';
        
        const finalEmail = cleanEmail || currentEmail;
        const finalPhone = cleanPhone || currentPhone;
        
        if (currentPhone !== finalPhone || currentEmail !== finalEmail) {
          await this.updateClient(existing.id, {
            phone: finalPhone,
            email: finalEmail
          });
        }
        return existing;
      }

      // Create new client
      const randomDocNum = Math.floor(Math.random() * 25000000) + 5000000;
      const nextCode = `CLI-${1001 + allClients.length}`;

      const newClient = {
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        document: `V-${randomDocNum}`,
        type: 'Natural',
        credit_usd: 0,
        code: nextCode
      };

      return await this.createClient(newClient);
    } catch (e) {
      console.error('Error in syncClientFromOrder:', e);
      return null;
    }
  },

  // --- MARKETING OPERATIONS ---
  async getDiscountCodes(): Promise<DiscountCode[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('discount_codes').select('*').order('created_at', { ascending: false });
      if (error) {
        console.warn('Could not fetch discount codes. Table might not exist yet.', error.message);
        return [];
      }
      return data as DiscountCode[];
    } catch (err) {
      return [];
    }
  }

, async saveDiscountCode(code: Partial<DiscountCode>): Promise<DiscountCode> {
    if (!supabase) throw new Error("No supabase instance");
    
    if (code.id) {
      const { data, error } = await supabase.from('discount_codes').update(code).eq('id', code.id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase.from('discount_codes').insert(code).select().single();
      if (error) throw error;
      return data;
    }
  }

, async deleteDiscountCode(id: string): Promise<void> {
    if (!supabase) throw new Error("No supabase instance");
    const { error } = await supabase.from('discount_codes').delete().eq('id', id);
    if (error) throw error;
  }

, async getLoyaltySettings(): Promise<LoyaltySettings | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from('loyalty_settings').select('*').limit(1).single();
      if (error) {
        console.warn('Could not fetch loyalty settings. Table might not exist yet.', error.message);
        return null;
      }
      return data as LoyaltySettings;
    } catch (err) {
      return null;
    }
  }

, async saveLoyaltySettings(settings: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
    if (!supabase) throw new Error("No supabase instance");
    
    if (settings.id) {
      const { data, error } = await supabase.from('loyalty_settings').update(settings).eq('id', settings.id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase.from('loyalty_settings').insert(settings).select().single();
      if (error) throw error;
      return data;
    }
  }

, async getLoyaltyRewards(): Promise<LoyaltyReward[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('loyalty_rewards').select('*').order('points_cost', { ascending: true });
      if (error) return [];
      return data as LoyaltyReward[];
    } catch (err) {
      return [];
    }
  }

, async saveLoyaltyReward(reward: Partial<LoyaltyReward>): Promise<LoyaltyReward> {
    if (!supabase) throw new Error("No supabase instance");
    
    if (reward.id) {
      const { data, error } = await supabase.from('loyalty_rewards').update(reward).eq('id', reward.id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase.from('loyalty_rewards').insert(reward).select().single();
      if (error) throw error;
      return data;
    }
  }

, async deleteLoyaltyReward(id: string): Promise<void> {
    if (!supabase) throw new Error("No supabase instance");
    const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
    if (error) throw error;
  }
  
, async getCustomerPoints(phoneNumber: string): Promise<number> {
    if (!supabase) return 0;
    try {
      const { data, error } = await supabase.from('customer_points').select('points').eq('phone_number', phoneNumber).single();
      if (error) return 0;
      return data?.points || 0;
    } catch (err) {
      return 0;
    }
  }

, async addCustomerPoints(phoneNumber: string, pointsToAdd: number): Promise<void> {
    if (!supabase) return;
    try {
      const { data: existing } = await supabase.from('customer_points').select('*').eq('phone_number', phoneNumber).single();
      if (existing) {
        await supabase.from('customer_points').update({ points: existing.points + pointsToAdd }).eq('phone_number', phoneNumber);
      } else {
        await supabase.from('customer_points').insert({ phone_number: phoneNumber, points: pointsToAdd });
      }
    } catch (e) {
      console.warn('Could not add points', e);
    }
  }

, async subtractCustomerPoints(phoneNumber: string, pointsToSubtract: number): Promise<void> {
    if (!supabase) return;
    try {
      const { data: existing } = await supabase.from('customer_points').select('*').eq('phone_number', phoneNumber).single();
      if (existing && existing.points >= pointsToSubtract) {
        await supabase.from('customer_points').update({ points: existing.points - pointsToSubtract }).eq('phone_number', phoneNumber);
      }
    } catch (e) {
      console.warn('Could not subtract points', e);
    }
  }

  // --- WISHLIST OPERATIONS (REAL SUPABASE + LOCALSTORAGE FALLBACK) ---
  , async getWishlist(email: string): Promise<WishlistItem[]> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('wishlist')
          .select('*')
          .eq('user_email', cleanEmail);
        if (!error && data) {
          const list = data as WishlistItem[];
          return list.filter((item: any) => 
            item && 
            item.product_id && 
            typeof item.product_id === 'string' && 
            item.product_id !== '[object Object]' &&
            item.product_id.trim() !== ''
          );
        }
      } catch (e) {
        console.warn("Could not query wishlist from Supabase, falling back to LocalStorage:", e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_wishlist');
      if (saved) {
        const list = JSON.parse(saved);
        return list.filter((item: any) => 
          item &&
          (item.user_email || '').toLowerCase() === cleanEmail &&
          item.product_id &&
          typeof item.product_id === 'string' &&
          item.product_id !== '[object Object]' &&
          item.product_id.trim() !== ''
        );
      }
    } catch (e) {
      console.warn('Error reading wishlist from localStorage:', e);
    }
    return [];
  }

  , async addToWishlist(email: string, productId: string): Promise<boolean> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !productId) return false;

    const newItem: WishlistItem = {
      id: crypto.randomUUID(),
      user_email: cleanEmail,
      product_id: productId,
      created_at: new Date().toISOString()
    };

    let savedLocally = false;
    try {
      const saved = localStorage.getItem('copias_bellavista_wishlist');
      const list = saved ? JSON.parse(saved) : [];
      if (!list.some((item: any) => (item.user_email || '').toLowerCase() === cleanEmail && item.product_id === productId)) {
        list.push(newItem);
        localStorage.setItem('copias_bellavista_wishlist', JSON.stringify(list));
      }
      savedLocally = true;
    } catch (e) {
      console.warn("Error updating wishlist in localStorage:", e);
    }

    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('wishlist')
          .select('id')
          .eq('user_email', cleanEmail)
          .eq('product_id', productId)
          .maybeSingle();

        if (!existing) {
          await supabase.from('wishlist').insert([newItem]);
        }
        return true;
      } catch (e) {
        console.warn("Could not insert wishlist item into Supabase, used local storage fallback:", e);
      }
    }

    return savedLocally;
  }

  , async removeFromWishlist(email: string, productId: string): Promise<boolean> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !productId) return false;

    let savedLocally = false;
    try {
      const saved = localStorage.getItem('copias_bellavista_wishlist');
      if (saved) {
        let list = JSON.parse(saved);
        list = list.filter((item: any) => !((item.user_email || '').toLowerCase() === cleanEmail && item.product_id === productId));
        localStorage.setItem('copias_bellavista_wishlist', JSON.stringify(list));
      }
      savedLocally = true;
    } catch (e) {
      console.warn("Error removing wishlist item from localStorage:", e);
    }

    if (supabase) {
      try {
        await supabase
          .from('wishlist')
          .delete()
          .eq('user_email', cleanEmail)
          .eq('product_id', productId);
        return true;
      } catch (e) {
        console.warn("Could not delete wishlist item from Supabase, used local storage fallback:", e);
      }
    }

    return savedLocally;
  }

  // Helper to check if string is a valid UUID
  , isUUID(str?: string): boolean {
    return isUUID(str);
  }

  // --- STORE USERS OPERATIONS ---
  , async getStoreUsers(): Promise<StoreUser[]> {
    let dbUsers: StoreUser[] = [];
    let dbFetched = false;
    if (supabase) {
      try {
        const { data, error } = await supabase.from('store_users').select('*').order('created_at', { ascending: false });
        if (!error && data && Array.isArray(data)) {
          dbUsers = data;
          dbFetched = true;
        }
      } catch (e) {
        console.warn('Could not fetch store users from Supabase', e);
      }
    }

    let localUsers: StoreUser[] = [];
    try {
      const local = localStorage.getItem('copias_bellavista_store_users');
      if (local) {
        localUsers = JSON.parse(local);
      }
    } catch (e) {
      console.warn('Error reading store users from localStorage', e);
    }

    const localMap = new Map<string, StoreUser>();
    localUsers.forEach(u => {
      const keyById = (u.id || '').toLowerCase();
      const keyByEmail = (u.email || '').toLowerCase();
      if (keyById) localMap.set(keyById, u);
      if (keyByEmail) localMap.set(keyByEmail, u);
    });

    let combined: StoreUser[] = [];
    if (dbFetched) {
      // 100% Real data from Supabase store_users - NO simulated seed users!
      combined = dbUsers.map(dbUser => {
        const local = localMap.get((dbUser.id || '').toLowerCase()) || 
                      localMap.get((dbUser.email || '').toLowerCase());
        return {
          ...dbUser,
          email: (dbUser.email || '').trim().toLowerCase(),
          password: local?.password || '123456',
          permissions: local?.permissions || (dbUser as any).permissions || getDefaultPermissionsForRole(dbUser.role)
        };
      });
    } else {
      // Fallback only if offline/no connection
      combined = localUsers.map(u => ({
        ...u,
        email: (u.email || '').trim().toLowerCase()
      }));
    }

    // Save real list to LocalStorage cache
    try {
      localStorage.setItem('copias_bellavista_store_users', JSON.stringify(combined));
    } catch (e) {}

    return combined;
  }

  , async normalizeAllUserEmailsToLowerCase(): Promise<void> {
    try {
      // 1. LocalStorage store_users
      const storeUsersRaw = localStorage.getItem('copias_bellavista_store_users');
      if (storeUsersRaw) {
        let list = JSON.parse(storeUsersRaw);
        if (Array.isArray(list)) {
          let updated = false;
          list = list.map((u: any) => {
            if (u.email && u.email !== u.email.trim().toLowerCase()) {
              updated = true;
              return { ...u, email: u.email.trim().toLowerCase() };
            }
            return u;
          });
          if (updated) {
            localStorage.setItem('copias_bellavista_store_users', JSON.stringify(list));
          }
        }
      }

      // 2. LocalStorage clients
      const clientsRaw = localStorage.getItem('copias_bellavista_local_clients');
      if (clientsRaw) {
        let list = JSON.parse(clientsRaw);
        if (Array.isArray(list)) {
          let updated = false;
          list = list.map((c: any) => {
            let change = false;
            let newObj = { ...c };
            if (newObj.email && newObj.email !== newObj.email.trim().toLowerCase()) {
              newObj.email = newObj.email.trim().toLowerCase();
              change = true;
            }
            if (newObj.correo && newObj.correo !== newObj.correo.trim().toLowerCase()) {
              newObj.correo = newObj.correo.trim().toLowerCase();
              change = true;
            }
            if (change) updated = true;
            return newObj;
          });
          if (updated) {
            localStorage.setItem('copias_bellavista_local_clients', JSON.stringify(list));
          }
        }
      }

      // 3. Supabase database tables (if connected)
      if (supabase) {
        const { data: suData } = await supabase.from('store_users').select('*');
        if (suData && Array.isArray(suData)) {
          for (const u of suData) {
            if (u.email && u.email !== u.email.trim().toLowerCase()) {
              const cleanE = u.email.trim().toLowerCase();
              await supabase.from('store_users').update({ email: cleanE }).eq('id', u.id);
            }
          }
        }
        const { data: cData } = await supabase.from('clients').select('*');
        if (cData && Array.isArray(cData)) {
          for (const c of cData) {
            if (c.email && c.email !== c.email.trim().toLowerCase()) {
              const cleanE = c.email.trim().toLowerCase();
              await supabase.from('clients').update({ email: cleanE, correo: cleanE }).eq('id', c.id);
            } else if (c.correo && c.correo !== c.correo.trim().toLowerCase()) {
              const cleanE = c.correo.trim().toLowerCase();
              await supabase.from('clients').update({ email: cleanE, correo: cleanE }).eq('id', c.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error normalizing user emails in database:', e);
    }
  }

  , async addStoreUser(user: Omit<StoreUser, 'id' | 'created_at'> & { id?: string }): Promise<StoreUser | null> {
    const cleanUserPayload: Record<string, any> = {
      name: (user.name || '').trim(),
      email: (user.email || '').trim().toLowerCase(),
      password: (user.password || '123456').trim(),
      role: user.role || 'Cajero',
      is_active: user.is_active !== false,
      created_at: new Date().toISOString()
    };

    if (user.phone) cleanUserPayload.phone = user.phone;
    if (user.telefono) cleanUserPayload.telefono = user.telefono;
    if (user.document) cleanUserPayload.document = user.document;
    if (user.doc_type) cleanUserPayload.doc_type = user.doc_type;
    if (user.doc_number) cleanUserPayload.doc_number = user.doc_number;
    if (user.tipo_documento) cleanUserPayload.tipo_documento = user.tipo_documento;
    if (user.documento) cleanUserPayload.documento = user.documento;
    if (user.client_code) cleanUserPayload.client_code = user.client_code;
    if (user.permissions) cleanUserPayload.permissions = user.permissions;

    let savedDbUser: StoreUser | null = null;
    if (supabase) {
      try {
        let dbRole = cleanUserPayload.role || 'Cajero';
        if (dbRole === 'Vendedor') dbRole = 'Cajero';
        if (!['Propietario', 'Admin', 'Gerente', 'Cajero', 'Despachador', 'Repartidor'].includes(dbRole)) {
          dbRole = 'Cajero';
        }

        const supabasePayload = {
          name: cleanUserPayload.name,
          email: cleanUserPayload.email,
          role: dbRole,
          is_active: cleanUserPayload.is_active !== false,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from('store_users').upsert([supabasePayload], { onConflict: 'email' }).select().single();
        if (!error && data) {
          savedDbUser = data;
        } else if (error) {
          console.warn('Supabase store_users insert error:', error.message);
          const { data: d2 } = await supabase.from('store_users').insert([supabasePayload]).select().single();
          if (d2) savedDbUser = d2;
        }
      } catch (e) {
        console.warn('Could not add store user to Supabase', e);
      }
    }

    const finalUser: StoreUser = savedDbUser ? {
      ...savedDbUser,
      password: cleanUserPayload.password || '123456',
      permissions: cleanUserPayload.permissions || getDefaultPermissionsForRole(savedDbUser.role)
    } : {
      id: user.id || 'usr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      ...user,
      ...cleanUserPayload,
      permissions: cleanUserPayload.permissions || getDefaultPermissionsForRole(cleanUserPayload.role)
    };

    // Update LocalStorage
    try {
      let localUsers: StoreUser[] = [];
      const local = localStorage.getItem('copias_bellavista_store_users');
      if (local) localUsers = JSON.parse(local);
      const updatedUsers = [finalUser, ...localUsers.filter(u => u.email !== finalUser.email && u.id !== finalUser.id)];
      localStorage.setItem('copias_bellavista_store_users', JSON.stringify(updatedUsers));
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_store_users_updated'));
    }

    return finalUser;
  }

  , async updateStoreUser(id: string, updates: Partial<StoreUser>): Promise<boolean> {
    const cleanId = (id || '').toString();
    const cleanUpdates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (updates.name !== undefined && updates.name !== null) cleanUpdates.name = String(updates.name).trim();
    if (updates.email !== undefined && updates.email !== null) cleanUpdates.email = String(updates.email).trim().toLowerCase();
    if (updates.password !== undefined && updates.password !== null && String(updates.password).trim()) cleanUpdates.password = String(updates.password).trim();
    if (updates.role !== undefined) cleanUpdates.role = updates.role;
    if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;
    if (updates.phone !== undefined) cleanUpdates.phone = updates.phone;
    if (updates.telefono !== undefined) cleanUpdates.telefono = updates.telefono;
    if (updates.client_code !== undefined) cleanUpdates.client_code = updates.client_code;
    if (updates.permissions !== undefined) cleanUpdates.permissions = updates.permissions;

    let success = false;
    if (supabase && cleanId) {
      try {
        const supabaseUpdates: Record<string, any> = {
          updated_at: new Date().toISOString()
        };
        if (updates.name !== undefined && updates.name !== null) supabaseUpdates.name = String(updates.name).trim();
        if (updates.email !== undefined && updates.email !== null) supabaseUpdates.email = String(updates.email).trim().toLowerCase();
        if (updates.is_active !== undefined) supabaseUpdates.is_active = updates.is_active;
        if (updates.role !== undefined) {
          let r = updates.role;
          if (r === 'Vendedor') r = 'Cajero';
          if (!['Propietario', 'Admin', 'Gerente', 'Cajero', 'Despachador', 'Repartidor'].includes(r)) r = 'Cajero';
          supabaseUpdates.role = r;
        }

        if (isUUID(cleanId)) {
          const { error, data } = await supabase.from('store_users').update(supabaseUpdates).eq('id', cleanId).select();
          if (!error && data && data.length > 0) {
            success = true;
          }
        }

        const targetEmail = (cleanId.includes('@') ? cleanId : updates.email || '').toLowerCase();
        if (!success && targetEmail) {
          const { error, data } = await supabase.from('store_users').update(supabaseUpdates).ilike('email', targetEmail).select();
          if (!error && data && data.length > 0) {
            success = true;
          }
        }

        // Upsert fallback if user row didn't exist in Supabase yet
        if (!success && (updates.name || updates.email)) {
          const localList = await this.getStoreUsers();
          const target = localList.find(u => u.id === cleanId || u.email === cleanId || (u.email && (u.email || '').toLowerCase() === cleanId.toLowerCase()));
          let r = updates.role || target?.role || 'Cajero';
          if (r === 'Vendedor') r = 'Cajero';
          if (!['Propietario', 'Admin', 'Gerente', 'Cajero', 'Despachador', 'Repartidor'].includes(r)) r = 'Cajero';

          const fullPayload = {
            name: updates.name || target?.name || 'Usuario',
            email: (updates.email || target?.email || cleanId).toLowerCase(),
            role: r,
            is_active: updates.is_active !== undefined ? updates.is_active : (target?.is_active !== false),
            updated_at: new Date().toISOString()
          };
          if (fullPayload.email) {
            const { error } = await supabase.from('store_users').upsert([fullPayload], { onConflict: 'email' });
            if (!error) success = true;
          }
        }
      } catch (e) {
        console.warn('Could not update store user in Supabase', e);
      }
    }

    // Always update LocalStorage
    try {
      let localUsers: StoreUser[] = [];
      const local = localStorage.getItem('copias_bellavista_store_users');
      if (local) localUsers = JSON.parse(local);

      let found = false;
      const updatedUsers = localUsers.map(u => {
        const matches = (u.id && cleanId && u.id === cleanId) || (u.email && cleanId && u.email === cleanId) || (!!u.email && (u.email || '').toLowerCase() === cleanId.toLowerCase());
        if (matches) {
          found = true;
          return { ...u, ...updates };
        }
        return u;
      });

      if (!found && cleanId) {
        updatedUsers.push({
          id: cleanId.includes('@') ? 'usr-' + Date.now() : cleanId,
          name: updates.name || 'Usuario',
          email: updates.email || (cleanId.includes('@') ? cleanId : ''),
          password: updates.password || '123456',
          role: updates.role || 'Cajero',
          is_active: updates.is_active !== undefined ? updates.is_active : true,
          ...updates
        });
      }

      localStorage.setItem('copias_bellavista_store_users', JSON.stringify(updatedUsers));
      success = true;
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_store_users_updated'));
    }

    return success;
  }

  , async deleteStoreUser(id: string, email?: string): Promise<boolean> {
    const cleanId = (id || '').toString().trim();
    const cleanEmail = (email || (cleanId.includes('@') ? cleanId : '')).trim().toLowerCase();
    let success = false;
    if (supabase) {
      try {
        if (cleanId && isUUID(cleanId)) {
          const { error } = await supabase.from('store_users').delete().eq('id', cleanId);
          if (!error) success = true;
        }
        if (cleanEmail) {
          const { error } = await supabase.from('store_users').delete().ilike('email', cleanEmail);
          if (!error) success = true;
        }
        if (cleanId && !isUUID(cleanId) && !cleanId.includes('@')) {
          const { error } = await supabase.from('store_users').delete().eq('id', cleanId);
          if (!error) success = true;
        }
      } catch (e) {
        console.warn('Could not delete store user from Supabase', e);
      }
    }

    // Delete from LocalStorage
    try {
      let localUsers: StoreUser[] = [];
      const local = localStorage.getItem('copias_bellavista_store_users');
      if (local) localUsers = JSON.parse(local);

      const updatedUsers = localUsers.filter(u => {
        const uId = (u.id || '').toString().trim();
        const uEmail = (u.email || '').trim().toLowerCase();
        if (cleanId && uId === cleanId) return false;
        if (cleanId && uEmail === cleanId.toLowerCase()) return false;
        if (cleanEmail && uEmail === cleanEmail) return false;
        return true;
      });
      localStorage.setItem('copias_bellavista_store_users', JSON.stringify(updatedUsers));
      success = true;
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_store_users_updated'));
    }

    return success;
  }

  , async loginStoreUser(email: string, password?: string): Promise<StoreUser | null> {
    const users = await this.getStoreUsers();
    const normalizedEmail = (email || '').trim().toLowerCase();
    const found = users.find(u => u.email && u.email.trim().toLowerCase() === normalizedEmail && u.is_active);
    if (!found) return null;

    if (found.password) {
      if (password && found.password === password) {
        return found;
      }
      return null;
    }
    
    // Fallback if user was created without password
    return found;
  }

  , async resetPasswordStoreUser(email: string, newPassword?: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const updatedPass = newPassword ? newPassword.trim() : '123456';

    let dbUpdated = false;
    if (supabase) {
      try {
        const { error } = await supabase
          .from('store_users')
          .update({ password: updatedPass, updated_at: new Date().toISOString() })
          .ilike('email', normalizedEmail);
        if (!error) dbUpdated = true;
      } catch (e) {
        console.warn('Could not update store_users password in Supabase:', e);
      }
    }

    const users = await this.getStoreUsers();
    const found = users.find(u => (u.email || '').trim().toLowerCase() === normalizedEmail);

    if (found) {
      await this.updateStoreUser(found.id!, { password: updatedPass });
      return { success: true, message: `Contraseña restablecida con éxito para ${normalizedEmail}. Ya puedes iniciar sesión.` };
    }

    if (dbUpdated) {
      return { success: true, message: `Contraseña restablecida con éxito en la base de datos para ${normalizedEmail}. Ya puedes iniciar sesión.` };
    }

    return { success: false, message: 'No se encontró ninguna cuenta registrada con este correo electrónico.' };
  }

  // --- CLIENT AUTHENTICATION & SECURITY METHODS ---
  , async findClientByIdentifier(identifier: string): Promise<any | null> {
    if (!identifier || !identifier.trim()) return null;
    const clean = identifier.trim().toLowerCase();
    const docClean = clean.replace(/[^a-z0-9]/gi, '');

    // 1. Check directly in Supabase DB if available
    if (supabase) {
      try {
        // Query clients table in Supabase
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*');

        if (clientsData && clientsData.length > 0) {
          const match = clientsData.find(c => {
            let phone = c.phone || '';
            let email = (c.email || '').toLowerCase();
            if (phone.includes(' | email:')) {
              const parts = phone.split(' | email:');
              if (!email) email = parts[1].trim().toLowerCase();
            }
            const cDoc = (c.doc_number || c.documento || c.document || c.rif || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
            const cType = (c.doc_type || c.tipo_documento || 'V').toLowerCase();
            const fullDoc = `${cType}-${cDoc}`.replace(/[^a-z0-9]/gi, '');

            return email === clean || cDoc === docClean || fullDoc === docClean || (c.document || '').toLowerCase().replace(/[^a-z0-9]/gi, '') === docClean;
          });

          if (match) {
            let phone = match.phone || '';
            let email = match.email || '';
            if (phone.includes(' | email:')) {
              const parts = phone.split(' | email:');
              phone = parts[0].trim();
              if (!email) email = parts[1].trim();
            }
            const docType = match.doc_type || match.tipo_documento || 'V';
            const docNum = match.doc_number || match.documento || (match.document ? match.document.replace(/^[a-zA-Z]-?/, '') : '');

            return {
              id: match.id,
              doc_type: docType,
              doc_number: docNum,
              tipo_documento: docType,
              documento: docNum,
              document: match.document || `${docType}-${docNum}`,
              rif: match.document || `${docType}-${docNum}`,
              name: match.name,
              nombres: match.name,
              apellidos: '',
              correo: email || clean,
              email: email || clean,
              phone: phone,
              telefono: phone,
              password: match.password || '',
              estado: match.is_active !== false,
              is_active: match.is_active !== false
            };
          }
        }

        // Query store_users table in Supabase
        const { data: storeUsersData } = await supabase
          .from('store_users')
          .select('*');

        if (storeUsersData && storeUsersData.length > 0) {
          const matchU = storeUsersData.find(u => {
            const uEmail = (u.email || '').toLowerCase();
            const uDoc = (u.document || u.doc_number || u.documento || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
            return uEmail === clean || (uDoc && uDoc === docClean);
          });

          if (matchU) {
            const uDocType = matchU.doc_type || matchU.tipo_documento || 'V';
            const uDocNum = matchU.doc_number || matchU.documento || '';

            return {
              id: matchU.id,
              doc_type: uDocType,
              doc_number: uDocNum,
              tipo_documento: uDocType,
              documento: uDocNum,
              document: matchU.document || `${uDocType}-${uDocNum}`,
              rif: matchU.document || `${uDocType}-${uDocNum}`,
              name: matchU.name,
              nombres: matchU.name,
              apellidos: '',
              correo: matchU.email,
              email: matchU.email,
              phone: matchU.phone || matchU.telefono || '',
              telefono: matchU.phone || matchU.telefono || '',
              password: matchU.password || '',
              estado: matchU.is_active !== false,
              is_active: matchU.is_active !== false
            };
          }
        }
      } catch (e) {
        console.warn("Error querying client directly from Supabase:", e);
      }
    }

    // 2. Local fallback check
    try {
      const clients = await this.getClients();
      const matchClient = clients.find(c => {
        const cEmail = (c.email || c.correo || '').toLowerCase();
        const cDoc = (c.doc_number || c.documento || c.rif || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
        const cFullDoc = `${(c.doc_type || c.tipo_documento || '').toLowerCase()}${cDoc}`;
        return cEmail === clean || cDoc === docClean || cFullDoc === docClean;
      });

      if (matchClient) return matchClient;

      const storeUsers = await this.getStoreUsers();
      const matchUser = storeUsers.find(u => {
        const uEmail = (u.email || '').toLowerCase();
        const uDoc = (u.document || u.doc_number || u.documento || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
        return uEmail === clean || (uDoc && uDoc === docClean);
      });

      if (matchUser) {
        const uDocType = matchUser.doc_type || (matchUser as any).tipo_documento || 'V';
        const uDocNum = matchUser.doc_number || (matchUser as any).documento || '';

        return {
          id: matchUser.id,
          doc_type: uDocType,
          doc_number: uDocNum,
          tipo_documento: uDocType,
          documento: uDocNum,
          document: matchUser.document || `${uDocType}-${uDocNum}`,
          rif: matchUser.document || `${uDocType}-${uDocNum}`,
          name: matchUser.name,
          nombres: matchUser.name,
          apellidos: '',
          correo: matchUser.email,
          email: matchUser.email,
          phone: matchUser.phone || matchUser.telefono || '',
          telefono: matchUser.phone || matchUser.telefono || '',
          password: matchUser.password || '',
          estado: matchUser.is_active !== false,
          is_active: matchUser.is_active !== false
        };
      }
    } catch (err) {
      console.error("Error finding client by identifier:", err);
    }
    return null;
  },

  async loginClient(identifier: string, password?: string): Promise<{ success: boolean; client?: any; message: string }> {
    const client = await this.findClientByIdentifier(identifier);
    if (!client) {
      return { success: false, message: 'No encontramos ninguna cuenta asociada a este correo o documento.' };
    }

    if (client.estado === false || client.is_active === false) {
      return { success: false, message: 'Esta cuenta se encuentra inactiva. Contacta a soporte para reactivarla.' };
    }

    if (!password) {
      return { success: true, client, message: 'Cliente encontrado.' };
    }

    // Check password
    if (client.password && client.password !== password) {
      await this.recordSecurityLog('cliente', client.correo || client.email || identifier, 'failed_login', 'Contraseña incorrecta');
      return { success: false, message: 'La contraseña ingresada es incorrecta.' };
    }

    // Log successful login
    await this.recordSecurityLog('cliente', client.correo || client.email || identifier, 'login', 'Inicio de sesión exitoso');
    await this.createSession('cliente', client.id || client.correo, client.correo || client.email || identifier);

    return { success: true, client, message: 'Bienvenido(a)' };
  },

  async registerClientUser(data: {
    tipo_documento: string;
    documento: string;
    nombres: string;
    apellidos: string;
    correo: string;
    telefono: string;
    password?: string;
  }): Promise<{ success: boolean; client?: any; message: string; isAlreadyRegistered?: boolean }> {
    try {
      const cleanEmail = (data?.correo || '').trim().toLowerCase();
      const docType = data?.tipo_documento || 'V';
      const docNum = (data?.documento || '').trim();
      const formattedDoc = `${docType}-${docNum}`;

      // 1. Verify email uniqueness
      const existingByEmail = await this.findClientByIdentifier(cleanEmail);
      if (existingByEmail) {
        if (data.password && existingByEmail.password && existingByEmail.password === data.password) {
          return {
            success: true,
            client: existingByEmail,
            message: '¡Cuenta registrada encontrada! Iniciando sesión...'
          };
        }
        return { 
          success: false, 
          isAlreadyRegistered: true,
          client: existingByEmail,
          message: 'El correo electrónico ya está registrado. Por favor ingresa tu contraseña para iniciar sesión.' 
        };
      }

      // 2. Verify document uniqueness
      const existingByDoc = await this.findClientByIdentifier(formattedDoc);
      if (existingByDoc) {
        if (data.password && existingByDoc.password && existingByDoc.password === data.password) {
          return {
            success: true,
            client: existingByDoc,
            message: '¡Cuenta registrada encontrada! Iniciando sesión...'
          };
        }
        return { 
          success: false, 
          isAlreadyRegistered: true,
          client: existingByDoc,
          message: 'El número de documento / RIF ya está registrado con otra cuenta.' 
        };
      }

      const clientName = `${data.nombres.trim()} ${data.apellidos.trim()}`.trim();

      // 3. Create record in clients table
      const newClient = await this.createClient({
        name: clientName,
        document: formattedDoc,
        doc_type: docType,
        doc_number: docNum,
        tipo_documento: docType,
        documento: docNum,
        rif: formattedDoc,
        type: docType === 'J' || docType === 'G' ? 'Jurídico' : 'Natural',
        phone: data.telefono.trim(),
        email: cleanEmail,
        password: data.password || '123456',
        is_active: true
      });

      // 4. Sync to store_users table with role 'Cliente'
      await this.addStoreUser({
        name: clientName,
        email: cleanEmail,
        phone: data.telefono.trim(),
        telefono: data.telefono.trim(),
        document: formattedDoc,
        doc_type: docType,
        doc_number: docNum,
        tipo_documento: docType,
        documento: docNum,
        password: data.password || '123456',
        role: 'Cliente',
        is_active: true,
        client_code: newClient?.code || ''
      });

      await this.recordSecurityLog('cliente', cleanEmail, 'register', 'Registro de cliente completado en base de datos');
      return { success: true, client: newClient, message: '¡Cuenta creada exitosamente en la base de datos!' };
    } catch (err: any) {
      console.error("Error registering client:", err);
      return { success: false, message: 'Error al registrar cliente: ' + (err.message || 'Error del servidor') };
    }
  },

  async resetClientPassword(emailOrDoc: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const client = await this.findClientByIdentifier(emailOrDoc);
    if (!client) {
      return { success: false, message: 'No se encontró ninguna cuenta registrada con este correo electrónico o documento.' };
    }

    const email = (client.correo || client.email || '').trim().toLowerCase();
    if (!email) {
      return { success: false, message: 'No hay un correo electrónico asociado a esta cuenta.' };
    }

    const updatedPass = newPassword.trim();

    // 1. Update in clients table in Supabase
    if (supabase) {
      try {
        await supabase
          .from('clients')
          .update({ password: updatedPass })
          .eq('id', client.id);

        await supabase
          .from('clients')
          .update({ password: updatedPass })
          .ilike('email', email);
      } catch (e) {
        console.warn("Could not update clients table password in Supabase:", e);
      }
    }

    // 2. Update in store_users table
    await this.resetPasswordStoreUser(email, updatedPass);
    await this.recordSecurityLog('cliente', email, 'password_reset', 'Restablecimiento de contraseña de cliente exitoso');

    return { success: true, message: '¡Contraseña actualizada correctamente! Ya puedes iniciar sesión con tu nueva contraseña.' };
  },

  // --- SECURITY LOGS & SESSION MANAGEMENT ---
  async recordSecurityLog(userType: 'interno' | 'cliente', email: string, action: string, details: string) {
    const log = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user_type: userType,
      user_email: email,
      action,
      ip: '127.0.0.1 (VPN / Cloud Run)',
      details
    };
    try {
      const saved = localStorage.getItem('copias_bellavista_security_logs');
      const logs = saved ? JSON.parse(saved) : [];
      logs.unshift(log);
      if (logs.length > 100) logs.pop();
      localStorage.setItem('copias_bellavista_security_logs', JSON.stringify(logs));
    } catch (e) {
      console.error("Error recording security log:", e);
    }
  },

  async getSecurityLogs(): Promise<any[]> {
    try {
      const saved = localStorage.getItem('copias_bellavista_security_logs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  async createSession(userType: 'interno' | 'cliente', userId: string, email: string): Promise<any> {
    const session = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`,
      usuario_tipo: userType,
      usuario_id: userId,
      usuario_email: email,
      token: `jwt-token-${Math.random().toString(36).substring(2)}-${Date.now()}`,
      ip: '127.0.0.1',
      navegador: typeof navigator !== 'undefined' ? navigator.userAgent : 'Browser Agent',
      fecha_inicio: new Date().toISOString(),
      fecha_expira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    try {
      const saved = localStorage.getItem('copias_bellavista_active_sessions');
      const sessions = saved ? JSON.parse(saved) : [];
      sessions.unshift(session);
      localStorage.setItem('copias_bellavista_active_sessions', JSON.stringify(sessions));
    } catch (e) {}
    return session;
  },

  async getSessions(userEmail: string): Promise<any[]> {
    try {
      const saved = localStorage.getItem('copias_bellavista_active_sessions');
      const sessions = saved ? JSON.parse(saved) : [];
      return sessions.filter((s: any) => s.usuario_email === userEmail);
    } catch (e) {
      return [];
    }
  },

  async terminateAllSessions(userEmail: string): Promise<boolean> {
    try {
      const saved = localStorage.getItem('copias_bellavista_active_sessions');
      if (saved) {
        let sessions = JSON.parse(saved);
        sessions = sessions.filter((s: any) => s.usuario_email !== userEmail);
        localStorage.setItem('copias_bellavista_active_sessions', JSON.stringify(sessions));
      }
      await this.recordSecurityLog('cliente', userEmail, 'logout_all', 'Sesiones cerradas en todos los dispositivos');
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- PROVIDER OPERATIONS ---
, async getProviders(): Promise<Provider[]> {
    let apiProviders: Provider[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('providers')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          apiProviders = data as Provider[];
        }
      } catch (e) {
        console.warn('Error fetching providers from Supabase:', e);
      }
    }

    // Load from localStorage
    let localProviders: Provider[] = [];
    try {
      const saved = localStorage.getItem('copias_bellavista_local_providers');
      if (saved) {
        localProviders = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading local providers:', e);
    }

    // Merge lists
    const mergedMap = new Map<string, Provider>();
    localProviders.forEach(p => {
      mergedMap.set(p.id || p.rif || p.code, p);
    });
    apiProviders.forEach(p => {
      mergedMap.set(p.id || p.rif || p.code, p);
    });

    return Array.from(mergedMap.values()).sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  },

  async createProvider(provider: Omit<Provider, 'id'> & { id?: string }): Promise<Provider> {
    // Generate consecutive sequential code
    let calculatedCode = provider.code?.trim();
    if (!calculatedCode) {
      try {
        const allProviders = await this.getProviders();
        let maxNum = 0;
        allProviders.forEach(p => {
          if (!p.code) return;
          const match = p.code.match(/(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        const nextNum = maxNum + 1;
        calculatedCode = nextNum < 1000 ? `PROV-${String(nextNum).padStart(3, '0')}` : `PROV-${nextNum}`;
      } catch (e) {
        calculatedCode = 'PROV-001';
      }
    }

    const newProvider: Provider = {
      id: provider.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Math.floor(Math.random() * 1000000)}`),
      code: calculatedCode,
      rif: provider.rif,
      name: provider.name,
      type: provider.type || 'Jurídico',
      phone: provider.phone,
      bank_name: provider.bank_name || '',
      created_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        const { data, error } = await supabase.from('providers').insert([newProvider]).select();
        if (!error && data && data[0]) {
          return data[0] as Provider;
        } else {
          console.warn("Supabase insert provider failed (RLS/schema). Using local fallback:", error);
        }
      } catch (e) {
        console.warn("Supabase insert provider error. Using local fallback:", e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_providers');
      const localProviders = saved ? JSON.parse(saved) : [];
      localProviders.push(newProvider);
      localStorage.setItem('copias_bellavista_local_providers', JSON.stringify(localProviders));
    } catch (e) {
      console.error("Failed to save provider to localStorage:", e);
    }

    return newProvider;
  },

  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | null> {
    if (supabase && id && !String(id).startsWith('local-')) {
      try {
        const { data, error } = await supabase
          .from('providers')
          .update(updates)
          .eq('id', id)
          .select();
        if (!error && data && data[0]) {
          return data[0] as Provider;
        }
      } catch (e) {
        console.warn("Supabase update provider error. Updating local copy instead:", e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_providers');
      if (saved) {
        let localProviders = JSON.parse(saved);
        localProviders = localProviders.map((p: any) => {
          if (p.id === id) {
            return { ...p, ...updates };
          }
          return p;
        });
        localStorage.setItem('copias_bellavista_local_providers', JSON.stringify(localProviders));
        return localProviders.find((p: any) => p.id === id) || null;
      }
    } catch (e) {
      console.error("Failed to update provider in localStorage:", e);
    }
    return null;
  },

  async deleteProvider(id: string): Promise<boolean> {
    if (supabase && id && !String(id).startsWith('local-')) {
      try {
        const { error } = await supabase.from('providers').delete().eq('id', id);
        if (!error) return true;
      } catch (e) {
        console.warn("Supabase delete provider failed. Deleting from local copy:", e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_providers');
      if (saved) {
        let localProviders = JSON.parse(saved);
        localProviders = localProviders.filter((p: any) => p.id !== id);
        localStorage.setItem('copias_bellavista_local_providers', JSON.stringify(localProviders));
      }
    } catch (e) {
      console.error("Failed to delete provider from localStorage:", e);
    }
    return true;
  },

  // ==========================================
  // COMPRAS E INVENTARIO (PURCHASES & STOCK)
  // ==========================================
  async getPurchases(): Promise<Purchase[]> {
    let apiPurchases: Purchase[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('purchases')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          apiPurchases = data.map((p: any) => ({
            ...p,
            items: typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || [])
          })) as Purchase[];
        }
      } catch (e) {
        console.warn('Error fetching purchases from Supabase:', e);
      }
    }

    let localPurchases: Purchase[] = [];
    try {
      const saved = localStorage.getItem('copias_bellavista_local_purchases');
      if (saved) {
        localPurchases = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading local purchases:', e);
    }

    const mergedMap = new Map<string, Purchase>();
    localPurchases.forEach(p => mergedMap.set(p.id, p));
    apiPurchases.forEach(p => mergedMap.set(p.id, p));

    return Array.from(mergedMap.values()).sort((a, b) => {
      const dateA = new Date(a.date || a.created_at || 0).getTime();
      const dateB = new Date(b.date || b.created_at || 0).getTime();
      return dateB - dateA;
    });
  },

  async createPurchase(
    purchaseData: Omit<Purchase, 'id'> & { id?: string },
    updateProductCost: boolean = false
  ): Promise<{ purchase: Purchase; updatedProducts: Product[] }> {
    notifyProcedureExecuted();
    const allPurchases = await this.getPurchases();
    const purchaseSeq = String(allPurchases.length + 1).padStart(5, '0');
    const newId = purchaseData.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pur-${Date.now()}`);

    const newPurchase: Purchase = {
      id: newId,
      purchase_number: purchaseData.purchase_number || `CMP-${purchaseSeq}`,
      invoice_number: purchaseData.invoice_number || `FAC-${purchaseSeq}`,
      provider_id: purchaseData.provider_id || '',
      provider_name: purchaseData.provider_name || 'Proveedor General',
      provider_rif: purchaseData.provider_rif || '',
      date: purchaseData.date || new Date().toISOString().split('T')[0],
      items: purchaseData.items || [],
      total_amount: purchaseData.total_amount || 0,
      total_items: purchaseData.items?.reduce((sum, it) => sum + Number(it.quantity || 0), 0) || 0,
      status: purchaseData.status || 'completada',
      notes: purchaseData.notes || '',
      update_cost_applied: updateProductCost,
      payment_method: purchaseData.payment_method || 'Efectivo USD',
      payment_status: purchaseData.payment_status || 'pagado',
      due_date: purchaseData.due_date || undefined,
      installments_count: purchaseData.installments_count || undefined,
      installments: purchaseData.installments || undefined,
      created_at: purchaseData.created_at || new Date().toISOString(),
      created_by: purchaseData.created_by || 'Admin'
    };

    // 1. Save purchase to Supabase / localStorage
    if (supabase) {
      try {
        const payloadToSave = {
          ...newPurchase,
          items: JSON.stringify(newPurchase.items),
          installments: newPurchase.installments ? JSON.stringify(newPurchase.installments) : undefined
        };
        const { data, error } = await supabase.from('purchases').insert([payloadToSave]).select();
        if (error) {
          console.warn('Supabase insert purchase warning (using local fallback):', error);
        }
      } catch (e) {
        console.warn('Supabase insert purchase error (using local fallback):', e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_purchases');
      const localPurchases = saved ? JSON.parse(saved) : [];
      localPurchases.unshift(newPurchase);
      localStorage.setItem('copias_bellavista_local_purchases', JSON.stringify(localPurchases));
    } catch (e) {
      console.error('Failed to save purchase to localStorage:', e);
    }

    // 2. Obligatory stock update:
    // Locate each selected product by ID/SKU
    // Execute relative stock increase: Stock Nuevo = Stock Actual + Cantidad Comprada
    // (Optional) Update cost_price if updateProductCost is true
    const currentProducts = await this.getProducts();
    const updatedProducts: Product[] = [];

    for (const item of newPurchase.items) {
      if (!item.product_id && !item.sku) continue;
      const targetProd = currentProducts.find(p => p.id === item.product_id || (item.sku && p.sku === item.sku));
      if (targetProd) {
        const currentStock = Number(targetProd.stock || 0);
        const qtyBought = Number(item.quantity || 0);
        const newStock = Math.max(0, currentStock + qtyBought);

        const updatePayload: Partial<Product> = {
          stock: newStock
        };

        if (updateProductCost && item.unit_cost !== undefined && item.unit_cost !== null && item.unit_cost > 0) {
          updatePayload.cost_price = Number(item.unit_cost);
        }

        try {
          const updated = await this.updateProduct(targetProd.id, updatePayload);
          updatedProducts.push(updated);
        } catch (err) {
          console.error(`Failed to update product ${targetProd.id} stock in Supabase:`, err);
          // Fallback: update local storage copy of products if present
          try {
            const savedLocal = localStorage.getItem('copias_bellavista_local_products');
            if (savedLocal) {
              let localProds = JSON.parse(savedLocal);
              localProds = localProds.map((p: any) => p.id === targetProd.id ? { ...p, ...updatePayload } : p);
              localStorage.setItem('copias_bellavista_local_products', JSON.stringify(localProds));
            }
          } catch (le) {
            console.error('Failed to update local product copy:', le);
          }
          updatedProducts.push({ ...targetProd, ...updatePayload });
        }
      }
    }

    // 3. Auto-link to Cuentas por Pagar (CXP) if purchase is credit/pending
    const isCreditPurchase = newPurchase.payment_status === 'pendiente' ||
      newPurchase.payment_status === 'parcial' ||
      newPurchase.status === 'pendiente' ||
      String(newPurchase.payment_method || '').toLowerCase().includes('crédito') ||
      String(newPurchase.payment_method || '').toLowerCase().includes('credito') ||
      String(newPurchase.payment_method || '').toLowerCase().includes('cxp') ||
      String(newPurchase.payment_method || '').toLowerCase().includes('cuenta por pagar') ||
      Boolean(newPurchase.installments && newPurchase.installments.length > 0);

    if (isCreditPurchase) {
      try {
        const cxpId = `cxp-pur-${newPurchase.id}`;
        const totalDebt = Number(newPurchase.total_amount || 0);
        const paidAmount = Number(newPurchase.paid_amount ?? newPurchase.initial_payment ?? 0);
        const remainingDebt = Math.max(0, Number((totalDebt - paidAmount).toFixed(2)));
        const status = remainingDebt <= 0 ? 'pagado' : (paidAmount > 0 ? 'parcial' : 'pendiente');

        const autoCxp: AccountPayable = {
          id: cxpId,
          purchase_id: newPurchase.id,
          invoice_number: newPurchase.invoice_number,
          entity_name: newPurchase.provider_name || 'Proveedor General',
          provider_name: newPurchase.provider_name || 'Proveedor General',
          provider_rif: newPurchase.provider_rif || '',
          subject: `Factura #${newPurchase.invoice_number} - Compra`,
          description: `Cuenta por pagar generada desde Compra Factura #${newPurchase.invoice_number}. Sede/Notas: ${newPurchase.notes || 'Principal'}`,
          total_amount: totalDebt,
          paid_amount: paidAmount,
          remaining_amount: remainingDebt,
          status: status,
          currency: 'USD',
          issue_date: newPurchase.date ? new Date(newPurchase.date).toISOString() : new Date().toISOString(),
          due_date: newPurchase.due_date ? new Date(newPurchase.due_date).toISOString() : undefined,
          installments_count: newPurchase.installments_count,
          installments: newPurchase.installments,
          created_at: newPurchase.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await this.saveAccountPayable(autoCxp);

        if (paidAmount > 0) {
          const initialPaymentRecord: AccountPayablePayment = {
            id: `pay-init-${newPurchase.id}`,
            cxp_id: cxpId,
            account_payable_id: cxpId,
            amount: paidAmount,
            payment_method: 'Abono Inicial',
            payment_date: newPurchase.date ? new Date(newPurchase.date).toISOString() : new Date().toISOString(),
            reference: `Abono Inicial Factura #${newPurchase.invoice_number}`,
            notes: `Abono inicial registrado en compra Factura #${newPurchase.invoice_number}`
          };
          const existingPayments = await this.getAccountsPayablePayments();
          if (!existingPayments.some(p => p.id === initialPaymentRecord.id)) {
            const updated = [initialPaymentRecord, ...existingPayments];
            localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify(updated));
            if (supabase) {
              try {
                await supabase.from('accounts_payable_payments').insert(initialPaymentRecord);
              } catch (e) {}
            }
            window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_payments_updated', { detail: updated }));
          }
        }
      } catch (cxpErr) {
        console.warn('Could not auto-create CXP in createPurchase:', cxpErr);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_purchases_updated'));
    return { purchase: newPurchase, updatedProducts };
  },

  async updatePurchase(id: string, updates: Partial<Purchase>): Promise<Purchase | null> {
    const all = await this.getPurchases();
    const existing = all.find(p => p.id === id);
    if (!existing) return null;

    const updatedPurchase: Purchase = {
      ...existing,
      ...updates
    };

    if (supabase && id && !String(id).startsWith('pur-')) {
      try {
        const payload = {
          ...updatedPurchase,
          items: typeof updatedPurchase.items === 'object' ? JSON.stringify(updatedPurchase.items) : updatedPurchase.items,
          installments: updatedPurchase.installments ? JSON.stringify(updatedPurchase.installments) : undefined
        };
        await supabase.from('purchases').update(payload).eq('id', id);
      } catch (e) {
        console.warn('Supabase update purchase error:', e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_purchases');
      if (saved) {
        let localPurchases = JSON.parse(saved);
        localPurchases = localPurchases.map((p: any) => p.id === id ? updatedPurchase : p);
        localStorage.setItem('copias_bellavista_local_purchases', JSON.stringify(localPurchases));
      }
    } catch (e) {
      console.error('Failed to update purchase in localStorage:', e);
    }

    window.dispatchEvent(new CustomEvent('bellavista_purchases_updated'));
    return updatedPurchase;
  },

  async deletePurchase(id: string): Promise<boolean> {
    if (supabase && id && !String(id).startsWith('pur-')) {
      try {
        const { error } = await supabase.from('purchases').delete().eq('id', id);
        if (!error) return true;
      } catch (e) {
        console.warn('Supabase delete purchase failed:', e);
      }
    }

    try {
      const saved = localStorage.getItem('copias_bellavista_local_purchases');
      if (saved) {
        let localPurchases = JSON.parse(saved);
        localPurchases = localPurchases.filter((p: any) => p.id !== id);
        localStorage.setItem('copias_bellavista_local_purchases', JSON.stringify(localPurchases));
      }
    } catch (e) {
      console.error('Failed to delete purchase from localStorage:', e);
    }
    return true;
  },

  // Publicidad: Banner Slides Operations
  async getBannerSlides(): Promise<BannerSlide[]> {
    const defaultSlides: BannerSlide[] = [
      {
        id: 'slide-1',
        title: 'Servicios de Impresión y Copiado de Alta Calidad',
        subtitle: 'Impresiones a color, b&n, plastificado, encuadernación y soluciones de oficina.',
        badge: '⚡ Servicio Rápido',
        image_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=1500&h=600',
        button_text: 'Ver Papelería & Copias',
        target_category: 'Papelería y Oficina',
        active: true,
        sort_order: 1
      },
      {
        id: 'slide-2',
        title: 'Línea de Repostería Gourmet & Utensilios Especiales',
        subtitle: 'Descubre nuestros moldes, esencias, cortadores y las mejores tortas artesanales.',
        badge: '🍰 Especial Dulce',
        image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=1500&h=600',
        button_text: 'Explorar Repostería',
        target_category: 'Repostería',
        active: true,
        sort_order: 2
      },
      {
        id: 'slide-3',
        title: 'Grandes Descuentos y Promociones Especiales',
        subtitle: 'Aprovecha nuestras ofertas semanales en productos seleccionados.',
        badge: '🔥 Ofertas Top',
        image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&q=80&w=1500&h=600',
        button_text: 'Ver Ofertas',
        target_offer: true,
        active: true,
        sort_order: 3
      }
    ];

    try {
      const savedLocal = localStorage.getItem('copias_bellavista_banner_slides');
      let slides: BannerSlide[] = savedLocal ? JSON.parse(savedLocal) : defaultSlides;

      if (supabase) {
        try {
          const { data, error } = await supabase.from('banner_slides').select('*').order('sort_order', { ascending: true });
          if (!error && data && data.length > 0) {
            slides = data as BannerSlide[];
            localStorage.setItem('copias_bellavista_banner_slides', JSON.stringify(slides));
          } else {
            // Also check key-value app_config
            const { data: configData } = await supabase.from('app_config').select('*').eq('key', 'banner_slides').maybeSingle();
            if (configData && configData.value && Array.isArray(configData.value)) {
              slides = configData.value as BannerSlide[];
              localStorage.setItem('copias_bellavista_banner_slides', JSON.stringify(slides));
            }
          }
        } catch (e) {}
      }
      return slides.sort((a, b) => a.sort_order - b.sort_order);
    } catch (e) {
      console.warn('Error reading banner slides:', e);
      return defaultSlides;
    }
  },

  async saveBannerSlides(slides: BannerSlide[]): Promise<boolean> {
    const sorted = [...slides].map((s, idx) => ({ ...s, sort_order: idx + 1 }));
    localStorage.setItem('copias_bellavista_banner_slides', JSON.stringify(sorted));

    if (supabase) {
      try {
        const { error } = await supabase.from('banner_slides').upsert(sorted);
        if (error) {
          console.warn('Notice upserting banner_slides to Supabase, trying app_config fallback:', error.message);
          await supabase.from('app_config').upsert({
            key: 'banner_slides',
            value: sorted,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        }
      } catch (e) {
        console.warn('Supabase saveBannerSlides exception:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_banner_updated'));
    return true;
  },

  // Publicidad: Landing Special Operations
  async getLandingConfig(): Promise<LandingConfig> {
    const defaultConfig: LandingConfig = {
      is_active: false,
      title: '¡Novedad Dulce! Tres Leches Especial Gourmet',
      subtitle: 'Disfruta de nuestra exquisita torta Tres Leches artesanal preparada con la receta original Bella Vista.',
      badge: '🍰 Novedad Especial',
      image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=600&h=400',
      button_text: 'Explorar Colección Gourmet'
    };

    try {
      const savedLocal = localStorage.getItem('copias_bellavista_landing_config');
      let config: LandingConfig = savedLocal ? JSON.parse(savedLocal) : defaultConfig;

      if (supabase) {
        try {
          const { data, error } = await supabase.from('app_config').select('*').eq('key', 'landing_config').maybeSingle();
          if (!error && data && data.value) {
            config = data.value as LandingConfig;
            localStorage.setItem('copias_bellavista_landing_config', JSON.stringify(config));
          }
        } catch (e) {}
      }
      return config;
    } catch (e) {
      return defaultConfig;
    }
  },

  async saveLandingConfig(config: LandingConfig): Promise<boolean> {
    localStorage.setItem('copias_bellavista_landing_config', JSON.stringify(config));
    localStorage.setItem('copias_bellavista_landing_active', String(config.is_active));

    // Also update disabled_settings disable_landing flag
    try {
      const savedDisabled = localStorage.getItem('copias_bellavista_disabled_settings');
      const parsed = savedDisabled ? JSON.parse(savedDisabled) : {};
      parsed.disable_landing = !config.is_active;
      localStorage.setItem('copias_bellavista_disabled_settings', JSON.stringify(parsed));
    } catch (e) {}

    if (supabase) {
      try {
        const { error } = await supabase.from('app_config').upsert({
          key: 'landing_config',
          value: config,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        if (error) {
          console.warn('Notice saving landing_config to Supabase:', error.message);
        }
      } catch (e) {
        console.warn('Supabase saveLandingConfig exception:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_landing_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
    return true;
  },

  // Publicidad: Home Carousel Cards Order Operations
  async getHomeCarouselCards(): Promise<HomeCarouselCardItem[]> {
    const defaultCards: HomeCarouselCardItem[] = [
      {
        id: 'cat-copias',
        title: 'Copias & Encuadernación',
        subtitle: 'Rápidas, nítidas y listas al instante',
        badge: 'Servicio Express',
        enabled: true,
        sort_order: 1
      },
      {
        id: 'featured-1',
        title: 'Nitidez & Calidad',
        subtitle: 'Nuestros productos estrella de impresión',
        badge: 'Destacado',
        enabled: true,
        sort_order: 2
      },
      {
        id: 'cat-papeleria',
        title: 'Papelería Creativa',
        subtitle: 'Todo para tus ideas al mejor precio',
        badge: 'Ofertas Diarias',
        enabled: true,
        sort_order: 3
      },
      {
        id: 'cat-escolar',
        title: 'Útiles Escolares',
        subtitle: 'Ahorros diarios para el regreso a clases',
        badge: 'Temporada Escolar',
        enabled: true,
        sort_order: 4
      },
      {
        id: 'cat-postres',
        title: 'Dulces & Postres',
        subtitle: 'Un antojo delicioso para acompañar tu día',
        badge: 'Recién Horneado',
        enabled: true,
        sort_order: 5
      },
      {
        id: 'featured-2',
        title: 'Super Oferta del Día',
        subtitle: 'Estilos y productos con precios de locura',
        badge: 'Oferta Especial',
        enabled: true,
        sort_order: 6
      }
    ];

    try {
      let cards: HomeCarouselCardItem[] | null = null;

      if (supabase) {
        try {
          const { data } = await supabase.from('app_config').select('*').eq('key', 'home_carousel_cards').maybeSingle();
          if (data && data.value && Array.isArray(data.value) && data.value.length > 0) {
            cards = data.value as HomeCarouselCardItem[];
            localStorage.setItem('copias_bellavista_home_carousel_cards', JSON.stringify(cards));
          }
        } catch (e) {
          console.warn('Notice loading home_carousel_cards from Supabase:', e);
        }
      }

      if (!cards) {
        const savedLocal = localStorage.getItem('copias_bellavista_home_carousel_cards');
        if (savedLocal) {
          try {
            cards = JSON.parse(savedLocal);
          } catch (e) {}
        }
      }

      if (!cards || cards.length === 0) {
        cards = defaultCards;
      }

      return cards.sort((a, b) => a.sort_order - b.sort_order);
    } catch (e) {
      return defaultCards;
    }
  },

  async getQuotes(): Promise<Quote[]> {
    let apiQuotes: Quote[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          apiQuotes = data as Quote[];
        } else {
          console.warn('Error fetching quotes from Supabase:', error);
        }
      } catch (e) {
        console.warn('Error in getQuotes (Supabase):', e);
      }
    }

    let localQuotes: Quote[] = [];
    try {
      const saved = localStorage.getItem('copias_bellavista_local_quotes');
      if (saved) {
        localQuotes = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading local quotes:", e);
    }

    let quotesToUse = apiQuotes.length > 0 ? apiQuotes : localQuotes;

    // Check automatic expiration for active quotes
    const now = new Date();
    let hasExpiredChanges = false;

    quotesToUse = quotesToUse.map(q => {
      if ((q.status === 'creada' || q.status === 'pendiente') && q.expiration_date) {
        const exp = new Date(q.expiration_date);
        if (!isNaN(exp.getTime()) && exp < now) {
          hasExpiredChanges = true;
          return { ...q, status: 'expirada' as const };
        }
      }
      return q;
    });

    if (hasExpiredChanges) {
      localStorage.setItem('copias_bellavista_local_quotes', JSON.stringify(quotesToUse));
    }

    return quotesToUse;
  },

  async saveQuote(quote: Omit<Quote, 'created_at' | 'quote_number'> & { created_at?: string; quote_number?: string }): Promise<Quote> {
    const localQuotes = await this.getQuotes();
    
    let targetQuote: Quote;
    const isEditing = !!quote.id && localQuotes.some(q => q.id === quote.id);

    if (isEditing) {
      const existing = localQuotes.find(q => q.id === quote.id)!;
      targetQuote = {
        ...existing,
        ...quote,
        updated_at: new Date().toISOString()
      } as Quote;
    } else {
      const id = quote.id || crypto.randomUUID();
      const count = localQuotes.length + 1;
      const quoteNumber = `COT-${String(1000 + count).padStart(4, '0')}`;
      targetQuote = {
        ...quote,
        id,
        quote_number: quoteNumber,
        status: quote.status || 'creada',
        created_at: quote.created_at || new Date().toISOString()
      } as Quote;
    }

    let updatedLocalQuotes: Quote[];
    if (isEditing) {
      updatedLocalQuotes = localQuotes.map(q => q.id === targetQuote.id ? targetQuote : q);
    } else {
      updatedLocalQuotes = [targetQuote, ...localQuotes];
    }
    localStorage.setItem('copias_bellavista_local_quotes', JSON.stringify(updatedLocalQuotes));

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('quotes')
          .upsert(targetQuote, { onConflict: 'id' })
          .select();

        if (error) {
          console.warn('Supabase saveQuote error, retrying with core columns fallback:', error.message);
          // Fallback if extra columns don't exist in Supabase table
          const corePayload = {
            id: targetQuote.id,
            quote_number: targetQuote.quote_number,
            client_name: targetQuote.client_name,
            client_phone: targetQuote.client_phone,
            client_email: targetQuote.client_email,
            concept: targetQuote.concept,
            items: targetQuote.items,
            total_price: targetQuote.total_price,
            status: targetQuote.status,
            created_at: targetQuote.created_at,
            notes: targetQuote.notes,
            order_id: targetQuote.order_id
          };
          const { data: fbData } = await supabase
            .from('quotes')
            .upsert(corePayload, { onConflict: 'id' })
            .select();
          if (fbData && fbData[0]) {
            return { ...targetQuote, ...fbData[0] };
          }
        } else if (data && data[0]) {
          const savedQuote = data[0] as Quote;
          const index = updatedLocalQuotes.findIndex(q => q.id === savedQuote.id);
          if (index !== -1) {
            updatedLocalQuotes[index] = savedQuote;
            localStorage.setItem('copias_bellavista_local_quotes', JSON.stringify(updatedLocalQuotes));
          }
          return savedQuote;
        }
      } catch (e) {
        console.warn('Exception in saveQuote (Supabase):', e);
      }
    }

    return targetQuote;
  },

  async deleteQuote(id: string): Promise<boolean> {
    const localQuotes = await this.getQuotes();
    const filtered = localQuotes.filter(q => q.id !== id);
    localStorage.setItem('copias_bellavista_local_quotes', JSON.stringify(filtered));

    if (supabase) {
      try {
        const { error } = await supabase.from('quotes').delete().eq('id', id);
        if (error) {
          console.warn('Error deleting quote from Supabase:', error.message);
        }
      } catch (e) {
        console.warn('Exception deleting quote from Supabase:', e);
      }
    }
    return true;
  },

  async saveHomeCarouselCards(cards: HomeCarouselCardItem[]): Promise<boolean> {
    const sorted = [...cards].map((c, idx) => ({ ...c, sort_order: idx + 1 }));
    localStorage.setItem('copias_bellavista_home_carousel_cards', JSON.stringify(sorted));

    if (supabase) {
      try {
        await supabase.from('app_config').upsert({
          key: 'home_carousel_cards',
          value: sorted,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {
        console.warn('Supabase saveHomeCarouselCards exception:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_home_carousel_updated'));
    return true;
  },

  async getTaxes(): Promise<Tax[]> {
    const defaultTaxes: Tax[] = [
      { id: 'default-iva', name: 'IVA', rate: 16, is_active: true }
    ];
    try {
      const savedLocal = localStorage.getItem('copias_bellavista_taxes');
      let taxes: Tax[] = savedLocal ? JSON.parse(savedLocal) : defaultTaxes;

      if (supabase) {
        try {
          const { data, error } = await supabase.from('taxes').select('*').order('created_at', { ascending: true });
          if (!error && data) {
            taxes = data.map((t: any) => ({
              id: t.id,
              name: t.name,
              rate: parseFloat(t.rate) || 0,
              is_active: t.is_active === true,
              created_at: t.created_at
            })) as Tax[];
            localStorage.setItem('copias_bellavista_taxes', JSON.stringify(taxes));
          } else {
            console.warn('Supabase getTaxes failed (likely table does not exist). Using localStorage / defaults:', error?.message);
          }
        } catch (e) {
          console.warn('Supabase getTaxes exception:', e);
        }
      }
      return taxes;
    } catch (e) {
      console.warn('Error reading taxes:', e);
      return defaultTaxes;
    }
  },

  async saveTax(tax: Partial<Tax>): Promise<Tax> {
    const defaultTaxes: Tax[] = [
      { id: 'default-iva', name: 'IVA', rate: 16, is_active: true }
    ];
    const savedLocal = localStorage.getItem('copias_bellavista_taxes');
    const localTaxes: Tax[] = savedLocal ? JSON.parse(savedLocal) : defaultTaxes;

    const id = tax.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-tax-${Math.floor(Math.random() * 1000000)}`);
    const cleanTax: Tax = {
      id,
      name: tax.name || 'Nuevo Impuesto',
      rate: tax.rate !== undefined ? tax.rate : 0,
      is_active: tax.is_active !== undefined ? tax.is_active : true,
      created_at: tax.created_at || new Date().toISOString()
    };

    // Update locally
    const existingIndex = localTaxes.findIndex(t => t.id === id);
    if (existingIndex > -1) {
      localTaxes[existingIndex] = cleanTax;
    } else {
      localTaxes.push(cleanTax);
    }
    localStorage.setItem('copias_bellavista_taxes', JSON.stringify(localTaxes));

    if (supabase) {
      try {
        const { error } = await supabase.from('taxes').upsert({
          id: cleanTax.id,
          name: cleanTax.name,
          rate: cleanTax.rate,
          is_active: cleanTax.is_active,
          created_at: cleanTax.created_at
        });
        
        if (error) {
          console.warn('Supabase upsert tax failed. Table might not exist:', error.message);
        }
      } catch (e) {
        console.warn('Supabase saveTax exception:', e);
      }
    }
    
    // Dispatch custom event to notify components
    window.dispatchEvent(new CustomEvent('bellavista_taxes_updated'));
    return cleanTax;
  },

  // 💳 MÉTODOS DE PAGO (CONFIGURACIÓN)
  async getPaymentMethods(): Promise<PaymentMethodConfig[]> {
    const defaultMethods: PaymentMethodConfig[] = [
      {
        id: 'pm-pagomovil',
        code: 'PAGOMOVIL',
        name: 'Pago Móvil C2P / P2P',
        currency: 'VES',
        type: 'movil',
        description: 'Transferencia instantánea interbancaria en bolívares.',
        instructions: 'Indicar número de teléfono, banco de destino y cédula/RIF.',
        account_details: '0412-5043857 | Banesco (0134) | V-24567890',
        is_active: true,
        requires_reference: true,
        allow_pos: true,
        allow_online: true,
        sort_order: 1
      },
      {
        id: 'pm-efectivo-usd',
        code: 'EFECTIVO_USD',
        name: 'Efectivo Dólares (USD)',
        currency: 'USD',
        type: 'efectivo',
        description: 'Billetes en buen estado sin roturas ni marcas severas.',
        instructions: 'Entregar monto exacto o indicar con cuánto cancela para vuelto.',
        account_details: 'Recepción directa en mostrador / caja',
        is_active: true,
        requires_reference: false,
        allow_pos: true,
        allow_online: true,
        sort_order: 2
      },
      {
        id: 'pm-efectivo-ves',
        code: 'EFECTIVO_VES',
        name: 'Efectivo Bolívares (Bs.)',
        currency: 'VES',
        type: 'efectivo',
        description: 'Moneda de curso legal nacional a tasa oficial BCV.',
        instructions: 'Calculado al tipo de cambio oficial del día.',
        account_details: 'Recepción directa en mostrador / caja',
        is_active: true,
        requires_reference: false,
        allow_pos: true,
        allow_online: true,
        sort_order: 3
      },
      {
        id: 'pm-transferencia-ves',
        code: 'TRANSFERENCIA_VES',
        name: 'Transferencia Bancaria Nacional (Bs.)',
        currency: 'VES',
        type: 'transferencia',
        description: 'Transferencias Banesco, Mercantil, Venezuela y Provincial.',
        instructions: 'Adjuntar comprobante con número de referencia de 6 o más dígitos.',
        account_details: 'Banesco Cta Corriente: 0134-0000-00-0000000000 | Titular: Papelería Bella Vista, C.A. | RIF: J-50987654-3',
        is_active: true,
        requires_reference: true,
        allow_pos: true,
        allow_online: true,
        sort_order: 4
      },
      {
        id: 'pm-punto-venta',
        code: 'PUNTO_VENTA',
        name: 'Punto de Venta / Tarjeta Débito (POS)',
        currency: 'VES',
        type: 'punto',
        description: 'Tarjetas de débito y crédito nacionales e internacionales.',
        instructions: 'Procesamiento en terminal físico en tienda.',
        account_details: 'Terminal POS Inalámbrico Biopago / Credicard',
        is_active: true,
        requires_reference: true,
        allow_pos: true,
        allow_online: false,
        sort_order: 5
      },
      {
        id: 'pm-zelle',
        code: 'ZELLE',
        name: 'Zelle (USD)',
        currency: 'USD',
        type: 'digital',
        description: 'Transferencias electrónicas en dólares estadounidenses sin comisión.',
        instructions: 'Colocar número de pedido en la nota de Zelle.',
        account_details: 'pagos@bellavista.com | Bella Vista Services LLC',
        is_active: true,
        requires_reference: true,
        allow_pos: true,
        allow_online: true,
        sort_order: 6
      },
      {
        id: 'pm-binance',
        code: 'BINANCE_PAY',
        name: 'Binance Pay (USDT)',
        currency: 'USDT',
        type: 'digital',
        description: 'Criptomoneda estable USDT / Binance Pay ID instantáneo.',
        instructions: 'Enviar por Pay ID o código QR Binance.',
        account_details: 'Binance Pay ID: 489201948',
        is_active: true,
        requires_reference: true,
        allow_pos: true,
        allow_online: true,
        sort_order: 7
      }
    ];

    try {
      const savedLocal = localStorage.getItem('copias_bellavista_payment_methods');
      let methods: PaymentMethodConfig[] = savedLocal ? JSON.parse(savedLocal) : defaultMethods;

      if (supabase) {
        try {
          const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order', { ascending: true });
          if (!error && data && data.length > 0) {
            methods = data.map((pm: any) => ({
              id: pm.id,
              code: pm.code || pm.id,
              name: pm.name,
              currency: pm.currency || 'VES',
              type: pm.type || 'otro',
              description: pm.description || '',
              instructions: pm.instructions || '',
              account_details: pm.account_details || '',
              bank_account_id: pm.bank_account_id || undefined,
              bank_account_name: pm.bank_account_name || undefined,
              incoming_commission: pm.incoming_commission !== undefined ? Number(pm.incoming_commission) : 0,
              outgoing_commission: pm.outgoing_commission !== undefined ? Number(pm.outgoing_commission) : 0,
              is_active: pm.is_active !== false,
              requires_reference: pm.requires_reference === true,
              allow_pos: pm.allow_pos !== false,
              allow_online: pm.allow_online !== false,
              sort_order: pm.sort_order || 1,
              created_at: pm.created_at
            })) as PaymentMethodConfig[];
            localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(methods));
          } else {
            // Also check key-value app_config
            const { data: configData } = await supabase.from('app_config').select('*').eq('key', 'payment_methods_config').maybeSingle();
            if (configData && configData.value && Array.isArray(configData.value) && configData.value.length > 0) {
              methods = configData.value as PaymentMethodConfig[];
              localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(methods));
            }
          }
        } catch (e) {
          console.warn('Supabase getPaymentMethods exception:', e);
        }
      }
      return (methods || defaultMethods).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    } catch (e) {
      console.warn('Error reading payment methods:', e);
      return defaultMethods;
    }
  },

  async savePaymentMethod(method: Partial<PaymentMethodConfig>): Promise<PaymentMethodConfig> {
    const existingMethods = await this.getPaymentMethods();
    const id = method.id || `pm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    const cleanMethod: PaymentMethodConfig = {
      id,
      code: method.code?.trim().toUpperCase() || id.toUpperCase(),
      name: method.name?.trim() || 'Nuevo Método de Pago',
      currency: method.currency || 'VES',
      type: method.type || 'otro',
      description: method.description || '',
      instructions: method.instructions || '',
      account_details: method.account_details || '',
      bank_account_id: method.bank_account_id || undefined,
      bank_account_name: method.bank_account_name || undefined,
      incoming_commission: method.incoming_commission !== undefined ? Number(method.incoming_commission) : 0,
      outgoing_commission: method.outgoing_commission !== undefined ? Number(method.outgoing_commission) : 0,
      is_active: method.is_active !== undefined ? method.is_active : true,
      requires_reference: method.requires_reference !== undefined ? method.requires_reference : false,
      allow_pos: method.allow_pos !== undefined ? method.allow_pos : true,
      allow_online: method.allow_online !== undefined ? method.allow_online : true,
      sort_order: method.sort_order !== undefined ? method.sort_order : (existingMethods.length + 1),
      created_at: method.created_at || new Date().toISOString()
    };

    const existingIndex = existingMethods.findIndex(m => m.id === id);
    let updatedList: PaymentMethodConfig[] = [];
    if (existingIndex > -1) {
      updatedList = [...existingMethods];
      updatedList[existingIndex] = cleanMethod;
    } else {
      updatedList = [...existingMethods, cleanMethod];
    }

    localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedList));

    if (supabase) {
      try {
        const { error } = await supabase.from('payment_methods').upsert(cleanMethod);
        if (error) {
          console.warn('Notice saving payment_methods directly, updating fallback app_config:', error.message);
          await supabase.from('app_config').upsert({
            key: 'payment_methods_config',
            value: updatedList,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        }
      } catch (e) {
        console.warn('Supabase savePaymentMethod exception:', e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
    return cleanMethod;
  },

  async deletePaymentMethod(id: string): Promise<boolean> {
    const existingMethods = await this.getPaymentMethods();
    const updatedList = existingMethods.filter(m => m.id !== id);
    localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedList));

    if (supabase) {
      try {
        await supabase.from('payment_methods').delete().eq('id', id);
        await supabase.from('app_config').upsert({
          key: 'payment_methods_config',
          value: updatedList,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {
        console.warn('Supabase deletePaymentMethod exception:', e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
    return true;
  },

  async getReportModulesConfig(): Promise<ReportModuleConfig[]> {
    const defaultModules: ReportModuleConfig[] = [
      {
        id: 'tu_ganancia',
        title: 'Tu ganancia',
        description: 'Cuánto ganaste, costo y margen de ganancia',
        enabled: true,
        section: 'graficas',
        sort_order: 1
      },
      {
        id: 'tus_ventas',
        title: 'Tus ventas',
        description: 'Monto total de ventas y volumen de transacciones',
        enabled: true,
        section: 'graficas',
        sort_order: 2
      },
      {
        id: 'top_productos',
        title: 'Top productos',
        description: 'Productos más vendidos y con mayor ganancia',
        enabled: true,
        section: 'comparativos',
        sort_order: 3
      },
      {
        id: 'top_clientes',
        title: 'Top clientes',
        description: 'Clientes más recurrentes y con mayor volumen de compra',
        enabled: true,
        section: 'comparativos',
        sort_order: 4
      },
      {
        id: 'top_empleados',
        title: 'Top empleados',
        description: 'Desempeño del personal y ventas realizadas',
        enabled: true,
        section: 'comparativos',
        sort_order: 5
      },
      {
        id: 'tus_gastos',
        title: 'Tus gastos',
        description: 'Gastos operativos detallados por categoría',
        enabled: true,
        section: 'detalle',
        sort_order: 6
      },
      {
        id: 'report_multimoneda',
        title: 'Divisas y Multimoneda',
        description: 'Desglose de ingresos por divisa original (USD, VES, EUR, COP) y pagos mixtos',
        enabled: true,
        section: 'detalle',
        sort_order: 7
      }
    ];

    try {
      let configs: ReportModuleConfig[] | null = null;

      if (supabase) {
        try {
          const { data } = await supabase.from('app_config').select('*').eq('key', 'reportes_modules_config').maybeSingle();
          if (data && data.value && Array.isArray(data.value) && data.value.length > 0) {
            configs = data.value as ReportModuleConfig[];
            localStorage.setItem('copias_bellavista_report_modules', JSON.stringify(configs));
          }
        } catch (e) {
          console.warn('Notice loading reportes_modules_config from Supabase:', e);
        }
      }

      if (!configs) {
        const savedLocal = localStorage.getItem('copias_bellavista_report_modules');
        if (savedLocal) {
          configs = JSON.parse(savedLocal);
        }
      }

      if (configs && configs.length > 0) {
        const merged = defaultModules.map(dm => {
          const matched = configs!.find(c => c.id === dm.id);
          return matched ? { ...dm, ...matched } : dm;
        });
        return merged.sort((a, b) => a.sort_order - b.sort_order);
      }
    } catch (e) {
      console.error("Error loading report modules:", e);
    }

    return defaultModules;
  },

  async saveReportModulesConfig(modules: ReportModuleConfig[]): Promise<boolean> {
    const sorted = [...modules].map((m, idx) => ({ ...m, sort_order: idx + 1 }));
    localStorage.setItem('copias_bellavista_report_modules', JSON.stringify(sorted));

    if (supabase) {
      try {
        await supabase.from('app_config').upsert({
          key: 'reportes_modules_config',
          value: sorted,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {
        console.warn('Supabase saveReportModulesConfig exception:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_report_modules_updated'));
    return true;
  },

  async deleteTax(id: string): Promise<boolean> {
    const savedLocal = localStorage.getItem('copias_bellavista_taxes');
    if (savedLocal) {
      const localTaxes: Tax[] = JSON.parse(savedLocal);
      const filtered = localTaxes.filter(t => t.id !== id);
      localStorage.setItem('copias_bellavista_taxes', JSON.stringify(filtered));
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('taxes').delete().eq('id', id);
        if (error) {
          console.warn('Supabase delete tax failed:', error.message);
        }
      } catch (e) {
        console.warn('Supabase deleteTax exception:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('bellavista_taxes_updated'));
    return true;
  },

  // ==========================================
  // 💱 SYSTEM CURRENCIES (MONEDAS PRINCIPALES)
  // ==========================================
  async getCurrencies(): Promise<SystemCurrency[]> {
    const cachedRates = getCachedCurrencyRates();
    const defaultCurrencies: SystemCurrency[] = [
      {
        id: 'cur-usd',
        code: 'USD',
        name: 'Dólar Estadounidense (USD)',
        symbol: '$',
        rate: 1.00,
        is_active: true,
        is_main: false,
        country_code: 'US',
        decimals: 2,
        position: 'prefix',
        created_at: new Date().toISOString()
      },
      {
        id: 'cur-ves',
        code: 'VES',
        name: 'Bolívar Venezolano (VES)',
        symbol: 'Bs.',
        rate: cachedRates.VES || 842.2067,
        is_active: true,
        is_main: true,
        country_code: 'VE',
        decimals: 2,
        position: 'prefix',
        created_at: new Date().toISOString()
      },
      {
        id: 'cur-eur',
        code: 'EUR',
        name: 'Euro (EUR)',
        symbol: '€',
        rate: cachedRates.EUR || 0.92,
        is_active: true,
        is_main: false,
        country_code: 'EU',
        decimals: 2,
        position: 'suffix',
        created_at: new Date().toISOString()
      },
      {
        id: 'cur-cop',
        code: 'COP',
        name: 'Peso Colombiano (COP)',
        symbol: 'COP$',
        rate: cachedRates.COP || 4100,
        is_active: true,
        is_main: false,
        country_code: 'CO',
        decimals: 0,
        position: 'prefix',
        created_at: new Date().toISOString()
      },
      {
        id: 'cur-usdt',
        code: 'USDT',
        name: 'Tether / USDT (Binance)',
        symbol: 'USDT',
        rate: 1.00,
        is_active: true,
        is_main: false,
        country_code: 'USDT',
        decimals: 2,
        position: 'suffix',
        created_at: new Date().toISOString()
      }
    ];

    try {
      const savedLocal = localStorage.getItem('copias_bellavista_system_currencies');
      let localCurrencies: SystemCurrency[] = savedLocal ? JSON.parse(savedLocal) : [];
      let mergedCurrencies: SystemCurrency[] = [];

      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('system_currencies')
            .select('*')
            .order('created_at', { ascending: true });

          if (!error && data && data.length > 0) {
            const dbCurrencies: SystemCurrency[] = data.map((c: any) => ({
              id: c.id,
              code: (c.code || 'USD').toUpperCase().trim(),
              name: c.name || c.code,
              symbol: c.symbol || '$',
              rate: parseFloat(c.rate) || 1,
              is_active: c.is_active !== false,
              is_main: c.is_main === true,
              country_code: c.country_code || (c.code === 'VES' ? 'VE' : c.code === 'EUR' ? 'EU' : c.code === 'COP' ? 'CO' : 'US'),
              decimals: c.decimals !== undefined ? parseInt(c.decimals) : 2,
              position: c.position || 'prefix',
              created_at: c.created_at,
              updated_at: c.updated_at
            }));

            mergedCurrencies = [...dbCurrencies];

            // Ensure base default currencies exist
            defaultCurrencies.forEach(def => {
              if (!mergedCurrencies.some(c => c.code === def.code)) {
                mergedCurrencies.push(def);
              }
            });

            // Keep any locally created ones that might not have reached DB yet
            localCurrencies.forEach(loc => {
              if (!mergedCurrencies.some(c => c.code === loc.code)) {
                mergedCurrencies.push(loc);
              }
            });
          } else {
            mergedCurrencies = localCurrencies.length > 0 ? localCurrencies : [...defaultCurrencies];
          }
        } catch (e) {
          console.warn('Supabase getCurrencies exception:', e);
          mergedCurrencies = localCurrencies.length > 0 ? localCurrencies : [...defaultCurrencies];
        }
      } else {
        mergedCurrencies = localCurrencies.length > 0 ? localCurrencies : [...defaultCurrencies];
      }

      // Guarantee default currencies are always present
      defaultCurrencies.forEach(def => {
        if (!mergedCurrencies.some(c => c.code === def.code)) {
          mergedCurrencies.push(def);
        }
      });

      // Sync rates from currency_rates table if available
      if (supabase) {
        try {
          const { data: rateData } = await supabase.from('currency_rates').select('*');
          if (rateData && rateData.length > 0) {
            rateData.forEach((r: any) => {
              const match = mergedCurrencies.find(c => c.code === r.code);
              if (match && r.rate) {
                match.rate = parseFloat(r.rate);
              }
            });
          }
        } catch (_) {}
      }

      localStorage.setItem('copias_bellavista_system_currencies', JSON.stringify(mergedCurrencies));

      // Register all currencies in currency.ts helper
      mergedCurrencies.forEach(c => {
        registerDynamicCurrency({
          code: c.code,
          symbol: c.symbol,
          name: c.name,
          position: c.position,
          decimals: c.decimals
        });
      });

      return mergedCurrencies;
    } catch (e) {
      console.warn('Error reading currencies:', e);
      return defaultCurrencies;
    }
  },

  async saveCurrency(currency: Partial<SystemCurrency>, updatedBy?: string): Promise<SystemCurrency> {
    const currencies = await this.getCurrencies();
    const code = (currency.code || 'USD').toUpperCase().trim();
    
    // Check if ID is a valid UUID
    const isUuid = currency.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currency.id);
    const id = isUuid ? currency.id! : (currency.id || `cur-${code.toLowerCase()}-${Date.now()}`);

    const cleanCurrency: SystemCurrency = {
      id,
      code,
      name: currency.name || `${code}`,
      symbol: currency.symbol || '$',
      rate: currency.rate !== undefined ? parseFloat(currency.rate.toString()) : 1,
      is_active: currency.is_active !== undefined ? currency.is_active : true,
      is_main: currency.is_main === true,
      country_code: currency.country_code || (code === 'VES' ? 'VE' : code === 'EUR' ? 'EU' : code === 'COP' ? 'CO' : code.slice(0, 2)),
      decimals: currency.decimals !== undefined ? Number(currency.decimals) : (code === 'COP' ? 0 : 2),
      position: currency.position || (code === 'EUR' ? 'suffix' : 'prefix'),
      created_at: currency.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // If marked as is_main, unmark others
    if (cleanCurrency.is_main) {
      currencies.forEach(c => {
        if (c.code !== cleanCurrency.code) {
          c.is_main = false;
        }
      });
      localStorage.setItem('copias_bellavista_active_currency', cleanCurrency.code);
    }

    const existingIndex = currencies.findIndex(c => c.id === id || c.code === code);
    if (existingIndex > -1) {
      currencies[existingIndex] = { ...currencies[existingIndex], ...cleanCurrency };
    } else {
      currencies.push(cleanCurrency);
    }

    localStorage.setItem('copias_bellavista_system_currencies', JSON.stringify(currencies));

    // Register in memory CURRENCIES
    registerDynamicCurrency({
      code: cleanCurrency.code,
      symbol: cleanCurrency.symbol,
      name: cleanCurrency.name,
      position: cleanCurrency.position,
      decimals: cleanCurrency.decimals
    });

    // Update cached rates
    const cachedRates = getCachedCurrencyRates();
    cachedRates[cleanCurrency.code] = cleanCurrency.rate;
    saveCachedCurrencyRates(cachedRates);

    // Persist to Supabase
    if (supabase) {
      try {
        const payload: any = {
          code: cleanCurrency.code,
          name: cleanCurrency.name,
          symbol: cleanCurrency.symbol,
          rate: cleanCurrency.rate,
          is_active: cleanCurrency.is_active,
          is_main: cleanCurrency.is_main || false,
          country_code: cleanCurrency.country_code,
          decimals: cleanCurrency.decimals,
          position: cleanCurrency.position,
          updated_at: cleanCurrency.updated_at
        };
        if (isUuid) {
          payload.id = cleanCurrency.id;
        }

        const { data: curData, error: curErr } = await supabase
          .from('system_currencies')
          .upsert(payload, { onConflict: 'code' })
          .select();

        if (curErr) {
          console.warn('Supabase save system_currencies table note:', curErr.message);
        } else if (curData && curData.length > 0 && curData[0].id) {
          cleanCurrency.id = curData[0].id;
          const idx = currencies.findIndex(c => c.code === cleanCurrency.code);
          if (idx > -1) {
            currencies[idx].id = curData[0].id;
            localStorage.setItem('copias_bellavista_system_currencies', JSON.stringify(currencies));
          }
        }

        // 2. Also keep currency_rates table synchronized
        const { error: rateErr } = await supabase.from('currency_rates').upsert({
          code: cleanCurrency.code,
          rate: cleanCurrency.rate,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy || 'Administrador'
        }, { onConflict: 'code' });

        if (rateErr) {
          console.warn('Supabase save currency_rates table note:', rateErr.message);
        }
      } catch (e) {
        console.warn('Supabase saveCurrency exception:', e);
      }
    }

    // Real-time events
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_currencies_updated'));
      window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: cleanCurrency.rate, code: cleanCurrency.code } }));
      if (cleanCurrency.is_main) {
        window.dispatchEvent(new CustomEvent('bellavista_currency_changed', { detail: cleanCurrency.code }));
      }
    }

    return cleanCurrency;
  },

  async deleteCurrency(idOrCode: string): Promise<boolean> {
    const currencies = await this.getCurrencies();
    const target = currencies.find(c => c.id === idOrCode || c.code === idOrCode);
    if (!target) return false;

    if (target.code === 'USD') {
      throw new Error('No es posible eliminar el Dólar (USD) ya que actúa como moneda base del sistema.');
    }

    const filtered = currencies.filter(c => c.id !== target.id && c.code !== target.code);
    localStorage.setItem('copias_bellavista_system_currencies', JSON.stringify(filtered));

    if (supabase) {
      try {
        const isUuid = target.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id);
        if (isUuid) {
          await supabase.from('system_currencies').delete().or(`id.eq.${target.id},code.eq.${target.code}`);
        } else {
          await supabase.from('system_currencies').delete().eq('code', target.code);
        }
        await supabase.from('currency_rates').delete().eq('code', target.code);
      } catch (e) {
        console.warn('Supabase deleteCurrency exception:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bellavista_currencies_updated'));
    }

    return true;
  },

  // ==========================================
  // BUSINESS PROFILE (INFORMACIÓN DEL NEGOCIO)
  // ==========================================
  async getBusinessProfile(): Promise<BusinessProfile> {
    const defaultProfile: BusinessProfile = {
      id: 'main',
      name: 'Copias Bella Vista, C.A.',
      business_type: 'Papelería y libros',
      address: 'Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4',
      city: 'Barinitas',
      phone: '+58 412-5043857',
      email: 'Fotocopiasfyp@gmail.com',
      rif: 'J-50987654-3',
      website: 'https://copiasbellavista.vercel.app/',
      logo_url: '',
      slogan: 'Equipando Tus Proyectos',
      saas_plan: 'pro'
    };

    try {
      // Check localStorage first as fast buffer
      const savedLocal = localStorage.getItem('copias_bellavista_business_profile');
      let profile: BusinessProfile = savedLocal ? { ...defaultProfile, ...JSON.parse(savedLocal) } : defaultProfile;

      if (supabase) {
        try {
          // 1. Try dedicated table 'business_profile'
          const { data, error } = await supabase.from('business_profile').select('*').limit(1).maybeSingle();
          if (!error && data) {
            profile = {
              id: data.id || 'main',
              name: data.name || profile.name,
              business_type: data.business_type || profile.business_type,
              address: data.address !== undefined ? data.address : profile.address,
              city: data.city !== undefined ? data.city : profile.city,
              phone: data.phone !== undefined ? data.phone : profile.phone,
              email: data.email !== undefined ? data.email : profile.email,
              rif: data.rif !== undefined ? data.rif : profile.rif,
              website: data.website !== undefined ? data.website : profile.website,
              logo_url: data.logo_url !== undefined ? data.logo_url : profile.logo_url,
              slogan: data.slogan !== undefined ? data.slogan : profile.slogan,
              saas_plan: data.saas_plan || profile.saas_plan,
              updated_at: data.updated_at
            };
            localStorage.setItem('copias_bellavista_business_profile', JSON.stringify(profile));
            return profile;
          }

          // 2. Fallback check 'app_config' table key 'business_profile'
          const { data: configData } = await supabase.from('app_config').select('*').eq('key', 'business_profile').maybeSingle();
          if (configData && configData.value) {
            profile = { ...defaultProfile, ...configData.value };
            localStorage.setItem('copias_bellavista_business_profile', JSON.stringify(profile));
            return profile;
          }
        } catch (dbErr) {
          console.warn("Notice fetching business profile from Supabase:", dbErr);
        }
      }

      return profile;
    } catch (e) {
      console.warn("getBusinessProfile error:", e);
      return defaultProfile;
    }
  },

  async saveBusinessProfile(profile: Partial<BusinessProfile>): Promise<BusinessProfile> {
    const current = await this.getBusinessProfile();
    const updated: BusinessProfile = {
      ...current,
      ...profile,
      id: current.id || 'main',
      updated_at: new Date().toISOString()
    };

    // Save to local storage for fast sync across tabs
    localStorage.setItem('copias_bellavista_business_profile', JSON.stringify(updated));
    localStorage.setItem('business_address', updated.address || '');
    localStorage.setItem('business_city', updated.city || '');
    localStorage.setItem('business_email', updated.email || '');
    localStorage.setItem('business_type', updated.business_type || '');
    localStorage.setItem('business_website', updated.website || '');

    if (supabase) {
      try {
        // Upsert to business_profile
        const { error } = await supabase.from('business_profile').upsert(updated, { onConflict: 'id' });
        if (error) {
          console.warn("Supabase upsert to business_profile failed, falling back to app_config:", error.message);
          await supabase.from('app_config').upsert({
            key: 'business_profile',
            value: updated,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        }
      } catch (e) {
        console.warn("Supabase saveBusinessProfile exception:", e);
        try {
          await supabase.from('app_config').upsert({
            key: 'business_profile',
            value: updated,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        } catch (e2) {}
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_business_profile_updated', { detail: updated }));
    window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
    return updated;
  },

  // ==========================================
  // SEDES / SUCURSALES (BUSINESS BRANCHES)
  // ==========================================
  async getBusinessBranches(): Promise<BusinessBranch[]> {
    const defaultBranches: BusinessBranch[] = [
      { 
        id: 'branch_main_barinitas', 
        name: 'Tienda Bella Vista', 
        code: 'SP-01', 
        address: 'Carrera 6 entre calle 19 y 20, Barinitas, Edo. Barinas', 
        phone: '+58 412-5043857', 
        active: true,
        created_at: new Date().toISOString()
      },
      { 
        id: 'branch_agua_dulce', 
        name: 'Almacén Agua Dulce', 
        code: 'SUC-02', 
        address: 'Sector Agua Dulce, Barinitas, Edo. Barinas', 
        phone: '+58 412-5043857', 
        active: true,
        created_at: new Date().toISOString()
      },
      { 
        id: 'branch_online', 
        name: 'Tienda Online - Almacén', 
        code: 'SUC-03', 
        address: 'Barinitas, Edo. Barinas', 
        phone: '+58 412-5043857', 
        active: true,
        created_at: new Date().toISOString()
      }
    ];

    try {
      if (supabase) {
        try {
          const { data, error } = await supabase.from('business_branches').select('*').order('created_at', { ascending: true });
          if (!error && data && Array.isArray(data)) {
            // Filter out old template sample branches if any exist
            const realBranches = data.filter((b: any) => b.id !== '2' && b.code !== 'SD-02');
            if (realBranches.length > 0) {
              localStorage.setItem('copias_bellavista_branches', JSON.stringify(realBranches));
              return realBranches as BusinessBranch[];
            }
          }

          // Fallback to app_config
          const { data: configData, error: cfgErr } = await supabase.from('app_config').select('*').eq('key', 'business_branches').maybeSingle();
          if (!cfgErr && configData && configData.value && Array.isArray(configData.value)) {
            const cleanList = (configData.value as BusinessBranch[]).filter(b => b.id !== '2' && b.code !== 'SD-02');
            if (cleanList.length > 0) {
              localStorage.setItem('copias_bellavista_branches', JSON.stringify(cleanList));
              return cleanList;
            }
          }
        } catch (dbErr) {
          console.warn("Notice fetching business branches from Supabase:", dbErr);
        }
      }

      const savedLocal = localStorage.getItem('copias_bellavista_branches');
      if (savedLocal !== null) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (Array.isArray(parsed)) {
            const clean = parsed.filter(b => b.id !== '2' && b.code !== 'SD-02');
            if (clean.length > 0) return clean;
          }
        } catch (e) {}
      }

      localStorage.setItem('copias_bellavista_branches', JSON.stringify(defaultBranches));
      return defaultBranches;
    } catch (e) {
      console.warn("getBusinessBranches error:", e);
      return defaultBranches;
    }
  },

  async saveBusinessBranch(branch: BusinessBranch): Promise<BusinessBranch> {
    const currentBranches = await this.getBusinessBranches();
    const existingIndex = currentBranches.findIndex(b => b.id === branch.id);
    let updatedBranches: BusinessBranch[];

    if (existingIndex >= 0) {
      updatedBranches = [...currentBranches];
      updatedBranches[existingIndex] = branch;
    } else {
      updatedBranches = [...currentBranches, branch];
    }

    localStorage.setItem('copias_bellavista_branches', JSON.stringify(updatedBranches));

    if (supabase) {
      try {
        const { error } = await supabase.from('business_branches').upsert(branch, { onConflict: 'id' });
        if (error) {
          console.warn("Supabase upsert to business_branches notice:", error.message);
        }
      } catch (e) {
        console.warn("Supabase saveBusinessBranch exception:", e);
      }

      try {
        await supabase.from('app_config').upsert({
          key: 'business_branches',
          value: updatedBranches,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e2) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_branches_updated', { detail: updatedBranches }));
    return branch;
  },

  async deleteBusinessBranch(id: string): Promise<boolean> {
    const currentBranches = await this.getBusinessBranches();
    const updatedBranches = currentBranches.filter(b => b.id !== id);
    localStorage.setItem('copias_bellavista_branches', JSON.stringify(updatedBranches));

    // Also delete associated terminals locally
    const currentTerminals = await this.getBusinessTerminals();
    const updatedTerminals = currentTerminals.filter(t => t.branch_id !== id);
    localStorage.setItem('copias_bellavista_terminals', JSON.stringify(updatedTerminals));

    if (supabase) {
      try {
        await supabase.from('business_branches').delete().eq('id', id);
      } catch (e) {
        console.warn("Supabase deleteBusinessBranch notice:", e);
      }

      try {
        await supabase.from('business_terminals').delete().eq('branch_id', id);
      } catch (e) {
        console.warn("Supabase delete terminals for branch notice:", e);
      }

      try {
        await supabase.from('app_config').upsert({
          key: 'business_branches',
          value: updatedBranches,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        await supabase.from('app_config').upsert({
          key: 'business_terminals',
          value: updatedTerminals,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_branches_updated', { detail: updatedBranches }));
    window.dispatchEvent(new CustomEvent('bellavista_terminals_updated', { detail: updatedTerminals }));
    return true;
  },

  // ==========================================
  // TERMINALES / PUNTOS DE VENTA (CAJAS)
  // ==========================================
  async getBusinessTerminals(branchId?: string): Promise<BusinessTerminal[]> {
    const defaultTerminals: BusinessTerminal[] = [
      { id: 'term_main_01', branch_id: 'branch_main_barinitas', code: 'C1', name: 'Caja Principal (Mostrador)', active: true },
      { id: 'term_main_02', branch_id: 'branch_main_barinitas', code: 'C2', name: 'Caja Copias e Impresiones', active: true }
    ];

    try {
      if (supabase) {
        try {
          let query = supabase.from('business_terminals').select('*');
          if (branchId) {
            query = query.eq('branch_id', branchId);
          }
          const { data, error } = await query.order('created_at', { ascending: true });
          if (!error && data && Array.isArray(data) && data.length > 0) {
            if (!branchId) {
              localStorage.setItem('copias_bellavista_terminals', JSON.stringify(data));
            }
            return data as BusinessTerminal[];
          }

          // Fallback to app_config
          const { data: configData, error: cfgErr } = await supabase.from('app_config').select('*').eq('key', 'business_terminals').maybeSingle();
          if (!cfgErr && configData && configData.value && Array.isArray(configData.value)) {
            let list = configData.value as BusinessTerminal[];
            if (branchId) list = list.filter(t => t.branch_id === branchId);
            return list;
          }
        } catch (dbErr) {
          console.warn("Notice fetching terminals from Supabase:", dbErr);
        }
      }

      const savedLocal = localStorage.getItem('copias_bellavista_terminals');
      let terminals: BusinessTerminal[] = defaultTerminals;
      if (savedLocal !== null) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (Array.isArray(parsed)) terminals = parsed;
        } catch (e) {}
      }

      if (branchId) {
        return terminals.filter(t => t.branch_id === branchId);
      }
      return terminals;
    } catch (e) {
      console.warn("getBusinessTerminals error:", e);
      return branchId ? defaultTerminals.filter(t => t.branch_id === branchId) : defaultTerminals;
    }
  },

  async saveBusinessTerminal(terminal: BusinessTerminal): Promise<BusinessTerminal> {
    const currentTerminals = await this.getBusinessTerminals();
    const existingIndex = currentTerminals.findIndex(t => t.id === terminal.id);
    let updatedTerminals: BusinessTerminal[];

    if (existingIndex >= 0) {
      updatedTerminals = [...currentTerminals];
      updatedTerminals[existingIndex] = terminal;
    } else {
      updatedTerminals = [...currentTerminals, terminal];
    }

    localStorage.setItem('copias_bellavista_terminals', JSON.stringify(updatedTerminals));

    if (supabase) {
      try {
        const { error } = await supabase.from('business_terminals').upsert(terminal, { onConflict: 'id' });
        if (error) {
          console.warn("Supabase upsert to business_terminals notice:", error.message);
        }
      } catch (e) {
        console.warn("Supabase saveBusinessTerminal exception:", e);
      }

      try {
        await supabase.from('app_config').upsert({
          key: 'business_terminals',
          value: updatedTerminals,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e2) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_terminals_updated', { detail: updatedTerminals }));
    return terminal;
  },

  async deleteBusinessTerminal(id: string): Promise<boolean> {
    const currentTerminals = await this.getBusinessTerminals();
    const updatedTerminals = currentTerminals.filter(t => t.id !== id);
    localStorage.setItem('copias_bellavista_terminals', JSON.stringify(updatedTerminals));

    if (supabase) {
      try {
        await supabase.from('business_terminals').delete().eq('id', id);
      } catch (e) {
        console.warn("Supabase deleteBusinessTerminal notice:", e);
      }

      try {
        await supabase.from('app_config').upsert({
          key: 'business_terminals',
          value: updatedTerminals,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_terminals_updated', { detail: updatedTerminals }));
    return true;
  },

  // ============================================================================
  // FINANZAS: CUENTAS BANCARIAS
  // ============================================================================
  
  async getBankAccounts(): Promise<BankAccount[]> {
    const local = this._getLocalFallback('bank_accounts', [] as BankAccount[]);
    let apiList: BankAccount[] = [];
    let configAccounts: BankAccount[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          apiList = data as BankAccount[];
        }
      } catch (e) {
        console.warn('Supabase fetch bank_accounts error:', e);
      }

      // Also read from app_config backup
      try {
        const { data: configData } = await supabase.from('app_config').select('*').eq('key', 'bank_accounts').maybeSingle();
        if (configData && configData.value && Array.isArray(configData.value)) {
          configAccounts = configData.value as BankAccount[];
        }
      } catch (e) {}
    }

    // 🛑 Strictly exclude virtual Accounts Receivable accounts from real Bank Accounts list
    const cleanAccounts = (rawList: BankAccount[]) => (rawList || []).filter(a => 
      a && a.id &&
      a.id !== 'cxc-virtual' && 
      !a.name?.toLowerCase().includes('cuentas por cobrar') && 
      !a.bank_name?.toLowerCase().includes('cobranzas virtual')
    );

    const validApi = cleanAccounts(apiList);
    const validConfig = cleanAccounts(configAccounts);
    const validLocal = cleanAccounts(local);

    // 🧹 Smart deduplication prioritizing Supabase real accounts (apiList) as authoritative
    const dedupedAccounts: BankAccount[] = [];
    const seenSignatures = new Map<string, BankAccount>();
    const aliasMap = new Map<string, string[]>();

    // 1. First register Supabase real accounts (authoritative)
    validApi.forEach(acc => {
      const curr = (acc.currency || 'VES').toUpperCase().trim();
      const cleanName = (acc.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const cleanBank = (acc.bank_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const sig = `${curr}::${cleanName}::${cleanBank}`;

      if (!seenSignatures.has(sig)) {
        acc.alias_ids = [acc.id];
        seenSignatures.set(sig, acc);
        aliasMap.set(acc.id, [acc.id]);
        dedupedAccounts.push(acc);
      } else {
        // Consolidate duplicate records in Supabase (e.g. repeated MERCANTIL P2P) into primary
        const primary = seenSignatures.get(sig)!;
        primary.balance = parseFloat(((Number(primary.balance) || 0) + (Number(acc.balance) || 0)).toFixed(2));
        if (!primary.account_number && acc.account_number) primary.account_number = acc.account_number;
        if ((!primary.notes || primary.notes === '[]') && acc.notes && acc.notes !== '[]') primary.notes = acc.notes;
        const aliases = aliasMap.get(primary.id) || [primary.id];
        if (!aliases.includes(acc.id)) aliases.push(acc.id);
        aliasMap.set(primary.id, aliases);
        primary.alias_ids = aliases;
      }
    });

    // 2. Then incorporate any config or local accounts not yet present in Supabase
    const fallbackList = [...validConfig, ...validLocal];
    fallbackList.forEach(acc => {
      if (!acc || !acc.id) return;
      const curr = (acc.currency || 'VES').toUpperCase().trim();
      const cleanName = (acc.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const cleanBank = (acc.bank_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const sig = `${curr}::${cleanName}::${cleanBank}`;

      if (seenSignatures.has(sig)) {
        const primary = seenSignatures.get(sig)!;
        if (!primary.account_number && acc.account_number) primary.account_number = acc.account_number;
        if ((!primary.notes || primary.notes === '[]') && acc.notes && acc.notes !== '[]') primary.notes = acc.notes;
        const aliases = aliasMap.get(primary.id) || [primary.id];
        if (!aliases.includes(acc.id)) aliases.push(acc.id);
        aliasMap.set(primary.id, aliases);
        primary.alias_ids = aliases;
      } else {
        // New account not in Supabase yet
        acc.alias_ids = [acc.id];
        seenSignatures.set(sig, acc);
        aliasMap.set(acc.id, [acc.id]);
        dedupedAccounts.push(acc);
      }
    });

    let accounts = dedupedAccounts;

    localStorage.setItem('copias_bellavista_bank_accounts', JSON.stringify(accounts));

    // Auto-sync missing local accounts to cloud in background
    if (supabase && accounts.length > 0 && apiList.length < accounts.length) {
      try {
        Promise.resolve(
          supabase.from('app_config').upsert({
            key: 'bank_accounts',
            value: accounts,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' })
        ).catch(() => {});

        accounts.forEach(acc => {
          if (!apiList.some(apiAcc => apiAcc.id === acc.id)) {
            const dbPayload = {
              id: acc.id,
              name: acc.name,
              bank_name: acc.bank_name,
              currency: acc.currency,
              balance: Number(acc.balance) || 0,
              is_active: acc.is_active !== false,
              notes: acc.notes || null,
              account_number: acc.account_number || null,
              created_at: acc.created_at || new Date().toISOString(),
              updated_at: acc.updated_at || new Date().toISOString()
            };
            Promise.resolve(
              supabase!.from('bank_accounts').upsert(dbPayload, { onConflict: 'id' })
            ).catch(() => {});
          }
        });
      } catch (e) {}
    }

    return accounts;
  },

  async saveBankAccount(account: BankAccount): Promise<BankAccount> {
    // 🛑 Never save or register virtual CxC as a real bank account
    if (
      account.id === 'cxc-virtual' || 
      account.name?.toLowerCase().includes('cuentas por cobrar') || 
      account.bank_name?.toLowerCase().includes('cobranzas virtual')
    ) {
      return account;
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!account.id || !UUID_REGEX.test(account.id)) {
      account.id = crypto.randomUUID();
    }
    
    account.currency = (account.currency || 'VES').toUpperCase().trim();
    account.balance = Number(account.balance) || 0;
    account.updated_at = new Date().toISOString();
    if (!account.created_at) account.created_at = new Date().toISOString();

    const current = await this.getBankAccounts();
    const cleanCurrent = current.filter(a => a.id !== 'cxc-virtual' && !a.name?.toLowerCase().includes('cuentas por cobrar'));
    
    // Check if updating an existing account by ID or matching semantic identity (name + bank + currency)
    const existingIndex = cleanCurrent.findIndex(a => 
      a.id === account.id || 
      (a.currency?.toUpperCase() === account.currency && 
       a.name?.toLowerCase().trim() === account.name?.toLowerCase().trim() && 
       (a.bank_name || '').toLowerCase().trim() === (account.bank_name || '').toLowerCase().trim())
    );

    let updated: BankAccount[];
    if (existingIndex >= 0) {
      // If found by name/bank/currency with a different valid ID, keep original ID
      if (cleanCurrent[existingIndex].id && cleanCurrent[existingIndex].id !== account.id) {
        account.id = cleanCurrent[existingIndex].id;
      }
      updated = cleanCurrent.map((a, idx) => idx === existingIndex ? account : a);
    } else {
      // Brand new account: successfully append!
      updated = [...cleanCurrent, account];
    }
    
    localStorage.setItem('copias_bellavista_bank_accounts', JSON.stringify(updated));

    if (supabase) {
      try {
        // Only send known columns to Supabase bank_accounts
        const dbPayload = {
          id: account.id,
          name: account.name,
          bank_name: account.bank_name,
          currency: account.currency,
          balance: account.balance,
          is_active: account.is_active !== false,
          notes: account.notes || null,
          account_number: account.account_number || null,
          created_at: account.created_at,
          updated_at: account.updated_at
        };
        const { error } = await supabase.from('bank_accounts').upsert(dbPayload, { onConflict: 'id' });
        if (error) {
          console.warn("Supabase saveBankAccount notice:", error.message);
        }
      } catch (e) {
        console.warn("Supabase saveBankAccount fallback:", e);
      }

      // Always backup in app_config
      try {
        await supabase.from('app_config').upsert({
          key: 'bank_accounts',
          value: updated,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e2) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated', { detail: updated }));
    return account;
  },

  async deleteBankAccount(id: string): Promise<boolean> {
    const current = await this.getBankAccounts();
    const updated = current.filter(a => a.id !== id);
    localStorage.setItem('copias_bellavista_bank_accounts', JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from('bank_accounts').delete().eq('id', id);
      } catch (e) {}

      try {
        await supabase.from('app_config').upsert({
          key: 'bank_accounts',
          value: updated,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated', { detail: updated }));
    return true;
  },

  async updateBankAccountBalance(id: string, amountChange: number): Promise<boolean> {
    const current = await this.getBankAccounts();
    const account = current.find(a => a.id === id);
    if (!account) return false;

    account.balance = Number(account.balance) + amountChange;
    account.updated_at = new Date().toISOString();

    return !!(await this.saveBankAccount(account));
  },

  async getBankTransfers(): Promise<BankTransfer[]> {
    const local = this._getLocalFallback('bank_transfers', [] as BankTransfer[]);
    let apiList: BankTransfer[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('bank_transfers').select('*').order('created_at', { ascending: false }).limit(5000);
        if (!error && data) {
          apiList = data as BankTransfer[];
        }
      } catch (e) {
        console.warn('Supabase fetch bank_transfers error:', e);
      }
    }

    const merged = new Map<string, BankTransfer>();
    local.forEach(t => { if (t.id) merged.set(t.id, t); });
    apiList.forEach(t => { if (t.id) merged.set(t.id, t); });

    let transfers = Array.from(merged.values());

    // Auto-sanitize records: for VES records where amount was stored in USD (e.g. 0.50) while exchange_rate was 785.07
    transfers = transfers.map(t => {
      if (t.currency === 'VES' && t.exchange_rate && t.exchange_rate > 50 && Number(t.amount) > 0 && Number(t.amount) < 50) {
        const fullBs = Number(t.amount) * Number(t.exchange_rate);
        return {
          ...t,
          amount: fullBs,
          converted_amount: fullBs
        };
      }
      return t;
    });

    // Clean sorting
    transfers.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(transfers));
    return transfers;
  },

  async transferBetweenAccounts(transfer: BankTransfer): Promise<BankTransfer> {
    transfer.id = crypto.randomUUID();
    transfer.created_at = new Date().toISOString();

    const current = await this.getBankTransfers();
    const updated = [transfer, ...current];
    localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(updated));

    if (transfer.from_account_id) {
      await this.updateBankAccountBalance(transfer.from_account_id, -transfer.amount);
    }
    const creditAmount = transfer.converted_amount !== undefined ? Number(transfer.converted_amount) : Number(transfer.amount);
    if (transfer.to_account_id && creditAmount > 0) {
      await this.updateBankAccountBalance(transfer.to_account_id, creditAmount);
    }

    if (supabase) {
      try {
        await supabase.from('bank_transfers').insert(transfer);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated', { detail: updated }));
    return transfer;
  },

  async recordSaleIncomeToBankAccounts(params: {
    invoice: Invoice;
    splitPayments?: Array<{
      method: string;
      currency?: string;
      amount?: number;
      amount_usd?: number;
      amount_ves?: number;
      rate?: number;
      bankAccountId?: string;
      bank_account_id?: string;
      bank_account_name?: string;
    }>;
    singlePaymentMethod?: string;
    totalUsd?: number;
    totalVes?: number;
    bcvRate?: number;
    createdBy?: string;
    bankAccountId?: string;
  }): Promise<void> {
    try {
      const [bankAccountsRes, paymentMethods] = await Promise.all([
        this.getBankAccounts(),
        this.getPaymentMethods()
      ]);
      let bankAccounts = bankAccountsRes;
      const bcvRate = params.bcvRate || params.invoice?.bcv_rate || getCachedCurrencyRates().VES;

      // If no bank accounts exist in DB, create initial seed accounts so money gets tracked
      if (bankAccounts.length === 0) {
        const seedAccounts: BankAccount[] = [
          {
            id: crypto.randomUUID(),
            name: 'Cuenta Dólares',
            bank_name: 'Cuenta Dólares',
            currency: 'USD',
            balance: 0,
            is_active: true,
            created_at: new Date().toISOString()
          },
          {
            id: crypto.randomUUID(),
            name: 'Cuenta Bolívares',
            bank_name: 'Cuenta Bolívares',
            currency: 'VES',
            balance: 0,
            is_active: true,
            created_at: new Date().toISOString()
          }
        ];
        for (const sa of seedAccounts) {
          await this.saveBankAccount(sa);
        }
        bankAccounts = await this.getBankAccounts();
      }

      // Helper function for normalisation
      const clean = (s: string) => (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Build payment items list
      const paymentEntries: Array<{
        method: string;
        amount: number;
        amountUsd: number;
        amountVes: number;
        currency: string;
        rate: number;
        bankAccountId?: string;
      }> = [];

      const rawSplit = params.splitPayments || (params.invoice as any)?.split_payments;

      if (rawSplit && rawSplit.length > 0) {
        rawSplit.forEach((sp: any) => {
          const spMethod = sp.method || 'Pago';
          const spRate = sp.rate || bcvRate || 1;
          const spCurr = (sp.currency || (sp.amount_ves && !sp.amount_usd ? 'VES' : 'USD')).toUpperCase();
          const amt = Number(sp.amount || 0);
          let amtUsd = Number(sp.amount_usd || 0);
          let amtVes = Number(sp.amount_ves || 0);

          if (amtUsd === 0 && amtVes === 0 && amt > 0) {
            if (spCurr === 'VES') {
              amtVes = amt;
              amtUsd = amt / (spRate || 1);
            } else if (spCurr === 'USDT') {
              amtUsd = amt;
              amtVes = amt * (bcvRate || spRate);
            } else {
              amtUsd = amt;
              amtVes = amt * (spRate || bcvRate);
            }
          } else if (amtUsd > 0 && amtVes === 0) {
            amtVes = amtUsd * (spRate || bcvRate);
          } else if (amtVes > 0 && amtUsd === 0) {
            amtUsd = amtVes / (spRate || 1);
          }

          paymentEntries.push({
            method: spMethod,
            amount: amt || (spCurr === 'VES' ? amtVes : amtUsd),
            amountUsd: amtUsd,
            amountVes: amtVes,
            currency: spCurr,
            rate: spRate,
            bankAccountId: sp.bankAccountId || sp.bank_account_id || params.bankAccountId || params.invoice?.bank_account_id
          });
        });
      } else {
        const methodStr = params.singlePaymentMethod || params.invoice?.payment_method || 'Efectivo';
        const isUsdt = methodStr.toLowerCase().includes('usdt') || 
                       methodStr.toLowerCase().includes('binance') || 
                       methodStr.toLowerCase().includes('tether');
        const isVes = !isUsdt && (methodStr.toLowerCase().includes('bs') || 
                      methodStr.toLowerCase().includes('bolivar') || 
                      methodStr.toLowerCase().includes('pago movil') || 
                      methodStr.toLowerCase().includes('punto') || 
                      methodStr.toLowerCase().includes('transferencia'));
        const totUsd = Number(params.totalUsd !== undefined ? params.totalUsd : params.invoice?.total || 0);
        const totVes = Number(params.totalVes !== undefined ? params.totalVes : totUsd * bcvRate);

        paymentEntries.push({
          method: methodStr,
          amount: isVes ? totVes : totUsd,
          amountUsd: totUsd,
          amountVes: totVes,
          currency: isUsdt ? 'USDT' : (isVes ? 'VES' : 'USD'),
          rate: bcvRate,
          bankAccountId: params.bankAccountId || params.invoice?.bank_account_id
        });
      }

      const transfersToInsert: BankTransfer[] = [];

      for (const entry of paymentEntries) {
        if (entry.amountUsd <= 0 && entry.amountVes <= 0 && entry.amount <= 0) continue;

        const rawMethod = entry.method || '';
        const normMethod = clean(rawMethod);
        
        // 🛑 IMPORTANT: Ignore virtual CxC entries so credit sales / receivables are not recorded as bank deposits!
        if (
          entry.bankAccountId === 'cxc-virtual' ||
          normMethod.includes('cuentas por cobrar') ||
          normMethod.includes('credito cliente') ||
          normMethod.includes('credito por venta')
        ) {
          continue;
        }
        
        let targetBank: BankAccount | undefined;

        // 🏦 STEP 0: Direct bank account ID assigned to this entry (HIGHEST PRIORITY)
        if (entry.bankAccountId) {
          targetBank = bankAccounts.find(a => a.id === entry.bankAccountId);
        }

        // 🏦 STEP 0.5: Fallback to invoice-level / params bank account ID
        if (!targetBank && params.bankAccountId) {
          targetBank = bankAccounts.find(a => a.id === params.bankAccountId);
        }
        if (!targetBank && params.invoice?.bank_account_id) {
          targetBank = bankAccounts.find(a => a.id === params.invoice.bank_account_id);
        }

        // Find configured payment method
        const pmConfig = paymentMethods.find(p => {
          const normPName = clean(p.name);
          const normPId = clean(p.id);
          const normPCode = clean(p.code || '');
          return normPName === normMethod || 
                 p.id === rawMethod || 
                 normPId === normMethod ||
                 normPCode === normMethod ||
                 (normPName.length > 3 && (normMethod.includes(normPName) || normPName.includes(normMethod))) ||
                 (normMethod.length > 3 && (normMethod.includes(normPName) || normPName.includes(normMethod)));
        });

        // 🏦 STEP 1: Direct link in PaymentMethodConfig
        if (!targetBank && pmConfig && pmConfig.bank_account_id) {
          targetBank = bankAccounts.find(a => a.id === pmConfig.bank_account_id);
        }

        // 🏦 STEP 2: Associated methods JSON in bankAccount.notes
        if (!targetBank) {
          targetBank = bankAccounts.find(a => {
            if (!a.notes) return false;
            try {
              const parsed = JSON.parse(a.notes);
              if (Array.isArray(parsed)) {
                return parsed.some(m => {
                  const mNorm = clean(m.name || '');
                  const mIdNorm = clean(m.id || '');
                  return mNorm === normMethod || 
                         mIdNorm === normMethod ||
                         (mNorm.length > 3 && (normMethod.includes(mNorm) || mNorm.includes(normMethod))) ||
                         m.id === pmConfig?.id;
                });
              }
            } catch (e) {}
            return false;
          });
        }

        // 🏦 STEP 3: Institution keyword search in method name
        if (!targetBank) {
          const isBanesco = normMethod.includes('banesco');
          const isVenezuela = normMethod.includes('venezuela') || normMethod.includes('bdv') || normMethod.includes('vzla');
          const isBNC = normMethod.includes('bnc') || normMethod.includes('nacional de credito') || (normMethod.includes('credito') && !normMethod.includes('tarjeta')) || normMethod.includes('pagomovil') || normMethod.includes('pago movil') || normMethod.includes('punto');
          const isMercantil = normMethod.includes('mercantil');
          const isProvincial = normMethod.includes('provincial') || normMethod.includes('bbva');
          const isBofA = normMethod.includes('bofa') || normMethod.includes('bank of america') || normMethod.includes('america');
          const isZelle = normMethod.includes('zelle');
          const isBinance = normMethod.includes('binance') || normMethod.includes('usdt');
          
          const isEfectivoVES = (normMethod.includes('efectivo') || normMethod.includes('cash')) && 
                               (normMethod.includes('ves') || normMethod.includes('bs') || normMethod.includes('bolivar') || normMethod.includes('bolivares'));
          
          const isEfectivoUSD = normMethod === 'efectivo' || 
                               normMethod === 'efectivo usd' || 
                               normMethod === 'efectivo dolares' || 
                               normMethod === 'efectivo dólares' || 
                               normMethod === 'dolares' || 
                               normMethod === 'usd' || 
                               ((normMethod.includes('efectivo') || normMethod.includes('cash')) && !isEfectivoVES);

          if (isBanesco) {
            targetBank = bankAccounts.find(a => clean(`${a.name} ${a.bank_name || ''}`).includes('3750')) ||
                         bankAccounts.find(a => clean(`${a.name} ${a.bank_name || ''}`).includes('banesco'));
          } else if (isVenezuela) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('ahorro') && (aText.includes('venezuela') || aText.includes('bdv') || aText.includes('vzla'));
            }) || bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('venezuela') || aText.includes('bdv') || aText.includes('vzla');
            });
          } else if (isBNC) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('bnc') || aText.includes('nacional de credito') || aText.includes('credito');
            });
          } else if (isMercantil) {
            targetBank = bankAccounts.find(a => clean(`${a.name} ${a.bank_name || ''}`).includes('mercantil'));
          } else if (isProvincial) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('provincial') || aText.includes('bbva');
            });
          } else if (isBofA) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('bofa') || aText.includes('america');
            });
          } else if (isZelle) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return aText.includes('zelle') || (a.currency === 'USD' && aText.includes('dolar'));
            });
          } else if (isBinance) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return (a.currency || '').toUpperCase() === 'USDT' || aText.includes('binance') || aText.includes('usdt');
            }) || bankAccounts.find(a => (a.currency || '').toUpperCase() === 'USDT');
          } else if (isEfectivoUSD) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return (aText.includes('efectivo') && (aText.includes('dolar') || aText.includes('dolares'))) || aText === 'efectivo dolares';
            }) || bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return a.currency === 'USD' && (aText.includes('efectivo') || aText.includes('caja') || aText.includes('dolar'));
            }) || bankAccounts.find(a => a.currency === 'USD');
          } else if (isEfectivoVES) {
            targetBank = bankAccounts.find(a => {
              const aText = clean(`${a.name} ${a.bank_name || ''}`);
              return a.currency === 'VES' && (aText.includes('efectivo') || aText.includes('caja') || aText.includes('bolivar'));
            }) || bankAccounts.find(a => a.currency === 'VES' && clean(a.name).includes('efectivo'));
          }
        }

        // 🏦 STEP 4: Substring matching with bank account names
        if (!targetBank) {
          targetBank = bankAccounts.find(a => {
            const aNameNorm = clean(a.name);
            const aBankNorm = clean(a.bank_name || '');
            return normMethod.includes(aNameNorm) || (aNameNorm.length > 3 && normMethod.includes(aNameNorm)) ||
                   (aBankNorm.length > 3 && normMethod.includes(aBankNorm));
          });
        }

        // 🏦 STEP 5: Intelligent Fallback by currency (differentiating Cash vs Bank/Digital)
        if (!targetBank) {
          const isUsdtMethod = (entry.currency || '').toUpperCase() === 'USDT' || 
                               normMethod.includes('usdt') || 
                               normMethod.includes('binance') || 
                               normMethod.includes('tether');
          const isUsdMethod = !isUsdtMethod && (
            (entry.currency || '').toUpperCase() === 'USD' || 
            normMethod.includes('usd') || 
            normMethod.includes('dolar') || 
            normMethod.includes('zelle')
          );
          const isCashMethod = normMethod.includes('efectivo') || normMethod.includes('cash');

          if (isUsdtMethod) {
            targetBank = bankAccounts.find(a => (a.currency || '').toUpperCase() === 'USDT')
                      || bankAccounts.find(a => clean(`${a.name} ${a.bank_name || ''}`).includes('binance') || clean(`${a.name} ${a.bank_name || ''}`).includes('usdt'));
          } else if (isCashMethod) {
            targetBank = bankAccounts.find(a => (a.currency || '').toUpperCase() === (isUsdMethod ? 'USD' : 'VES') && (clean(a.name).includes('efectivo') || clean(a.name).includes('caja')))
                      || bankAccounts.find(a => (a.currency || '').toUpperCase() === (isUsdMethod ? 'USD' : 'VES'));
          } else {
            targetBank = bankAccounts.find(a => (a.currency || '').toUpperCase() === (isUsdMethod ? 'USD' : 'VES') && !clean(a.name).includes('efectivo') && !clean(a.name).includes('caja'))
                      || bankAccounts.find(a => (a.currency || '').toUpperCase() === (isUsdMethod ? 'USD' : 'VES'));
          }
          if (!targetBank) {
            targetBank = bankAccounts[0];
          }
        }

        if (targetBank) {
          const targetCurr = (targetBank.currency || 'VES').toUpperCase();
          const isBankVES = targetCurr === 'VES';
          const isBankUSDT = targetCurr === 'USDT';
          let creditAmount = 0;

          if (isBankVES) {
            creditAmount = Number(entry.amountVes) || (Number(entry.amountUsd) * bcvRate) || (Number(entry.amount) * (entry.currency === 'VES' ? 1 : bcvRate));
          } else if (isBankUSDT) {
            creditAmount = Number(entry.amountUsd) || (entry.currency === 'VES' ? (Number(entry.amount) / bcvRate) : Number(entry.amount));
          } else {
            creditAmount = Number(entry.amountUsd) || (entry.currency === 'VES' ? (Number(entry.amount) / bcvRate) : Number(entry.amount));
          }

          // Deduct incoming commission if configured
          const commissionPercent = pmConfig?.incoming_commission || 0;
          if (commissionPercent > 0) {
            creditAmount = creditAmount - (creditAmount * (commissionPercent / 100));
          }

          creditAmount = parseFloat(creditAmount.toFixed(2));

          // 1. Update bank account balance directly
          targetBank.balance = Number(targetBank.balance || 0) + creditAmount;
          targetBank.updated_at = new Date().toISOString();

          // 2. Prepare movement record for bank_transfers
          const docTypeLabel = params.invoice?.document_type === 'nota_entrega' ? 'Nota de Entrega' : 'Factura';
          const docNum = params.invoice?.control_number || params.invoice?.invoice_number || '';
          const clientName = params.invoice?.customer_name || 'Consumidor Final';

          const transferItem: BankTransfer = {
            id: crypto.randomUUID(),
            to_account_id: targetBank.id,
            to_account_name: targetBank.name || targetBank.bank_name,
            amount: creditAmount,
            currency: targetBank.currency,
            exchange_rate: isBankVES ? (entry.rate || bcvRate) : undefined,
            converted_amount: creditAmount,
            reference: docNum ? `${params.invoice?.document_type === 'nota_entrega' ? 'NE' : 'FAC'}-${docNum}` : `VENTA-${Date.now().toString().slice(-6)}`,
            notes: `Ingreso Venta Flash (${targetBank.name || entry.method}) - ${docTypeLabel} #${docNum} (${clientName})`,
            created_by: params.createdBy || params.invoice?.created_by || 'Cajero POS',
            created_at: params.invoice?.created_at || new Date().toISOString()
          };

          transfersToInsert.push(transferItem);
        }
      }

      // Save updated bank accounts in local storage immediately and sync with Supabase in background
      localStorage.setItem('copias_bellavista_bank_accounts', JSON.stringify(bankAccounts));
      if (supabase) {
        Promise.allSettled(
          bankAccounts.map(b => supabase!.from('bank_accounts').upsert(b, { onConflict: 'id' }))
        ).catch(e => console.warn("Background bank upsert notice:", e));
      }

      if (transfersToInsert.length > 0) {
        let currentTransfers: BankTransfer[] = [];
        try {
          const savedT = localStorage.getItem('copias_bellavista_bank_transfers');
          if (savedT) currentTransfers = JSON.parse(savedT);
        } catch (e) {}

        const updatedTransfers = [...transfersToInsert, ...currentTransfers];
        localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(updatedTransfers));

        if (supabase) {
          try {
            await supabase.from('bank_transfers').insert(transfersToInsert);
          } catch (e) {
            console.warn("Error inserting bank transfers in Supabase:", e);
          }
        }

        window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated', { detail: bankAccounts }));
        window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated', { detail: updatedTransfers }));
      }
    } catch (err) {
      console.error("Error in recordSaleIncomeToBankAccounts:", err);
    }
  },

  // ============================================================================
  // FINANZAS: GASTOS FIJOS Y VARIABLES
  // ============================================================================

  async getGastosFijos(): Promise<GastoFijo[]> {
    if (!supabase) return this._getLocalFallback('gastos_fijos', [] as GastoFijo[]);
    try {
      const { data, error } = await supabase.from('gastos_fijos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        localStorage.setItem('copias_bellavista_gastos_fijos', JSON.stringify(data));
        return data as GastoFijo[];
      }
    } catch (e) {}
    return this._getLocalFallback('gastos_fijos', [] as GastoFijo[]);
  },

  async saveGastoFijo(gasto: GastoFijo): Promise<GastoFijo> {
    notifyProcedureExecuted();
    const isNew = !gasto.id;
    if (isNew) gasto.id = crypto.randomUUID();
    
    gasto.updated_at = new Date().toISOString();

    const current = await this.getGastosFijos();
    const updated = isNew ? [gasto, ...current] : current.map(g => g.id === gasto.id ? gasto : g);
    localStorage.setItem('copias_bellavista_gastos_fijos', JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from('gastos_fijos').upsert(gasto, { onConflict: 'id' });
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_gastos_fijos_updated', { detail: updated }));
    return gasto;
  },

  async deleteGastoFijo(id: string): Promise<boolean> {
    const current = await this.getGastosFijos();
    const updated = current.filter(g => g.id !== id);
    localStorage.setItem('copias_bellavista_gastos_fijos', JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from('gastos_fijos').delete().eq('id', id);
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('bellavista_gastos_fijos_updated', { detail: updated }));
    return true;
  },

  async getGastoFijoPayments(): Promise<GastoFijoPayment[]> {
    if (!supabase) return this._getLocalFallback('gastos_fijos_payments', [] as GastoFijoPayment[]);
    try {
      const { data, error } = await supabase.from('gastos_fijos_payments').select('*').order('payment_date', { ascending: false });
      if (error) throw error;
      if (data) {
        localStorage.setItem('copias_bellavista_gastos_fijos_payments', JSON.stringify(data));
        return data as GastoFijoPayment[];
      }
    } catch (e) {}
    return this._getLocalFallback('gastos_fijos_payments', [] as GastoFijoPayment[]);
  },

  async payGastoFijo(payment: GastoFijoPayment, updateStatus?: string, updateNextDate?: string): Promise<GastoFijoPayment> {
    payment.id = crypto.randomUUID();
    if (!payment.created_at) payment.created_at = new Date().toISOString();

    const current = await this.getGastoFijoPayments();
    const updated = [payment, ...current];
    localStorage.setItem('copias_bellavista_gastos_fijos_payments', JSON.stringify(updated));

    // Deduct from bank if applicable with correct currency conversion & movement record
    if (payment.bank_account_id) {
      const bankAccounts = await this.getBankAccounts();
      const bank = bankAccounts.find(a => a.id === payment.bank_account_id);
      if (bank) {
        const isVES = bank.currency === 'VES';
        const amountToDeduct = isVES ? (Number(payment.amount_bs) || (Number(payment.amount) * getCachedCurrencyRates().VES)) : Number(payment.amount);
        
        bank.balance = Number(bank.balance) - amountToDeduct;
        bank.updated_at = new Date().toISOString();
        await this.saveBankAccount(bank);

        // Record movement in bank_transfers
        const bankMovement: BankTransfer = {
          id: crypto.randomUUID(),
          from_account_id: bank.id,
          from_account_name: bank.name || bank.bank_name,
          amount: amountToDeduct,
          currency: bank.currency,
          exchange_rate: isVES ? (amountToDeduct / (Number(payment.amount) || 1)) : undefined,
          converted_amount: amountToDeduct,
          reference: payment.reference || 'PAGO-GASTO',
          notes: payment.notes || `Pago de gasto fijo (${payment.payment_method})`,
          created_by: payment.created_by || 'Administrador',
          created_at: payment.payment_date || new Date().toISOString()
        };

        const currentTransfers = await this.getBankTransfers();
        const updatedTransfers = [bankMovement, ...currentTransfers];
        localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(updatedTransfers));
        if (supabase) {
          try {
            await supabase.from('bank_transfers').insert(bankMovement);
          } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated', { detail: updatedTransfers }));
      }
    }

    // Update the gasto status
    if (updateStatus || updateNextDate) {
      const gastos = await this.getGastosFijos();
      const gasto = gastos.find(g => g.id === payment.gasto_fijo_id);
      if (gasto) {
        if (updateStatus) gasto.status = updateStatus as any;
        if (updateNextDate) gasto.next_due_date = updateNextDate;
        gasto.last_paid_date = payment.payment_date;
        await this.saveGastoFijo(gasto);
      }
    }

    if (supabase) {
      try {
        await supabase.from('gastos_fijos_payments').insert(payment);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_gastos_fijos_payments_updated', { detail: updated }));
    return payment;
  },

  // ============================================================================
  // FINANZAS: CUENTAS POR PAGAR (CxP)
  // ============================================================================

  async getAccountsPayable(): Promise<AccountPayable[]> {
    const localItems = this._getLocalFallback('accounts_payable', [] as AccountPayable[]);
    let apiItems: AccountPayable[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('accounts_payable').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          apiItems = data as AccountPayable[];
        }
      } catch (e) {
        console.warn('Supabase getAccountsPayable warning:', e);
      }
    }

    // 1. Merge Supabase & Local Accounts Payable
    const mergedMap = new Map<string, AccountPayable>();
    localItems.forEach(item => {
      if (typeof (item as any).installments === 'string') {
        try {
          (item as any).installments = JSON.parse((item as any).installments);
        } catch (e) {}
      }
      if (item.id) mergedMap.set(item.id, item);
    });
    apiItems.forEach(item => {
      if (typeof (item as any).installments === 'string') {
        try {
          (item as any).installments = JSON.parse((item as any).installments);
        } catch (e) {}
      }
      if (item.id) mergedMap.set(item.id, item);
    });

    // 2. Also check legacy copias_bellavista_cuentas_por_pagar
    try {
      const legacyRaw = localStorage.getItem('copias_bellavista_cuentas_por_pagar');
      if (legacyRaw) {
        const legacyList = JSON.parse(legacyRaw);
        if (Array.isArray(legacyList)) {
          // Clean legacyList to remove redundant sub-cuota items
          const cleanedLegacy = legacyList.filter((leg: any) => {
            const isSubCuota = leg.id && /cxp-pur-.*-\d+$/.test(leg.id);
            const isCuotaConcept = leg.concept && /Cuota #\d+ de \d+/i.test(leg.concept);
            return !isSubCuota && !isCuotaConcept;
          });
          localStorage.setItem('copias_bellavista_cuentas_por_pagar', JSON.stringify(cleanedLegacy));

          cleanedLegacy.forEach((leg: any) => {
            const mappedId = leg.id || `cxp-leg-${Date.now()}`;
            if (!mergedMap.has(mappedId)) {
              mergedMap.set(mappedId, {
                id: mappedId,
                entity_name: leg.provider_name || leg.entity_name || 'Proveedor General',
                provider_name: leg.provider_name || leg.entity_name || 'Proveedor General',
                subject: leg.concept || leg.subject || 'Cuenta por Pagar',
                description: leg.observation || leg.description || '',
                total_amount: Number(leg.amount || leg.total_amount || 0),
                paid_amount: 0,
                remaining_amount: Number(leg.amount || leg.total_amount || 0),
                status: leg.status || 'pendiente',
                currency: 'USD',
                issue_date: leg.created_at || new Date().toISOString(),
                due_date: leg.due_date ? new Date(leg.due_date).toISOString() : undefined,
                created_at: leg.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          });
        }
      }
    } catch (e) {}

    // 3. Scan Purchases to ensure all Credit / CXP / Pendiente purchases exist in Cuentas por Pagar
    try {
      const allPurchases = await this.getPurchases();
      for (const pur of allPurchases) {
        const isCredit = pur.payment_status === 'pendiente' ||
          pur.payment_status === 'parcial' ||
          pur.status === 'pendiente' ||
          String(pur.payment_method || '').toLowerCase().includes('crédito') ||
          String(pur.payment_method || '').toLowerCase().includes('credito') ||
          String(pur.payment_method || '').toLowerCase().includes('cxp') ||
          String(pur.payment_method || '').toLowerCase().includes('cuenta por pagar') ||
          Boolean(pur.installments && pur.installments.length > 0);

        if (isCredit) {
          // Check if already in mergedMap by purchase_id or invoice_number
          const existing = Array.from(mergedMap.values()).find(
            c => (c.purchase_id && c.purchase_id === pur.id) ||
                 (c.invoice_number && pur.invoice_number && c.invoice_number === pur.invoice_number) ||
                 c.id === `cxp-pur-${pur.id}` ||
                 c.id === pur.id
          );

          if (!existing) {
            const totalDebt = Number(pur.total_amount || 0);
            const paidAmount = Number(pur.paid_amount ?? pur.initial_payment ?? (pur.payment_status === 'pagado' ? totalDebt : 0));
            const remaining = Math.max(0, Number((totalDebt - paidAmount).toFixed(2)));
            const autoCxp: AccountPayable = {
              id: `cxp-pur-${pur.id}`,
              purchase_id: pur.id,
              invoice_number: pur.invoice_number,
              entity_name: pur.provider_name || 'Proveedor General',
              provider_name: pur.provider_name || 'Proveedor General',
              provider_rif: pur.provider_rif || '',
              subject: `Factura #${pur.invoice_number} - Compra`,
              description: `Cuenta por pagar vinculada desde Compra #${pur.invoice_number}. Sede: ${pur.notes || 'Principal'}`,
              total_amount: totalDebt,
              paid_amount: paidAmount,
              remaining_amount: remaining,
              status: remaining <= 0 ? 'pagado' : (paidAmount > 0 ? 'parcial' : 'pendiente'),
              currency: 'USD',
              issue_date: pur.date ? new Date(pur.date).toISOString() : (pur.created_at || new Date().toISOString()),
              due_date: pur.due_date ? new Date(pur.due_date).toISOString() : undefined,
              installments_count: pur.installments_count,
              installments: pur.installments,
              created_at: pur.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mergedMap.set(autoCxp.id, autoCxp);
          } else {
            if (!existing.installments && pur.installments) {
              existing.installments = pur.installments;
              existing.installments_count = pur.installments_count;
            }
          }
        }
      }
    } catch (e) {}

    // 4. PURGE DUPLICATE SUB-CUOTA RECORDS
    // Sub-cuotas (e.g. `cxp-pur-*-1`, `Cuota #1 de 2`) must never exist as independent CXP debts
    const toDeleteIds: string[] = [];
    mergedMap.forEach((cxp, id) => {
      const isSubCuotaId = /cxp-pur-.*-\d+$/.test(id);
      const isCuotaSubject = Boolean(cxp.subject && /Cuota #\d+ de \d+/i.test(cxp.subject));
      if (isSubCuotaId || isCuotaSubject) {
        toDeleteIds.push(id);
      }
    });
    toDeleteIds.forEach(id => mergedMap.delete(id));

    // 5. Reconcile with recorded payments to ensure accurate remaining balances
    try {
      const allPayments = await this.getAccountsPayablePayments().catch(() => this._getLocalFallback('accounts_payable_payments', [] as AccountPayablePayment[]));
      mergedMap.forEach((cxp) => {
        const itemPayments = allPayments.filter(p => p.account_payable_id === cxp.id || p.cxp_id === cxp.id);
        if (itemPayments.length > 0) {
          const sumPayments = itemPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          if (sumPayments > 0) {
            cxp.paid_amount = Number(sumPayments.toFixed(2));
            cxp.remaining_amount = Math.max(0, Number((cxp.total_amount - cxp.paid_amount).toFixed(2)));
            cxp.status = cxp.remaining_amount <= 0.001 ? 'pagado' : 'parcial';
          }
        }
      });
    } catch (e) {}

    const finalList = Array.from(mergedMap.values()).sort((a, b) => {
      const dateA = new Date(a.issue_date || a.created_at || 0).getTime();
      const dateB = new Date(b.issue_date || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    localStorage.setItem('copias_bellavista_accounts_payable', JSON.stringify(finalList));
    return finalList;
  },

  async saveAccountPayable(cxp: AccountPayable): Promise<AccountPayable> {
    const isNew = !cxp.id;
    if (isNew) cxp.id = crypto.randomUUID();
    cxp.updated_at = new Date().toISOString();

    const current = await this.getAccountsPayable();
    const updated = isNew ? [cxp, ...current.filter(c => c.id !== cxp.id)] : current.map(c => c.id === cxp.id ? cxp : c);
    localStorage.setItem('copias_bellavista_accounts_payable', JSON.stringify(updated));

    if (supabase) {
      try {
        const payloadToSave = {
          ...cxp,
          installments: cxp.installments ? (typeof cxp.installments === 'object' ? JSON.stringify(cxp.installments) : cxp.installments) : undefined
        };
        await supabase.from('accounts_payable').upsert(payloadToSave, { onConflict: 'id' });
      } catch (e) {
        console.warn('Supabase upsert accounts_payable warning:', e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_updated', { detail: updated }));
    return cxp;
  },

  async deleteAccountPayable(id: string): Promise<boolean> {
    const current = await this.getAccountsPayable();
    const updated = current.filter(c => c.id !== id);
    localStorage.setItem('copias_bellavista_accounts_payable', JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from('accounts_payable').delete().eq('id', id);
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_updated', { detail: updated }));
    return true;
  },

  async getAccountsPayablePayments(): Promise<AccountPayablePayment[]> {
    const local = this._getLocalFallback('accounts_payable_payments', [] as AccountPayablePayment[]);
    let apiList: AccountPayablePayment[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('accounts_payable_payments').select('*').order('payment_date', { ascending: false });
        if (!error && data) {
          apiList = data as AccountPayablePayment[];
        }
      } catch (e) {}
    }

    const merged = new Map<string, AccountPayablePayment>();
    local.forEach(p => { if (p.id) merged.set(p.id, p); });
    apiList.forEach(p => { if (p.id) merged.set(p.id, p); });

    const result = Array.from(merged.values()).sort((a, b) => {
      const da = new Date(a.payment_date || a.created_at || 0).getTime();
      const db = new Date(b.payment_date || b.created_at || 0).getTime();
      return db - da;
    });

    localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify(result));
    return result;
  },

  async payAccountPayable(payment: AccountPayablePayment): Promise<AccountPayablePayment> {
    payment.id = payment.id || crypto.randomUUID();
    if (!payment.created_at) payment.created_at = new Date().toISOString();

    const current = await this.getAccountsPayablePayments();
    const updated = [payment, ...current.filter(p => p.id !== payment.id)];
    localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify(updated));

    // Deduct from bank account with currency conversion & bank movement registration
    if (payment.bank_account_id) {
      const bankAccounts = await this.getBankAccounts();
      const bank = bankAccounts.find(a => a.id === payment.bank_account_id);
      if (bank) {
        const isVES = bank.currency === 'VES';
        const amountToDeduct = isVES ? (Number(payment.amount_bs) || (Number(payment.amount) * getCachedCurrencyRates().VES)) : Number(payment.amount);
        
        bank.balance = Number(bank.balance) - amountToDeduct;
        bank.updated_at = new Date().toISOString();
        await this.saveBankAccount(bank);

        // Record movement in bank_transfers for audit and history in Cuentas Bancarias
        const bankMovement: BankTransfer = {
          id: crypto.randomUUID(),
          from_account_id: bank.id,
          from_account_name: bank.name || bank.bank_name,
          amount: amountToDeduct,
          currency: bank.currency,
          exchange_rate: isVES ? (amountToDeduct / (Number(payment.amount) || 1)) : undefined,
          converted_amount: amountToDeduct,
          reference: payment.reference || 'PAGO-CXP',
          notes: payment.notes || `Pago de cuenta por pagar (${payment.payment_method})`,
          created_by: payment.created_by || 'Administrador',
          created_at: payment.payment_date || new Date().toISOString()
        };

        const currentTransfers = await this.getBankTransfers();
        const updatedTransfers = [bankMovement, ...currentTransfers];
        localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(updatedTransfers));
        if (supabase) {
          try {
            await supabase.from('bank_transfers').insert(bankMovement);
          } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated', { detail: updatedTransfers }));
      }
    }

    const cxps = await this.getAccountsPayable();
    const cxp = cxps.find(c => c.id === payment.account_payable_id || c.id === payment.cxp_id);
    if (cxp) {
      const thisCxPPayments = updated.filter(p => p.account_payable_id === cxp.id || p.cxp_id === cxp.id);
      const totalPaid = thisCxPPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      cxp.paid_amount = Number(totalPaid.toFixed(2));
      cxp.remaining_amount = Math.max(0, Number((Number(cxp.total_amount) - totalPaid).toFixed(2)));
      if (cxp.remaining_amount <= 0.001) {
        cxp.status = 'pagado';
      } else {
        cxp.status = 'parcial';
      }

      // Synchronize installments status if exists
      if (cxp.installments && cxp.installments.length > 0) {
        let runningPaid = totalPaid;
        cxp.installments = cxp.installments.map((inst, idx) => {
          const instNum = inst.number || idx + 1;
          const instAmount = Number(inst.amount || 0);
          const isDirectlyPaid = payment.installment_number === instNum;

          if (isDirectlyPaid || runningPaid >= instAmount - 0.001) {
            runningPaid = Math.max(0, runningPaid - instAmount);
            return {
              ...inst,
              status: 'pagado' as const,
              paid_amount: instAmount,
              paid_at: inst.paid_at || payment.payment_date || new Date().toISOString(),
              payment_method: inst.payment_method || payment.payment_method
            };
          } else if (runningPaid > 0.001) {
            const partialForThis = Number(runningPaid.toFixed(2));
            runningPaid = 0;
            return {
              ...inst,
              status: 'pendiente' as const,
              paid_amount: partialForThis
            };
          } else {
            return {
              ...inst,
              status: 'pendiente' as const,
              paid_amount: 0
            };
          }
        });
      }

      await this.saveAccountPayable(cxp);

      // Sincronizar estado con la compra correspondiente si existe
      if (cxp.purchase_id || cxp.invoice_number) {
        try {
          const purchases = await this.getPurchases();
          const targetPur = purchases.find(p => p.id === cxp.purchase_id || (cxp.invoice_number && p.invoice_number === cxp.invoice_number));
          if (targetPur) {
            const newPaymentStatus = cxp.remaining_amount <= 0.001 ? 'pagado' : 'parcial';
            const newStatus = cxp.remaining_amount <= 0.001 ? 'completada' : targetPur.status;
            await this.updatePurchase(targetPur.id, {
              payment_status: newPaymentStatus,
              status: newStatus
            });
          }
        } catch (syncPurErr) {
          console.warn('Could not sync purchase status on CXP payment:', syncPurErr);
        }
      }
    }

    if (supabase) {
      try {
        await supabase.from('accounts_payable_payments').insert(payment);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_payments_updated', { detail: updated }));
    return payment;
  },

  async payBatchAccountsPayable(entityName: string, totalPaymentAmount: number, basePaymentData: Omit<AccountPayablePayment, 'id' | 'amount' | 'account_payable_id'>): Promise<AccountPayablePayment[]> {
    const allCxP = await this.getAccountsPayable();
    const entityCxPs = allCxP
      .filter(c => ((c.entity_name || c.provider_name || '').toLowerCase() === entityName.toLowerCase()) && (Number(c.remaining_amount) > 0 || c.status === 'pendiente' || c.status === 'parcial'))
      .sort((a, b) => new Date(a.issue_date || a.created_at || 0).getTime() - new Date(b.issue_date || b.created_at || 0).getTime());

    let remainingToPay = totalPaymentAmount;
    const generatedPayments: AccountPayablePayment[] = [];

    for (const cxp of entityCxPs) {
      if (remainingToPay <= 0.001) break;
      const amountForThis = Math.min(remainingToPay, Number(cxp.remaining_amount));
      if (amountForThis > 0) {
        const payment: AccountPayablePayment = {
          id: crypto.randomUUID(),
          account_payable_id: cxp.id,
          cxp_id: cxp.id,
          amount: amountForThis,
          amount_bs: basePaymentData.amount_bs ? (basePaymentData.amount_bs * (amountForThis / totalPaymentAmount)) : undefined,
          payment_method: basePaymentData.payment_method,
          bank_account_id: basePaymentData.bank_account_id,
          payment_date: basePaymentData.payment_date || new Date().toISOString(),
          reference: basePaymentData.reference,
          notes: basePaymentData.notes || `Pago agrupado a ${entityName}`,
          created_by: basePaymentData.created_by,
          created_at: new Date().toISOString()
        };
        await this.payAccountPayable(payment);
        generatedPayments.push(payment);
        remainingToPay -= amountForThis;
      }
    }
    return generatedPayments;
  },

  // ============================================================================
  // FINANZAS: CUENTAS POR COBRAR (CxC)
  // ============================================================================

  async getAccountsReceivable(): Promise<AccountReceivable[]> {
    const localItems = this._getLocalFallback('accounts_receivable', [] as AccountReceivable[]);
    let apiItems: AccountReceivable[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('accounts_receivable').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          apiItems = data as AccountReceivable[];
        }
      } catch (e) {
        console.warn("Supabase fetch accounts_receivable error:", e);
      }
    }

    // 1. Merge by id / key
    const mergedMap = new Map<string, AccountReceivable>();
    localItems.forEach(item => {
      if (typeof (item as any).installments === 'string') {
        try {
          (item as any).installments = JSON.parse((item as any).installments);
        } catch (e) {}
      }
      if (item.id) mergedMap.set(item.id, item);
    });
    apiItems.forEach(item => {
      if (typeof (item as any).installments === 'string') {
        try {
          (item as any).installments = JSON.parse((item as any).installments);
        } catch (e) {}
      }
      if (item.id) {
        const existing = mergedMap.get(item.id);
        mergedMap.set(item.id, {
          ...existing,
          ...item
        });
      }
    });

    // 2. Auto-reconcile from Invoices (detect any credit sale or split payment like FAC-1354 Adelis Duarte)
    try {
      const invoices = await this.getInvoices().catch(() => []);
      for (const inv of invoices) {
        const isSplit = Array.isArray(inv.split_payments) && inv.split_payments.length > 0;
        let creditUsd = 0;
        let immediatePaidUsd = 0;

        if (isSplit) {
          inv.split_payments.forEach((p: any) => {
            const isCxCPart = p.bankAccountId === 'cxc-virtual' || 
                              p.bank_account_id === 'cxc-virtual' ||
                              p.bankAccountId === 'cxc' ||
                              (p.method && (p.method.toLowerCase().includes('cuentas por cobrar') || p.method.toLowerCase().includes('crédito') || p.method.toLowerCase().includes('credito')));
            if (isCxCPart) {
              creditUsd += Number(p.amount_usd || p.amount || 0);
            } else {
              immediatePaidUsd += Number(p.amount_usd || (p.currency === 'USD' ? p.amount : 0) || 0);
            }
          });
        } else {
          const methodStr = (inv.payment_method || '').toLowerCase();
          if (methodStr.includes('crédito') || methodStr.includes('credito') || methodStr.includes('cuentas por cobrar') || methodStr.includes('cxc')) {
            creditUsd = Number(inv.total) || 0;
          }
        }

        if (creditUsd > 0.001) {
          const invNum = inv.control_number || `FAC-${inv.id.substring(0, 6)}`;
          const clientName = (inv.customer_name || 'Cliente').trim();
          const clientPhone = (inv.customer_phone || '').trim();
          const clientDoc = (inv.customer_document || '').trim();
          const entityName = clientPhone ? `${clientName} ${clientPhone}` : clientName;

          // Check if already in mergedMap
          const existingCxc = Array.from(mergedMap.values()).find(c => 
            c.id === `cxc-${inv.id}` ||
            c.id === inv.id ||
            c.invoice_id === inv.id ||
            c.invoice_number === invNum ||
            (c.subject && c.subject.includes(invNum))
          );

          if (!existingCxc) {
            const newCxc: AccountReceivable = {
              id: `cxc-${inv.id}`,
              invoice_id: inv.id,
              invoice_number: invNum,
              subject: `Crédito por Venta - Factura #${invNum}`,
              entity_name: entityName || 'Consumidor final',
              client_name: entityName || 'Consumidor final',
              customer_name: clientName || 'Consumidor final',
              customer_phone: clientPhone,
              customer_document: clientDoc,
              description: `Crédito registrado vía ${inv.document_type === 'nota_entrega' ? 'Nota de Entrega' : 'Factura'} #${invNum}`,
              total_amount: Number(inv.total) || creditUsd,
              paid_amount: Number(immediatePaidUsd.toFixed(2)),
              remaining_amount: Number(creditUsd.toFixed(2)),
              currency: 'USD',
              bcv_rate: inv.bcv_rate || 40,
              status: (creditUsd <= 0.001 ? 'cobrado' : (immediatePaidUsd > 0 ? 'parcial' : 'pendiente')) as any,
              issue_date: inv.created_at || new Date().toISOString(),
              due_date: new Date(new Date(inv.created_at || Date.now()).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
              created_at: inv.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mergedMap.set(newCxc.id, newCxc);
          }
        }
      }
    } catch (e) {
      console.warn("Notice checking invoices for CxC reconciliation:", e);
    }

    let result = Array.from(mergedMap.values());

    // 3. Auto-reconcile with payments ledger & ensure remaining_amount = total_amount - paid_amount
    try {
      const payments = await this.getAccountsReceivablePayments().catch(() => this._getLocalFallback('accounts_receivable_payments', [] as AccountReceivablePayment[]));
      let hasChanges = false;
      result = result.map(cxc => {
        const cxcPayments = payments.filter(p => p.account_receivable_id === cxc.id || p.cxc_id === cxc.id);
        const paymentsTotal = cxcPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const effectivePaid = paymentsTotal > 0 ? paymentsTotal : (Number(cxc.paid_amount) || 0);
        const totalAmt = Number(cxc.total_amount) || 0;
        const calculatedRemaining = Math.max(0, parseFloat((totalAmt - effectivePaid).toFixed(2)));

        if (effectivePaid > 0 && Math.abs((Number(cxc.remaining_amount) || 0) - calculatedRemaining) > 0.01) {
          hasChanges = true;
          return {
            ...cxc,
            paid_amount: effectivePaid,
            remaining_amount: calculatedRemaining,
            status: (calculatedRemaining <= 0.001 ? 'cobrado' : 'parcial') as any
          };
        }
        return cxc;
      });

      if (hasChanges) {
        localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify(result));
      }
    } catch (e) {}

    localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify(result));
    return result;
  },

  async saveAccountReceivable(cxc: AccountReceivable): Promise<AccountReceivable> {
    notifyProcedureExecuted();
    const isNew = !cxc.id;
    if (isNew) cxc.id = crypto.randomUUID();
    cxc.updated_at = new Date().toISOString();

    const current = await this.getAccountsReceivable();
    const updated = isNew ? [cxc, ...current] : current.map(c => c.id === cxc.id ? cxc : c);
    localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify(updated));

    if (supabase) {
      try {
        const payload: any = {
          id: cxc.id,
          entity_name: cxc.entity_name || cxc.client_name || cxc.customer_name || 'Sin Asunto',
          client_name: cxc.client_name || cxc.entity_name || '',
          customer_name: cxc.customer_name || cxc.entity_name || '',
          subject: cxc.subject || 'crédito por venta POS',
          description: cxc.description || '',
          total_amount: Number(cxc.total_amount) || 0,
          paid_amount: Number(cxc.paid_amount) || 0,
          remaining_amount: Number(cxc.remaining_amount) || 0,
          status: cxc.status || 'pendiente',
          issue_date: cxc.issue_date || new Date().toISOString(),
          due_date: cxc.due_date || new Date().toISOString(),
          installments_count: cxc.installments_count || (cxc.installments ? cxc.installments.length : undefined),
          installments: cxc.installments ? (typeof cxc.installments === 'object' ? JSON.stringify(cxc.installments) : cxc.installments) : undefined,
          created_at: cxc.created_at || new Date().toISOString(),
          updated_at: cxc.updated_at || new Date().toISOString()
        };
        const { error } = await supabase.from('accounts_receivable').upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error("Error upserting accounts_receivable to Supabase:", error);
        }
      } catch (e) {
        console.error("Supabase upsert exception:", e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_updated', { detail: updated }));
    return cxc;
  },

  async deleteAccountReceivable(id: string): Promise<boolean> {
    const current = await this.getAccountsReceivable();
    const updated = current.filter(c => c.id !== id);
    localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify(updated));

    if (supabase) {
      try {
        await supabase.from('accounts_receivable').delete().eq('id', id);
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_updated', { detail: updated }));
    return true;
  },

  async getAccountsReceivablePayments(): Promise<AccountReceivablePayment[]> {
    const local = this._getLocalFallback('accounts_receivable_payments', [] as AccountReceivablePayment[]);
    let apiList: AccountReceivablePayment[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('accounts_receivable_payments').select('*').order('payment_date', { ascending: false });
        if (!error && data) {
          apiList = data as AccountReceivablePayment[];
        }
      } catch (e) {
        console.warn('Supabase fetch accounts_receivable_payments warning:', e);
      }
    }

    const merged = new Map<string, AccountReceivablePayment>();
    local.forEach(p => { if (p.id) merged.set(p.id, p); });
    apiList.forEach(p => { if (p.id) merged.set(p.id, p); });

    const result = Array.from(merged.values()).sort((a, b) => {
      const da = new Date(a.payment_date || a.created_at || 0).getTime();
      const db = new Date(b.payment_date || b.created_at || 0).getTime();
      return db - da;
    });

    localStorage.setItem('copias_bellavista_accounts_receivable_payments', JSON.stringify(result));
    return result;
  },

  async recordInitialAccountReceivablePayment(payment: AccountReceivablePayment): Promise<AccountReceivablePayment> {
    if (!payment.id) payment.id = crypto.randomUUID();
    if (!payment.created_at) payment.created_at = new Date().toISOString();

    const current = await this.getAccountsReceivablePayments();
    const exists = current.some(p => p.id === payment.id);
    const updated = exists ? current : [payment, ...current];
    localStorage.setItem('copias_bellavista_accounts_receivable_payments', JSON.stringify(updated));

    if (supabase) {
      try {
        const paymentPayload: any = {
          id: payment.id,
          account_receivable_id: payment.account_receivable_id || payment.cxc_id,
          cxc_id: payment.cxc_id || payment.account_receivable_id,
          amount: Number(payment.amount) || 0,
          amount_bs: payment.amount_bs ? Number(payment.amount_bs) : null,
          payment_method: payment.payment_method || 'EFECTIVO',
          bank_account_id: payment.bank_account_id || null,
          payment_date: payment.payment_date || new Date().toISOString(),
          reference: payment.reference || null,
          notes: payment.notes || null,
          created_by: payment.created_by || 'Administrador',
          created_at: payment.created_at || new Date().toISOString()
        };
        await supabase.from('accounts_receivable_payments').upsert(paymentPayload, { onConflict: 'id' });
      } catch (e) {
        console.error("Supabase initial payment exception:", e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_payments_updated', { detail: updated }));
    return payment;
  },

  async payAccountReceivable(payment: AccountReceivablePayment): Promise<AccountReceivablePayment> {
    if (!payment.id) payment.id = crypto.randomUUID();
    if (!payment.created_at) payment.created_at = new Date().toISOString();

    const current = await this.getAccountsReceivablePayments();
    const updated = [payment, ...current.filter(p => p.id !== payment.id)];
    localStorage.setItem('copias_bellavista_accounts_receivable_payments', JSON.stringify(updated));

    // Get bank accounts to manage balances
    const bankAccounts = await this.getBankAccounts();

    // 1. ABONAR a la cuenta bancaria real seleccionada por el cliente/usuario
    const isTargetCxc = payment.bank_account_id === 'cxc-virtual' || payment.bank_account_id === 'cxc';
    if (payment.bank_account_id && !isTargetCxc) {
      const destBank = bankAccounts.find(a => a.id === payment.bank_account_id && a.id !== 'cxc-virtual' && !a.name?.toLowerCase().includes('cuentas por cobrar'));
      if (destBank) {
        const isVES = destBank.currency === 'VES';
        const rate = (payment as any).bcv_rate || (Number(payment.amount_bs) && Number(payment.amount) ? (Number(payment.amount_bs) / Number(payment.amount)) : getCachedCurrencyRates().VES);
        const amountToCredit = isVES ? (Number(payment.amount_bs) || (Number(payment.amount) * rate)) : Number(payment.amount);
        
        destBank.balance = Number(destBank.balance || 0) + amountToCredit;
        destBank.updated_at = new Date().toISOString();
        await this.saveBankAccount(destBank);

        // Record movement in bank_transfers for audit and history in Cuentas Bancarias
        const bankMovement: BankTransfer = {
          id: crypto.randomUUID(),
          from_account_id: 'cxc-virtual',
          from_account_name: 'Cuentas por Cobrar (Crédito Cliente)',
          to_account_id: destBank.id,
          to_account_name: destBank.name || destBank.bank_name,
          amount: amountToCredit,
          currency: destBank.currency,
          exchange_rate: isVES ? rate : undefined,
          converted_amount: amountToCredit,
          reference: payment.reference || 'COBRO-CXC',
          notes: payment.notes || `Cobro de cuenta por cobrar (${payment.payment_method}) - Abonado en ${destBank.name}`,
          created_by: payment.created_by || 'Administrador',
          created_at: payment.payment_date || new Date().toISOString()
        };

        const currentTransfers = await this.getBankTransfers();
        const updatedTransfers = [bankMovement, ...currentTransfers];
        localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify(updatedTransfers));
        if (supabase) {
          try {
            await supabase.from('bank_transfers').insert(bankMovement);
          } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated', { detail: updatedTransfers }));
      }
    }

    const cxcs = await this.getAccountsReceivable();
    const targetCxcId = payment.account_receivable_id || payment.cxc_id;
    const cxc = cxcs.find(c => c.id === targetCxcId);
    if (cxc) {
      // Strictly derive paid_amount from the payments ledger
      const thisCxCPayments = updated.filter(p => p.account_receivable_id === cxc.id || p.cxc_id === cxc.id);
      const totalPaid = thisCxCPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      cxc.paid_amount = Number(totalPaid.toFixed(2));
      cxc.remaining_amount = Math.max(0, Number((Number(cxc.total_amount) - totalPaid).toFixed(2)));
      if (cxc.remaining_amount <= 0.001) cxc.status = 'cobrado';
      else cxc.status = 'parcial';

      // Synchronize installments status if exists
      if (cxc.installments && cxc.installments.length > 0) {
        let runningPaid = totalPaid;
        cxc.installments = cxc.installments.map((inst, idx) => {
          const instNum = inst.number || idx + 1;
          const instAmount = Number(inst.amount || 0);
          const isDirectlyPaid = payment.installment_number === instNum;

          if (isDirectlyPaid || runningPaid >= instAmount - 0.001) {
            runningPaid = Math.max(0, runningPaid - instAmount);
            return {
              ...inst,
              status: 'pagado' as const,
              paid_amount: instAmount,
              paid_at: inst.paid_at || payment.payment_date || new Date().toISOString(),
              payment_method: inst.payment_method || payment.payment_method
            };
          } else if (runningPaid > 0.001) {
            const partialForThis = Number(runningPaid.toFixed(2));
            runningPaid = 0;
            return {
              ...inst,
              status: 'pendiente' as const,
              paid_amount: partialForThis
            };
          } else {
            return {
              ...inst,
              status: 'pendiente' as const,
              paid_amount: 0
            };
          }
        });
      }

      await this.saveAccountReceivable(cxc);

      // Actualizar la deuda acumulada del cliente (credit_usd)
      try {
        const clients = await this.getClients();
        const client = clients.find(cl => 
          (cxc.client_id && cl.id === cxc.client_id) ||
          ((cl.name || '').trim().toLowerCase() === (cxc.client_name || cxc.entity_name || cxc.customer_name || '').trim().toLowerCase())
        );
        if (client) {
          const allCxCList = await this.getAccountsReceivable();
          const clientActiveCxC = allCxCList.filter(c => 
            ((c.client_id && c.client_id === client.id) ||
            ((c.client_name || c.entity_name || c.customer_name || '').trim().toLowerCase() === (client.name || '').trim().toLowerCase())) &&
            c.status !== 'cobrado' && Number(c.remaining_amount) > 0
          );
          const totalClientDebt = clientActiveCxC.reduce((sum, c) => sum + Number(c.remaining_amount || 0), 0);
          await this.updateClient(client.id, { credit_usd: Number(totalClientDebt.toFixed(2)) });
          window.dispatchEvent(new CustomEvent('bellavista_clients_updated'));
        }
      } catch (e) {
        console.warn("Could not update client credit_usd on CxC payment:", e);
      }
    }

    if (supabase) {
      try {
        const paymentPayload: any = {
          id: payment.id,
          account_receivable_id: payment.account_receivable_id || payment.cxc_id,
          cxc_id: payment.cxc_id || payment.account_receivable_id,
          amount: Number(payment.amount) || 0,
          amount_bs: payment.amount_bs ? Number(payment.amount_bs) : null,
          payment_method: payment.payment_method || 'EFECTIVO',
          bank_account_id: isTargetCxc ? null : (payment.bank_account_id || null),
          payment_date: payment.payment_date || new Date().toISOString(),
          reference: payment.reference || null,
          notes: payment.notes || null,
          created_by: payment.created_by || 'Administrador',
          created_at: payment.created_at || new Date().toISOString()
        };
        const { error } = await supabase.from('accounts_receivable_payments').upsert(paymentPayload, { onConflict: 'id' });
        if (error) {
          console.error("Error upserting accounts_receivable_payments to Supabase:", error);
        }
      } catch (e) {
        console.error("Supabase payment exception:", e);
      }
    }

    window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_payments_updated', { detail: updated }));
    return payment;
  },

  async payBatchAccountsReceivable(entityName: string, totalPaymentAmount: number, basePaymentData: Omit<AccountReceivablePayment, 'id' | 'amount' | 'account_receivable_id'>): Promise<AccountReceivablePayment[]> {
    const allCxC = await this.getAccountsReceivable();
    const entityCxCs = allCxC
      .filter(c => ((c.entity_name || c.client_name || c.customer_name || '').toLowerCase() === entityName.toLowerCase()) && (Number(c.remaining_amount) > 0 || c.status === 'pendiente' || c.status === 'parcial'))
      .sort((a, b) => new Date(a.issue_date || a.created_at || 0).getTime() - new Date(b.issue_date || b.created_at || 0).getTime());

    let remainingToCollect = totalPaymentAmount;
    const generatedPayments: AccountReceivablePayment[] = [];

    for (const cxc of entityCxCs) {
      if (remainingToCollect <= 0.001) break;
      const amountForThis = Math.min(remainingToCollect, Number(cxc.remaining_amount));
      if (amountForThis > 0) {
        const payment: AccountReceivablePayment = {
          id: crypto.randomUUID(),
          account_receivable_id: cxc.id,
          cxc_id: cxc.id,
          amount: amountForThis,
          amount_bs: basePaymentData.amount_bs ? (basePaymentData.amount_bs * (amountForThis / totalPaymentAmount)) : undefined,
          payment_method: basePaymentData.payment_method,
          bank_account_id: basePaymentData.bank_account_id,
          payment_date: basePaymentData.payment_date || new Date().toISOString(),
          reference: basePaymentData.reference,
          notes: basePaymentData.notes || `Cobro agrupado a ${entityName}`,
          created_by: basePaymentData.created_by,
          created_at: new Date().toISOString()
        };
        await this.payAccountReceivable(payment);
        generatedPayments.push(payment);
        remainingToCollect -= amountForThis;
      }
    }
    return generatedPayments;
  },

  /**
   * 🧹 Limpieza exclusiva de datos operacionales y transaccionales
   * Purga: Ventas (invoices), Pedidos (orders), Notas de entrega (drafts/invoices),
   * Movimientos bancarios (bank_transfers) y resetea saldos de cuentas bancarias a 0,
   * Cuentas por cobrar (CxC) y Cuentas por pagar (CxP), Operaciones de caja (cash_ops).
   *
   * CONSERVA ÍNTEGROS: Productos, Inventarios, Clientes, Proveedores, Usuarios,
   * Cuentas Bancarias registradas (con balance 0), Impuestos y Configuraciones.
   */
  async cleanOperationalTransactions(): Promise<{ success: boolean; details: Record<string, number | string> }> {
    const details: Record<string, number | string> = {};

    // 1. Limpiar Ventas y Facturas / Notas de Entrega
    try {
      if (supabase) {
        await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('draft_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      localStorage.setItem('copias_bellavista_local_invoices', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_draft_invoices', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_deleted_drafts', JSON.stringify([]));
      details['invoices'] = 'Eliminadas (Facturas y Notas de Entrega)';
    } catch (e: any) {
      console.warn("Error cleaning invoices:", e);
      details['invoices_err'] = e.message || 'Error local';
    }

    // 2. Limpiar Pedidos (Orders)
    try {
      if (supabase) {
        try {
          await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (err) {}
        await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      localStorage.setItem('copias_bellavista_local_orders', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_orders', JSON.stringify([]));
      details['orders'] = 'Eliminados (Pedidos Web y Tienda)';
    } catch (e: any) {
      console.warn("Error cleaning orders:", e);
      details['orders_err'] = e.message || 'Error local';
    }

    // 3. Limpiar Movimientos de Cuentas Bancarias y Resetear Saldos a 0
    try {
      if (supabase) {
        await supabase.from('bank_transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      localStorage.setItem('copias_bellavista_bank_transfers', JSON.stringify([]));

      // Resetear saldos de las cuentas existentes a 0
      const currentAccounts = await this.getBankAccounts();
      const resetAccounts = currentAccounts.map(acc => ({
        ...acc,
        balance: 0,
        updated_at: new Date().toISOString()
      }));
      localStorage.setItem('copias_bellavista_bank_accounts', JSON.stringify(resetAccounts));

      if (supabase) {
        for (const acc of resetAccounts) {
          try {
            await supabase.from('bank_accounts').upsert({
              id: acc.id,
              balance: 0,
              updated_at: new Date().toISOString()
            });
          } catch (err) {}
        }
      }
      details['bank_accounts'] = `Saldos reseteados a 0.00 (${resetAccounts.length} cuentas conservadas)`;
      details['bank_transfers'] = 'Movimientos bancarios purgados';
    } catch (e: any) {
      console.warn("Error cleaning bank data:", e);
      details['bank_err'] = e.message || 'Error local';
    }

    // 4. Limpiar Cuentas por Cobrar (CxC)
    try {
      if (supabase) {
        try {
          await supabase.from('accounts_receivable_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (err) {}
        await supabase.from('accounts_receivable').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_accounts_receivable_payments', JSON.stringify([]));
      details['accounts_receivable'] = 'Cuentas por cobrar y abonos purgados';
    } catch (e: any) {
      console.warn("Error cleaning accounts receivable:", e);
      details['cxc_err'] = e.message || 'Error local';
    }

    // 5. Limpiar Cuentas por Pagar (CxP)
    try {
      if (supabase) {
        try {
          await supabase.from('accounts_payable_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (err) {}
        await supabase.from('accounts_payable').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      localStorage.setItem('copias_bellavista_accounts_payable', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify([]));
      details['accounts_payable'] = 'Cuentas por pagar y pagos purgados';
    } catch (e: any) {
      console.warn("Error cleaning accounts payable:", e);
      details['cxp_err'] = e.message || 'Error local';
    }

    // 6. Limpiar Operaciones de Caja Chica / Arqueos históricos
    try {
      if (supabase) {
        try {
          await supabase.from('cash_ops').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('cash_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (err) {}
      }
      localStorage.setItem('copias_bellavista_cash_ops', JSON.stringify([]));
      localStorage.setItem('copias_bellavista_cash_sessions', JSON.stringify([]));
      localStorage.removeItem('copias_bellavista_active_cash_session');
      details['cash_ops'] = 'Operaciones de caja y sesiones purgadas';
    } catch (e: any) {
      console.warn("Error cleaning cash ops:", e);
    }

    // 7. Notificar a toda la interfaz y componentes montados
    window.dispatchEvent(new CustomEvent('bellavista_invoices_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_orders_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_caja_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_balance_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_updated'));

    return {
      success: true,
      details
    };
  },

  /**
   * 💾 Genera y extrae un respaldo integral de todos los registros y operaciones del sistema
   */
  async generateFullSystemBackup(): Promise<{
    filename: string;
    backupData: any;
    summary: Record<string, number>;
    jsonStr: string;
  }> {
    const safeGet = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        const res = await fn();
        return res ?? fallback;
      } catch (err) {
        console.warn("Backup error retrieving entity:", err);
        return fallback;
      }
    };

    // 1. Obtener datos maestros y transaccionales con tolerancia total a fallos
    const products = await safeGet(() => this.getProducts(), []);
    const categories = await safeGet(() => this.getCategories(), []);
    const brands = await safeGet(() => this.getBrands(), []);
    const clients = await safeGet(() => this.getClients(), []);
    const providers = await safeGet(() => this.getProviders(), []);
    const invoices = await safeGet(() => this.getInvoices(), []);
    const draftInvoices = await safeGet(() => this.getDraftInvoices(), []);
    const orders = await safeGet(() => this.getOrders(), []);
    const quotes = await safeGet(() => this.getQuotes(), []);
    const purchases = await safeGet(() => this.getPurchases(), []);
    const bankAccounts = await safeGet(() => this.getBankAccounts(), []);
    const bankTransfers = await safeGet(() => this.getBankTransfers(), []);
    const accountsReceivable = await safeGet(() => this.getAccountsReceivable(), []);
    const accountsReceivablePayments = await safeGet(() => this.getAccountsReceivablePayments(), []);
    const accountsPayable = await safeGet(() => this.getAccountsPayable(), []);
    const accountsPayablePayments = await safeGet(() => this.getAccountsPayablePayments(), []);
    const gastosFijos = await safeGet(() => this.getGastosFijos(), []);
    const cashSessions = await safeGet(() => this.getCashSessions(), []);
    const cashOps = await safeGet(() => this.getCashOps(), []);
    const businessProfile = await safeGet(() => this.getBusinessProfile(), null);
    const branches = await safeGet(() => this.getBusinessBranches(), []);
    const terminals = await safeGet(() => this.getBusinessTerminals(), []);
    const paymentMethods = await safeGet(() => this.getPaymentMethods(), []);
    const taxes = await safeGet(() => this.getTaxes(), []);
    const landingConfig = await safeGet(() => this.getLandingConfig(), null);
    const bannerSlides = await safeGet(() => this.getBannerSlides(), []);
    const storeUsers = await safeGet(() => this.getStoreUsers(), []);

    // 2. Extraer snapshots directos de almacenamiento local
    const localSnapshots: Record<string, any> = {};
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('copias_bellavista_')) {
            try {
              const raw = localStorage.getItem(key);
              localSnapshots[key] = raw ? JSON.parse(raw) : null;
            } catch {
              localSnapshots[key] = localStorage.getItem(key);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not capture local snapshots:", e);
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `Respaldo_Sistema_CopiasBellaVista_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;

    const summary: Record<string, number> = {
      productos: Array.isArray(products) ? products.length : 0,
      categorias: Array.isArray(categories) ? categories.length : 0,
      marcas: Array.isArray(brands) ? brands.length : 0,
      clientes: Array.isArray(clients) ? clients.length : 0,
      proveedores: Array.isArray(providers) ? providers.length : 0,
      ventas_facturas: Array.isArray(invoices) ? invoices.length : 0,
      notas_entrega: Array.isArray(draftInvoices) ? draftInvoices.length : 0,
      pedidos: Array.isArray(orders) ? orders.length : 0,
      cotizaciones: Array.isArray(quotes) ? quotes.length : 0,
      compras: Array.isArray(purchases) ? purchases.length : 0,
      cuentas_bancarias: Array.isArray(bankAccounts) ? bankAccounts.length : 0,
      movimientos_bancarios: Array.isArray(bankTransfers) ? bankTransfers.length : 0,
      cuentas_por_cobrar: Array.isArray(accountsReceivable) ? accountsReceivable.length : 0,
      abonos_cxc: Array.isArray(accountsReceivablePayments) ? accountsReceivablePayments.length : 0,
      cuentas_por_pagar: Array.isArray(accountsPayable) ? accountsPayable.length : 0,
      pagos_cxp: Array.isArray(accountsPayablePayments) ? accountsPayablePayments.length : 0,
      gastos_fijos: Array.isArray(gastosFijos) ? gastosFijos.length : 0,
      sesiones_caja: Array.isArray(cashSessions) ? cashSessions.length : 0,
      operaciones_caja: Array.isArray(cashOps) ? cashOps.length : 0,
      usuarios_sistema: Array.isArray(storeUsers) ? storeUsers.length : 0,
      sedes: Array.isArray(branches) ? branches.length : 0,
      cajas_terminales: Array.isArray(terminals) ? terminals.length : 0,
      metodos_pago: Array.isArray(paymentMethods) ? paymentMethods.length : 0,
      impuestos: Array.isArray(taxes) ? taxes.length : 0
    };

    const backupData = {
      meta: {
        sistema: "Copias Bella Vista - Sistema de Gestión Comercial y POS",
        version: "3.0.0",
        export_date: now.toISOString(),
        timestamp: now.getTime(),
        summary
      },
      catalog: {
        products,
        categories,
        brands
      },
      commercial_operations: {
        invoices,
        draft_invoices: draftInvoices,
        orders,
        quotes,
        purchases
      },
      financial_operations: {
        bank_accounts: bankAccounts,
        bank_transfers: bankTransfers,
        accounts_receivable: accountsReceivable,
        accounts_receivable_payments: accountsReceivablePayments,
        accounts_payable: accountsPayable,
        accounts_payable_payments: accountsPayablePayments,
        gastos_fijos: gastosFijos,
        cash_sessions: cashSessions,
        cash_ops: cashOps
      },
      contacts: {
        clients,
        providers,
        store_users: Array.isArray(storeUsers) ? storeUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          created_at: u.created_at
        })) : []
      },
      system_configuration: {
        business_profile: businessProfile,
        branches,
        terminals,
        payment_methods: paymentMethods,
        taxes,
        landing_config: landingConfig,
        banner_slides: bannerSlides
      },
      raw_storage_snapshots: localSnapshots
    };

    const jsonStr = JSON.stringify(backupData, null, 2);

    return {
      filename,
      backupData,
      summary,
      jsonStr
    };
  },

  /**
   * 📥 Descarga automática del archivo de respaldo en el navegador
   */
  async downloadSystemBackup(): Promise<{ filename: string; summary: Record<string, number>; jsonStr: string; success: boolean }> {
    const { filename, backupData, summary, jsonStr } = await this.generateFullSystemBackup();
    
    try {
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Dispatch click event for broad browser & iframe compatibility
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch {}
      }, 2000);

      return { filename, summary, jsonStr, success: true };
    } catch (e: any) {
      console.warn("Direct blob download error, attempting data URL fallback:", e);
      try {
        const encodedData = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
        const link = document.createElement('a');
        link.href = encodedData;
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { document.body.removeChild(link); } catch {}
        }, 2000);
        return { filename, summary, jsonStr, success: true };
      } catch (fallbackErr: any) {
        console.error("Backup download fallback failed:", fallbackErr);
        return { filename, summary, jsonStr, success: false };
      }
    }
  }
};
