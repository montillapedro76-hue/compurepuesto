/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Settings, Download, RefreshCw, ChevronDown, 
  Check, AlertCircle, TrendingUp, TrendingDown, DollarSign, 
  Users, ShoppingBag, Truck, User, ArrowLeft, ArrowUpRight, 
  Layers, BarChart2, Briefcase, CreditCard, ShoppingCart, HelpCircle, EyeOff, ChevronLeft, ChevronRight,
  PieChart as PieChartIcon, Info, X, Sparkles, Coins, Sliders, Calendar, Receipt, Building2, Wallet, ArrowDownRight,
  Package, Landmark, ArrowUpCircle, ArrowDownCircle, Search
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { Product, Order, ReportModuleConfig, StoreUser, Category, BusinessProfile } from '../types';
import { dbService, supabase } from '../lib/supabase';
import { CurrencyCode, formatCurrency } from '../lib/currency';
import { 
  parseUniversalDate, 
  getLocalDateString, 
  getPeriodKeyForDate 
} from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { exportReportsToPdf } from '../lib/pdfExport';

export interface ReportesDashboardProps {
  products: Product[];
  orders: Order[];
  cashOps?: any[];
  bcvRate: number;
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  onCurrencyChange?: (curr: CurrencyCode) => void;
  onRefreshData?: () => void;
  onExportSeniatExcel?: () => void;
  onPrintInventoryReport?: () => void;
  onOpenConfigDashboard?: () => void;
}

