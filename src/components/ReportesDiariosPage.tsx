import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Clock, User, Download, RefreshCw, FileText, ChevronDown, 
  Check, ArrowRight, DollarSign, ShoppingCart, Layers, TrendingUp, 
  TrendingDown, Store, AlertCircle, Sparkles, Filter, CreditCard,
  Building2, Wallet, PackageCheck, Eye, Printer, Copy, CheckCircle2
} from 'lucide-react';
import { Product, Order, StoreUser, BankAccount, BankTransfer, Purchase } from '../types';
import { dbService, supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { parseUniversalDate } from '../lib/dateUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Helper to safely parse items array from DB or JSON string
const parseItemsArray = (rawItems: any): any[] => {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      return [];
    }
  }
  return [];
};

const getItemQty = (it: any): number => {
  const q = it.quantity ?? it.qty ?? it.cantidad ?? it.count ?? it.units ?? 1;
  const num = Number(q);
  return isNaN(num) || num <= 0 ? 1 : num;
};

const getItemName = (it: any): string => {
  return String(it.name || it.product_name || it.title || it.descripcion || it.product?.name || 'Producto').trim();
};

interface ReportesDiariosProps {
  products?: Product[];
  orders?: any[];
  cashOps?: any[];
  bcvRate?: number;
  currentUser?: StoreUser | null;
  storeUsers?: StoreUser[];
  onRefreshData?: () => void;
}

