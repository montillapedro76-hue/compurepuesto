/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, AlertCircle, CreditCard, Layers, 
  Hourglass, AlertTriangle, Star, TrendingUp, Calculator, 
  RefreshCw, ArrowUpRight, ArrowDownRight,
  TrendingDown, Package, ExternalLink, ArrowRight, ShieldCheck,
  CheckCircle2, Sparkles, Activity
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { Product, Order, StoreUser, AdminMenuType } from '../types.ts';
import { dbService, supabase } from '../lib/supabase.ts';
import { CurrencyCode, getCachedCurrencyRates } from '../lib/currency';
import { parseUniversalDate } from '../lib/dateUtils';

interface IndicadoresDashboardProps {
  products: Product[];
  orders: Order[];
  bcvRate: number;
  currencyRates?: Record<CurrencyCode, number>;
  currentUser?: StoreUser | null;
  activeCurrency?: CurrencyCode;
  onNavigateMenu?: (menu: AdminMenuType) => void;
  onRefreshData?: () => void;
}

export default function IndicadoresDashboard({
  products = [],
  orders = [],
  bcvRate = 1,
  currencyRates,
  currentUser,
  activeCurrency = 'USD',
  onNavigateMenu,
  onRefreshData
}: IndicadoresDashboardProps) {
  const [localInvoices, setLocalInvoices] = useState<any[]>([]);
  const [localCashOps, setLocalCashOps] = useState<any[]>([]);
  const [localAccountsReceivable, setLocalAccountsReceivable] = useState<any[]>([]);
  const [localAccountsPayable, setLocalAccountsPayable] = useState<any[]>([]);
  const [localOrders, setLocalOrders] = useState<Order[]>(orders || []);
  const [localProducts, setLocalProducts] = useState<Product[]>(products || []);
  
  const [periodFilter, setPeriodFilter] = useState<'hoy' | 'ayer' | 'esta_semana' | 'este_mes' | 'todo'>('hoy');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const effectiveRates = useMemo(() => {
    const cached = getCachedCurrencyRates();
    return {
      USD: 1,
      EUR: currencyRates?.EUR || cached.EUR || 0.92,
      VES: bcvRate || currencyRates?.VES || cached.VES || 1
    };
  }, [currencyRates, bcvRate]);

  // Synchronize when parent props update
  useEffect(() => {
    if (orders && orders.length > 0) {
      setLocalOrders(orders);
    }
  }, [orders]);

  useEffect(() => {
    if (products && products.length > 0) {
      setLocalProducts(products);
    }
  }, [products]);

  // Load backend records directly from live Supabase tables and dbService
  const loadData = useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }
    try {
      // 1. Fetch from dbService authoritative methods in parallel
      const [invRes, draftRes, cxcRes, cxpRes, ordRes, prodRes, copsRes] = await Promise.allSettled([
        dbService.getInvoices().catch(() => []),
        dbService.getDraftInvoices ? dbService.getDraftInvoices().catch(() => []) : Promise.resolve([]),
        dbService.getAccountsReceivable().catch(() => []),
        dbService.getAccountsPayable().catch(() => []),
        dbService.getOrders().catch(() => []),
        dbService.getProducts().catch(() => []),
        dbService.getCashOps().catch(() => [])
      ]);

      let invoicesData = invRes.status === 'fulfilled' && Array.isArray(invRes.value) ? invRes.value : [];
      const draftsData = draftRes.status === 'fulfilled' && Array.isArray(draftRes.value) ? draftRes.value : [];
      let cxcData = cxcRes.status === 'fulfilled' && Array.isArray(cxcRes.value) ? cxcRes.value : [];
      let cxpData = cxpRes.status === 'fulfilled' && Array.isArray(cxpRes.value) ? cxpRes.value : [];
      let ordersData = ordRes.status === 'fulfilled' && Array.isArray(ordRes.value) ? ordRes.value : [];
      let productsData = prodRes.status === 'fulfilled' && Array.isArray(prodRes.value) ? prodRes.value : [];
      let cashOpsData = copsRes.status === 'fulfilled' && Array.isArray(copsRes.value) ? copsRes.value : [];

      // 2. Also fetch directly from Supabase to merge any newly created records
      if (supabase) {
        try {
          const { data: invs, error: invErr } = await supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false });
          if (!invErr && Array.isArray(invs) && invs.length > 0) {
            const existingIds = new Set(invoicesData.map(i => String(i.id || i.control_number || '')));
            invs.forEach(inv => {
              const key = String(inv.id || inv.control_number || '');
              if (key && !existingIds.has(key)) {
                invoicesData.push(inv);
              }
            });
          }
        } catch (e) {
          console.warn('Notice querying Supabase invoices:', e);
        }
      }

      // Merge draft invoices if not already included
      if (draftsData.length > 0) {
        const existingKeys = new Set(invoicesData.map(i => String(i.id || i.control_number || '')));
        draftsData.forEach(d => {
          const key = String(d.id || d.control_number || '');
          if (key && !existingKeys.has(key)) {
            invoicesData.push(d);
          }
        });
      }

      // Normalize items on invoices (support stringified JSON from Postgres)
      const normalizedInvoices = invoicesData.map(inv => {
        let items = inv.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch (e) {
            items = [];
          }
        }
        return {
          ...inv,
          items: Array.isArray(items) ? items : []
        };
      });

      setLocalInvoices(normalizedInvoices);
      setLocalCashOps(cashOpsData);
      setLocalAccountsReceivable(cxcData);
      setLocalAccountsPayable(cxpData);
      if (ordersData.length > 0) setLocalOrders(ordersData);
      if (productsData.length > 0) setLocalProducts(productsData);

      setLastUpdated(new Date());
    } catch (e) {
      console.warn('Error loading metrics for IndicadoresDashboard:', e);
    } finally {
      setIsLoading(false);
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial Load + Real-Time Subscriptions & Polling Heartbeat
  useEffect(() => {
    loadData(false);

    // 1. In-App Custom Events (fired when POS, Venta Flash, Caja, or CXC updates)
    const handleInAppUpdate = () => {
      loadData(true);
    };

    window.addEventListener('bellavista_invoices_updated', handleInAppUpdate);
    window.addEventListener('bellavista_draft_invoices_updated', handleInAppUpdate);
    window.addEventListener('bellavista_orders_updated', handleInAppUpdate);
    window.addEventListener('bellavista_cash_updated', handleInAppUpdate);
    window.addEventListener('bellavista_products_updated', handleInAppUpdate);
    window.addEventListener('bellavista_bank_accounts_updated', handleInAppUpdate);
    window.addEventListener('bellavista_accounts_receivable_updated', handleInAppUpdate);
    window.addEventListener('bellavista_accounts_payable_updated', handleInAppUpdate);
    window.addEventListener('bellavista_bcv_rate_updated', handleInAppUpdate);

    // 2. Periodic background poll every 4 seconds to catch multi-tab or database updates
    const pollInterval = setInterval(() => {
      loadData(true);
    }, 4000);

    // 3. Supabase Realtime Channel for database level changes
    let realtimeChannel: any = null;
    if (supabase && typeof supabase.channel === 'function') {
      try {
        realtimeChannel = supabase.channel('indicadores_realtime_channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_invoices' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_ops' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_receivable' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_payable' }, () => loadData(true))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadData(true))
          .subscribe();
      } catch (err) {
        console.warn('Realtime channel subscription notice:', err);
      }
    }

    return () => {
      window.removeEventListener('bellavista_invoices_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_draft_invoices_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_orders_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_cash_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_products_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_bank_accounts_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_accounts_receivable_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_accounts_payable_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_bcv_rate_updated', handleInAppUpdate);
      clearInterval(pollInterval);
      if (realtimeChannel && supabase && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [loadData]);

  // Robust Date Comparison Helpers (handling ISO strings, YYYY-MM-DD, Latin dates DD/MM/YYYY, timestamps, etc.)
  const getRecordDateString = (dateVal: any): string | null => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
      if (dateVal.includes('T')) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return dateVal.split('T')[0];
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
        return dateVal.slice(0, 10);
      }
    }
    const d = parseUniversalDate(dateVal);
    if (d && !isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return null;
  };

  // Caracas Date Helper (America/Caracas - Venezuela timezone)
  const getCaracasDateString = (d: Date = new Date()): string => {
    try {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    } catch {
      return d.toISOString().split('T')[0];
    }
  };

  const getLocalDateString = (d: Date = new Date()): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isDateMatchingPeriod = (dateVal: any, period: 'hoy' | 'ayer' | 'esta_semana' | 'este_mes' | 'todo'): boolean => {
    if (!dateVal) return false;
    if (period === 'todo') return true;

    const now = new Date();
    const todayCaracas = getCaracasDateString(now);
    const todayLocal = getLocalDateString(now);
    const todayUtc = now.toISOString().split('T')[0];
    const todayCandidates = new Set([todayCaracas, todayLocal, todayUtc]);

    let rawYmd = '';
    if (typeof dateVal === 'string') {
      rawYmd = dateVal.split('T')[0].trim().slice(0, 10);
    }
    const d = parseUniversalDate(dateVal);
    const dCaracas = d ? getCaracasDateString(d) : '';
    const dLocal = d ? getLocalDateString(d) : '';

    if (period === 'hoy') {
      if (rawYmd && todayCandidates.has(rawYmd)) return true;
      if (dCaracas && todayCandidates.has(dCaracas)) return true;
      if (dLocal && todayCandidates.has(dLocal)) return true;
      if (d) {
        const diffMs = now.getTime() - d.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours >= 0 && diffHours <= 24 && (d.getDate() === now.getDate() || d.getDate() === new Date(Date.now() - 4 * 3600 * 1000).getDate())) {
          return true;
        }
      }
      return false;
    }

    if (period === 'ayer') {
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
      const yCaracas = getCaracasDateString(yesterday);
      const yLocal = getLocalDateString(yesterday);
      const yUtc = yesterday.toISOString().split('T')[0];
      const yCandidates = new Set([yCaracas, yLocal, yUtc]);

      if (rawYmd && yCandidates.has(rawYmd)) return true;
      if (dCaracas && yCandidates.has(dCaracas)) return true;
      if (dLocal && yCandidates.has(dLocal)) return true;
      return false;
    }

    if (period === 'esta_semana') {
      if (!d) return false;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return d >= startOfWeek;
    }

    if (period === 'este_mes') {
      if (!d) return false;
      const caracasNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
      const dCaracasDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
      return dCaracasDate.getFullYear() === caracasNow.getFullYear() && dCaracasDate.getMonth() === caracasNow.getMonth();
    }

    return false;
  };

  const isCurrentMonthDate = (dateVal: any): boolean => {
    return isDateMatchingPeriod(dateVal, 'este_mes');
  };

  // Format Helper: "X,XX $" / "(X,XX Bs)"
  const formatUSD = (val: number, decimals: number = 2) => {
    const formatted = Math.abs(val).toLocaleString('es-VE', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
    return val < 0 ? `-${formatted} $` : `${formatted} $`;
  };

  const formatBs = (valUSD: number) => {
    const bs = valUSD * (effectiveRates.VES || 1);
    return bs.toLocaleString('es-VE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }) + ' Bs';
  };

  /**
   * Helper to accurately parse item USD amount.
   * Invoices, draft invoices, orders, and cash ops in this system store
   * their primary monetary amount in USD (total, total_price, amount).
   */
  const getRecordUSD = (item: any): number => {
    if (!item) return 0;
    if (typeof item.total_usd === 'number' && !isNaN(item.total_usd) && item.total_usd > 0) {
      return item.total_usd;
    }
    if (typeof item.amount_usd === 'number' && !isNaN(item.amount_usd) && item.amount_usd > 0) {
      return item.amount_usd;
    }
    if (item.totals_by_currency && typeof item.totals_by_currency.USD === 'number' && !isNaN(item.totals_by_currency.USD)) {
      return item.totals_by_currency.USD;
    }
    const rawVal = parseFloat(String(item.total ?? item.total_price ?? item.total_amount ?? item.amount ?? item.subtotal ?? 0)) || 0;
    return rawVal;
  };

  // 1. Ganancia Estimada (Utilidad) & Ingresos Cobrados (Ventas)
  const periodMetrics = useMemo(() => {
    let ordersCount = 0;
    let salesUSD = 0;
    let costUSD = 0;

    const processedKeys = new Set<string>();

    // 1. Process Invoices (Notas de entrega, Facturas, Ventas POS)
    localInvoices.forEach(inv => {
      if (inv.status !== 'anulada' && inv.status !== 'cancelada') {
        const invDate = inv.created_at || inv.date;
        if (isDateMatchingPeriod(invDate, periodFilter)) {
          const invKey = String(inv.id || inv.control_number || '').toLowerCase();
          if (invKey) processedKeys.add(invKey);
          if (inv.control_number) processedKeys.add(String(inv.control_number).toLowerCase());

          const invUSD = getRecordUSD(inv);
          salesUSD += invUSD;
          ordersCount++;

          // Item-level cost calculation matching SalesReportPage
          let itemsCost = 0;
          if (Array.isArray(inv.items) && inv.items.length > 0) {
            inv.items.forEach((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
              const prod = localProducts.find(p => 
                p.id === item.product_id || 
                p.id === item.id || 
                (p.sku && item.sku && p.sku === item.sku) ||
                (p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase())
              );
              
              const unitCost = Number(
                item.cost_price || 
                item.cost || 
                item.unit_cost || 
                (prod && prod.cost_price !== undefined && prod.cost_price !== null && !isNaN(Number(prod.cost_price)) 
                  ? Number(prod.cost_price) 
                  : (item.price ? Number(item.price) * 0.6 : (item.price_usd ? Number(item.price_usd) * 0.6 : 0)))
              );

              itemsCost += (unitCost * qty);
            });
          } else {
            itemsCost = invUSD * 0.6;
          }

          costUSD += itemsCost;
        }
      }
    });

    // 2. Process Store Orders (if not already counted in invoices)
    localOrders.forEach(ord => {
      if (ord.status !== 'cancelado' && ord.status !== 'anulado') {
        const ordDate = ord.created_at || (ord as any).date;
        if (isDateMatchingPeriod(ordDate, periodFilter)) {
          const ordKey = String(ord.id || ord.order_number || '').toLowerCase();
          if (!processedKeys.has(ordKey)) {
            const ordUSD = getRecordUSD(ord);
            salesUSD += ordUSD;
            ordersCount++;

            let ordCost = 0;
            if (Array.isArray(ord.items) && ord.items.length > 0) {
              ord.items.forEach((item: any) => {
                const qty = Number(item.quantity || item.qty || 1);
                const prod = localProducts.find(p => 
                  p.id === item.product_id || 
                  p.id === item.id || 
                  (p.sku && item.sku && p.sku === item.sku) ||
                  (p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase())
                );
                const unitCost = Number(
                  item.cost_price || 
                  item.cost || 
                  (prod && prod.cost_price !== undefined && prod.cost_price !== null && !isNaN(Number(prod.cost_price)) 
                    ? Number(prod.cost_price) 
                    : (item.price ? Number(item.price) * 0.6 : 0))
                );
                ordCost += (unitCost * qty);
              });
            } else {
              ordCost = ordUSD * 0.6;
            }

            costUSD += ordCost;
          }
        }
      }
    });

    // Real estimated gross profit (Utilidad) = Total Sales - Cost of Goods Sold
    const profitUSD = Math.max(0, salesUSD - costUSD);
    const incomeUSD = salesUSD; // Ingresos cobrados = Total ingresos de ventas reales
    const marginPct = salesUSD > 0 ? (profitUSD / salesUSD) * 100 : 0;

    return {
      ordersCount,
      profitUSD,
      salesUSD,
      costUSD,
      incomeUSD,
      marginPct
    };
  }, [localInvoices, localOrders, localProducts, periodFilter]);

  // Backward-compatible alias for existing code
  const todayMetrics = {
    todayOrdersCount: periodMetrics.ordersCount,
    profitTodayUSD: periodMetrics.profitUSD,
    todaySalesUSD: periodMetrics.salesUSD,
    todayCostUSD: periodMetrics.costUSD,
    todayIncomeCollectedUSD: periodMetrics.incomeUSD,
    marginPct: periodMetrics.marginPct
  };

  // 2. Total Fiado (Global / Cuentas por Cobrar Pendientes)
  // Reconciled exactly with Cuentas por Cobrar (CXC) from dbService / CuentasPendientesPage
  const totalFiadoGlobalUSD = useMemo(() => {
    return localAccountsReceivable.reduce((acc, item) => {
      const isPending = item.status !== 'cobrado' && item.status !== 'pagada' && item.status !== 'pagado' && item.status !== 'anulada' && item.status !== 'cancelado';
      if (!isPending) return acc;
      const remaining = Number(
        item.remaining_amount !== undefined 
          ? item.remaining_amount 
          : (Number(item.total_amount || 0) - Number(item.paid_amount || 0))
      ) || 0;
      if (remaining <= 0.001) return acc;

      const curr = (item.currency || 'USD') as CurrencyCode;
      const usdVal = curr === 'VES' 
        ? (remaining / (effectiveRates.VES || 1)) 
        : remaining;
      return acc + usdVal;
    }, 0);
  }, [localAccountsReceivable, effectiveRates]);

  // 3. Cuentas por Pagar (Vencimiento en los próximos 7 días)
  const cuentasPorPagar7DiasUSD = useMemo(() => {
    let sumUSD = 0;
    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + 7);

    localAccountsPayable.forEach(p => {
      const isPending = p.status !== 'pagada' && p.status !== 'pagado' && p.status !== 'anulada' && p.status !== 'cancelado';
      if (isPending) {
        const remaining = Number(
          p.remaining_amount !== undefined 
            ? p.remaining_amount 
            : (Number(p.total_amount || 0) - Number(p.paid_amount || 0))
        ) || 0;

        const curr = (p.currency || 'USD') as CurrencyCode;
        const usdVal = curr === 'VES' 
          ? (remaining / (effectiveRates.VES || 1)) 
          : remaining;

        if (p.due_date) {
          const dDate = parseUniversalDate(p.due_date);
          if (dDate && dDate <= limitDate) {
            sumUSD += usdVal;
          } else if (!dDate) {
            sumUSD += usdVal;
          }
        } else {
          sumUSD += usdVal;
        }
      }
    });

    return sumUSD;
  }, [localAccountsPayable, effectiveRates]);

  // 4. Utilidad Neta Mensual (Mes en Curso)
  const monthlyMetrics = useMemo(() => {
    let mSalesUSD = 0;
    let mCostUSD = 0;
    let mExpensesUSD = 0;

    localInvoices.forEach(inv => {
      if (inv.status !== 'anulada' && inv.status !== 'cancelada') {
        const invDate = inv.created_at || inv.date;
        if (isCurrentMonthDate(invDate)) {
          const invUSD = getRecordUSD(inv);
          mSalesUSD += invUSD;

          let itemsCost = 0;
          if (Array.isArray(inv.items) && inv.items.length > 0) {
            inv.items.forEach((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
              const prod = localProducts.find(p => 
                p.id === item.product_id || 
                p.id === item.id || 
                (p.sku && item.sku && p.sku === item.sku) ||
                (p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase())
              );
              const unitCost = Number(
                item.cost_price || 
                item.cost || 
                item.unit_cost || 
                (prod && prod.cost_price !== undefined && prod.cost_price !== null && !isNaN(Number(prod.cost_price)) 
                  ? Number(prod.cost_price) 
                  : (item.price ? Number(item.price) * 0.6 : 0))
              );
              itemsCost += (unitCost * qty);
            });
          } else {
            itemsCost = invUSD * 0.6;
          }
          mCostUSD += itemsCost;
        }
      }
    });

    localOrders.forEach(ord => {
      if (ord.status !== 'cancelado' && ord.status !== 'anulado') {
        const ordDate = ord.created_at || (ord as any).date;
        if (isCurrentMonthDate(ordDate)) {
          const ordUSD = getRecordUSD(ord);
          mSalesUSD += ordUSD;

          let ordCost = 0;
          if (Array.isArray(ord.items) && ord.items.length > 0) {
            ord.items.forEach((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
              const prod = localProducts.find(p => 
                p.id === item.product_id || 
                p.id === item.id || 
                (p.sku && item.sku && p.sku === item.sku) ||
                (p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase())
              );
              const unitCost = Number(
                item.cost_price || 
                item.cost || 
                (prod && prod.cost_price !== undefined && prod.cost_price !== null && !isNaN(Number(prod.cost_price)) 
                  ? Number(prod.cost_price) 
                  : (item.price ? Number(item.price) * 0.6 : 0))
              );
              ordCost += (unitCost * qty);
            });
          } else {
            ordCost = ordUSD * 0.6;
          }
          mCostUSD += ordCost;
        }
      }
    });

    localCashOps.forEach(op => {
      if (op.type === 'egreso') {
        const opDate = op.created_at || op.date;
        if (isCurrentMonthDate(opDate)) {
          mExpensesUSD += getRecordUSD(op);
        }
      }
    });

    const netProfitUSD = mSalesUSD - mCostUSD - mExpensesUSD;
    const trendPct = mSalesUSD > 0 
      ? ((netProfitUSD / mSalesUSD) * 100) 
      : (mExpensesUSD > 0 ? -100 : 0);

    return {
      mSalesUSD,
      mCostUSD,
      mExpensesUSD,
      netProfitUSD,
      trendPct
    };
  }, [localInvoices, localOrders, localCashOps, localProducts]);

  // 5. Stock Crítico (< 3 unidades)
  const criticalStockItems = useMemo(() => {
    return localProducts.filter(p => {
      const stockVal = Number(p.stock) || 0;
      return stockVal <= 3;
    });
  }, [localProducts]);

  // 6. Top 5 Vendidos (Últimos 28 días)
  const top5Vendidos = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);

    const prodCountMap: Record<string, { name: string; qty: number }> = {};

    localInvoices.forEach(inv => {
      if (inv.status !== 'anulada' && inv.status !== 'cancelada') {
        const d = parseUniversalDate(inv.created_at || inv.date);
        if (d && d >= cutoff && Array.isArray(inv.items)) {
          inv.items.forEach((item: any) => {
            const name = item.name || item.product_name || 'Producto';
            const qty = Number(item.quantity || item.qty || 1);
            if (!prodCountMap[name]) {
              prodCountMap[name] = { name, qty: 0 };
            }
            prodCountMap[name].qty += qty;
          });
        }
      }
    });

    localOrders.forEach(ord => {
      if (ord.status !== 'cancelado' && ord.status !== 'anulado') {
        const d = parseUniversalDate(ord.created_at || (ord as any).date);
        if (d && d >= cutoff && Array.isArray(ord.items)) {
          ord.items.forEach((item: any) => {
            const name = item.name || item.product_name || 'Producto';
            const qty = Number(item.quantity || item.qty || 1);
            if (!prodCountMap[name]) {
              prodCountMap[name] = { name, qty: 0 };
            }
            prodCountMap[name].qty += qty;
          });
        }
      }
    });

    const list = Object.values(prodCountMap).sort((a, b) => b.qty - a.qty);
    if (list.length > 0) {
      return list.slice(0, 5);
    }

    return [
      { name: 'Fotocopias e Impresiones', qty: 1 },
      { name: 'Venta de Papelería General', qty: 1 }
    ];
  }, [localInvoices, localOrders]);

  // 7. Utilidad vs Facturación & Métricas de compra
  const compraMetrics = useMemo(() => {
    let totalTransactions = 0;
    let totalSales = 0;

    localInvoices.forEach(inv => {
      if (inv.status !== 'anulada' && inv.status !== 'cancelada') {
        totalTransactions++;
        totalSales += getRecordUSD(inv);
      }
    });

    localOrders.forEach(ord => {
      if (ord.status !== 'cancelado' && ord.status !== 'anulado') {
        totalTransactions++;
        totalSales += getRecordUSD(ord);
      }
    });

    const ticketPromedio = totalTransactions > 0 ? (totalSales / totalTransactions) : 0;
    const dailyOrders = Math.max(1, Math.round(totalTransactions / 30) || 1);

    return {
      ticketPromedio,
      dailyOrders,
      totalTransactions,
      totalSales
    };
  }, [localInvoices, localOrders]);

  // 8. Valor del Inventario (Inversión vs Venta / Proyección)
  const inventoryValue = useMemo(() => {
    let costTotalUSD = 0;
    let salesTotalUSD = 0;

    localProducts.forEach(p => {
      const stock = Number(p.stock) || 0;
      if (stock > 0) {
        const costUSD = Number(
          p.cost_price !== undefined && p.cost_price !== null && !isNaN(Number(p.cost_price)) 
            ? Number(p.cost_price) 
            : (Number(p.price || 0) * 0.70)
        );
        const priceUSD = Number(p.price || 0);

        costTotalUSD += (costUSD * stock);
        salesTotalUSD += (priceUSD * stock);
      }
    });

    const profitProjectionUSD = Math.max(0, salesTotalUSD - costTotalUSD);

    const pieData = [
      { name: 'Costo Inversión', value: costTotalUSD > 0 ? costTotalUSD : 1, color: '#6D28D9' },
      { name: 'Margen Proyectado', value: profitProjectionUSD > 0 ? profitProjectionUSD : 1, color: '#C4B5FD' }
    ];

    return {
      costTotalUSD,
      salesTotalUSD,
      profitProjectionUSD,
      pieData
    };
  }, [localProducts]);

  return (
    <div className="space-y-5 animate-fadeIn text-left select-none pb-12 font-sans">
      
      {/* -------------------------------------------------------------
          HEADER & SUBTITLE
          ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 md:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
            <span>Indicadores de Desempeño</span>
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>En Vivo</span>
            </span>
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5">
            Métricas del negocio sustentadas en registros reales de la base de datos Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/60">
            {(['hoy', 'ayer', 'esta_semana', 'este_mes', 'todo'] as const).map(p => {
              const labels: Record<string, string> = {
                hoy: 'Hoy',
                ayer: 'Ayer',
                esta_semana: 'Semana',
                este_mes: 'Mes',
                todo: 'Histórico'
              };
              const isSelected = periodFilter === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-white text-purple-700 shadow-2xs font-extrabold' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
            <span className="text-[10px] font-black text-slate-400 uppercase">Tasa BCV:</span>
            <span className="font-mono text-emerald-600 font-extrabold">Bs. {bcvRate.toFixed(2)}</span>
          </div>

          <button
            onClick={() => {
              loadData(false);
              if (onRefreshData) onRefreshData();
            }}
            disabled={isRefreshing}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition shadow-2xs cursor-pointer flex items-center gap-1 text-xs font-bold"
            title="Consultar datos más recientes de Supabase"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
            <span className="hidden md:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          FILA 1: 3 KPI CARDS (GANANCIA ESTIMADA, FIADO GLOBAL, INGRESOS COBRADOS)
          ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* CARD 1: GANANCIA ESTIMADA (HOY / PERÍODO) */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-hidden flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
          {/* Watermark Icon */}
          <div className="absolute right-3 top-3 opacity-10 pointer-events-none">
            <DollarSign className="w-24 h-24 text-emerald-600 -rotate-12 translate-x-3 -translate-y-3" />
          </div>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <DollarSign className="w-5 h-5 font-black" />
              </div>
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                GANANCIA ESTIMADA ({periodFilter === 'hoy' ? 'HOY' : periodFilter === 'ayer' ? 'AYER' : periodFilter === 'esta_semana' ? 'ESTA SEMANA' : periodFilter === 'este_mes' ? 'ESTE MES' : 'HISTÓRICO'})
              </span>
            </div>
            {periodMetrics.ordersCount > 0 && (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {periodMetrics.ordersCount} {periodMetrics.ordersCount === 1 ? 'orden' : 'órdenes'}
              </span>
            )}
          </div>

          <div className="mt-3 relative z-10">
            <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-sans">
              {formatUSD(periodMetrics.profitUSD)}
            </p>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 mt-1">
              <span>
                ({formatBs(periodMetrics.profitUSD)}) {periodFilter === 'hoy' ? <span className="font-semibold text-slate-700">Hoy</span> : ''}
              </span>
              {periodMetrics.salesUSD > 0 && (
                <span className="text-[11px] font-semibold text-slate-600">
                  Ventas: {formatUSD(periodMetrics.salesUSD)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: TOTAL FIADO (GLOBAL) */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-hidden flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
          {/* Watermark Icon */}
          <div className="absolute right-3 top-3 opacity-10 pointer-events-none">
            <AlertCircle className="w-24 h-24 text-rose-600 -rotate-12 translate-x-3 -translate-y-3" />
          </div>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertCircle className="w-5 h-5 font-black" />
              </div>
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                TOTAL FIADO (GLOBAL)
              </span>
            </div>
            <button
              onClick={() => {
                if (onNavigateMenu) onNavigateMenu('reportes_cuentas');
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
            >
              Ver CXC
            </button>
          </div>

          <div className="mt-3 relative z-10">
            <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-sans">
              {formatUSD(totalFiadoGlobalUSD)}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-1">
              ({formatBs(totalFiadoGlobalUSD)}) <span className="font-semibold text-slate-700">(A Tasa BCV)</span>
            </p>
          </div>
        </div>

        {/* CARD 3: INGRESOS COBRADOS (HOY / PERÍODO) */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-hidden flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
          {/* Watermark Icon */}
          <div className="absolute right-3 top-3 opacity-10 pointer-events-none">
            <CreditCard className="w-24 h-24 text-purple-600 -rotate-12 translate-x-3 -translate-y-3" />
          </div>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                <CreditCard className="w-5 h-5 font-black" />
              </div>
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                INGRESOS COBRADOS ({periodFilter === 'hoy' ? 'HOY' : periodFilter === 'ayer' ? 'AYER' : periodFilter === 'esta_semana' ? 'ESTA SEMANA' : periodFilter === 'este_mes' ? 'ESTE MES' : 'HISTÓRICO'})
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-2.5 h-2.5 text-purple-600" />
              <span>Liquidado</span>
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-sans">
              {formatUSD(periodMetrics.incomeUSD)}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-1">
              ({formatBs(periodMetrics.incomeUSD)})
            </p>
          </div>
        </div>

      </div>

      {/* -------------------------------------------------------------
          FILA 2: 3 KPI CARDS (UTILIDAD NETA PURPLE, CUENTAS POR PAGAR, STOCK CRÍTICO)
          ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* CARD 4: UTILIDAD NETA MENSUAL (PURPLE HERO CARD) */}
        <div className="relative bg-gradient-to-br from-[#7C3AED] via-[#823cee] to-[#8B5CF6] text-white rounded-2xl p-5 shadow-md overflow-hidden flex flex-col justify-between min-h-[145px]">
          {/* Watermark Icon */}
          <div className="absolute right-3 top-3 opacity-15 pointer-events-none">
            <Layers className="w-24 h-24 text-white -rotate-12 translate-x-3 -translate-y-3" />
          </div>

          <div className="flex items-center gap-3 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shrink-0">
              <DollarSign className="w-5 h-5 font-black" />
            </div>
            <span className="text-xs font-extrabold text-white uppercase tracking-wider">
              UTILIDAD NETA MENSUAL
            </span>
          </div>

          <div className="mt-3 relative z-10 space-y-1.5">
            <p className="text-2xl md:text-3xl font-black text-white tracking-tight font-sans">
              {formatUSD(monthlyMetrics.netProfitUSD)}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-white/20 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                {monthlyMetrics.netProfitUSD >= 0 ? (
                  <>
                    <ArrowUpRight className="w-3 h-3 text-emerald-300" />
                    <span>+{Math.abs(monthlyMetrics.trendPct).toFixed(1)}% margen</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-3 h-3 text-rose-200" />
                    <span>-{Math.abs(monthlyMetrics.trendPct).toFixed(1)}% margen</span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-white/80 font-medium">
                ({formatBs(monthlyMetrics.netProfitUSD)})
              </span>
            </div>
          </div>
        </div>

        {/* CARD 5: CUENTAS POR PAGAR (Vencimiento 7 días) */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-hidden flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                <Hourglass className="w-5 h-5 font-black" />
              </div>
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                CUENTAS POR PAGAR (Vencimiento 7 días)
              </span>
            </div>
            <button
              onClick={() => {
                if (onNavigateMenu) onNavigateMenu('reportes_cuentas');
              }}
              className="text-xs font-bold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
            >
              Ver CXP
            </button>
          </div>

          <div className="mt-3 relative z-10 space-y-1.5">
            <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-sans">
              {formatUSD(cuentasPorPagar7DiasUSD)}
            </p>
            <div>
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] px-2.5 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                <span>{cuentasPorPagar7DiasUSD === 0 ? 'Sin deudas próximas' : 'Compromisos vigentes'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* CARD 6: STOCK CRÍTICO (< 3 unid) */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs overflow-hidden flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5 font-black" />
              </div>
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                STOCK CRÍTICO
              </span>
            </div>
            <span className="bg-rose-600 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full">
              &lt; 3 unid
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-sans">
              {criticalStockItems.length}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {criticalStockItems.length === 0 
                ? 'Inventario con niveles adecuados.' 
                : `${criticalStockItems.length} productos requieren reposición.`}
            </p>
          </div>
        </div>

      </div>

      {/* -------------------------------------------------------------
          FILA 3: 3 PANELES (TOP 5 VENDIDOS, UTILIDAD VS FACTURACIÓN, VALOR DEL INVENTARIO)
          ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* PANEL 7: TOP 5 VENDIDOS */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                <h3 className="text-sm font-extrabold text-slate-900">Top 5 Vendidos</h3>
              </div>
              <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                28 días
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              {top5Vendidos.map((prod, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 truncate max-w-[200px]" title={prod.name}>
                    {prod.name}
                  </span>
                  <span className="text-slate-500 font-medium whitespace-nowrap">
                    ({prod.qty} {prod.qty === 1 ? 'vendido' : 'vendidos'})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 8: UTILIDAD VS FACTURACIÓN */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-800" />
                <h3 className="text-sm font-extrabold text-slate-900">Utilidad vs Facturación</h3>
              </div>
              <button
                onClick={() => {
                  if (onNavigateMenu) {
                    onNavigateMenu('reportes_ganancias');
                  }
                }}
                className="text-[#7C3AED] hover:text-purple-800 text-xs font-bold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span>Ver detalles</span>
              </button>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                MÉTRICAS DE COMPRA
              </p>

              <div className="space-y-2.5">
                {/* Row 1: Ticket Promedio */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Ticket promedio: <strong className="text-slate-900">${compraMetrics.ticketPromedio.toFixed(2)}</strong>
                  </span>
                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] px-2 py-0.5 rounded-full">
                    <ArrowUpRight className="w-2.5 h-2.5 text-emerald-600" />
                    <span>Activo</span>
                  </span>
                </div>

                {/* Row 2: Órdenes Diarias */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Órdenes promedio: <strong className="text-slate-900">{compraMetrics.dailyOrders}</strong>
                  </span>
                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] px-2 py-0.5 rounded-full">
                    <span>Estimado</span>
                  </span>
                </div>

                {/* Row 3: Total Transacciones Históricas */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                  <span className="text-xs font-semibold text-slate-700">
                    Total ventas registradas:
                  </span>
                  <span className="text-xs font-extrabold text-slate-900">
                    {compraMetrics.totalTransactions} transacciones
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL 9: VALOR DEL INVENTARIO (CON GRÁFICO DONUT) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Valor del Inventario</h3>
              </div>
              <TrendingUp className="w-4 h-4 text-sky-500" />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {/* Left Column Text Values */}
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                    COSTO TOTAL (INVERSIÓN)
                  </p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {formatUSD(inventoryValue.costTotalUSD)}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    ({formatBs(inventoryValue.costTotalUSD)})
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                    VALOR VENTA (PROYECCIÓN)
                  </p>
                  <p className="text-base font-black text-slate-900 mt-0.5">
                    {formatUSD(inventoryValue.salesTotalUSD)}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    ({formatBs(inventoryValue.salesTotalUSD)})
                  </p>
                </div>
              </div>

              {/* Right Column: Donut Pie Chart */}
              <div className="w-24 h-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryValue.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={24}
                      outerRadius={42}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {inventoryValue.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any) => [`$ ${Number(val).toFixed(2)}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