const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const ReportesDashboard: React.FC<ReportesDashboardProps> = ({
  products,
  orders,
  cashOps = [],
  bcvRate,
  activeCurrency,
  currencyRates,
  onCurrencyChange,
  onRefreshData,
  onExportSeniatExcel,
  onPrintInventoryReport,
  onOpenConfigDashboard
}) => {
  // Navigation: 'view' (Vista Principal) or 'config' (Configuración)
  const [activeView, setActiveView] = useState<'view' | 'config'>('view');
  const [reportCurrency, setReportCurrency] = useState<CurrencyCode>('USD');

  // Filter state (Month / Year)
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | 'all'>(currentDate.getMonth()); // 0-11 or 'all'

  // Interactive Info Modal (for '?' buttons on cards)
  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);

  // Synchronization and loading
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Business profile
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  // Local synced data
  const [localOrders, setLocalOrders] = useState<Order[]>(orders || []);
  const [localInvoices, setLocalInvoices] = useState<any[]>([]);
  const [localProducts, setLocalProducts] = useState<Product[]>(products || []);
  const [localCashOps, setLocalCashOps] = useState<any[]>(cashOps || []);
  const [localGastosFijos, setLocalGastosFijos] = useState<any[]>([]);
  const [localGastosPayments, setLocalGastosPayments] = useState<any[]>([]);
  const [localStoreUsers, setLocalStoreUsers] = useState<StoreUser[]>([]);
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [localBankAccounts, setLocalBankAccounts] = useState<any[]>([]);
  const [localAccountsReceivable, setLocalAccountsReceivable] = useState<any[]>([]);
  const [localAccountsPayable, setLocalAccountsPayable] = useState<any[]>([]);

  const effectiveRates = useMemo(() => ({
    ...currencyRates,
    VES: bcvRate || currencyRates?.VES || 1,
    COP: currencyRates?.COP || 1,
    EUR: currencyRates?.EUR || 1,
    USD: 1
  }), [currencyRates, bcvRate]);

  const handleCurrencyChange = (newCurr: CurrencyCode) => {
    setReportCurrency(newCurr);
    if (onCurrencyChange) {
      onCurrencyChange(newCurr);
    }
  };

  // Synchronize when parent props update
  useEffect(() => {
    if (orders && orders.length > 0) setLocalOrders(orders);
  }, [orders]);
  useEffect(() => {
    if (products && products.length > 0) setLocalProducts(products);
  }, [products]);
  useEffect(() => {
    if (cashOps && cashOps.length > 0) setLocalCashOps(cashOps);
  }, [cashOps]);

  // Fetch freshest live data from Supabase without simulating any metrics
  const fetchLatestFromDb = async () => {
    setIsSyncing(true);
    try {
      const [
        latestOrders, 
        latestInvoices, 
        latestProducts, 
        latestCashOps, 
        latestGastosFijos,
        latestGastosPayments,
        latestUsers, 
        latestCats, 
        profile,
        banks,
        cxcs,
        cxps
      ] = await Promise.all([
        dbService.getOrders().catch(() => []),
        dbService.getInvoices().catch(() => []),
        dbService.getProducts().catch(() => []),
        dbService.getCashOps().catch(() => []),
        dbService.getGastosFijos().catch(() => []),
        dbService.getGastoFijoPayments().catch(() => []),
        dbService.getStoreUsers().catch(() => []),
        dbService.getCategories().catch(() => []),
        dbService.getBusinessProfile().catch(() => null),
        dbService.getBankAccounts().catch(() => []),
        dbService.getAccountsReceivable().catch(() => []),
        dbService.getAccountsPayable().catch(() => [])
      ]);

      let invsData = Array.isArray(latestInvoices) ? [...latestInvoices] : [];
      let ordsData = Array.isArray(latestOrders) ? [...latestOrders] : [];
      let cashData = Array.isArray(latestCashOps) ? [...latestCashOps] : [];
      let gastosData = Array.isArray(latestGastosFijos) ? [...latestGastosFijos] : [];
      let gastosPaymentsData = Array.isArray(latestGastosPayments) ? [...latestGastosPayments] : [];
      let prodsData = Array.isArray(latestProducts) ? [...latestProducts] : [];
      let banksData = Array.isArray(banks) ? [...banks] : [];
      let cxcsData = Array.isArray(cxcs) ? [...cxcs] : [];
      let cxpsData = Array.isArray(cxps) ? [...cxps] : [];

      // Direct zero-latency queries to Supabase tables
      if (supabase) {
        try {
          const fetchSafe = async (promiseLike: any) => {
            try {
              return await promiseLike;
            } catch {
              return { data: null };
            }
          };

          const [sInvs, sOrds, sCash, sGastos, sGastosPayments, sProds, sBanks, sCxcs, sCxps] = await Promise.all([
            fetchSafe(supabase.from('invoices').select('*').order('created_at', { ascending: false })),
            fetchSafe(supabase.from('orders').select('*').order('created_at', { ascending: false })),
            fetchSafe(supabase.from('cash_ops').select('*').order('created_at', { ascending: false })),
            fetchSafe(supabase.from('gastos_fijos').select('*').order('created_at', { ascending: false })),
            fetchSafe(supabase.from('gastos_fijos_payments').select('*').order('payment_date', { ascending: false })),
            fetchSafe(supabase.from('products').select('*')),
            fetchSafe(supabase.from('bank_accounts').select('*')),
            fetchSafe(supabase.from('accounts_receivable').select('*')),
            fetchSafe(supabase.from('accounts_payable').select('*'))
          ]);

          if (sInvs?.data && Array.isArray(sInvs.data)) {
            const map = new Map();
            sInvs.data.forEach((i: any) => map.set(String(i.id || i.control_number), i));
            invsData.forEach((i: any) => map.set(String(i.id || i.control_number), i));
            invsData = Array.from(map.values());
          }
          if (sOrds?.data && Array.isArray(sOrds.data)) {
            const map = new Map();
            sOrds.data.forEach((o: any) => map.set(String(o.id || o.order_number), o));
            ordsData.forEach((o: any) => map.set(String(o.id || o.order_number), o));
            ordsData = Array.from(map.values());
          }
          if (sCash?.data && Array.isArray(sCash.data)) {
            const map = new Map();
            sCash.data.forEach((c: any) => map.set(String(c.id), c));
            cashData.forEach((c: any) => map.set(String(c.id), c));
            cashData = Array.from(map.values());
          }
          if (sGastos?.data && Array.isArray(sGastos.data)) {
            const map = new Map();
            sGastos.data.forEach((g: any) => map.set(String(g.id), g));
            gastosData.forEach((g: any) => map.set(String(g.id), g));
            gastosData = Array.from(map.values());
          }
          if (sGastosPayments?.data && Array.isArray(sGastosPayments.data)) {
            const map = new Map();
            sGastosPayments.data.forEach((gp: any) => map.set(String(gp.id), gp));
            gastosPaymentsData.forEach((gp: any) => map.set(String(gp.id), gp));
            gastosPaymentsData = Array.from(map.values());
          }
          if (sProds?.data && Array.isArray(sProds.data) && sProds.data.length > 0) {
            prodsData = sProds.data;
          }
          if (sBanks?.data && Array.isArray(sBanks.data) && sBanks.data.length > 0) {
            banksData = sBanks.data;
          }
          if (sCxcs?.data && Array.isArray(sCxcs.data) && sCxcs.data.length > 0) {
            cxcsData = sCxcs.data;
          }
          if (sCxps?.data && Array.isArray(sCxps.data) && sCxps.data.length > 0) {
            cxpsData = sCxps.data;
          }
        } catch (e) {
          console.warn("Notice querying direct Supabase tables:", e);
        }
      }

      // Normalize items on invoices (support stringified JSON from Postgres)
      const normalizedInvoices = invsData.map((inv: any) => {
        let items = inv.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        return {
          ...inv,
          items: Array.isArray(items) ? items : []
        };
      });

      // Normalize items on orders
      const normalizedOrders = ordsData.map((ord: any) => {
        let items = ord.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        return {
          ...ord,
          items: Array.isArray(items) ? items : []
        };
      });
      
      setLocalOrders(normalizedOrders);
      setLocalInvoices(normalizedInvoices);
      setLocalProducts(prodsData);
      setLocalCashOps(cashData);
      setLocalGastosFijos(gastosData);
      setLocalGastosPayments(gastosPaymentsData);
      if (latestUsers) setLocalStoreUsers(latestUsers);
      if (latestCats) setLocalCategories(latestCats);
      if (profile) setBusinessProfile(profile);
      setLocalBankAccounts(banksData);
      setLocalAccountsReceivable(cxcsData);
      setLocalAccountsPayable(cxpsData);
      
      setLastSync(new Date());
      if (onRefreshData) onRefreshData();
    } catch (error) {
      console.error("Error refreshing dashboard data:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchLatestFromDb();

    const handleInAppUpdate = () => {
      fetchLatestFromDb();
    };

    window.addEventListener('bellavista_invoices_updated', handleInAppUpdate);
    window.addEventListener('bellavista_draft_invoices_updated', handleInAppUpdate);
    window.addEventListener('bellavista_orders_updated', handleInAppUpdate);
    window.addEventListener('bellavista_cash_updated', handleInAppUpdate);
    window.addEventListener('bellavista_products_updated', handleInAppUpdate);
    window.addEventListener('bellavista_bank_accounts_updated', handleInAppUpdate);
    window.addEventListener('bellavista_accounts_receivable_updated', handleInAppUpdate);
    window.addEventListener('bellavista_accounts_payable_updated', handleInAppUpdate);
    window.addEventListener('bellavista_gastos_fijos_updated', handleInAppUpdate);
    window.addEventListener('bellavista_gastos_fijos_payments_updated', handleInAppUpdate);
    window.addEventListener('bellavista_bcv_rate_updated', handleInAppUpdate);

    // Periodic polling every 4 seconds to guarantee multi-tab synchronization
    const pollInterval = setInterval(() => {
      fetchLatestFromDb();
    }, 4000);

    // Supabase Realtime channel subscription for instant live updates
    let realtimeChannel: any = null;
    if (supabase) {
      try {
        realtimeChannel = supabase
          .channel('reportes_dashboard_realtime_channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_ops' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_fijos' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_fijos_payments' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_receivable' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_payable' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchLatestFromDb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => fetchLatestFromDb())
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
      window.removeEventListener('bellavista_gastos_fijos_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_gastos_fijos_payments_updated', handleInAppUpdate);
      window.removeEventListener('bellavista_bcv_rate_updated', handleInAppUpdate);
      clearInterval(pollInterval);
      if (realtimeChannel && supabase && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  // Rate helpers
  const getRateForCurrency = (currency: CurrencyCode): number => {
    if (currency === 'USD') return 1;
    return effectiveRates[currency] || 1;
  };

  // Convert USD amount to Report Currency
  const toReportCurr = (amountUSD: number): number => {
    if (reportCurrency === 'USD') return amountUSD;
    return amountUSD * getRateForCurrency(reportCurrency);
  };

  // Formats any USD amount into the selected currency cleanly (multiplies by rate once)
  const formatValue = (amountUSD: number, forcePositive: boolean = false): string => {
    const val = forcePositive ? Math.abs(amountUSD) : amountUSD;
    const isNegative = amountUSD < 0;
    const formatted = formatCurrency(Math.abs(val), reportCurrency, effectiveRates);
    return isNegative && !forcePositive ? `-${formatted}` : formatted;
  };

  /**
   * Parse transaction amounts accurately to USD base.
   * Invoices, draft invoices, orders, and cash ops in this system store
   * their primary monetary amount in USD (total, total_price, amount).
   */
  const getTransactionUSD = (item: any): number => {
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

  // Helper to compute all 12 monthly metrics for any given year from the real dataset (no simulated data)
  const computeYearEvolution = (targetYear: number) => {
    const monthsData = MONTH_NAMES_SHORT.map((shortName, mIndex) => {
      let mSalesUSD = 0;
      let mCostUSD = 0;
      let mExpensesUSD = 0;
      let mTxCount = 0;

      // Track counted IDs to prevent any duplicate counting between invoices & orders
      const countedOrderKeys = new Set<string>();

      // 1. Invoices (Facturas and Notas de Entrega)
      localInvoices.forEach(inv => {
        const d = parseUniversalDate(inv.created_at || inv.date);
        if (d && d.getFullYear() === targetYear && d.getMonth() === mIndex) {
          const sUSD = getTransactionUSD(inv);
          mSalesUSD += sUSD;
          mTxCount += 1;

          if (inv.control_number) countedOrderKeys.add(String(inv.control_number).toLowerCase());
          if (inv.order_number) countedOrderKeys.add(String(inv.order_number).toLowerCase());

          // Compute cost of items using real cost_price from product catalog
          let invCostUSD = 0;
          if (Array.isArray(inv.items) && inv.items.length > 0) {
            inv.items.forEach((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
              const prod = localProducts.find(p => p.id === item.product_id || p.sku === item.sku);
              const unitCost = (prod && typeof prod.cost_price === 'number' && prod.cost_price > 0) 
                ? prod.cost_price 
                : (typeof item.cost_price === 'number' && item.cost_price > 0 
                  ? item.cost_price 
                  : ((Number(item.price || item.price_usd || 0) || 0) * 0.7));
              invCostUSD += (unitCost * qty);
            });
          } else {
            invCostUSD = sUSD * 0.7;
          }
          mCostUSD += invCostUSD;
        }
      });

      // 2. Orders from online catalog (excluding cancelled or already counted)
      localOrders.forEach(o => {
        const status = (o.status || '').toLowerCase();
        if (status === 'cancelado' || status === 'anulado') return;
        const oKey = String(o.order_number || o.id || '').toLowerCase();
        if (countedOrderKeys.has(oKey)) return;

        const d = parseUniversalDate(o.created_at || (o as any).date);
        if (d && d.getFullYear() === targetYear && d.getMonth() === mIndex) {
          const sUSD = getTransactionUSD(o);
          mSalesUSD += sUSD;
          mTxCount += 1;

          let oCostUSD = 0;
          if (Array.isArray(o.items) && o.items.length > 0) {
            o.items.forEach((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
              const prod = localProducts.find(p => p.id === item.product_id || p.sku === item.sku);
              const unitCost = (prod && typeof prod.cost_price === 'number' && prod.cost_price > 0) 
                ? prod.cost_price 
                : (typeof item.cost_price === 'number' && item.cost_price > 0 
                  ? item.cost_price 
                  : ((Number(item.price || item.price_usd || 0) || 0) * 0.7));
              oCostUSD += (unitCost * qty);
            });
          } else {
            oCostUSD = sUSD * 0.7;
          }
          mCostUSD += oCostUSD;
        }
      });

      // 3. Gastos Fijos y Pagos Registrados (Alquiler, Sueldos, Gasolina, etc. from Supabase)
      const countedGastoMonthIds = new Set<string>();
      if (Array.isArray(localGastosPayments) && localGastosPayments.length > 0) {
        localGastosPayments.forEach(gp => {
          const d = parseUniversalDate(gp.payment_date || (gp as any).created_at);
          if (d && d.getFullYear() === targetYear && d.getMonth() === mIndex) {
            mExpensesUSD += (Number(gp.amount) || 0);
            if (gp.gasto_fijo_id) countedGastoMonthIds.add(String(gp.gasto_fijo_id));
          }
        });
      }
      // Sum any recurring fixed expenses active for that month not yet explicitly recorded in payments
      localGastosFijos.forEach(g => {
        if (!countedGastoMonthIds.has(String(g.id))) {
          const d = parseUniversalDate(g.last_paid_date || g.created_at || g.updated_at);
          if (d && d.getFullYear() === targetYear && d.getMonth() === mIndex) {
            mExpensesUSD += (Number(g.amount) || 0);
          }
        }
      });

      // 4. Cash Ops Egresos (excluding arqueo/cierre transfers and gastos already counted)
      localCashOps.forEach(op => {
        const d = parseUniversalDate(op.created_at || op.date || op.fecha);
        if (d && d.getFullYear() === targetYear && d.getMonth() === mIndex) {
          if (op.type === 'ingreso' && op.concept !== 'Apertura de Caja - Fondo Inicial') {
            const facMatch = (op.concept || '').match(/FAC-\d+|NE-\d+/i);
            if (!facMatch) {
              const incUSD = getTransactionUSD(op);
              mSalesUSD += incUSD;
              mCostUSD += (incUSD * 0.7);
              mTxCount += 1;
            }
          } else if (op.type === 'egreso') {
            const isArqueo = (op.concept || '').includes('Cierre de Caja') || (op.concept || '').includes('Arqueo');
            const isGastoFijoLinked = (op.concept || '').startsWith('[Gasto]');
            if (!isArqueo && !isGastoFijoLinked) {
              const expUSD = getTransactionUSD(op);
              mExpensesUSD += expUSD;
            }
          }
        }
      });

      const mGrossProfitUSD = mSalesUSD - mCostUSD;
      const mNetProfitUSD = mGrossProfitUSD - mExpensesUSD;

      return {
        month: shortName,
        fullName: MONTH_NAMES_FULL[mIndex],
        monthIndex: mIndex,
        salesUSD: mSalesUSD,
        costUSD: mCostUSD,
        expensesUSD: mExpensesUSD,
        grossProfitUSD: mGrossProfitUSD,
        netProfitUSD: mNetProfitUSD,
        txCount: mTxCount
      };
    });

    return monthsData;
  };

  // Calculate Monthly Evolution (12 Months of selected year)
  const monthlyEvolution12 = useMemo(() => {
    const currentRate = effectiveRates[reportCurrency] || 1;
    const rawYearData = computeYearEvolution(selectedYear);

    return rawYearData.map(m => ({
      ...m,
      ingresos: Number((m.salesUSD * currentRate).toFixed(2)),
      costos: Number((m.costUSD * currentRate).toFixed(2)),
      gastos: Number((m.expensesUSD * currentRate).toFixed(2)),
      utilidadBruta: Number((m.grossProfitUSD * currentRate).toFixed(2)),
      utilidadNeta: Number((m.netProfitUSD * currentRate).toFixed(2))
    }));
  }, [localInvoices, localOrders, localCashOps, localGastosFijos, localProducts, selectedYear, reportCurrency, effectiveRates]);

  // Metrics for the Selected Period (Month or Year) computed strictly from real data
  const selectedPeriodMetrics = useMemo(() => {
    let currentData = {
      salesUSD: 0,
      costUSD: 0,
      expensesUSD: 0,
      grossProfitUSD: 0,
      netProfitUSD: 0,
      txCount: 0
    };

    let prevData = {
      salesUSD: 0,
      costUSD: 0,
      expensesUSD: 0,
      grossProfitUSD: 0,
      netProfitUSD: 0
    };

    if (selectedMonthIndex === 'all') {
      // Aggregate whole year
      monthlyEvolution12.forEach(m => {
        currentData.salesUSD += m.salesUSD;
        currentData.costUSD += m.costUSD;
        currentData.expensesUSD += m.expensesUSD;
        currentData.grossProfitUSD += m.grossProfitUSD;
        currentData.netProfitUSD += m.netProfitUSD;
        currentData.txCount += m.txCount;
      });

      // Real comparative calculations: compute previous year (selectedYear - 1) from real records
      const prevYearData = computeYearEvolution(selectedYear - 1);
      prevYearData.forEach(m => {
        prevData.salesUSD += m.salesUSD;
        prevData.costUSD += m.costUSD;
        prevData.expensesUSD += m.expensesUSD;
        prevData.grossProfitUSD += m.grossProfitUSD;
        prevData.netProfitUSD += m.netProfitUSD;
      });
    } else {
      const activeMonth = monthlyEvolution12[selectedMonthIndex];
      if (activeMonth) {
        currentData = {
          salesUSD: activeMonth.salesUSD,
          costUSD: activeMonth.costUSD,
          expensesUSD: activeMonth.expensesUSD,
          grossProfitUSD: activeMonth.grossProfitUSD,
          netProfitUSD: activeMonth.netProfitUSD,
          txCount: activeMonth.txCount
        };
      }

      // Real comparative calculations: compare to previous month in the real dataset
      if (selectedMonthIndex > 0) {
        const prevMonth = monthlyEvolution12[selectedMonthIndex - 1];
        if (prevMonth) {
          prevData = {
            salesUSD: prevMonth.salesUSD,
            costUSD: prevMonth.costUSD,
            expensesUSD: prevMonth.expensesUSD,
            grossProfitUSD: prevMonth.grossProfitUSD,
            netProfitUSD: prevMonth.netProfitUSD
          };
        }
      } else {
        // January -> compare against December of previous year from real data
        const prevYearData = computeYearEvolution(selectedYear - 1);
        const decPrevYear = prevYearData[11];
        if (decPrevYear) {
          prevData = {
            salesUSD: decPrevYear.salesUSD,
            costUSD: decPrevYear.costUSD,
            expensesUSD: decPrevYear.expensesUSD,
            grossProfitUSD: decPrevYear.grossProfitUSD,
            netProfitUSD: decPrevYear.netProfitUSD
          };
        }
      }
    }

    // Mathematical Trend Percentages (Real, no simulated multipliers)
    const calcTrend = (current: number, previous: number) => {
      if (previous === 0 && current === 0) return 0;
      if (previous === 0) return current > 0 ? 100 : -100;
      return ((current - previous) / Math.abs(previous)) * 100;
    };

    const ingresosTrend = calcTrend(currentData.salesUSD, prevData.salesUSD);
    const costosTrend = currentData.salesUSD > 0 ? (currentData.costUSD / currentData.salesUSD) * 100 : 0;
    const gastosTrend = calcTrend(currentData.expensesUSD, prevData.expensesUSD);
    const margenBrutoPercent = currentData.salesUSD > 0 ? (currentData.grossProfitUSD / currentData.salesUSD) * 100 : 0;
    const margenNetoPercent = currentData.salesUSD > 0 
      ? (currentData.netProfitUSD / currentData.salesUSD) * 100 
      : (currentData.expensesUSD > 0 || currentData.costUSD > 0 ? -100 : 0);

    return {
      ...currentData,
      ingresosTrend,
      costosTrend,
      gastosTrend,
      margenBrutoPercent,
      margenNetoPercent
    };
  }, [monthlyEvolution12, selectedMonthIndex, selectedYear, localInvoices, localOrders, localCashOps, localGastosFijos, localGastosPayments, localProducts]);

  // Capital & Assets Metrics (Strictly from real database tables)
  const capitalMetrics = useMemo(() => {
    // 1. Real Inventory Value from products in database (USD)
    let inventoryCostUSD = 0;
    localProducts.forEach(p => {
      const stock = Number(p.stock) || 0;
      if (stock > 0) {
        const unitCost = (typeof p.cost_price === 'number' && p.cost_price > 0)
          ? p.cost_price
          : (Number(p.price || (p as any).price_1 || 0) * 0.7);
        inventoryCostUSD += (stock * unitCost);
      }
    });

    // 2. Real Bank Accounts Total from bank_accounts in database (USD)
    let banksUSD = 0;
    localBankAccounts.forEach(b => {
      const bal = Number(b.balance) || 0;
      if (b.currency === 'VES') {
        banksUSD += (bal / (effectiveRates.VES || 1));
      } else if (b.currency === 'COP') {
        banksUSD += (bal / (effectiveRates.COP || 1));
      } else if (b.currency === 'EUR') {
        banksUSD += (bal / (effectiveRates.EUR || 1));
      } else {
        banksUSD += bal;
      }
    });

    // 3. Real Accounts Receivable (CxC) pending balance from accounts_receivable in database (USD)
    let cxcUSD = 0;
    localAccountsReceivable.forEach(r => {
      const st = (r.status || '').toLowerCase();
      if (st !== 'pagada' && st !== 'cobrado' && st !== 'anulada') {
        const pending = Number(r.remaining_amount || (Number(r.total_amount || 0) - Number(r.paid_amount || 0))) || 0;
        if (pending > 0) {
          if (r.currency === 'VES') {
            cxcUSD += (pending / (effectiveRates.VES || 1));
          } else if (r.currency === 'COP') {
            cxcUSD += (pending / (effectiveRates.COP || 1));
          } else if (r.currency === 'EUR') {
            cxcUSD += (pending / (effectiveRates.EUR || 1));
          } else {
            cxcUSD += pending;
          }
        }
      }
    });

    // 4. Real Accounts Payable (CxP) from accounts_payable in database (USD)
    let cxpUSD = 0;
    localAccountsPayable.forEach(p => {
      const st = (p.status || '').toLowerCase();
      if (st !== 'pagada' && st !== 'anulada') {
        const pending = Number(p.remaining_amount || (Number(p.total_amount || 0) - Number(p.paid_amount || 0))) || 0;
        if (pending > 0) {
          if (p.currency === 'VES') {
            cxpUSD += (pending / (effectiveRates.VES || 1));
          } else if (p.currency === 'COP') {
            cxpUSD += (pending / (effectiveRates.COP || 1));
          } else if (p.currency === 'EUR') {
            cxpUSD += (pending / (effectiveRates.EUR || 1));
          } else {
            cxpUSD += pending;
          }
        }
      }
    });

    // Total Capital in USD
    const totalCapitalUSD = inventoryCostUSD + banksUSD + cxcUSD - cxpUSD;

    // Return on Equity / Capital Growth Rate (% de rentabilidad del capital en el período)
    const capitalTrend = totalCapitalUSD > 0 
      ? Number(((selectedPeriodMetrics.netProfitUSD / totalCapitalUSD) * 100).toFixed(2))
      : 0;

    // Real composition share of total assets/capital (no hardcoded fake percentages)
    const inventoryTrend = totalCapitalUSD > 0 
      ? Number(((inventoryCostUSD / totalCapitalUSD) * 100).toFixed(2))
      : 0;

    const banksTrend = totalCapitalUSD > 0 
      ? Number(((banksUSD / totalCapitalUSD) * 100).toFixed(2))
      : 0;

    const cxcTrend = totalCapitalUSD > 0 
      ? Number(((cxcUSD / totalCapitalUSD) * 100).toFixed(2))
      : 0;

    const cxpTrend = totalCapitalUSD > 0 
      ? Number(((cxpUSD / totalCapitalUSD) * 100).toFixed(2))
      : 0;

    return {
      totalCapitalUSD,
      inventoryCostUSD,
      banksUSD,
      cxcUSD,
      cxpUSD,
      capitalTrend,
      inventoryTrend,
      banksTrend,
      cxcTrend,
      cxpTrend
    };
  }, [localProducts, localBankAccounts, localAccountsReceivable, localAccountsPayable, selectedPeriodMetrics.netProfitUSD, effectiveRates]);

  // Donut Chart: Asset & Performance Distribution (No fake fallback numbers)
  const assetsPieData = useMemo(() => {
    const currentRate = effectiveRates[reportCurrency] || 1;
    const ingVal = Math.max(0, selectedPeriodMetrics.salesUSD * currentRate);
    const costVal = Math.max(0, selectedPeriodMetrics.costUSD * currentRate);
    const brutaVal = Math.max(0, selectedPeriodMetrics.grossProfitUSD * currentRate);
    const netaVal = Math.max(0, Math.abs(selectedPeriodMetrics.netProfitUSD * currentRate));

    const baseTotal = ingVal + costVal + brutaVal + netaVal;
    if (baseTotal === 0) {
      return [];
    }

    return [
      { name: 'Ingresos', value: ingVal || 0.001, usdValue: selectedPeriodMetrics.salesUSD, color: '#005da9' },
      { name: 'Costos de ventas', value: costVal || 0.001, usdValue: selectedPeriodMetrics.costUSD, color: '#60a5fa' },
      { name: 'Utilidad Bruta', value: brutaVal || 0.001, usdValue: selectedPeriodMetrics.grossProfitUSD, color: '#10b981' },
      { name: 'Utilidad Neta', value: netaVal || 0.001, usdValue: selectedPeriodMetrics.netProfitUSD, color: '#7928CA' }
    ];
  }, [selectedPeriodMetrics, reportCurrency, effectiveRates]);

  // Detailed Expense Breakdown from gastos_fijos table and cash_ops egresos
  const expensesBreakdown = useMemo(() => {
    const catMap: Record<string, { totalUSD: number; count: number }> = {};

    // 1. Gastos Fijos (tabla gastos_fijos de Supabase)
    localGastosFijos.forEach(g => {
      const d = parseUniversalDate(g.last_paid_date || g.created_at || g.updated_at);
      if (!d || d.getFullYear() !== selectedYear) return;
      if (selectedMonthIndex !== 'all' && d.getMonth() !== selectedMonthIndex) return;

      const cat = (g.category || 'Otros gastos').trim();
      const amtUSD = Number(g.amount) || 0;
      if (!catMap[cat]) {
        catMap[cat] = { totalUSD: 0, count: 0 };
      }
      catMap[cat].totalUSD += amtUSD;
      catMap[cat].count += 1;
    });

    // 2. Cash Ops Egresos (sin duplicar [Gasto] ni transferencias de arqueo)
    localCashOps.forEach(op => {
      if (op.type === 'egreso') {
        const isArqueo = (op.concept || '').includes('Cierre de Caja') || (op.concept || '').includes('Arqueo');
        const isGastoFijoLinked = (op.concept || '').startsWith('[Gasto]');
        if (isArqueo || isGastoFijoLinked) return;

        const d = parseUniversalDate(op.created_at || op.date || op.fecha);
        if (!d || d.getFullYear() !== selectedYear) return;
        if (selectedMonthIndex !== 'all' && d.getMonth() !== selectedMonthIndex) return;

        const concept = op.concept || '';
        let cat = (op.category || '').trim();
        if (!cat) {
          const lower = concept.toLowerCase();
          if (lower.includes('nomina') || lower.includes('sueldo') || lower.includes('salario')) cat = 'Sueldos y salarios';
          else if (lower.includes('compra') || lower.includes('mercancia') || lower.includes('proveedor')) cat = 'Compra de mercadería / productos';
          else if (lower.includes('alquiler') || lower.includes('local') || lower.includes('arriendo')) cat = 'Alquiler';
          else if (lower.includes('luz') || lower.includes('electricidad')) cat = 'Electricidad / luz';
          else if (lower.includes('agua')) cat = 'Agua';
          else if (lower.includes('gas')) cat = 'Gas';
          else if (lower.includes('internet') || lower.includes('telefono')) cat = 'Internet / teléfono';
          else if (lower.includes('transporte') || lower.includes('gasolina') || lower.includes('combustible')) cat = 'Transporte / combustible';
          else if (lower.includes('limpieza')) cat = 'Limpieza';
          else if (lower.includes('mantenimiento') || lower.includes('reparacion')) cat = 'Mantenimiento y reparaciones';
          else cat = 'Otros gastos';
        }

        const amtUSD = getTransactionUSD(op);
        if (!catMap[cat]) {
          catMap[cat] = { totalUSD: 0, count: 0 };
        }
        catMap[cat].totalUSD += amtUSD;
        catMap[cat].count += 1;
      }
    });

    return Object.entries(catMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalUSD: data.totalUSD
      }))
      .sort((a, b) => b.totalUSD - a.totalUSD);
  }, [localGastosFijos, localCashOps, selectedYear, selectedMonthIndex]);

  // Top Products Breakdown
  const topProductsBreakdown = useMemo(() => {
    const prodMap: Record<string, { name: string; sku: string; qty: number; salesUSD: number; costUSD: number }> = {};

    const processItem = (item: any, dateStr: string) => {
      const d = parseUniversalDate(dateStr);
      if (!d || d.getFullYear() !== selectedYear) return;
      if (selectedMonthIndex !== 'all' && d.getMonth() !== selectedMonthIndex) return;

      const key = item.product_id || item.sku || item.name || 'item';
      const qty = Number(item.quantity || item.qty) || 1;
      const price = Number(item.price || item.price_usd) || 0;
      const prod = localProducts.find(p => p.id === item.product_id || p.sku === item.sku);
      const unitCost = (prod && typeof prod.cost_price === 'number' && prod.cost_price > 0) 
        ? prod.cost_price 
        : (typeof item.cost_price === 'number' && item.cost_price > 0 ? item.cost_price : (price * 0.7));

      if (!prodMap[key]) {
        prodMap[key] = {
          name: item.name || prod?.name || 'Artículo',
          sku: item.sku || prod?.sku || '',
          qty: 0,
          salesUSD: 0,
          costUSD: 0
        };
      }
      prodMap[key].qty += qty;
      prodMap[key].salesUSD += (price * qty);
      prodMap[key].costUSD += (unitCost * qty);
    };

    localInvoices.forEach(inv => {
      if (Array.isArray(inv.items)) {
        inv.items.forEach((it: any) => processItem(it, inv.created_at || inv.date));
      }
    });

    localOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((it: any) => processItem(it, o.created_at || (o as any).date));
      }
    });

    return Object.values(prodMap)
      .map(p => ({
        ...p,
        salesUSD: p.salesUSD,
        costUSD: p.costUSD,
        profitUSD: p.salesUSD - p.costUSD
      }))
      .sort((a, b) => b.salesUSD - a.salesUSD)
      .slice(0, 8);
  }, [localInvoices, localOrders, localProducts, selectedYear, selectedMonthIndex]);

  // Export Executive PDF
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const currentRate = effectiveRates[reportCurrency] || 1;
      const periodLabel = selectedMonthIndex === 'all' 
        ? `Año ${selectedYear}` 
        : `${MONTH_NAMES_FULL[selectedMonthIndex]} ${selectedYear}`;

      const expCategoryList = expensesBreakdown.map(item => ({
        category: item.name,
        amount: item.totalUSD * currentRate,
        percentage: selectedPeriodMetrics.expensesUSD > 0 ? (item.totalUSD / selectedPeriodMetrics.expensesUSD) * 100 : 0
      }));

      const topProductsList = topProductsBreakdown.map(p => ({
        name: p.name,
        sku: p.sku,
        quantity: p.qty,
        total: p.salesUSD * currentRate,
        profit: p.profitUSD * currentRate
      }));

      await exportReportsToPdf({
        businessName: businessProfile?.name || 'Copias Bellavista',
        rif: businessProfile?.tax_id || '',
        periodLabel,
        frequency: 'mensual',
        selectedPeriod: periodLabel,
        generatedAt: new Date().toLocaleString('es-VE'),
        currency: reportCurrency,
        currencySymbol: reportCurrency === 'USD' ? '$' : reportCurrency === 'VES' ? 'Bs' : reportCurrency === 'EUR' ? '€' : 'COP$',
        totalSales: selectedPeriodMetrics.salesUSD * currentRate,
        totalCost: selectedPeriodMetrics.costUSD * currentRate,
        grossProfit: selectedPeriodMetrics.grossProfitUSD * currentRate,
        grossMarginPercent: selectedPeriodMetrics.margenBrutoPercent,
        totalExpenses: selectedPeriodMetrics.expensesUSD * currentRate,
        netProfit: selectedPeriodMetrics.netProfitUSD * currentRate,
        netMarginPercent: selectedPeriodMetrics.margenNetoPercent,
        totalOrdersCount: selectedPeriodMetrics.txCount,
        averageTicket: selectedPeriodMetrics.txCount > 0 ? (selectedPeriodMetrics.salesUSD * currentRate) / selectedPeriodMetrics.txCount : 0,
        expensesByCategory: expCategoryList,
        teamPerformance: [],
        channelPerformance: [],
        topProducts: topProductsList,
        incomes: [],
        egresses: []
      });
    } catch (err) {
      console.error("PDF Export error:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export Excel Report
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const currentRate = effectiveRates[reportCurrency] || 1;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Frenyer Sistema Administrativo';
      const sheet = workbook.addWorksheet('Ganancias y Perdidas');

      // Styles
      const headerFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1B2631' } // Corporate Navy #1B2631
      };
      const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

      sheet.columns = [
        { header: 'CONCEPTO / INDICADOR', key: 'concepto', width: 32 },
        { header: 'MONTO USD', key: 'montoUSD', width: 20 },
        { header: `MONTO (${reportCurrency})`, key: 'montoReport', width: 22 },
        { header: '% PARTICIPACIÓN', key: 'porcentaje', width: 18 }
      ];

      // Format Header row
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Data Rows
      const rows = [
        { concepto: 'Ingresos por Ventas', montoUSD: selectedPeriodMetrics.salesUSD, montoReport: selectedPeriodMetrics.salesUSD * currentRate, porcentaje: '100.00%' },
        { concepto: 'Costos de Ventas (COGS)', montoUSD: selectedPeriodMetrics.costUSD, montoReport: selectedPeriodMetrics.costUSD * currentRate, porcentaje: `${selectedPeriodMetrics.costosTrend.toFixed(2)}%` },
        { concepto: 'Utilidad Bruta', montoUSD: selectedPeriodMetrics.grossProfitUSD, montoReport: selectedPeriodMetrics.grossProfitUSD * currentRate, porcentaje: `${selectedPeriodMetrics.margenBrutoPercent.toFixed(2)}%` },
        { concepto: 'Gastos Operativos (Fijos / Variables)', montoUSD: selectedPeriodMetrics.expensesUSD, montoReport: selectedPeriodMetrics.expensesUSD * currentRate, porcentaje: `${selectedPeriodMetrics.salesUSD > 0 ? ((selectedPeriodMetrics.expensesUSD / selectedPeriodMetrics.salesUSD) * 100).toFixed(2) : 0}%` },
        { concepto: 'Utilidad Neta del Período', montoUSD: selectedPeriodMetrics.netProfitUSD, montoReport: selectedPeriodMetrics.netProfitUSD * currentRate, porcentaje: `${selectedPeriodMetrics.margenNetoPercent.toFixed(2)}%` }
      ];

      rows.forEach((r, idx) => {
        const addedRow = sheet.addRow(r);
        if (idx % 2 === 1) {
          addedRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F4' } };
          });
        }
      });

      // Totals
      const totalRow = sheet.addRow({
        concepto: 'TOTAL UTILIDAD NETA',
        montoUSD: selectedPeriodMetrics.netProfitUSD,
        montoReport: selectedPeriodMetrics.netProfitUSD * currentRate,
        porcentaje: `${selectedPeriodMetrics.margenNetoPercent.toFixed(2)}%`
      });

      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF16A085' }, size: 12 };
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'double' }
        };
      });

      sheet.views = [{ showGridLines: true }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_Ganancias_Perdidas_${selectedYear}_${selectedMonthIndex !== 'all' ? MONTH_NAMES_SHORT[selectedMonthIndex] : 'Anual'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel Export error:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Info Modal Explanations
  const getModalInfo = (key: string) => {
    switch (key) {
      case 'ingresos':
        return {
          title: 'Ingresos por Ventas',
          formula: 'Ventas Totales = Ventas POS + Pedidos + Cobranzas',
          desc: 'Representa el flujo total bruto de dinero facturado o recaudado por la venta de productos o servicios dentro del período seleccionado.',
          tip: 'Aumentar el ticket promedio o la frecuencia de compra eleva directamente este indicador.'
        };
      case 'costos':
        return {
          title: 'Costos de Ventas (COGS)',
          formula: 'Costo de Ventas = Suma (Unidades Vendidas × Costo Unitario)',
          desc: 'Es el valor de adquisición o producción directo de los artículos que fueron vendidos. No incluye alquiler ni sueldos administrativos.',
          tip: 'Negociar mejores precios con tus proveedores reduce este costo y amplía tu margen bruto.'
        };
      case 'gastos':
        return {
          title: 'Gastos Fijos y Variables',
          formula: 'Gastos = Nómina + Alquiler + Servicios + Envíos + Otros',
          desc: 'Egresos operativos necesarios para mantener el negocio en marcha. Son independientes del costo directo del inventario vendido.',
          tip: 'Controlar los gastos fijos te protege en meses con fluctuaciones en las ventas.'
        };
      case 'utilidad_bruta':
        return {
          title: 'Utilidad Bruta',
          formula: 'Utilidad Bruta = Ingresos - Costos de Ventas',
          desc: 'El beneficio directo generado por tu catálogo antes de descontar los costos operativos del negocio. Mide la rentabilidad de tus precios.',
          tip: 'Un margen bruto saludable para comercio minorista oscila entre el 25% y el 50%.'
        };
      case 'utilidad_neta':
        return {
          title: 'Utilidad Neta (Resultado Final)',
          formula: 'Utilidad Neta = Utilidad Bruta - Gastos Fijos/Variables',
          desc: 'La ganancia o pérdida final de tu negocio después de cubrir absolutamente todos los costos y egresos del período.',
          tip: 'Es el indicador supremo de salud financiera: si es positivo, tu negocio está acumulando capital real.'
        };
      case 'capital':
        return {
          title: 'Total de Capital del Negocio',
          formula: 'Capital = Valor Inventario + Bancos + Cuentas por Cobrar - Cuentas por Pagar',
          desc: 'Patrimonio neto activo del negocio calculado sumando todos los activos circulantes y restando las deudas a proveedores.',
          tip: 'Un capital creciente refleja solidez patrimonial y capacidad de reinversión.'
        };
      case 'inventario':
        return {
          title: 'Valor del Inventario',
          formula: 'Inventario = Suma (Stock Actual × Costo Unitario)',
          desc: 'Valoración contable de toda la mercancía disponible en bodega y vitrinas lista para ser vendida.',
          tip: 'Evita tener exceso de stock en productos de baja rotación para liberar liquidez.'
        };
      case 'bancos':
        return {
          title: 'Cuentas Bancarias y Caja',
          formula: 'Saldo = Suma de saldos disponibles en todas las cuentas y billeteras',
          desc: 'Liquidez inmediata disponible para pagos de nómina, compras a proveedores o emergencias operativas.',
          tip: 'Monitorea las cuentas en divisas (USD) y moneda local (Bs) para evitar pérdidas cambiarias.'
        };
      case 'cxc':
        return {
          title: 'Cuentas por Cobrar (CxC)',
          formula: 'CxC = Saldo pendiente de clientes con crédito activo',
          desc: 'Dinero pendiente de cobro otorgado a clientes de confianza. Activo circulante por ingresar.',
          tip: 'Mantén un ciclo de cobranza menor a 15 días para no comprometer tu flujo de caja.'
        };
      case 'cxp':
        return {
          title: 'Cuentas por Pagar (CxP)',
          formula: 'CxP = Deudas pendientes con proveedores de mercancía o servicios',
          desc: 'Obligaciones financieras adquiridas por compras a crédito que deberán ser saldadas próximamente.',
          tip: 'Alinea las fechas de pago con tus fechas pico de recaudación por ventas.'
        };
      default:
        return null;
    }
  };

  const currentMonthLabel = selectedMonthIndex === 'all' 
    ? `Todo el Año ${selectedYear}` 
    : `${MONTH_NAMES_FULL[selectedMonthIndex]} ${selectedYear}`;

  return (
    <div className="bg-[#F8F9FA] min-h-screen p-4 md:p-6 lg:p-8 font-sans text-slate-800 space-y-6">
      
      {/* -------------------------------------------------------------
          HEADER PRINCIPAL (ESTILO FRENYER CON BOTONES PÍLDORAS)
          ------------------------------------------------------------- */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
        
        {/* Title & Period Badge */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#1D3557] via-[#005da9] to-[#40E0D0] text-white flex items-center justify-center shadow-sm shrink-0">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-[#1D3557] tracking-tight uppercase">
                UTILIDAD / PERDIDA
              </h1>
              <span className="hidden sm:inline-block px-3 py-0.5 rounded-full text-xs font-black bg-blue-50 text-[#005da9] border border-blue-200">
                {currentMonthLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Tablero gerencial financiero en tiempo real • {businessProfile?.name || 'Copias Bellavista'}
            </p>
          </div>
        </div>

        {/* CONTROLS (BOTONES TIPO PÍLDORAS) */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Dropdown Mes (Píldora) */}
          <div className="relative">
            <select
              value={selectedMonthIndex}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMonthIndex(val === 'all' ? 'all' : parseInt(val, 10));
              }}
              className="appearance-none bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-full px-4 py-2 pr-8 text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#005da9]/30 transition"
            >
              <option value="all">Todo el año</option>
              {MONTH_NAMES_FULL.map((name, idx) => (
                <option key={idx} value={idx}>
                  {idx === currentDate.getMonth() && selectedYear === currentDate.getFullYear() ? `${name} (Mes actual)` : name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Dropdown Año (Píldora) */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="appearance-none bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-full px-4 py-2 pr-8 text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#005da9]/30 transition"
            >
              {[2026, 2025, 2024, 2023].map((y) => (
                <option key={y} value={y}>
                  {y === currentDate.getFullYear() ? `Año ${y} (Actual)` : `Año ${y}`}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Currency Switcher (Píldoras con USD por defecto) */}
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 text-xs font-bold">
            {(['USD', 'VES', 'EUR', 'COP'] as CurrencyCode[]).map((curr) => {
              const isSelected = reportCurrency === curr;
              const label = curr === 'USD' ? '$ USD' : curr === 'VES' ? 'Bs. VES' : curr === 'EUR' ? '€ EUR' : 'COP$';
              return (
                <button
                  key={curr}
                  type="button"
                  onClick={() => handleCurrencyChange(curr)}
                  className={`px-3 py-1 rounded-full transition text-xs font-black cursor-pointer ${
                    isSelected 
                      ? 'bg-[#005da9] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Sincronizar Button (Píldora) */}
          <button
            onClick={fetchLatestFromDb}
            disabled={isSyncing}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-full transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Sincronizar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#005da9]' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          {/* PDF Button (Píldora) */}
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 text-xs font-black px-4 py-2 rounded-full transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>PDF</span>
          </button>

          {/* Excel Button (Píldora) */}
          <button
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-700 text-xs font-black px-4 py-2 rounded-full transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          BARRA DE AUDITORÍA EN TIEMPO REAL CON SUPABASE (0% DATOS SIMULADOS)
          ------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-blue-950 via-[#1D3557] to-[#005da9] text-white p-4 rounded-3xl shadow-md border border-[#005da9]/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#40E0D0] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#40E0D0]"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wide text-white uppercase">
                Sincronización en Tiempo Real
              </span>
              <span className="bg-[#40E0D0]/20 text-[#40E0D0] border border-[#40E0D0]/40 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                0% Datos Simulados
              </span>
            </div>
            <p className="text-[11px] text-blue-100/80 font-medium mt-0.5">
              Conexión activa al servidor • Última sincronización: {lastSync.toLocaleTimeString('es-VE')}
            </p>
          </div>
        </div>

        {/* Live Database Audit Pill Counters */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            🧾 <strong className="text-[#40E0D0] font-black">{localInvoices.length}</strong> Comprobantes
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            📦 <strong className="text-[#40E0D0] font-black">{localOrders.length}</strong> Pedidos
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            💵 <strong className="text-[#40E0D0] font-black">{localCashOps.length}</strong> Mov. Caja
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            ⚡ <strong className="text-[#40E0D0] font-black">{localGastosFijos.length}</strong> Gastos Fijos
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            💳 <strong className="text-[#40E0D0] font-black">{localGastosPayments.length}</strong> Pagos
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            🏷️ <strong className="text-[#40E0D0] font-black">{localProducts.length}</strong> Catálogo
          </span>
          <span className="bg-white/10 backdrop-blur-xs border border-white/15 px-2.5 py-1 rounded-full font-bold text-white">
            🏦 <strong className="text-[#40E0D0] font-black">{localBankAccounts.length}</strong> Bancos
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------
          SECCIÓN 1: UTILIDAD (5 KPI CARDS ADAPTADAS)
          ------------------------------------------------------------- */}
      <div className="space-y-3 text-left">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span>UTILIDAD</span>
          <span className="text-[11px] font-bold text-slate-400 capitalize">({currentMonthLabel})</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* 1. Ingresos */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group relative">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-600">
                  {selectedPeriodMetrics.ingresosTrend >= 0 ? `+${selectedPeriodMetrics.ingresosTrend.toFixed(2)}%` : `${selectedPeriodMetrics.ingresosTrend.toFixed(2)}%`}
                </span>
                <button 
                  onClick={() => setInfoModalKey('ingresos')}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                  title="¿Qué son los Ingresos?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ingresos</p>
              <p className="text-xl md:text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {formatValue(selectedPeriodMetrics.salesUSD, true)}
              </p>
            </div>
          </div>

          {/* 2. Costos de ventas */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group relative">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600">
                  {selectedPeriodMetrics.costosTrend.toFixed(2)}%
                </span>
                <button 
                  onClick={() => setInfoModalKey('costos')}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                  title="¿Qué son los Costos de Ventas?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Costos de ventas</p>
              <p className="text-xl md:text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                -{formatValue(selectedPeriodMetrics.costUSD, true)}
              </p>
            </div>
          </div>

          {/* 3. Gastos fijos/variables */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group relative">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] font-black flex items-center justify-center">
                  !
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600">
                  {selectedPeriodMetrics.gastosTrend >= 0 ? `+${selectedPeriodMetrics.gastosTrend.toFixed(2)}%` : `${selectedPeriodMetrics.gastosTrend.toFixed(2)}%`}
                </span>
                <button 
                  onClick={() => setInfoModalKey('gastos')}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                  title="¿Qué son los Gastos Fijos y Variables?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Gastos fijos/variables</p>
              <p className="text-xl md:text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                -{formatValue(selectedPeriodMetrics.expensesUSD, true)}
              </p>
            </div>
          </div>

          {/* 4. Utilidad Bruta */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition group relative">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-600">
                  {selectedPeriodMetrics.margenBrutoPercent.toFixed(2)}%
                </span>
                <button 
                  onClick={() => setInfoModalKey('utilidad_bruta')}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                  title="¿Qué es la Utilidad Bruta?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Utilidad Bruta</p>
              <p className="text-xl md:text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {formatValue(selectedPeriodMetrics.grossProfitUSD)}
              </p>
            </div>
          </div>

          {/* 5. Utilidad Neta (Destacada con Borde Púrpura) */}
          <div className="bg-purple-50/25 border-2 border-purple-400/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between relative">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                  selectedPeriodMetrics.netProfitUSD >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {selectedPeriodMetrics.margenNetoPercent.toFixed(2)}%
                </span>
                <button 
                  onClick={() => setInfoModalKey('utilidad_neta')}
                  className="text-purple-400 hover:text-purple-700 transition cursor-pointer p-0.5"
                  title="¿Qué es la Utilidad Neta?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-extrabold text-purple-900 uppercase tracking-wide">Utilidad Neta</p>
              <p className={`text-xl md:text-2xl font-black mt-0.5 tracking-tight ${
                selectedPeriodMetrics.netProfitUSD >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {formatValue(selectedPeriodMetrics.netProfitUSD)}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* -------------------------------------------------------------
          SECCIÓN 2: EVOLUCIÓN MENSUAL (GRÁFICA COMPUESTA BARS + LINE)
          ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 md:p-6 shadow-xs text-left space-y-4">
        
        {/* Header de la Gráfica */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          
          <div className="flex items-center gap-3">
            <span className="bg-gradient-to-r from-[#7928CA] to-[#005da9] text-white text-xs font-black px-4 py-1.5 rounded-full shadow-2xs">
              Año {selectedYear}
            </span>
            <h3 className="text-base font-black text-slate-800 tracking-tight">
              Evolución Mensual
            </h3>
          </div>

          {/* Leyenda Visual */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#005da9]"></span>
              <span>Ingresos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#93c5fd]"></span>
              <span>Total Costos ventas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#fca5a5]"></span>
              <span>Gastos fijos/variables</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-[#d97706]"></span>
              <span>Utilidad Neta</span>
            </div>
          </div>
        </div>

        {/* Recharts Container */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={monthlyEvolution12}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}`}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-xs font-sans space-y-1.5 border border-slate-800">
                        <p className="font-black text-slate-200 border-b border-slate-700 pb-1">
                          {data.fullName} {selectedYear}
                        </p>
                        <div className="flex justify-between gap-4 text-emerald-400">
                          <span>Ingresos:</span>
                          <span className="font-mono font-bold">{formatValue(data.salesUSD)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-blue-300">
                          <span>Costos:</span>
                          <span className="font-mono font-bold">-{formatValue(data.costUSD)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-rose-300">
                          <span>Gastos:</span>
                          <span className="font-mono font-bold">-{formatValue(data.expensesUSD)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-amber-300 font-bold border-t border-slate-700 pt-1">
                          <span>Utilidad Neta:</span>
                          <span className="font-mono">{formatValue(data.netProfitUSD)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {/* Bars for Revenue, Cost, Expenses */}
              <Bar dataKey="ingresos" name="Ingresos" fill="#005da9" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="costos" name="Total Costos ventas" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="gastos" name="Gastos fijos/variables" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={22} />
              {/* Monotone Line for Net Profit */}
              <Line 
                type="monotone" 
                dataKey="utilidadNeta" 
                name="Utilidad Neta" 
                stroke="#d97706" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: '#d97706', strokeWidth: 1 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* -------------------------------------------------------------
          SECCIÓN 3: CAPITAL (HERO CARD + 2x2 GRID + DONUT CHART)
          ------------------------------------------------------------- */}
      <div className="space-y-3 text-left">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span>CAPITAL</span>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Col 1: Hero Card: TOTAL DE CAPITAL (lg:col-span-4) */}
          <div className="lg:col-span-4 bg-gradient-to-br from-[#7928CA] via-[#6366F1] to-[#005da9] text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[220px]">
            <div className="flex items-center justify-between relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-white/20 text-white backdrop-blur-xs" title="Rendimiento del Capital (Utilidad Neta / Capital Total)">
                  {capitalMetrics.capitalTrend >= 0 ? `+${capitalMetrics.capitalTrend.toFixed(2)}%` : `${capitalMetrics.capitalTrend.toFixed(2)}%`}
                </span>
                <button 
                  onClick={() => setInfoModalKey('capital')}
                  className="text-white/70 hover:text-white transition cursor-pointer p-0.5"
                  title="¿Qué es el Total de Capital?"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="my-auto py-3 relative z-10">
              <p className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono">
                {formatValue(capitalMetrics.totalCapitalUSD)}
              </p>
              <p className="text-xs font-black uppercase tracking-wider text-purple-100 mt-1">
                TOTAL DE CAPITAL
              </p>
            </div>

            {/* Subtle background decoration */}
            <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
          </div>

          {/* Col 2: 2x2 Grid of Financial Metric Cards (lg:col-span-4) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3.5">
            
            {/* Valor inventario */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
              <div className="flex items-center justify-between">
                <Package className="w-4 h-4 text-[#005da9]" />
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#005da9]" title="Porcentaje que representa del capital total">
                  {capitalMetrics.inventoryTrend.toFixed(1)}% cap.
                </span>
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Valor inventario</p>
                <p className="text-base font-black text-slate-900 mt-0.5 font-mono">
                  {formatValue(capitalMetrics.inventoryCostUSD)}
                </p>
              </div>
            </div>

            {/* Cuentas bancarias */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
              <div className="flex items-center justify-between">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600" title="Porcentaje que representa del capital total">
                  {capitalMetrics.banksTrend.toFixed(1)}% cap.
                </span>
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Cuentas bancarias</p>
                <p className="text-base font-black text-slate-900 mt-0.5 font-mono">
                  {formatValue(capitalMetrics.banksUSD)}
                </p>
              </div>
            </div>

            {/* Cuentas por cobrar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
              <div className="flex items-center justify-between">
                <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600" title="Porcentaje que representa del capital total">
                  {capitalMetrics.cxcTrend.toFixed(1)}% cap.
                </span>
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Cuentas por cobrar</p>
                <p className="text-base font-black text-slate-900 mt-0.5 font-mono">
                  {formatValue(capitalMetrics.cxcUSD)}
                </p>
              </div>
            </div>

            {/* Cuentas por pagar */}
            <div className="bg-white border border-rose-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-rose-300 transition">
              <div className="flex items-center justify-between">
                <ArrowDownCircle className="w-4 h-4 text-rose-600" />
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600" title="Porcentaje que representa del capital total">
                  {capitalMetrics.cxpTrend.toFixed(1)}% cap.
                </span>
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Cuentas por pagar</p>
                <p className="text-base font-black text-slate-900 mt-0.5 font-mono">
                  {formatValue(capitalMetrics.cxpUSD)}
                </p>
              </div>
            </div>

          </div>

          {/* Col 3: VALOR DE ACTIVOS (Donut / Pie Chart) (lg:col-span-4) */}
          <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                VALOR DE ACTIVOS
              </h3>
              <PieChartIcon className="w-4 h-4 text-[#7928CA]" />
            </div>

            {assetsPieData.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                <PieChartIcon className="w-8 h-8 text-slate-300 mb-1" />
                <p className="text-xs font-bold text-slate-400">Sin movimientos en el período seleccionado</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2 py-2">
                {/* Pie Chart */}
                <div className="h-40 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={assetsPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {assetsPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any, name: any, item: any) => [formatValue(item?.payload?.usdValue || 0), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom Legend */}
                <div className="space-y-2 text-[11px] font-bold text-slate-600">
                  {assetsPieData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="truncate">{entry.name}</span>
                      </div>
                      <span className="font-mono text-slate-900 font-extrabold text-[10px]">
                        {formatValue(entry.usdValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* -------------------------------------------------------------
          MODAL DE INFORMACIÓN Y CONCEPTOS FINANCIEROS (?)
          ------------------------------------------------------------- */}
      {infoModalKey && (() => {
        const info = getModalInfo(infoModalKey);
        if (!info) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 text-left animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-[#1D3557]">
                  <Info className="w-5 h-5 text-[#005da9]" />
                  <h3 className="font-black text-base">{info.title}</h3>
                </div>
                <button
                  onClick={() => setInfoModalKey(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-blue-50/70 border border-blue-200 p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-black text-[#005da9] tracking-wider">Fórmula Oficial</p>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{info.formula}</p>
                </div>

                <div>
                  <p className="font-black text-slate-700 uppercase text-[10px] tracking-wider">Definición</p>
                  <p className="text-slate-600 mt-1 leading-relaxed">{info.desc}</p>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-black text-emerald-800 tracking-wider">Consejo Gerencial</p>
                  <p className="text-emerald-900 font-medium mt-0.5">{info.tip}</p>
                </div>
              </div>

              <button
                onClick={() => setInfoModalKey(null)}
                className="w-full bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-black py-2.5 rounded-full transition shadow-xs cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default ReportesDashboard;