export default function ReportesDiariosPage({
  products: initialProducts = [],
  orders: initialOrders = [],
  cashOps: initialCashOps = [],
  bcvRate = 785.07,
  currentUser,
  storeUsers: initialStoreUsers = [],
  onRefreshData
}: ReportesDiariosProps) {
  // Tabs: 'ventas' | 'cuentas' | 'inventario'
  const [activeTab, setActiveTab] = useState<'ventas' | 'cuentas' | 'inventario'>('ventas');

  // Dates & Filter State
  const now = new Date();
  const todayStartStr = `${now.toISOString().split('T')[0]}T00:00`;
  const todayEndStr = `${now.toISOString().split('T')[0]}T23:59`;

  const [startDateTime, setStartDateTime] = useState<string>(todayStartStr);
  const [endDateTime, setEndDateTime] = useState<string>(todayEndStr);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Live Real-Time Data Collections
  const [ordersList, setOrdersList] = useState<any[]>(initialOrders);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [cashOpsList, setCashOpsList] = useState<any[]>(initialCashOps);
  const [bankAccountsList, setBankAccountsList] = useState<BankAccount[]>([]);
  const [bankTransfersList, setBankTransfersList] = useState<BankTransfer[]>([]);
  const [purchasesList, setPurchasesList] = useState<Purchase[]>([]);
  const [productsList, setProductsList] = useState<Product[]>(initialProducts);
  const [storeUsersList, setStoreUsersList] = useState<StoreUser[]>(initialStoreUsers);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch all collections directly from Supabase / localStorage
  const loadAllRealtimeData = async () => {
    setIsLoading(true);
    try {
      const [
        ords,
        invs,
        ops,
        banks,
        transfers,
        purchases,
        prods,
        users
      ] = await Promise.all([
        dbService.getOrders().catch(() => []),
        dbService.getInvoices().catch(() => []),
        dbService.getCashOps().catch(() => []),
        dbService.getBankAccounts().catch(() => []),
        dbService.getBankTransfers().catch(() => []),
        dbService.getPurchases().catch(() => []),
        dbService.getProducts().catch(() => []),
        dbService.getStoreUsers().catch(() => [])
      ]);

      if (ords && Array.isArray(ords)) setOrdersList(ords);
      if (invs && Array.isArray(invs)) setInvoicesList(invs);
      if (ops && Array.isArray(ops)) setCashOpsList(ops);
      if (banks && Array.isArray(banks)) setBankAccountsList(banks);
      if (transfers && Array.isArray(transfers)) setBankTransfersList(transfers);
      if (purchases && Array.isArray(purchases)) setPurchasesList(purchases);
      if (prods && Array.isArray(prods)) setProductsList(prods);
      if (users && Array.isArray(users)) setStoreUsersList(users);
    } catch (err) {
      console.error('Error loading reportes diarios data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load and Real-Time Subscriptions
  useEffect(() => {
    loadAllRealtimeData();

    // 1. Listen to Supabase Postgres Changes
    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel('reportes_diarios_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_ops' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transfers' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => loadAllRealtimeData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadAllRealtimeData())
        .subscribe();
    }

    // 2. Custom local window events
    const handleEvents = () => loadAllRealtimeData();
    window.addEventListener('bellavista_orders_updated', handleEvents);
    window.addEventListener('bellavista_cash_ops_updated', handleEvents);
    window.addEventListener('bellavista_bank_accounts_updated', handleEvents);
    window.addEventListener('bellavista_bank_transfers_updated', handleEvents);
    window.addEventListener('bellavista_purchases_updated', handleEvents);
    window.addEventListener('bellavista_products_updated', handleEvents);
    window.addEventListener('storage', handleEvents);

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
      window.removeEventListener('bellavista_orders_updated', handleEvents);
      window.removeEventListener('bellavista_cash_ops_updated', handleEvents);
      window.removeEventListener('bellavista_bank_accounts_updated', handleEvents);
      window.removeEventListener('bellavista_bank_transfers_updated', handleEvents);
      window.removeEventListener('bellavista_purchases_updated', handleEvents);
      window.removeEventListener('bellavista_products_updated', handleEvents);
      window.removeEventListener('storage', handleEvents);
    };
  }, []);

  // Filter helper for timestamps with robust universal date parsing
  const isDateInRange = (dateVal?: any) => {
    if (!dateVal) return true;
    if (!startDateTime && !endDateTime) return true;

    const parsedDate = parseUniversalDate(dateVal) || new Date(dateVal);
    if (!parsedDate || isNaN(parsedDate.getTime())) return true;

    const itemTime = parsedDate.getTime();
    const start = startDateTime ? (parseUniversalDate(startDateTime)?.getTime() || new Date(startDateTime).getTime()) : 0;
    const end = endDateTime ? (parseUniversalDate(endDateTime)?.getTime() || new Date(endDateTime).getTime()) : Infinity;

    return itemTime >= start && itemTime <= end;
  };

  // Distinct list of users detected in system
  const availableUsers = useMemo(() => {
    const userMap = new Map<string, string>();
    
    // From store users
    storeUsersList.forEach(u => {
      if (u.name) userMap.set(u.name.toLowerCase().trim(), u.name);
    });
    
    // From orders created_by
    ordersList.forEach(o => {
      const creator = o.created_by || o.cashier_name || o.seller_name;
      if (creator && typeof creator === 'string') {
        userMap.set(creator.toLowerCase().trim(), creator);
      }
    });

    // From invoices
    invoicesList.forEach(i => {
      const creator = i.created_by || i.cashier_name;
      if (creator && typeof creator === 'string') {
        userMap.set(creator.toLowerCase().trim(), creator);
      }
    });

    if (currentUser?.name) {
      userMap.set(currentUser.name.toLowerCase().trim(), currentUser.name);
    }

    // Default fallback if empty
    if (userMap.size === 0) {
      userMap.set('administrador', 'Administrador');
    }

    return Array.from(userMap.values());
  }, [storeUsersList, ordersList, invoicesList, currentUser]);

  // Match user filter
  const matchesUser = (creator?: string | null) => {
    if (selectedUser === 'all') return true;
    if (!creator) return false;
    return creator.toLowerCase().trim() === selectedUser.toLowerCase().trim();
  };

  // -------------------------------------------------------------
  // TAB 1: VENTAS (Reporte de ventas)
  // -------------------------------------------------------------
  const filteredSales = useMemo(() => {
    const result: {
      id: string;
      orderCode: string;
      customer: string;
      channel: string;
      date: string;
      rawDate: string;
      createdBy: string;
      total: number;
      cost: number;
      profit: number;
    }[] = [];

    // Map Product Costs for profit calculations
    const productCostMap = new Map<string, number>();
    productsList.forEach(p => {
      if (p.id) {
        productCostMap.set(String(p.id).toLowerCase().trim(), Number(p.cost_price || p.price * 0.6 || 0));
      }
      if (p.name) {
        productCostMap.set(p.name.toLowerCase().trim(), Number(p.cost_price || p.price * 0.6 || 0));
      }
    });

    // 1. Process regular Orders (Online / Pedidos)
    ordersList.forEach(ord => {
      if (['cancelled', 'anulado', 'rechazado'].includes((ord.status || '').toLowerCase())) return;
      if (!isDateInRange(ord.created_at || ord.date || ord.fecha)) return;
      
      const creator = ord.created_by || ord.cashier_name || ord.seller_name || 'Administrador';
      if (!matchesUser(creator)) return;

      const orderTotal = Number(ord.total_price || ord.total || 0);

      // Compute total item costs for this order
      let orderCost = 0;
      const itemsArr = parseItemsArray(ord.items);
      if (itemsArr.length > 0) {
        itemsArr.forEach((it: any) => {
          const pId = String(it.product_id || it.id || '').toLowerCase().trim();
          const pName = getItemName(it).toLowerCase().trim();
          const unitCost = productCostMap.get(pId) || productCostMap.get(pName) || Number(it.cost_price || (it.price * 0.6) || 0);
          orderCost += unitCost * getItemQty(it);
        });
      } else {
        orderCost = orderTotal * 0.6;
      }

      const orderProfit = Math.max(0, orderTotal - orderCost);

      // Build explicit document code linked with ORD-
      const rawNum = String(ord.order_number || ord.id || '').trim();
      let formattedCode = '';
      if (rawNum.toUpperCase().startsWith('ORD-') || rawNum.toUpperCase().startsWith('FAC-') || rawNum.toUpperCase().startsWith('NE-')) {
        formattedCode = rawNum.toUpperCase();
      } else {
        const digits = rawNum.replace(/\D/g, '');
        formattedCode = `ORD-${(digits || '1').padStart(6, '0')}`;
      }

      const dateObj = parseUniversalDate(ord.created_at || ord.date || ord.fecha) || new Date();
      const dateFormatted = dateObj.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) + ', ' + dateObj.toLocaleTimeString('es-VE', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      result.push({
        id: ord.id || `ord-${Math.random()}`,
        orderCode: formattedCode,
        customer: ord.customer_name || ord.customer?.name || ord.phone_number || ord.client_name || '-',
        channel: ord.sales_channel || ord.channel || (ord.delivery_method === 'retiro' ? 'Tienda' : 'Online'),
        date: dateFormatted,
        rawDate: (ord.created_at || ord.date || new Date()).toString(),
        createdBy: creator,
        total: orderTotal,
        cost: orderCost,
        profit: orderProfit
      });
    });

    // 2. Process POS Invoices & Notas de Entrega (Ventas directas en caja)
    invoicesList.forEach(inv => {
      if (['anulado', 'cancelled'].includes((inv.status || '').toLowerCase())) return;
      if (!isDateInRange(inv.created_at || inv.date || inv.fecha)) return;

      const creator = inv.created_by || inv.cashier_name || 'Administrador';
      if (!matchesUser(creator)) return;

      const invTotal = Number(inv.total_usd || (inv.total_bs ? inv.total_bs / bcvRate : 0) || inv.total || 0);
      let invCost = 0;
      const itemsArr = parseItemsArray(inv.items);
      if (itemsArr.length > 0) {
        itemsArr.forEach((it: any) => {
          const pId = String(it.product_id || it.id || '').toLowerCase().trim();
          const pName = getItemName(it).toLowerCase().trim();
          const unitCost = productCostMap.get(pId) || productCostMap.get(pName) || Number(it.cost_price || (it.price * 0.6) || 0);
          invCost += unitCost * getItemQty(it);
        });
      } else {
        invCost = invTotal * 0.6;
      }
      const invProfit = Math.max(0, invTotal - invCost);

      // Build explicit document code linked with FAC- or NE-
      const controlNum = String(inv.control_number || inv.invoice_number || inv.numero || inv.id || '').trim().toUpperCase();
      const isNotaEntrega = inv.document_type === 'nota_entrega' || controlNum.startsWith('NE-');
      let formattedCode = '';
      if (controlNum.startsWith('FAC-') || controlNum.startsWith('NE-') || controlNum.startsWith('ORD-')) {
        formattedCode = controlNum;
      } else {
        const digits = controlNum.replace(/\D/g, '');
        const padded = (digits || '1').padStart(6, '0');
        formattedCode = isNotaEntrega ? `NE-${padded}` : `FAC-${padded}`;
      }

      const dateObj = parseUniversalDate(inv.created_at || inv.date || inv.fecha) || new Date();
      const dateFormatted = dateObj.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) + ', ' + dateObj.toLocaleTimeString('es-VE', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      result.push({
        id: inv.id || `inv-${Math.random()}`,
        orderCode: formattedCode,
        customer: inv.customer_name || inv.client_name || inv.cliente || '-',
        channel: inv.sales_channel || (isNotaEntrega ? 'Nota de Entrega' : 'POS Tienda'),
        date: dateFormatted,
        rawDate: (inv.created_at || inv.date || new Date()).toString(),
        createdBy: creator,
        total: invTotal,
        cost: invCost,
        profit: invProfit
      });
    });

    // Sort by latest first
    return result.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [ordersList, invoicesList, productsList, startDateTime, endDateTime, selectedUser, bcvRate]);

  // Ventas metrics summary
  const ventasMetrics = useMemo(() => {
    const count = filteredSales.length;
    const ingresos = filteredSales.reduce((sum, item) => sum + item.total, 0);
    const utilidad = filteredSales.reduce((sum, item) => sum + item.profit, 0);

    return { count, ingresos, utilidad };
  }, [filteredSales]);


  // Helper to format currency accurately (Bs. for VES, $ for USD)
  const formatCurrency = (val: number, curr: string = 'USD') => {
    const num = Number(val) || 0;
    if (curr === 'VES') {
      return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // -------------------------------------------------------------
  // TAB 2: CUENTAS (Reporte de cuentas)
  // Totalmente conectado a la base de datos de Supabase sin simulaciones.
  // Cuentas en bolívares muestran montos en Bs. y cuentas en dólares en $.
  // -------------------------------------------------------------
  const accountCards = useMemo(() => {
    const cards: {
      id: string;
      title: string;
      ingresos: number;
      salidas: number;
      diferencia: number;
      totalEnCuenta: number;
      currency: 'USD' | 'VES';
    }[] = [];

    // Map each bank/cash account directly from Supabase bank_accounts (active only)
    bankAccountsList.filter(acc => acc.is_active !== false).forEach(acc => {
      const lowerName = (acc.name || acc.bank_name || '').toLowerCase().trim();
      const isUSD = acc.currency === 'USD' || 
        lowerName.includes('dolar') || 
        lowerName.includes('usd') || 
        lowerName.includes('zelle') || 
        lowerName.includes('bofa');
      
      const accCurrency: 'USD' | 'VES' = isUSD ? 'USD' : 'VES';
      let accIngresos = 0;
      let accSalidas = 0;

      // 1. Movements from bank_transfers
      bankTransfersList.forEach(t => {
        if (!isDateInRange(t.created_at)) return;
        if (!matchesUser(t.created_by)) return;

        const isIncoming = t.to_account_id === acc.id || (t.to_account_name && t.to_account_name.toLowerCase().trim() === lowerName);
        const isOutgoing = t.from_account_id === acc.id || (t.from_account_name && t.from_account_name.toLowerCase().trim() === lowerName);

        if (isIncoming) {
          const amt = isUSD 
            ? Number(t.amount || 0) 
            : Number(t.amount_bs || t.converted_amount || t.amount || 0);
          accIngresos += amt;
        }

        if (isOutgoing) {
          const amt = isUSD 
            ? Number(t.amount || 0) 
            : Number(t.amount_bs || t.converted_amount || t.amount || 0);
          accSalidas += amt;
        }
      });

      // 2. Movements from cash_ops (for Cash Drawer accounts)
      if (lowerName === 'efectivo' || lowerName.includes('efectivo') || lowerName.includes('caja')) {
        cashOpsList.forEach(op => {
          if (!isDateInRange(op.created_at)) return;
          if (!matchesUser(op.created_by || op.empleado_nombre)) return;

          if (accCurrency === 'VES') {
            // Bolivares cash ops
            if (op.currency === 'VES' || Number(op.amount_bs) > 0 || (op.currency !== 'USD' && !op.currency_code?.includes('USD'))) {
              const amt = Number(op.amount_bs > 0 ? op.amount_bs : op.amount);
              if (op.type === 'ingreso') accIngresos += amt;
              else if (op.type === 'egreso') accSalidas += amt;
            }
          } else {
            // USD cash ops
            if (op.currency === 'USD' || op.currency_code === 'USD' || (op.currency !== 'VES' && Number(op.amount) > 0 && !op.amount_bs)) {
              const amt = Number(op.amount || 0);
              if (op.type === 'ingreso') accIngresos += amt;
              else if (op.type === 'egreso') accSalidas += amt;
            }
          }
        });
      }

      // 3. Sales income from orders & invoices assigned to this account
      ordersList.forEach(ord => {
        if (ord.status === 'cancelled' || ord.status === 'anulado') return;
        if (!isDateInRange(ord.created_at)) return;
        if (!matchesUser(ord.created_by || ord.cashier_name)) return;

        const pm = (ord.payment_method || '').toLowerCase().trim();
        let matched = false;

        if (ord.bank_account_id === acc.id) {
          matched = true;
        } else if (lowerName === 'efectivo' && (pm === 'efectivo' || pm === 'cash' || pm === 'efectivo_bs' || pm === '')) {
          matched = true;
        } else if ((lowerName.includes('dolar') || lowerName.includes('usd')) && (pm === 'efectivo_usd' || pm === 'efectivo_dolares' || pm === 'dolares' || pm === 'usd' || pm === 'cash_usd')) {
          matched = true;
        } else if ((lowerName.includes('venezuela') || lowerName.includes('bdv')) && (pm.includes('venezuela') || pm.includes('bdv'))) {
          matched = true;
        } else if (lowerName.includes('banesco') && pm.includes('banesco')) {
          matched = true;
        } else if (lowerName.includes('zelle') && pm.includes('zelle')) {
          matched = true;
        } else if (lowerName.includes('bofa') && (pm.includes('bofa') || pm.includes('bank of america'))) {
          matched = true;
        }

        if (matched) {
          const ordTotalUSD = Number(ord.total_price || ord.total || 0);
          const ordTotalVES = Number(ord.total_bs || ord.total_price_bs || (ordTotalUSD * (ord.bcv_rate || bcvRate || 1)));
          accIngresos += accCurrency === 'VES' ? ordTotalVES : ordTotalUSD;
        }
      });

      invoicesList.forEach(inv => {
        if (inv.status === 'cancelled' || inv.status === 'anulado') return;
        if (!isDateInRange(inv.created_at)) return;
        if (!matchesUser(inv.created_by || inv.cashier_name)) return;

        const pm = (inv.payment_method || '').toLowerCase().trim();
        let matched = false;

        if (inv.bank_account_id === acc.id) {
          matched = true;
        } else if (lowerName === 'efectivo' && (pm === 'efectivo' || pm === 'cash' || pm === 'efectivo_bs' || pm === '')) {
          matched = true;
        } else if ((lowerName.includes('dolar') || lowerName.includes('usd')) && (pm === 'efectivo_usd' || pm === 'efectivo_dolares' || pm === 'dolares' || pm === 'usd')) {
          matched = true;
        } else if ((lowerName.includes('venezuela') || lowerName.includes('bdv')) && (pm.includes('venezuela') || pm.includes('bdv'))) {
          matched = true;
        } else if (lowerName.includes('banesco') && pm.includes('banesco')) {
          matched = true;
        } else if (lowerName.includes('zelle') && pm.includes('zelle')) {
          matched = true;
        } else if (lowerName.includes('bofa') && (pm.includes('bofa') || pm.includes('bank of america'))) {
          matched = true;
        }

        if (matched) {
          const invTotalUSD = Number(inv.total_usd || inv.total || 0);
          const invTotalVES = Number(inv.total_bs || (invTotalUSD * (inv.bcv_rate || bcvRate || 1)));
          accIngresos += accCurrency === 'VES' ? invTotalVES : invTotalUSD;
        }
      });

      const accDiferencia = accIngresos - accSalidas;
      // Real balance from Supabase database (in Bs. if VES, in $ if USD)
      const realTotalEnCuenta = Number(acc.balance || 0);

      cards.push({
        id: acc.id,
        title: `${acc.name || acc.bank_name}:`,
        ingresos: accIngresos,
        salidas: accSalidas,
        diferencia: accDiferencia,
        totalEnCuenta: realTotalEnCuenta,
        currency: accCurrency
      });
    });

    return cards;
  }, [bankAccountsList, bankTransfersList, cashOpsList, ordersList, invoicesList, bcvRate, selectedUser, startDateTime, endDateTime]);

  // Overall Cuentas Totals (consolidating USD and VES accurately)
  const cuentasTotals = useMemo(() => {
    let ingresosUSD = 0;
    let salidasUSD = 0;
    let ingresosVES = 0;
    let salidasVES = 0;

    accountCards.forEach(c => {
      if (c.currency === 'VES') {
        ingresosVES += c.ingresos;
        salidasVES += c.salidas;
      } else {
        ingresosUSD += c.ingresos;
        salidasUSD += c.salidas;
      }
    });

    return {
      usd: {
        ingresos: ingresosUSD,
        salidas: salidasUSD,
        diferencia: ingresosUSD - salidasUSD
      },
      ves: {
        ingresos: ingresosVES,
        salidas: salidasVES,
        diferencia: ingresosVES - salidasVES
      }
    };
  }, [accountCards]);


  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // TAB 3: INVENTARIO (Reporte de inventario)
  // Solo registra los productos que se movieron, vendieron, nota de entrega,
  // tienda online (pedidos) o ajuste/compras de inventario en el período.
  // -------------------------------------------------------------
  const inventoryReportItems = useMemo(() => {
    // Map product metadata by ID, Name, and SKU
    const productMap = new Map<string, Product>();
    productsList.forEach(p => {
      if (p.id) productMap.set(String(p.id).toLowerCase().trim(), p);
      if (p.name) productMap.set(p.name.toLowerCase().trim(), p);
      if (p.sku) productMap.set(String(p.sku).toLowerCase().trim(), p);
    });

    const itemMovements = new Map<string, {
      id: string;
      name: string;
      unit: string;
      entradas: number;
      salidas: number;
      diferencia: number;
      totalEnInventario: number;
      hasActivity: boolean;
    }>();

    const getOrCreateEntry = (prodId?: string, prodName?: string, unit?: string, fallbackStock?: number) => {
      const rawId = String(prodId || '').toLowerCase().trim();
      const rawName = String(prodName || '').toLowerCase().trim();

      let matchedProd: Product | undefined = undefined;
      if (rawId && productMap.has(rawId)) {
        matchedProd = productMap.get(rawId);
      } else if (rawName && productMap.has(rawName)) {
        matchedProd = productMap.get(rawName);
      }

      const key = matchedProd?.id ? String(matchedProd.id).toLowerCase().trim() : (rawName || rawId || `item-${Math.random()}`);
      const resolvedName = matchedProd?.name || prodName || 'Producto General';
      const resolvedUnit = unit || matchedProd?.unit || 'Und.';
      const currentStock = matchedProd?.stock !== undefined ? Number(matchedProd.stock) : (fallbackStock !== undefined ? fallbackStock : 0);

      if (!itemMovements.has(key)) {
        itemMovements.set(key, {
          id: matchedProd?.id || key,
          name: resolvedName,
          unit: resolvedUnit,
          entradas: 0,
          salidas: 0,
          diferencia: 0,
          totalEnInventario: currentStock,
          hasActivity: false
        });
      }
      return itemMovements.get(key)!;
    };

    // 1. ENTRADAS: Compras y Ajustes de Inventario Positivos
    purchasesList.forEach(pur => {
      if (!isDateInRange(pur.created_at || pur.date)) return;
      if (!matchesUser(pur.created_by)) return;

      const itemsArr = parseItemsArray(pur.items);
      itemsArr.forEach((it: any) => {
        const qty = getItemQty(it);
        if (qty > 0) {
          const entry = getOrCreateEntry(it.product_id || it.id, getItemName(it), it.unit);
          entry.entradas += qty;
          entry.hasActivity = true;
        }
      });
    });

    // 2. SALIDAS: Pedidos de Tienda Online (Orders / B2C / Retiro)
    ordersList.forEach(ord => {
      if (['cancelled', 'anulado', 'rechazado'].includes((ord.status || '').toLowerCase())) return;
      if (!isDateInRange(ord.created_at || ord.date || ord.fecha)) return;
      if (!matchesUser(ord.created_by || ord.cashier_name || ord.seller_name)) return;

      const itemsArr = parseItemsArray(ord.items);
      itemsArr.forEach((it: any) => {
        const qty = getItemQty(it);
        if (qty > 0) {
          const entry = getOrCreateEntry(it.product_id || it.id || it.sku, getItemName(it), it.unit);
          entry.salidas += qty;
          entry.hasActivity = true;
        }
      });
    });

    // 3. SALIDAS: Facturas POS y Ventas Rápidas / Notas de Entrega en Caja
    invoicesList.forEach(inv => {
      if (['cancelled', 'anulado'].includes((inv.status || '').toLowerCase())) return;
      if (!isDateInRange(inv.created_at || inv.date || inv.fecha)) return;
      if (!matchesUser(inv.created_by || inv.cashier_name)) return;

      const itemsArr = parseItemsArray(inv.items);
      itemsArr.forEach((it: any) => {
        const qty = getItemQty(it);
        if (qty > 0) {
          const entry = getOrCreateEntry(it.product_id || it.id || it.sku, getItemName(it), it.unit);
          entry.salidas += qty;
          entry.hasActivity = true;
        }
      });
    });

    // 4. Filtrar y Calcular productos con movimiento (o todos si no hay ninguno filtrado)
    const movedItems = Array.from(itemMovements.values())
      .filter(it => it.hasActivity || it.entradas > 0 || it.salidas > 0)
      .map(it => {
        const dif = it.entradas - it.salidas;
        return {
          id: it.id,
          name: it.name,
          unit: it.unit,
          entradas: it.entradas,
          salidas: it.salidas,
          diferencia: dif,
          totalEnInventario: it.totalEnInventario
        };
      });

    return movedItems;
  }, [productsList, purchasesList, ordersList, invoicesList, startDateTime, endDateTime, selectedUser]);


  // -------------------------------------------------------------
  // PDF & EXCEL EXPORT (Descargar reporte)
  // -------------------------------------------------------------
  const handleDownloadReport = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const primaryColor: [number, number, number] = [108, 43, 217]; // #6C2BD9 Purple
      const darkColor: [number, number, number] = [17, 24, 39];

      // Header Banner
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('COPIAS BELLA VISTA - REPORTES DIARIOS', 14, 11);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Rango: ${startDateTime.replace('T', ' ')} hasta ${endDateTime.replace('T', ' ')}  |  Usuario: ${selectedUser === 'all' ? 'Todos los usuarios' : selectedUser}`, 14, 18);

      let currentY = 32;

      if (activeTab === 'ventas') {
        doc.setTextColor(...darkColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Reporte de Ventas', 14, currentY);

        currentY += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Órdenes: ${ventasMetrics.count}  |  Ingresos: $${ventasMetrics.ingresos.toFixed(2)}  |  Utilidad: $${ventasMetrics.utilidad.toFixed(2)}`, 14, currentY);

        currentY += 6;
        const tableBody = filteredSales.map(s => [
          s.orderCode,
          s.customer,
          s.channel,
          s.date,
          s.createdBy,
          `$${s.total.toFixed(2)}`
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Orden', 'Cliente', 'Canal de venta', 'Fecha de registro', 'Creado por', 'Precio']],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [108, 43, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8 }
        });
      } else if (activeTab === 'cuentas') {
        doc.setTextColor(...darkColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Reporte de Cuentas y Balances', 14, currentY);

        currentY += 6;
        const tableBody = accountCards.map(c => [
          c.title.replace(':', ''),
          formatCurrency(c.ingresos, c.currency),
          formatCurrency(c.salidas, c.currency),
          formatCurrency(c.diferencia, c.currency),
          formatCurrency(c.totalEnCuenta, c.currency)
        ]);

        if (cuentasTotals.usd.ingresos > 0 || cuentasTotals.usd.salidas > 0) {
          tableBody.push([
            'TOTALES (USD)',
            formatCurrency(cuentasTotals.usd.ingresos, 'USD'),
            formatCurrency(cuentasTotals.usd.salidas, 'USD'),
            formatCurrency(cuentasTotals.usd.diferencia, 'USD'),
            '-'
          ]);
        }

        if (cuentasTotals.ves.ingresos > 0 || cuentasTotals.ves.salidas > 0) {
          tableBody.push([
            'TOTALES (VES)',
            formatCurrency(cuentasTotals.ves.ingresos, 'VES'),
            formatCurrency(cuentasTotals.ves.salidas, 'VES'),
            formatCurrency(cuentasTotals.ves.diferencia, 'VES'),
            '-'
          ]);
        }

        autoTable(doc, {
          startY: currentY,
          head: [['Cuenta', 'Ingresos', 'Salidas', 'Diferencia', 'Total en cuenta']],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [108, 43, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8 }
        });
      } else {
        doc.setTextColor(...darkColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`Reporte de Inventario (${inventoryReportItems.length} items)`, 14, currentY);

        currentY += 6;
        const tableBody = inventoryReportItems.map(it => [
          it.name,
          `${it.entradas} ${it.unit}`,
          `${it.salidas} ${it.unit}`,
          `${it.diferencia} ${it.unit}`,
          `${it.totalEnInventario} ${it.unit}`
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Item', 'Entradas', 'Salidas', 'Diferencia', 'Total en inventario']],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [108, 43, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8 }
        });
      }

      doc.save(`Reporte_Diario_${activeTab}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setIsExporting(false);
    }
  };

  // SQL Script text for Supabase
  const supabaseSqlScript = `-- =========================================================================
-- SCRIPT DE MIGRACIÓN SUPABASE: TABLAS Y REALTIME PARA REPORTES DIARIOS
-- Copias Bella Vista
-- =========================================================================

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Cuentas Bancarias
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'VES',
    account_number VARCHAR(100),
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Movimientos / Transferencias Bancarias
CREATE TABLE IF NOT EXISTS public.bank_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    from_account_name VARCHAR(255),
    to_account_name VARCHAR(255),
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'VES',
    exchange_rate NUMERIC(15, 4),
    converted_amount NUMERIC(15, 2),
    fee NUMERIC(15, 2) DEFAULT 0.00,
    reference VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(255) DEFAULT 'Administrador',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Órdenes / Ventas
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number BIGINT GENERATED BY DEFAULT AS IDENTITY,
    customer_name VARCHAR(255),
    phone_number VARCHAR(100),
    delivery_method VARCHAR(50) DEFAULT 'retiro',
    sales_channel VARCHAR(100) DEFAULT 'Principal',
    status VARCHAR(50) DEFAULT 'completada',
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    items JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(255) DEFAULT 'Administrador',
    payment_method VARCHAR(100) DEFAULT 'efectivo',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de Facturas POS (Ventas Rápidas)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(100),
    customer_name VARCHAR(255),
    total_usd NUMERIC(15, 2) DEFAULT 0.00,
    total_bs NUMERIC(15, 2) DEFAULT 0.00,
    sales_channel VARCHAR(100) DEFAULT 'POS Tienda',
    items JSONB DEFAULT '[]'::jsonb,
    cashier_name VARCHAR(255) DEFAULT 'Administrador',
    created_by VARCHAR(255) DEFAULT 'Administrador',
    payment_method VARCHAR(100) DEFAULT 'efectivo',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de Compras e Inventario
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_number VARCHAR(100),
    provider_name VARCHAR(255),
    total_amount NUMERIC(15, 2) DEFAULT 0.00,
    items JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'completada',
    created_by VARCHAR(255) DEFAULT 'Administrador',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Activar Realtime en todas las tablas clave de Finanzas
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_ops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
`;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-left pb-16 font-sans">
      {/* HEADER: TITLE */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
            REPORTES DIARIOS
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Monitoreo en tiempo real de ventas, movimientos de cuentas bancarias y flujo de inventario.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSqlModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
            title="Ver código SQL para Supabase"
          >
            <FileText className="w-4 h-4 text-[#005da9]" />
            <span>Código Supabase</span>
          </button>

          <button
            onClick={loadAllRealtimeData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98 disabled:opacity-50"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 text-[#005da9] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR CONTAINER */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
        {/* Quick Range Presets */}
        <div className="flex items-center gap-2 pb-2 overflow-x-auto border-b border-gray-100">
          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-violet-600" /> Rango rápido:
          </span>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              const dStr = n.toISOString().split('T')[0];
              setStartDateTime(`${dStr}T00:00`);
              setEndDateTime(`${dStr}T23:59`);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-montserrat font-bold bg-white text-[#1D3557] border border-slate-300 shadow-2xs hover:bg-slate-50 transition cursor-pointer active:scale-98"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              n.setDate(n.getDate() - 1);
              const dStr = n.toISOString().split('T')[0];
              setStartDateTime(`${dStr}T00:00`);
              setEndDateTime(`${dStr}T23:59`);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-montserrat font-bold bg-white text-[#1D3557] border border-slate-300 shadow-2xs hover:bg-slate-50 transition cursor-pointer active:scale-98"
          >
            Ayer
          </button>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              const day = n.getDay() || 7;
              n.setDate(n.getDate() - day + 1);
              const startStr = n.toISOString().split('T')[0];
              const todayStr = new Date().toISOString().split('T')[0];
              setStartDateTime(`${startStr}T00:00`);
              setEndDateTime(`${todayStr}T23:59`);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-montserrat font-bold bg-white text-[#1D3557] border border-slate-300 shadow-2xs hover:bg-slate-50 transition cursor-pointer active:scale-98"
          >
            Esta Semana
          </button>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              const firstDay = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split('T')[0];
              const todayStr = new Date().toISOString().split('T')[0];
              setStartDateTime(`${firstDay}T00:00`);
              setEndDateTime(`${todayStr}T23:59`);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-montserrat font-bold bg-white text-[#1D3557] border border-slate-300 shadow-2xs hover:bg-slate-50 transition cursor-pointer active:scale-98"
          >
            Este Mes
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDateTime('');
              setEndDateTime('');
            }}
            className="px-3 py-1.5 rounded-full text-xs font-montserrat font-bold bg-white text-[#1D3557] border border-slate-300 shadow-2xs hover:bg-slate-50 transition cursor-pointer active:scale-98"
          >
            Todo el Histórico
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Fecha y hora inicial */}
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              Fecha y hora incial:
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition outline-none"
              />
              <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Fecha y hora final */}
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              Fecha y hora final:
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition outline-none"
              />
              <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Usuarios Dropdown */}
          <div className="flex-1 min-w-[200px] space-y-1.5" ref={userDropdownRef}>
            <label className="block text-xs font-bold text-gray-700">
              Usuarios
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition flex items-center justify-between"
              >
                <span className="truncate">
                  {selectedUser === 'all' ? 'Usuarios seleccionados' : selectedUser}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </button>

              {isUserDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1.5 max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser('all');
                      setIsUserDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between hover:bg-violet-50 transition ${
                      selectedUser === 'all' ? 'text-violet-700 font-bold bg-violet-50/50' : 'text-gray-700'
                    }`}
                  >
                    <span>Todos los usuarios</span>
                    {selectedUser === 'all' && <Check className="w-3.5 h-3.5 text-violet-700" />}
                  </button>

                  {availableUsers.map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setIsUserDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between hover:bg-violet-50 transition ${
                        selectedUser.toLowerCase() === u.toLowerCase() ? 'text-violet-700 font-bold bg-violet-50/50' : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{u}</span>
                      {selectedUser.toLowerCase() === u.toLowerCase() && <Check className="w-3.5 h-3.5 text-violet-700" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Generar Button */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={loadAllRealtimeData}
              className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition active:scale-98 flex items-center gap-1.5 h-[41px] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-[#005da9] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Generar</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TABS AND MAIN CONTENT CONTAINER */}
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-200 px-2">
          <button
            type="button"
            onClick={() => setActiveTab('ventas')}
            className={`pb-3 text-xs font-bold tracking-tight transition relative ${
              activeTab === 'ventas'
                ? 'text-[#6C2BD9] border-b-2 border-[#6C2BD9]'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Ventas
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cuentas')}
            className={`pb-3 text-xs font-bold tracking-tight transition relative ${
              activeTab === 'cuentas'
                ? 'text-[#6C2BD9] border-b-2 border-[#6C2BD9]'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Cuentas
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inventario')}
            className={`pb-3 text-xs font-bold tracking-tight transition relative ${
              activeTab === 'inventario'
                ? 'text-[#6C2BD9] border-b-2 border-[#6C2BD9]'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Inventario
          </button>
        </div>

        {/* MAIN PANEL CONTENT */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xs space-y-6">
          {/* Top Bar inside Card: Title and Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              {activeTab === 'ventas' && (
                <h2 className="text-base font-bold text-gray-900">
                  Reporte de ventas
                </h2>
              )}
              {activeTab === 'cuentas' && (
                <h2 className="text-base font-bold text-gray-900">
                  Reporte de cuentas
                </h2>
              )}
              {activeTab === 'inventario' && (
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Reporte de inventario
                  </h2>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    {inventoryReportItems.length} items encontrados
                  </p>
                </div>
              )}
            </div>

            {/* Descargar reporte Button */}
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={isExporting}
              className="self-start sm:self-auto px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-2 active:scale-98 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[#005da9]" />
              <span>Descargar reporte</span>
            </button>
          </div>

          {/* TAB 1: VENTAS */}
          {activeTab === 'ventas' && (
            <div className="space-y-8">
              {/* 3 Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Ordenes */}
                <div className="rounded-2xl p-6 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs hover:shadow-xs flex flex-col justify-between h-32 transition-all">
                  <span className="text-sm font-montserrat font-bold text-[#1D3557]">
                    Ordenes:
                  </span>
                  <span className="text-3xl font-black text-[#1D3557] tracking-tight">
                    {ventasMetrics.count}
                  </span>
                </div>

                {/* Ingresos */}
                <div className="rounded-2xl p-6 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs hover:shadow-xs flex flex-col justify-between h-32 transition-all">
                  <span className="text-sm font-montserrat font-bold text-[#1D3557]">
                    Ingresos:
                  </span>
                  <span className="text-3xl font-black text-[#1D3557] tracking-tight">
                    ${(Number(ventasMetrics?.ingresos) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Utilidad */}
                <div className="rounded-2xl p-6 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs hover:shadow-xs flex flex-col justify-between h-32 transition-all">
                  <span className="text-sm font-montserrat font-bold text-[#1D3557]">
                    Utilidad:
                  </span>
                  <span className="text-3xl font-black text-[#1D3557] tracking-tight">
                    ${(Number(ventasMetrics?.utilidad) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Table of Orders */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-700 font-bold">
                      <th className="py-3 px-3">Orden</th>
                      <th className="py-3 px-3">Cliente</th>
                      <th className="py-3 px-3">Canal de venta</th>
                      <th className="py-3 px-3">Fecha de registro</th>
                      <th className="py-3 px-3">Creado por</th>
                      <th className="py-3 px-3 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-600 font-medium">
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                          No se encontraron órdenes registradas en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50/50 transition">
                          <td className="py-3.5 px-3 font-semibold text-gray-800">
                            {sale.orderCode}
                          </td>
                          <td className="py-3.5 px-3 text-gray-700">
                            {sale.customer}
                          </td>
                          <td className="py-3.5 px-3 text-gray-600">
                            {sale.channel}
                          </td>
                          <td className="py-3.5 px-3 text-gray-500">
                            {sale.date}
                          </td>
                          <td className="py-3.5 px-3 text-gray-700">
                            {sale.createdBy}
                          </td>
                          <td className="py-3.5 px-3 text-right font-bold text-gray-900">
                            ${(Number(sale?.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t border-gray-50">
                <p className="text-[11px] text-gray-400 font-medium">
                  Reporte de ventas generado. Total de ordenes creadas.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: CUENTAS */}
          {activeTab === 'cuentas' && (
            <div className="space-y-8">
              {/* Account Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {accountCards.map(acc => (
                  <div 
                    key={acc.id}
                    className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4"
                  >
                    <h3 className="text-sm font-bold text-gray-900">
                      {acc.title}
                    </h3>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Ingresos:</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(acc.ingresos, acc.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Salidas:</span>
                        <span className="font-bold text-rose-600">
                          {formatCurrency(acc.salidas, acc.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Diferencia:</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(acc.diferencia, acc.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-gray-600 font-medium">Total en cuenta:</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(acc.totalEnCuenta, acc.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Totales Card */}
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-gray-900">
                    Totales:
                  </h3>

                  <div className="space-y-3 text-xs">
                    {/* Dolares Totals if USD transactions exist or default */}
                    <div className="space-y-1.5 pb-2 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Ingresos:</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(cuentasTotals.usd.ingresos, 'USD')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Salidas:</span>
                        <span className="font-bold text-rose-600">
                          {formatCurrency(cuentasTotals.usd.salidas, 'USD')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Diferencia:</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(cuentasTotals.usd.diferencia, 'USD')}
                        </span>
                      </div>
                    </div>

                    {/* Bolivares Totals if VES transactions exist */}
                    {(cuentasTotals.ves.ingresos > 0 || cuentasTotals.ves.salidas > 0 || cuentasTotals.ves.diferencia !== 0) && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 font-medium">Ingresos (Bs):</span>
                          <span className="font-bold text-emerald-600">
                            {formatCurrency(cuentasTotals.ves.ingresos, 'VES')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 font-medium">Salidas (Bs):</span>
                          <span className="font-bold text-rose-600">
                            {formatCurrency(cuentasTotals.ves.salidas, 'VES')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 font-medium">Diferencia (Bs):</span>
                          <span className="font-bold text-gray-900">
                            {formatCurrency(cuentasTotals.ves.diferencia, 'VES')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INVENTARIO */}
          {activeTab === 'inventario' && (
            <div className="space-y-8">
              {/* Inventory Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-700 font-bold">
                      <th className="py-3 px-3">Item</th>
                      <th className="py-3 px-3">Entradas</th>
                      <th className="py-3 px-3">Salidas</th>
                      <th className="py-3 px-3">Diferencia</th>
                      <th className="py-3 px-3 text-right">Total en inventario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-600 font-medium">
                    {inventoryReportItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                          No se registraron movimientos de inventario (ventas, notas de entrega, pedidos online o compras/ajustes) en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      inventoryReportItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition">
                          <td className="py-3.5 px-3 font-semibold text-gray-800">
                            {item.name}
                          </td>
                          <td className="py-3.5 px-3 text-emerald-600 font-semibold">
                            {item.entradas} {item.unit}
                          </td>
                          <td className="py-3.5 px-3 text-rose-600 font-semibold">
                            {item.salidas} {item.unit}
                          </td>
                          <td className="py-3.5 px-3 text-gray-800 font-semibold">
                            {item.diferencia} {item.unit}
                          </td>
                          <td className="py-3.5 px-3 text-right font-bold text-gray-900">
                            {item.totalEnInventario} {item.unit}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t border-gray-50">
                <p className="text-[11px] text-gray-400 font-medium">
                  Reporte de inventario dinámico: solo incluye productos con entradas (compras/ajustes) o salidas (ventas POS, tienda online o notas de entrega) en el período consultado.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SQL CODE MODAL FOR SUPABASE */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-50 text-violet-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Script SQL para Supabase (Realtime & Tablas)
                  </h3>
                  <p className="text-[11px] text-gray-400 font-medium">
                    Ejecuta este script en el SQL Editor de tu proyecto en Supabase para sincronización en tiempo real.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-900 rounded-2xl p-4 text-emerald-400 font-mono text-[11px] leading-relaxed select-all">
              <pre>{supabaseSqlScript}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-gray-500">
                Copia y pega en Supabase &gt; SQL Editor &gt; Run
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(supabaseSqlScript);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="px-5 py-2 bg-[#6C2BD9] hover:bg-[#5B21B6] text-white text-xs font-bold rounded-xl transition flex items-center gap-2"
              >
                {copiedSql ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar código SQL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
