import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Download,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Building2,
  DollarSign,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Truck,
  Globe,
  Receipt,
  Eye,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Printer,
  Copy,
  Check,
  Filter,
  ArrowUpRight,
  HelpCircle,
  Coins,
  ShieldCheck,
  Package,
  Award,
  Sparkles,
  Percent,
  ArrowUpDown,
  SlidersHorizontal
} from 'lucide-react';
import { BankAccount, Invoice, Order, StoreUser, BusinessProfile } from '../types';
import { dbService } from '../lib/supabase';
import { formatCurrency, CurrencyCode } from '../lib/currency';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import SalesLibroVentasTab from './sales-report/SalesLibroVentasTab';
import SalesAlicuotasTab from './sales-report/SalesAlicuotasTab';
import SalesMetodoPagoTab from './sales-report/SalesMetodoPagoTab';
import SalesTopProductosTab from './sales-report/SalesTopProductosTab';
import SalesTransactionModal from './sales-report/SalesTransactionModal';

export interface UnifiedSaleTransaction {
  id: string;
  sourceType: 'factura' | 'nota_entrega' | 'pedido_online' | 'cuenta_cobrar';
  sourceId?: string;
  controlNumber: string;
  date: string;
  customerName: string;
  customerRif?: string;
  customerPhone?: string;
  itemsCount: number;
  itemsSummary: string;
  itemsDetail: any[];
  subtotal: number;
  iva: number;
  igtf: number;
  totalUsd: number;
  totalVes: number;
  bcvRate: number;
  paymentMethodText: string;
  bankAccountAllocations: {
    bankAccountId?: string;
    bankAccountName: string;
    currency: 'USD' | 'VES' | string;
    amount: number; // in native currency of the account
    amountUsd: number;
    amountVes: number;
  }[];
  status: string;
  createdBy?: string;
  notes?: string;
  isCredit?: boolean;
  rawRecord: any;
}

export interface BankAccountSummary {
  id: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  accountType?: string;
  currency: string;
  nativeTotal: number;
  totalUsd: number;
  totalVes: number;
  count: number;
  percentage: number;
  isCash?: boolean;
}

export interface TopProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  totalUnits: number;
  totalRevenueUsd: number;
  totalRevenueVes: number;
  ticketsCount: number;
  currentStock: number | string;
  avgPriceUsd: number;
  percentage: number;
  unitsBySource: {
    facturas: number;
    notas: number;
    pedidos: number;
    credito: number;
  };
  revenueBySource: {
    facturas: number;
    notas: number;
    pedidos: number;
    credito: number;
  };
}

interface SalesReportPageProps {
  bankAccounts?: BankAccount[];
  activeCurrency?: CurrencyCode;
  currencyRates?: Record<CurrencyCode, number>;
  currentUser?: StoreUser | null;
}

type DateRangePreset = 'hoy' | 'ayer' | 'esta_semana' | 'este_mes' | 'mes_anterior' | 'ultimos_30' | 'todo' | 'personalizado';

export default function SalesReportPage({
  bankAccounts: initialBankAccounts = [],
  activeCurrency = 'USD',
  currencyRates = { USD: 1, VES: 791.66, EUR: 0.92, COP: 4100 },
  currentUser
}: SalesReportPageProps) {
  // -------------------------------------------------------------
  // TABS STATE: 'libro_ventas' | 'metodo_pago' | 'top_productos'
  // -------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'libro_ventas' | 'metodo_pago' | 'top_productos'>('libro_ventas');

  // -------------------------------------------------------------
  // STATES
  // -------------------------------------------------------------
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [draftInvoices, setDraftInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accountsReceivable, setAccountsReceivable] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialBankAccounts);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Date filters
  const [datePreset, setDatePreset] = useState<DateRangePreset>('este_mes');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Table filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'factura' | 'nota_entrega' | 'pedido_online' | 'credito'>('all');
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Top Products filters
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [productSortBy, setProductSortBy] = useState<'units' | 'revenue'>('revenue');
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [topProductsLimit, setTopProductsLimit] = useState<'top10' | 'top20' | 'all'>('top10');

  // Tax filter
  const [taxFilter, setTaxFilter] = useState<'all' | 'gravadas' | 'exentas' | 'con_igtf'>('all');

  // Modal detail
  const [selectedTransaction, setSelectedTransaction] = useState<UnifiedSaleTransaction | null>(null);

  // -------------------------------------------------------------
  // DATA FETCHING & SYNCHRONIZATION
  // -------------------------------------------------------------
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [invRes, draftRes, ordRes, cxcRes, bankRes, profRes, prodRes] = await Promise.all([
        dbService.getInvoices().catch(() => []),
        dbService.getDraftInvoices().catch(() => []),
        dbService.getOrders().catch(() => []),
        dbService.getAccountsReceivable().catch(() => []),
        dbService.getBankAccounts().catch(() => []),
        dbService.getBusinessProfile().catch(() => null),
        dbService.getProducts().catch(() => [])
      ]);

      setInvoices(invRes || []);
      setDraftInvoices(draftRes || []);
      setOrders(ordRes || []);
      setAccountsReceivable(cxcRes || []);
      if (bankRes && bankRes.length > 0) {
        setBankAccounts(bankRes);
      }
      if (profRes) {
        setBusinessProfile(profRes);
      }
      if (prodRes && prodRes.length > 0) {
        setProducts(prodRes);
      }
    } catch (e) {
      console.error('Error fetching sales report data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    const handleDataUpdate = () => {
      loadAllData();
    };

    window.addEventListener('bellavista_invoices_updated', handleDataUpdate);
    window.addEventListener('bellavista_draft_invoices_updated', handleDataUpdate);
    window.addEventListener('bellavista_orders_updated', handleDataUpdate);
    window.addEventListener('bellavista_accounts_receivable_updated', handleDataUpdate);
    window.addEventListener('bellavista_bank_accounts_updated', handleDataUpdate);

    return () => {
      window.removeEventListener('bellavista_invoices_updated', handleDataUpdate);
      window.removeEventListener('bellavista_draft_invoices_updated', handleDataUpdate);
      window.removeEventListener('bellavista_orders_updated', handleDataUpdate);
      window.removeEventListener('bellavista_accounts_receivable_updated', handleDataUpdate);
      window.removeEventListener('bellavista_bank_accounts_updated', handleDataUpdate);
    };
  }, []);

  // -------------------------------------------------------------
  // DATE PRESET HANDLER
  // -------------------------------------------------------------
  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'hoy') {
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'ayer') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'esta_semana') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    } else if (preset === 'este_mes') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(startOfMonth.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    } else if (preset === 'mes_anterior') {
      const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(startPrevMonth.toISOString().split('T')[0]);
      setEndDate(endPrevMonth.toISOString().split('T')[0]);
    } else if (preset === 'ultimos_30') {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      setStartDate(d30.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    } else if (preset === 'todo') {
      setStartDate('2020-01-01');
      setEndDate(new Date(now.getFullYear() + 1, 11, 31).toISOString().split('T')[0]);
    }
  };

  // -------------------------------------------------------------
  // ONLY PRESENT ACTIVE BANK ACCOUNTS FROM CUENTAS BANCARIAS
  // -------------------------------------------------------------
  const activeBankAccounts = useMemo(() => {
    return (bankAccounts || []).filter(acc => acc.is_active !== false);
  }, [bankAccounts]);

  const resolveActiveAccount = (identifier?: string, paymentMethodName?: string, isVesDefault: boolean = false) => {
    if (!activeBankAccounts || activeBankAccounts.length === 0) return null;

    const idClean = (identifier || '').trim();
    const pmClean = (paymentMethodName || '').trim().toLowerCase();

    // 1. Direct ID match in active bank accounts
    if (idClean) {
      const byId = activeBankAccounts.find(a => a.id === idClean);
      if (byId) return byId;
    }

    // 2. Direct Name / Bank Name match in active bank accounts
    if (idClean) {
      const byName = activeBankAccounts.find(a => 
        a.name.toLowerCase() === idClean.toLowerCase() || 
        (a.bank_name && a.bank_name.toLowerCase() === idClean.toLowerCase())
      );
      if (byName) return byName;
    }

    // 3. Match from payment method text against active bank accounts
    if (pmClean) {
      const byPmName = activeBankAccounts.find(a => 
        pmClean.includes(a.name.toLowerCase()) || 
        (a.bank_name && pmClean.includes(a.bank_name.toLowerCase()))
      );
      if (byPmName) return byPmName;

      // Check sub-methods configured in account notes
      for (const a of activeBankAccounts) {
        if (a.notes) {
          try {
            const methods = JSON.parse(a.notes);
            if (Array.isArray(methods)) {
              const matchedSub = methods.some((m: any) => 
                (m.name && pmClean.includes(m.name.toLowerCase())) ||
                (m.id && pmClean.includes(m.id.toLowerCase())) ||
                (m.type && pmClean.includes(m.type.toLowerCase()))
              );
              if (matchedSub) return a;
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }

      // Keyword heuristics matching active accounts by currency/type
      if (pmClean.includes('zelle') || pmClean.includes('dolar') || pmClean.includes('usd') || pmClean.includes('cash_usd') || pmClean.includes('bofa')) {
        const usdAcc = activeBankAccounts.find(a => a.currency === 'USD');
        if (usdAcc) return usdAcc;
      }
      if (pmClean.includes('pago movil') || pmClean.includes('pagomovil') || pmClean.includes('punto') || pmClean.includes('pos') || pmClean.includes('transferencia') || pmClean.includes('ves') || pmClean.includes('bs')) {
        const vesAcc = activeBankAccounts.find(a => a.currency === 'VES');
        if (vesAcc) return vesAcc;
      }
    }

    // 4. Fallback to active account matching the transaction currency
    const byCur = activeBankAccounts.find(a => isVesDefault ? a.currency === 'VES' : a.currency === 'USD');
    if (byCur) return byCur;

    return activeBankAccounts[0] || null;
  };

  // -------------------------------------------------------------
  // UNIFY ALL SALES OPERATIONS (Facturas, Notas de Entrega, Pedidos, Cuentas por Cobrar)
  // -------------------------------------------------------------
  const allUnifiedTransactions: UnifiedSaleTransaction[] = useMemo(() => {
    const list: UnifiedSaleTransaction[] = [];
    const activeBcv = currencyRates.VES || 791.66;
    const processedCodes = new Set<string>();
    const processedIds = new Set<string>();

    // 1. Process Invoices (Facturas normales, Notas de entrega registradas, Ventas a Crédito / CxC)
    invoices.forEach((inv: any) => {
      const rawDate = inv.created_at || new Date().toISOString();
      const isNota = inv.document_type === 'nota_entrega' || inv.control_number?.startsWith('NE-') || inv.invoice_number?.startsWith('NE-');
      const isCredit = Boolean(
        inv.is_credit ||
        inv.payment_method?.toLowerCase().includes('crédito') ||
        inv.payment_method?.toLowerCase().includes('credito') ||
        inv.bank_account_id === 'cxc-virtual' ||
        inv.notes?.toLowerCase().includes('crédito') ||
        inv.notes?.toLowerCase().includes('credito')
      );

      const docType: 'factura' | 'nota_entrega' = isNota ? 'nota_entrega' : 'factura';
      const rate = inv.bcv_rate && inv.bcv_rate > 0 ? inv.bcv_rate : activeBcv;

      const totalUsd = Number(inv.total) || 0;
      const totalVes = Number(inv.totals_by_currency?.VES) || (totalUsd * rate);

      // Extract items info
      let items: any[] = [];
      if (Array.isArray(inv.items)) {
        items = inv.items;
      } else if (typeof inv.items === 'string') {
        try {
          items = JSON.parse(inv.items);
        } catch (e) {
          items = [];
        }
      }

      const itemsSummary = items.length > 0
        ? items.map(it => `${it.quantity || it.qty || 1}x ${it.name || it.product_name || 'Item'}`).slice(0, 3).join(', ') + (items.length > 3 ? ` (+${items.length - 3} más)` : '')
        : (inv.notes || 'Venta de productos');

      // Bank account allocations
      const allocations: UnifiedSaleTransaction['bankAccountAllocations'] = [];

      if (inv.split_payments && Array.isArray(inv.split_payments) && inv.split_payments.length > 0) {
        inv.split_payments.forEach((sp: any) => {
          const isVes = sp.currency === 'VES' || sp.method?.toLowerCase().includes('ves') || sp.method?.toLowerCase().includes('bs') || sp.method?.toLowerCase().includes('pago móvil') || sp.method?.toLowerCase().includes('pagomovil');
          const matchedBank = resolveActiveAccount(sp.bankAccountId, sp.method || sp.bank_account_name, isVes);
          const bankName = matchedBank?.name || sp.bank_account_name || sp.method || 'Cuenta Activa';
          const bankId = matchedBank?.id || sp.bankAccountId;
          const isVesFinal = matchedBank ? matchedBank.currency === 'VES' : isVes;
          const rawAmt = Number(sp.amount) || 0;
          const amtUsd = isVesFinal ? (rawAmt / rate) : rawAmt;
          const amtVes = isVesFinal ? rawAmt : (rawAmt * rate);

          allocations.push({
            bankAccountId: bankId,
            bankAccountName: bankName,
            currency: isVesFinal ? 'VES' : 'USD',
            amount: rawAmt,
            amountUsd: amtUsd,
            amountVes: amtVes
          });
        });
      } else {
        const isVes = inv.currency_code === 'VES' || inv.payment_method?.toLowerCase().includes('ves') || inv.payment_method?.toLowerCase().includes('pago móvil') || inv.payment_method?.toLowerCase().includes('pagomovil') || inv.payment_method?.toLowerCase().includes('bs') || inv.payment_method?.toLowerCase().includes('punto');
        const matchedBank = resolveActiveAccount(inv.bank_account_id, inv.payment_method || inv.bank_account_name, isVes);
        const bankName = matchedBank?.name || inv.bank_account_name || inv.payment_method || (isCredit ? 'Cuentas por Cobrar (Crédito)' : 'Cuenta Activa');
        const bankId = matchedBank?.id || inv.bank_account_id || (isCredit ? 'cxc-virtual' : undefined);
        const isVesFinal = matchedBank ? matchedBank.currency === 'VES' : isVes;
        const amtNative = isVesFinal ? totalVes : totalUsd;

        allocations.push({
          bankAccountId: bankId,
          bankAccountName: bankName,
          currency: isVesFinal ? 'VES' : 'USD',
          amount: amtNative,
          amountUsd: totalUsd,
          amountVes: totalVes
        });
      }

      const ctrlNum = inv.control_number || inv.invoice_number || (isNota ? `NE-${(inv.id || '').slice(0, 6).toUpperCase()}` : `FAC-${(inv.id || '').slice(0, 6).toUpperCase()}`);
      if (inv.id) processedIds.add(inv.id);
      if (ctrlNum) processedCodes.add(ctrlNum.toLowerCase());

      list.push({
        id: inv.id || `inv-${Math.random()}`,
        sourceType: docType,
        sourceId: inv.id,
        controlNumber: ctrlNum,
        date: rawDate,
        customerName: inv.customer_name || 'Consumidor Final',
        customerRif: inv.customer_rif,
        customerPhone: inv.customer_phone,
        itemsCount: items.reduce((acc, it) => acc + (Number(it.quantity || it.qty || 1)), 0) || items.length || 1,
        itemsSummary,
        itemsDetail: items,
        subtotal: Number(inv.subtotal) || totalUsd,
        iva: Number(inv.iva) || 0,
        igtf: Number(inv.taxes_detail?.find((t: any) => t.id === 'igtf-3')?.amount) || 0,
        totalUsd,
        totalVes,
        bcvRate: rate,
        paymentMethodText: isCredit ? 'Crédito (CxC)' : (inv.payment_method || (inv.split_payments ? 'Multimétodo' : 'Contado')),
        bankAccountAllocations: allocations,
        status: inv.status || 'Completado',
        createdBy: inv.created_by || 'Cajero POS',
        notes: inv.notes,
        isCredit,
        rawRecord: inv
      });
    });

    // 2. Process Draft Invoices (Notas de Entrega registradas en borradores/notas)
    draftInvoices.forEach((draft: any) => {
      const draftCtrl = draft.control_number || draft.invoice_number || (draft.id ? `NE-${draft.id.slice(0, 6).toUpperCase()}` : 'NE-BORRADOR');
      if (draft.id && processedIds.has(draft.id)) return;
      if (draftCtrl && processedCodes.has(draftCtrl.toLowerCase())) return;

      const rawDate = draft.created_at || new Date().toISOString();
      const rate = draft.bcv_rate && draft.bcv_rate > 0 ? draft.bcv_rate : activeBcv;
      const totalUsd = Number(draft.total) || 0;
      const totalVes = Number(draft.totals_by_currency?.VES) || (totalUsd * rate);

      let items: any[] = [];
      if (Array.isArray(draft.items)) {
        items = draft.items;
      } else if (typeof draft.items === 'string') {
        try {
          items = JSON.parse(draft.items);
        } catch (e) {
          items = [];
        }
      }

      const itemsSummary = items.length > 0
        ? items.map(it => `${it.quantity || it.qty || 1}x ${it.name || it.product_name || 'Item'}`).slice(0, 3).join(', ') + (items.length > 3 ? ` (+${items.length - 3} más)` : '')
        : (draft.notes || 'Nota de entrega');

      const isCredit = Boolean(draft.is_credit || draft.payment_method?.toLowerCase().includes('crédito') || draft.payment_method?.toLowerCase().includes('credito'));

      const isVes = draft.currency_code === 'VES' || draft.payment_method?.toLowerCase().includes('ves') || draft.payment_method?.toLowerCase().includes('bs');
      const matchedBank = resolveActiveAccount(draft.bank_account_id, draft.payment_method || 'Nota de Entrega', isVes);
      const bankName = matchedBank?.name || (isCredit ? 'Cuentas por Cobrar (Crédito)' : 'Nota de Entrega');
      const bankId = matchedBank?.id || draft.bank_account_id;
      const isVesFinal = matchedBank ? matchedBank.currency === 'VES' : isVes;
      const amtNative = isVesFinal ? totalVes : totalUsd;

      if (draft.id) processedIds.add(draft.id);
      if (draftCtrl) processedCodes.add(draftCtrl.toLowerCase());

      list.push({
        id: draft.id || `draft-${Math.random()}`,
        sourceType: 'nota_entrega',
        sourceId: draft.id,
        controlNumber: draftCtrl,
        date: rawDate,
        customerName: draft.customer_name || 'Cliente Nota Entrega',
        customerRif: draft.customer_rif,
        customerPhone: draft.customer_phone,
        itemsCount: items.reduce((acc, it) => acc + (Number(it.quantity || it.qty || 1)), 0) || items.length || 1,
        itemsSummary,
        itemsDetail: items,
        subtotal: totalUsd,
        iva: 0,
        igtf: 0,
        totalUsd,
        totalVes,
        bcvRate: rate,
        paymentMethodText: isCredit ? 'Crédito (CxC)' : (draft.payment_method || 'Nota de Entrega'),
        bankAccountAllocations: [{
          bankAccountId: bankId,
          bankAccountName: bankName,
          currency: isVesFinal ? 'VES' : 'USD',
          amount: amtNative,
          amountUsd: totalUsd,
          amountVes: totalVes
        }],
        status: draft.status || 'Entregado',
        createdBy: draft.created_by || 'Ventas',
        notes: draft.notes,
        isCredit,
        rawRecord: draft
      });
    });

    // 3. Process Online Orders (Pedidos)
    orders.forEach((ord: any) => {
      const ordCode = ord.order_number ? `#${ord.order_number}` : (ord.id ? `PED-${ord.id.slice(0, 6).toUpperCase()}` : 'PED-ONLINE');
      // Avoid duplicate counting if an order was already converted to invoice
      if (ord.id && processedIds.has(ord.id)) return;
      if (ordCode && processedCodes.has(ordCode.toLowerCase())) return;
      const alreadyInvoiced = list.some(i => (i.controlNumber && i.controlNumber.toLowerCase() === ordCode.toLowerCase()) || (i.notes && i.notes.includes(ord.id)));
      if (alreadyInvoiced) return;

      const rawDate = ord.created_at || new Date().toISOString();
      const rate = ord.bcv_rate && ord.bcv_rate > 0 ? ord.bcv_rate : activeBcv;
      const totalUsd = Number(ord.total_price) || 0;
      const totalVes = Number(ord.totals_by_currency?.VES) || (totalUsd * rate);

      let items: any[] = [];
      if (Array.isArray(ord.items)) {
        items = ord.items;
      } else if (typeof ord.items === 'string') {
        try {
          items = JSON.parse(ord.items);
        } catch (e) {
          items = [];
        }
      }

      const itemsSummary = items.length > 0
        ? items.map(it => `${it.quantity || 1}x ${it.name || 'Producto'}`).slice(0, 3).join(', ') + (items.length > 3 ? ` (+${items.length - 3} más)` : '')
        : (ord.comments || 'Pedido de tienda online');

      const allocations: UnifiedSaleTransaction['bankAccountAllocations'] = [];

      if (ord.split_payments && Array.isArray(ord.split_payments) && ord.split_payments.length > 0) {
        ord.split_payments.forEach((sp: any) => {
          const isVes = sp.currency === 'VES' || sp.method?.toLowerCase().includes('ves') || sp.method?.toLowerCase().includes('bs') || sp.method?.toLowerCase().includes('pagomovil');
          const matchedBank = resolveActiveAccount(sp.bankAccountId, sp.method || sp.bank_account_name, isVes);
          const bankName = matchedBank?.name || sp.bank_account_name || sp.method || 'Cuenta Activa';
          const bankId = matchedBank?.id || sp.bankAccountId;
          const isVesFinal = matchedBank ? matchedBank.currency === 'VES' : isVes;
          const rawAmt = Number(sp.amount) || 0;
          const amtUsd = isVesFinal ? (rawAmt / rate) : rawAmt;
          const amtVes = isVesFinal ? rawAmt : (rawAmt * rate);

          allocations.push({
            bankAccountId: bankId,
            bankAccountName: bankName,
            currency: isVesFinal ? 'VES' : 'USD',
            amount: rawAmt,
            amountUsd: amtUsd,
            amountVes: amtVes
          });
        });
      } else {
        const isVes = ord.currency_code === 'VES' || ord.payment_method?.toLowerCase().includes('ves') || ord.payment_method?.toLowerCase().includes('pagomovil') || ord.payment_method?.toLowerCase().includes('bs');
        const matchedBank = resolveActiveAccount(ord.bank_account_id, ord.payment_method, isVes);
        const bankName = matchedBank?.name || ord.payment_method || (ord.delivery_method === 'b2c' ? 'Transferencia / Pago Móvil' : 'Efectivo / Retiro');
        const bankId = matchedBank?.id || ord.bank_account_id;
        const isVesFinal = matchedBank ? matchedBank.currency === 'VES' : isVes;
        const amtNative = isVesFinal ? totalVes : totalUsd;

        allocations.push({
          bankAccountId: bankId,
          bankAccountName: bankName,
          currency: isVesFinal ? 'VES' : 'USD',
          amount: amtNative,
          amountUsd: totalUsd,
          amountVes: totalVes
        });
      }

      if (ord.id) processedIds.add(ord.id);
      if (ordCode) processedCodes.add(ordCode.toLowerCase());

      list.push({
        id: ord.id || `ord-${Math.random()}`,
        sourceType: 'pedido_online',
        sourceId: ord.id,
        controlNumber: ordCode,
        date: rawDate,
        customerName: ord.customer_name || 'Cliente Web',
        customerPhone: ord.phone_number,
        customerRif: '',
        itemsCount: items.reduce((acc, it) => acc + (Number(it.quantity || 1)), 0) || items.length || 1,
        itemsSummary,
        itemsDetail: items,
        subtotal: totalUsd,
        iva: 0,
        igtf: 0,
        totalUsd,
        totalVes,
        bcvRate: rate,
        paymentMethodText: ord.payment_method || 'Online / Delivery',
        bankAccountAllocations: allocations,
        status: ord.status || 'Pendiente',
        createdBy: 'Tienda Online (Web)',
        notes: ord.comments,
        isCredit: false,
        rawRecord: ord
      });
    });

    // 4. Process Standalone Accounts Receivable (Cuentas por Cobrar no registradas previamente como Factura)
    accountsReceivable.forEach((cxc: any) => {
      const linkedInvoiceId = cxc.invoice_id || cxc.invoiceId;
      const linkedInvoiceNum = cxc.invoice_number || cxc.invoiceNumber;
      const subject = cxc.subject || '';

      const matchedExistingTx = list.find(t => 
        (linkedInvoiceId && (t.sourceId === linkedInvoiceId || t.id === linkedInvoiceId)) ||
        (linkedInvoiceNum && t.controlNumber.toLowerCase() === linkedInvoiceNum.toLowerCase()) ||
        (subject && subject.toLowerCase().includes(t.controlNumber.toLowerCase()))
      );

      if (matchedExistingTx) {
        matchedExistingTx.isCredit = true;
        return;
      }

      const cxcCode = cxc.subject?.includes('#') ? cxc.subject : `CXC-${(cxc.id || '').slice(0, 6).toUpperCase()}`;
      if (cxc.id && processedIds.has(cxc.id)) return;
      if (cxcCode && processedCodes.has(cxcCode.toLowerCase())) return;

      const rawDate = cxc.issue_date || cxc.created_at || new Date().toISOString();
      const rate = activeBcv;
      const totalUsd = Number(cxc.total_amount) || 0;
      const totalVes = totalUsd * rate;

      let items: any[] = [];
      if (Array.isArray(cxc.items)) {
        items = cxc.items;
      } else if (typeof cxc.items === 'string') {
        try {
          items = JSON.parse(cxc.items);
        } catch (e) {
          items = [];
        }
      }

      if (items.length === 0) {
        const descText = cxc.description || cxc.subject || 'Crédito otorgado por venta de productos';
        items = [{
          name: descText.replace(/^Crédito otorgado por venta de /i, '').replace(/^Cuenta por cobrar /i, ''),
          quantity: 1,
          price: totalUsd
        }];
      }

      const itemsSummary = items.length > 0
        ? items.map(it => `${it.quantity || 1}x ${it.name || 'Artículo a Crédito'}`).slice(0, 3).join(', ')
        : (cxc.description || 'Venta a crédito');

      list.push({
        id: cxc.id || `cxc-${Math.random()}`,
        sourceType: 'cuenta_cobrar',
        sourceId: cxc.id,
        controlNumber: cxcCode,
        date: rawDate,
        customerName: cxc.entity_name || cxc.client_name || cxc.customer_name || 'Cliente a Crédito',
        customerPhone: cxc.phone,
        customerRif: cxc.rif,
        itemsCount: items.reduce((acc, it) => acc + (Number(it.quantity || 1)), 0) || 1,
        itemsSummary,
        itemsDetail: items,
        subtotal: totalUsd,
        iva: 0,
        igtf: 0,
        totalUsd,
        totalVes,
        bcvRate: rate,
        paymentMethodText: 'Crédito (CxC)',
        bankAccountAllocations: [{
          bankAccountId: 'cxc-virtual',
          bankAccountName: 'Cuentas por Cobrar (Crédito Cliente)',
          currency: 'USD',
          amount: totalUsd,
          amountUsd: totalUsd,
          amountVes: totalVes
        }],
        status: cxc.status === 'cobrado' ? 'Completado' : cxc.status === 'parcial' ? 'Abono Parcial' : 'Crédito Pendiente',
        createdBy: 'Crédito / CxC',
        notes: cxc.description,
        isCredit: true,
        rawRecord: cxc
      });
    });

    // Sort by date descending
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, draftInvoices, orders, accountsReceivable, activeBankAccounts, currencyRates]);

  // -------------------------------------------------------------
  // FILTERED TRANSACTIONS (Date Range & Filters)
  // -------------------------------------------------------------
  const filteredTransactions = useMemo(() => {
    return allUnifiedTransactions.filter(tx => {
      // 1. Date Range
      const txDate = tx.date.split('T')[0];
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;

      // 2. Type filter
      if (typeFilter !== 'all' && tx.sourceType !== typeFilter) return false;

      // 3. Status filter
      if (statusFilter !== 'all') {
        const stLower = (tx.status || '').toLowerCase();
        if (statusFilter === 'completed' && !['completado', 'facturado', 'entregado', 'pagado', 'aprobado'].includes(stLower)) {
          return false;
        }
        if (statusFilter === 'pending' && !['pendiente', 'en_proceso', 'esperando'].includes(stLower)) {
          return false;
        }
      }

      // 4. Bank account filter
      if (bankFilter !== 'all') {
        const hasBank = tx.bankAccountAllocations.some(b => b.bankAccountId === bankFilter || b.bankAccountName.toLowerCase().includes(bankFilter.toLowerCase()));
        if (!hasBank) return false;
      }

      // 5. Search text
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchCode = tx.controlNumber.toLowerCase().includes(term);
        const matchClient = tx.customerName.toLowerCase().includes(term);
        const matchRif = (tx.customerRif || '').toLowerCase().includes(term);
        const matchPhone = (tx.customerPhone || '').toLowerCase().includes(term);
        const matchItems = tx.itemsSummary.toLowerCase().includes(term);
        const matchBank = tx.bankAccountAllocations.some(b => b.bankAccountName.toLowerCase().includes(term));
        if (!matchCode && !matchClient && !matchRif && !matchPhone && !matchItems && !matchBank) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [allUnifiedTransactions, startDate, endDate, typeFilter, statusFilter, bankFilter, searchTerm, sortOrder]);

  // -------------------------------------------------------------
  // BANK ACCOUNT CLASSIFICATION & TOTALS (STRICTLY ACTIVE ACCOUNTS)
  // -------------------------------------------------------------
  const bankAccountsSummary = useMemo(() => {
    const accountMap = new Map<string, {
      id: string;
      name: string;
      bankName?: string;
      accountNumber?: string;
      accountType?: string;
      currency: string;
      nativeTotal: number;
      totalUsd: number;
      totalVes: number;
      count: number;
      isCash?: boolean;
    }>();

    // STRICT: Initialize ONLY with active registered bank accounts from "Cuentas Bancarias"
    activeBankAccounts.forEach(acc => {
      accountMap.set(acc.id, {
        id: acc.id,
        name: acc.name,
        bankName: acc.bank_name,
        accountNumber: acc.account_number,
        accountType: acc.account_type,
        currency: acc.currency || 'USD',
        isCash: (acc as any).is_cash || acc.name.toLowerCase().includes('efectivo') || acc.name.toLowerCase().includes('caja'),
        nativeTotal: 0,
        totalUsd: 0,
        totalVes: 0,
        count: 0
      });
    });

    // Populate transaction movements strictly into active bank accounts
    filteredTransactions.forEach(tx => {
      tx.bankAccountAllocations.forEach(alloc => {
        let existing = accountMap.get(alloc.bankAccountId || '');

        if (!existing) {
          // Find matching account among activeBankAccounts
          const matched = activeBankAccounts.find(b =>
            b.id === alloc.bankAccountId ||
            b.name.toLowerCase() === alloc.bankAccountName.toLowerCase() ||
            (b.bank_name && b.bank_name.toLowerCase() === alloc.bankAccountName.toLowerCase())
          );
          if (matched) {
            existing = accountMap.get(matched.id);
          }
        }

        if (existing) {
          existing.nativeTotal += alloc.amount;
          existing.totalUsd += alloc.amountUsd;
          existing.totalVes += alloc.amountVes;
          existing.count += 1;
        }
      });
    });

    const activeList = Array.from(accountMap.values());
    const grandTotalUsd = activeList.reduce((acc, curr) => acc + curr.totalUsd, 0);

    return activeList.map(item => ({
      ...item,
      percentage: grandTotalUsd > 0 ? (item.totalUsd / grandTotalUsd) * 100 : 0
    })).sort((a, b) => b.totalUsd - a.totalUsd);
  }, [filteredTransactions, activeBankAccounts]);

  // Overall Totals for the Bank Accounts Table
  const bankAccountsTotals = useMemo(() => {
    const totalUsd = bankAccountsSummary.reduce((acc, b) => acc + b.totalUsd, 0);
    const totalVes = bankAccountsSummary.reduce((acc, b) => acc + b.totalVes, 0);
    const totalCount = bankAccountsSummary.reduce((acc, b) => acc + b.count, 0);

    const totalNativeVes = bankAccountsSummary
      .filter(b => b.currency === 'VES')
      .reduce((acc, b) => acc + b.nativeTotal, 0);

    const totalNativeUsd = bankAccountsSummary
      .filter(b => b.currency === 'USD')
      .reduce((acc, b) => acc + b.nativeTotal, 0);

    return {
      totalUsd,
      totalVes,
      totalCount,
      totalNativeVes,
      totalNativeUsd
    };
  }, [bankAccountsSummary]);

  // Overall Global Totals for the filtered set
  const metrics = useMemo(() => {
    const totalUsd = filteredTransactions.reduce((acc, t) => acc + t.totalUsd, 0);
    const totalVes = filteredTransactions.reduce((acc, t) => acc + t.totalVes, 0);
    const count = filteredTransactions.length;
    const avgTicketUsd = count > 0 ? totalUsd / count : 0;

    let totalCostUsd = 0;
    filteredTransactions.forEach(t => {
      if (Array.isArray(t.itemsDetail) && t.itemsDetail.length > 0) {
        t.itemsDetail.forEach((it: any) => {
          const qty = Number(it.quantity || it.qty || 1);
          const cost = Number(it.cost_price || it.cost || it.unit_cost || (it.price ? it.price * 0.6 : (it.price_usd ? it.price_usd * 0.6 : 0)));
          totalCostUsd += qty * cost;
        });
      } else {
        totalCostUsd += t.totalUsd * 0.6;
      }
    });
    const totalUtilidad = Math.max(0, totalUsd - totalCostUsd);

    const facturas = filteredTransactions.filter(t => t.sourceType === 'factura' && !t.isCredit);
    const notas = filteredTransactions.filter(t => t.sourceType === 'nota_entrega');
    const online = filteredTransactions.filter(t => t.sourceType === 'pedido_online');
    const credito = filteredTransactions.filter(t => t.isCredit || t.sourceType === 'cuenta_cobrar');

    return {
      totalUsd,
      totalVes,
      count,
      avgTicketUsd,
      totalUtilidad,
      facturasCount: facturas.length,
      facturasTotalUsd: facturas.reduce((acc, t) => acc + t.totalUsd, 0),
      notasCount: notas.length,
      notasTotalUsd: notas.reduce((acc, t) => acc + t.totalUsd, 0),
      onlineCount: online.length,
      onlineTotalUsd: online.reduce((acc, t) => acc + t.totalUsd, 0),
      creditoCount: credito.length,
      creditoTotalUsd: credito.reduce((acc, t) => acc + t.totalUsd, 0)
    };
  }, [filteredTransactions]);

  // -------------------------------------------------------------
  // FISCAL & ALÍCUOTAS IVA SUMMARY & BREAKDOWN (SENIAT STANDARD)
  // -------------------------------------------------------------
  const taxSummary = useMemo(() => {
    let baseExentaUsd = 0;
    let baseGravada16Usd = 0;
    let debitoIva16Usd = 0;
    let baseIgtf3Usd = 0;
    let debitoIgtf3Usd = 0;

    let baseExentaVes = 0;
    let baseGravada16Ves = 0;
    let debitoIva16Ves = 0;
    let baseIgtf3Ves = 0;
    let debitoIgtf3Ves = 0;

    let totalVentasUsd = 0;
    let totalVentasVes = 0;

    let opsExentasCount = 0;
    let opsGravadasCount = 0;
    let opsIgtfCount = 0;

    filteredTransactions.forEach(tx => {
      const rate = tx.bcvRate > 0 ? tx.bcvRate : (currencyRates.VES || 791.66);
      totalVentasUsd += tx.totalUsd;
      totalVentasVes += tx.totalVes;

      const txIvaUsd = Number(tx.iva) || 0;
      const txIgtfUsd = Number(tx.igtf) || 0;
      const txSubtotalUsd = Number(tx.subtotal) || Math.max(0, tx.totalUsd - txIvaUsd - txIgtfUsd);

      if (txIvaUsd > 0) {
        opsGravadasCount++;
        // Calculate taxable base from IVA (16%)
        const calcGravada = Math.min(txSubtotalUsd, txIvaUsd / 0.16);
        const calcExento = Math.max(0, txSubtotalUsd - calcGravada);

        baseGravada16Usd += calcGravada;
        debitoIva16Usd += txIvaUsd;
        baseGravada16Ves += calcGravada * rate;
        debitoIva16Ves += txIvaUsd * rate;

        if (calcExento > 0.01) {
          baseExentaUsd += calcExento;
          baseExentaVes += calcExento * rate;
          opsExentasCount++;
        }
      } else {
        // 0% Exenta / Exonerada
        opsExentasCount++;
        baseExentaUsd += txSubtotalUsd;
        baseExentaVes += txSubtotalUsd * rate;
      }

      if (txIgtfUsd > 0) {
        opsIgtfCount++;
        const calcBaseIgtf = txIgtfUsd / 0.03;
        baseIgtf3Usd += calcBaseIgtf;
        debitoIgtf3Usd += txIgtfUsd;
        baseIgtf3Ves += calcBaseIgtf * rate;
        debitoIgtf3Ves += txIgtfUsd * rate;
      }
    });

    const grandTotalUsd = totalVentasUsd;

    return {
      baseExentaUsd,
      baseExentaVes,
      baseGravada16Usd,
      debitoIva16Usd,
      baseGravada16Ves,
      debitoIva16Ves,
      baseIgtf3Usd,
      debitoIgtf3Usd,
      baseIgtf3Ves,
      debitoIgtf3Ves,
      totalVentasUsd,
      totalVentasVes,
      opsExentasCount,
      opsGravadasCount,
      opsIgtfCount,
      pctExenta: grandTotalUsd > 0 ? (baseExentaUsd / grandTotalUsd) * 100 : 0,
      pctGravada16: grandTotalUsd > 0 ? ((baseGravada16Usd + debitoIva16Usd) / grandTotalUsd) * 100 : 0,
      pctIgtf: grandTotalUsd > 0 ? (debitoIgtf3Usd / grandTotalUsd) * 100 : 0
    };
  }, [filteredTransactions, currencyRates]);

  // Filtered transactions for the Alícuotas detailed table
  const taxFilteredTransactions = useMemo(() => {
    return filteredTransactions.filter(tx => {
      if (taxFilter === 'gravadas') return tx.iva > 0;
      if (taxFilter === 'exentas') return !tx.iva || tx.iva === 0;
      if (taxFilter === 'con_igtf') return tx.igtf > 0;
      return true;
    });
  }, [filteredTransactions, taxFilter]);

  // -------------------------------------------------------------
  // TOP PRODUCTOS RANKING & MULTI-CHANNEL AGGREGATION
  // (Facturas Normales + Notas de Entrega + Pedidos + Cuentas por Cobrar)
  // -------------------------------------------------------------
  const { topProductsList, productCategories, topProductsTotals } = useMemo(() => {
    const prodMap = new Map<string, {
      id: string;
      name: string;
      sku: string;
      category: string;
      totalUnits: number;
      totalRevenueUsd: number;
      totalRevenueVes: number;
      ticketsCount: number;
      currentStock: number | string;
      unitsBySource: {
        facturas: number;
        notas: number;
        pedidos: number;
        credito: number;
      };
      revenueBySource: {
        facturas: number;
        notas: number;
        pedidos: number;
        credito: number;
      };
    }>();

    const categoriesSet = new Set<string>();

    filteredTransactions.forEach(tx => {
      const rate = tx.bcvRate > 0 ? tx.bcvRate : (currencyRates.VES || 791.66);
      const items = tx.itemsDetail || [];

      // Determine sale channel:
      const channel: 'facturas' | 'notas' | 'pedidos' | 'credito' = 
        tx.isCredit || tx.sourceType === 'cuenta_cobrar'
          ? 'credito'
          : tx.sourceType === 'nota_entrega'
          ? 'notas'
          : tx.sourceType === 'pedido_online'
          ? 'pedidos'
          : 'facturas';

      if (!Array.isArray(items) || items.length === 0) {
        const fallbackName = tx.itemsSummary || 'Venta General';
        const key = fallbackName.toLowerCase().trim();
        const existing = prodMap.get(key);
        if (existing) {
          existing.totalUnits += tx.itemsCount || 1;
          existing.totalRevenueUsd += tx.totalUsd;
          existing.totalRevenueVes += tx.totalVes;
          existing.ticketsCount += 1;
          existing.unitsBySource[channel] += tx.itemsCount || 1;
          existing.revenueBySource[channel] += tx.totalUsd;
        } else {
          prodMap.set(key, {
            id: key,
            name: fallbackName,
            sku: 'GEN-001',
            category: 'General',
            totalUnits: tx.itemsCount || 1,
            totalRevenueUsd: tx.totalUsd,
            totalRevenueVes: tx.totalVes,
            ticketsCount: 1,
            currentStock: '-',
            unitsBySource: {
              facturas: channel === 'facturas' ? (tx.itemsCount || 1) : 0,
              notas: channel === 'notas' ? (tx.itemsCount || 1) : 0,
              pedidos: channel === 'pedidos' ? (tx.itemsCount || 1) : 0,
              credito: channel === 'credito' ? (tx.itemsCount || 1) : 0,
            },
            revenueBySource: {
              facturas: channel === 'facturas' ? tx.totalUsd : 0,
              notas: channel === 'notas' ? tx.totalUsd : 0,
              pedidos: channel === 'pedidos' ? tx.totalUsd : 0,
              credito: channel === 'credito' ? tx.totalUsd : 0,
            }
          });
          categoriesSet.add('General');
        }
        return;
      }

      items.forEach((it: any) => {
        const rawName = (it.name || it.product_name || it.title || 'Producto').trim();
        const rawSku = (it.sku || it.code || it.product_id || '').trim();
        const qty = Number(it.quantity || it.qty || it.cantidad || 1) || 1;
        const unitPrice = Number(it.price || it.unit_price || it.precio || 0);
        const itemTotalUsd = unitPrice > 0 ? (unitPrice * qty) : (tx.totalUsd / (items.length || 1));
        const itemTotalVes = itemTotalUsd * rate;

        const matchedProd = products.find(p => 
          (p.id && (p.id === it.product_id || p.id === it.id)) ||
          (p.sku && p.sku.toLowerCase() === rawSku.toLowerCase()) ||
          (p.name && p.name.toLowerCase() === rawName.toLowerCase())
        );

        const officialName = matchedProd?.name || rawName;
        const officialSku = matchedProd?.sku || rawSku || 'S/N';
        const officialCategory = matchedProd?.category || it.category || 'General';
        const officialStock = matchedProd ? (matchedProd.stock ?? matchedProd.quantity ?? '-') : '-';

        categoriesSet.add(officialCategory);

        const prodKey = (matchedProd?.id || officialSku + '_' + officialName).toLowerCase();

        const existing = prodMap.get(prodKey);
        if (existing) {
          existing.totalUnits += qty;
          existing.totalRevenueUsd += itemTotalUsd;
          existing.totalRevenueVes += itemTotalVes;
          existing.ticketsCount += 1;
          existing.unitsBySource[channel] += qty;
          existing.revenueBySource[channel] += itemTotalUsd;
        } else {
          prodMap.set(prodKey, {
            id: prodKey,
            name: officialName,
            sku: officialSku,
            category: officialCategory,
            totalUnits: qty,
            totalRevenueUsd: itemTotalUsd,
            totalRevenueVes: itemTotalVes,
            ticketsCount: 1,
            currentStock: officialStock,
            unitsBySource: {
              facturas: channel === 'facturas' ? qty : 0,
              notas: channel === 'notas' ? qty : 0,
              pedidos: channel === 'pedidos' ? qty : 0,
              credito: channel === 'credito' ? qty : 0,
            },
            revenueBySource: {
              facturas: channel === 'facturas' ? itemTotalUsd : 0,
              notas: channel === 'notas' ? itemTotalUsd : 0,
              pedidos: channel === 'pedidos' ? itemTotalUsd : 0,
              credito: channel === 'credito' ? itemTotalUsd : 0,
            }
          });
        }
      });
    });

    const rawList = Array.from(prodMap.values());
    const totalGrandRevenueUsd = rawList.reduce((acc, p) => acc + p.totalRevenueUsd, 0);
    const totalGrandRevenueVes = rawList.reduce((acc, p) => acc + p.totalRevenueVes, 0);
    const totalGrandUnits = rawList.reduce((acc, p) => acc + p.totalUnits, 0);

    const enrichedList: TopProductItem[] = rawList.map(item => ({
      ...item,
      avgPriceUsd: item.totalUnits > 0 ? item.totalRevenueUsd / item.totalUnits : 0,
      percentage: totalGrandRevenueUsd > 0 ? (item.totalRevenueUsd / totalGrandRevenueUsd) * 100 : 0
    }));

    return {
      topProductsList: enrichedList,
      productCategories: Array.from(categoriesSet).sort(),
      topProductsTotals: {
        totalGrandUnits,
        totalGrandRevenueUsd,
        totalGrandRevenueVes
      }
    };
  }, [filteredTransactions, products, currencyRates]);

  // Filtered and Sorted Top Products (With Top 10 Limit support)
  const filteredTopProducts = useMemo(() => {
    const list = topProductsList.filter(p => {
      if (productCategoryFilter !== 'all' && p.category.toLowerCase() !== productCategoryFilter.toLowerCase()) {
        return false;
      }
      if (productSearchTerm.trim() !== '') {
        const term = productSearchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(term);
        const matchSku = p.sku.toLowerCase().includes(term);
        const matchCat = p.category.toLowerCase().includes(term);
        if (!matchName && !matchSku && !matchCat) return false;
      }
      return true;
    }).sort((a, b) => {
      if (productSortBy === 'units') {
        return b.totalUnits - a.totalUnits;
      }
      return b.totalRevenueUsd - a.totalRevenueUsd;
    });

    if (topProductsLimit === 'top10') {
      return list.slice(0, 10);
    }
    if (topProductsLimit === 'top20') {
      return list.slice(0, 20);
    }
    return list;
  }, [topProductsList, productCategoryFilter, productSearchTerm, productSortBy, topProductsLimit]);

  // -------------------------------------------------------------
  // PDF EXPORT GENERATOR (4 COMPLETE SECTIONS)
  // -------------------------------------------------------------
  const handleExportPDF = () => {
    setIsExportingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const businessName = businessProfile?.name || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.';
      const businessRif = businessProfile?.rif || 'J-50143164-8';
      const businessAddress = businessProfile?.address || 'Barinitas, Estado Barinas, Venezuela';

      // 1. Header Banner
      doc.setFillColor(29, 53, 87); // #1D3557 Deep Navy
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(businessName.toUpperCase(), 14, 10);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`RIF: ${businessRif}  |  ${businessAddress}`, 14, 16);
      doc.text(`REPORTE INTEGRAL DE VENTAS Y TOP 10 PRODUCTOS`, pageWidth - 14, 10, { align: 'right' });
      doc.text(`Período: ${startDate} al ${endDate}  |  Generado: ${new Date().toLocaleString('es-VE')}`, pageWidth - 14, 16, { align: 'right' });

      let currentY = 30;

      // Section 1: Resumen de Métodos de Pago y Cuentas Bancarias
      doc.setTextColor(29, 53, 87);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. CLASIFICACIÓN DE INGRESOS POR CUENTAS BANCARIAS Y MÉTODOS DE PAGO', 14, currentY);

      currentY += 4;

      const bankTableBody = bankAccountsSummary
        .filter(b => b.nativeTotal > 0 || b.count > 0)
        .map(b => [
          b.name + (b.bankName && b.bankName !== b.name ? ` (${b.bankName})` : ''),
          b.currency,
          b.currency === 'VES' ? `Bs. ${b.nativeTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${b.nativeTotal.toFixed(2)}`,
          `$${b.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `Bs. ${b.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${b.count}`,
          `${b.percentage.toFixed(1)}%`
        ]);

      // Add Total Row to Bank Table
      bankTableBody.push([
        'TOTAL GENERAL RECAUDADO',
        '-',
        bankAccountsTotals.totalNativeUsd > 0 && bankAccountsTotals.totalNativeVes > 0
          ? `$${bankAccountsTotals.totalNativeUsd.toFixed(2)} / Bs. ${bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
          : bankAccountsTotals.totalNativeUsd > 0
          ? `$${bankAccountsTotals.totalNativeUsd.toFixed(2)}`
          : `Bs. ${bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        `$${bankAccountsTotals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Bs. ${bankAccountsTotals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${bankAccountsTotals.totalCount}`,
        '100.0%'
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Cuenta Bancaria / Método', 'Moneda', 'Monto en Moneda Nativa', 'Equivalente USD ($)', 'Equivalente VES (Bs.)', 'N° Transacciones', '% Participación']],
        body: bankTableBody,
        theme: 'striped',
        headStyles: { fillColor: [29, 53, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        styles: { cellPadding: 2 },
        didParseCell: (data) => {
          if (data.row.index === bankTableBody.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 244, 248];
          }
        }
      });

      // @ts-ignore
      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Section 2: Resumen de Alícuotas e Impuestos
      doc.setTextColor(29, 53, 87);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. RESUMEN DE ALÍCUOTAS E IMPUESTOS FISCALES (SENIAT)', 14, currentY);

      currentY += 4;

      const taxTableBody = [
        ['Ventas Internas Gravadas (16%)', '16.00%', `$${taxSummary.baseGravada16Usd.toFixed(2)}`, `Bs. ${taxSummary.baseGravada16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${taxSummary.debitoIva16Usd.toFixed(2)}`, `Bs. ${taxSummary.debitoIva16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsGravadasCount}`, `${taxSummary.pctGravada16.toFixed(1)}%`],
        ['Ventas Internas Exentas / Exoneradas (0%)', '0.00%', `$${taxSummary.baseExentaUsd.toFixed(2)}`, `Bs. ${taxSummary.baseExentaVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, '$0.00', 'Bs. 0.00', `${taxSummary.opsExentasCount}`, `${taxSummary.pctExenta.toFixed(1)}%`],
        ['IGTF Percibido en Divisas (3%)', '3.00%', `$${taxSummary.baseIgtf3Usd.toFixed(2)}`, `Bs. ${taxSummary.baseIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${taxSummary.debitoIgtf3Usd.toFixed(2)}`, `Bs. ${taxSummary.debitoIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsIgtfCount}`, `${taxSummary.pctIgtf.toFixed(1)}%`],
        ['TOTAL GENERAL BASES E IMPUESTOS', '-', `$${(taxSummary.baseGravada16Usd + taxSummary.baseExentaUsd).toFixed(2)}`, `Bs. ${(taxSummary.baseGravada16Ves + taxSummary.baseExentaVes).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${(taxSummary.debitoIva16Usd + taxSummary.debitoIgtf3Usd).toFixed(2)}`, `Bs. ${(taxSummary.debitoIva16Ves + taxSummary.debitoIgtf3Ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsGravadasCount + taxSummary.opsExentasCount}`, '100.0%']
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['Concepto / Alícuota', 'Tasa', 'Base Imponible USD', 'Base Imponible VES', 'Débito Fiscal USD', 'Débito Fiscal VES', 'N° Operaciones', '% Part.']],
        body: taxTableBody,
        theme: 'grid',
        headStyles: { fillColor: [69, 123, 157], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        styles: { cellPadding: 2 },
        didParseCell: (data) => {
          if (data.row.index === taxTableBody.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 244, 248];
          }
        }
      });

      // @ts-ignore
      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Section 3: Ranking Top 10 Productos Más Vendidos
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 20;
      }

      doc.setTextColor(29, 53, 87);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('3. RANKING OFICIAL: TOP 10 PRODUCTOS MÁS VENDIDOS (AUDITORÍA 4 CANALES)', 14, currentY);

      currentY += 4;

      const top10Items = topProductsList.slice(0, 10);
      const productTableBody = top10Items.map((p, idx) => [
        `#${idx + 1}`,
        p.name,
        p.sku,
        p.category,
        `${p.totalUnits}`,
        `Fac: ${p.unitsBySource.facturas} | NE: ${p.unitsBySource.notas} | Ped: ${p.unitsBySource.pedidos} | CxC: ${p.unitsBySource.credito}`,
        `$${p.avgPriceUsd.toFixed(2)}`,
        `$${p.totalRevenueUsd.toFixed(2)}`,
        `Bs. ${p.totalRevenueVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${p.percentage.toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Pos.', 'Producto / Artículo', 'SKU', 'Categoría', 'Unids', 'Desglose por Canal (Fac/NE/Ped/CxC)', 'P. Prom ($)', 'Total USD ($)', 'Total VES (Bs.)', '% Part.']],
        body: productTableBody,
        theme: 'striped',
        headStyles: { fillColor: [29, 53, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        styles: { cellPadding: 1.8 },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 50 },
          2: { cellWidth: 20 },
          3: { cellWidth: 24 },
          4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: 58, fontSize: 6.5 },
          6: { cellWidth: 18, halign: 'right' },
          7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 28, halign: 'right' },
          9: { cellWidth: 16, halign: 'right' }
        }
      });

      // Section 4: Libro de Transacciones Detallado
      doc.addPage();
      currentY = 20;

      doc.setTextColor(29, 53, 87);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`4. LIBRO DE TRANSACCIONES DETALLADO (${filteredTransactions.length} REGISTROS)`, 14, currentY);

      currentY += 4;

      const txTableBody = filteredTransactions.map(t => {
        const typeLabel = t.isCredit ? 'Crédito CxC' : t.sourceType === 'factura' ? 'Factura' : t.sourceType === 'nota_entrega' ? 'Nota Entrega' : 'Pedido Web';
        const banksText = t.bankAccountAllocations.map(b => b.bankAccountName).join(' + ') || t.paymentMethodText;
        const dateFormatted = new Date(t.date).toLocaleDateString('es-VE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return [
          dateFormatted,
          t.controlNumber,
          typeLabel,
          t.customerName,
          banksText,
          `${t.bcvRate.toFixed(2)}`,
          `$${t.totalUsd.toFixed(2)}`,
          `Bs. ${t.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          t.status
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Fecha / Hora', 'N° Comprobante', 'Tipo', 'Cliente', 'Cuenta(s) Bancaria(s)', 'Tasa BCV', 'Total USD ($)', 'Total VES (Bs.)', 'Estado']],
        body: txTableBody,
        theme: 'striped',
        headStyles: { fillColor: [29, 53, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        styles: { cellPadding: 1.8 },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 22, fontStyle: 'bold' },
          2: { cellWidth: 22 },
          3: { cellWidth: 42 },
          4: { cellWidth: 46 },
          5: { cellWidth: 16, halign: 'right' },
          6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 28, halign: 'right' },
          8: { cellWidth: 22, halign: 'center' }
        }
      });

      // Save PDF file
      const fileName = `Reporte_Ventas_BellaVista_${startDate}_${endDate}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error generating PDF report:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // -------------------------------------------------------------
  // EXCEL EXPORT GENERATOR WITH STYLED EXCELJS
  // -------------------------------------------------------------
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = businessProfile?.name || 'Inversiones y Copias Bella Vista';
      workbook.created = new Date();

      const businessName = businessProfile?.name || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.';
      const businessRif = businessProfile?.rif || 'J-50143164-8';
      const businessAddress = businessProfile?.address || 'Barinitas, Estado Barinas, Venezuela';
      const timestamp = new Date().toLocaleString('es-VE');

      // Style definitions
      const NAVY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2631' } };
      const HEADER_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      
      const SECTION_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAECEE' } };
      const SECTION_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };

      const ZEBRA_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F4' } };

      const TOTAL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF16A085' } };
      const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FF1B2631' } },
        bottom: { style: 'double', color: { argb: 'FF1B2631' } }
      };

      const DATA_BORDER: Partial<ExcelJS.Borders> = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };

      // Helper to add institutional header block to a sheet
      const addHeaderBlock = (sheet: ExcelJS.Worksheet, title: string) => {
        sheet.views = [{ showGridLines: true }];

        const r1 = sheet.addRow([businessName.toUpperCase(), '', '', '', '', '', '', '', title]);
        r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
        r1.getCell(9).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
        r1.getCell(9).alignment = { horizontal: 'right' };

        const r2 = sheet.addRow([`RIF: ${businessRif} | ${businessAddress}`, '', '', '', '', '', '', '', `Período: ${startDate} al ${endDate}`]);
        r2.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };
        r2.getCell(9).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
        r2.getCell(9).alignment = { horizontal: 'right' };

        const r3 = sheet.addRow(['', '', '', '', '', '', '', '', `Fecha de Generación: ${timestamp}`]);
        r3.getCell(9).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
        r3.getCell(9).alignment = { horizontal: 'right' };

        sheet.addRow([]); // empty line
      };

      // Helper to add styled section table to a sheet
      const addStyledTable = (
        sheet: ExcelJS.Worksheet,
        sectionTitle: string | null,
        headers: string[],
        dataRows: (string | number)[][],
        totalRow?: (string | number)[],
        alignments?: ('left' | 'center' | 'right')[]
      ) => {
        sheet.views = [{ showGridLines: true }];

        if (sectionTitle) {
          const secRow = sheet.addRow([sectionTitle]);
          secRow.height = 24;
          secRow.getCell(1).fill = SECTION_FILL;
          secRow.getCell(1).font = SECTION_FONT;
          secRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        }

        // 1. Cabeceras de Tablas: Fondo #1B2631, Texto Blanco #FFFFFF en Negrita, con alineación ajustada
        const headerRow = sheet.addRow(headers);
        headerRow.height = 25;
        headerRow.eachCell((cell, colNum) => {
          cell.fill = NAVY_FILL;
          cell.font = HEADER_FONT;
          const align = alignments?.[colNum - 1] || 'left';
          cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF1B2631' } },
            bottom: { style: 'medium', color: { argb: 'FF1B2631' } },
            left: { style: 'thin', color: { argb: 'FF2C3E50' } },
            right: { style: 'thin', color: { argb: 'FF2C3E50' } }
          };
        });

        // 3. Filas de Datos con sombreado alternado (Zebra #F2F4F4 en filas pares intercaladas)
        dataRows.forEach((rowValues, idx) => {
          const row = sheet.addRow(rowValues);
          row.height = 20;
          const isZebra = idx % 2 === 1;
          row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            if (isZebra) {
              cell.fill = ZEBRA_FILL;
            }
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2C3E50' } };
            cell.border = DATA_BORDER;
            const align = alignments?.[colNum - 1] || (typeof rowValues[colNum - 1] === 'number' ? 'right' : 'left');
            cell.alignment = { vertical: 'middle', horizontal: align };
          });
        });

        // 2. Totales Generales: Texto Verde Esmeralda en Negrita (#16A085) y Borde Contable Oficial (top thin, bottom double)
        if (totalRow) {
          const tRow = sheet.addRow(totalRow);
          tRow.height = 23;
          tRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.font = TOTAL_FONT;
            cell.border = TOTAL_BORDER;
            const align = alignments?.[colNum - 1] || (colNum === 1 ? 'left' : 'right');
            cell.alignment = { vertical: 'middle', horizontal: align };
          });
        }

        sheet.addRow([]); // Blank spacing row
      };

      // -------------------------------------------------------------
      // TAB 1: REPORTE CONSOLIDADO
      // -------------------------------------------------------------
      const sheetConsolidado = workbook.addWorksheet('Reporte Consolidado', { views: [{ showGridLines: true }] });
      addHeaderBlock(sheetConsolidado, 'REPORTE INTEGRAL DE VENTAS Y TOP 10 PRODUCTOS');

      // Table 1: Bank accounts
      const bankData = bankAccountsSummary
        .filter(b => b.nativeTotal > 0 || b.count > 0)
        .map(b => [
          b.name + (b.bankName && b.bankName !== b.name ? ` (${b.bankName})` : ''),
          b.currency,
          b.currency === 'VES' ? `Bs. ${b.nativeTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${b.nativeTotal.toFixed(2)}`,
          `$${b.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `Bs. ${b.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${b.count}`,
          `${b.percentage.toFixed(1)}%`
        ]);

      const bankTotal = [
        'TOTAL GENERAL RECAUDADO',
        '-',
        bankAccountsTotals.totalNativeUsd > 0 && bankAccountsTotals.totalNativeVes > 0
          ? `$${bankAccountsTotals.totalNativeUsd.toFixed(2)} / Bs. ${bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
          : bankAccountsTotals.totalNativeUsd > 0
          ? `$${bankAccountsTotals.totalNativeUsd.toFixed(2)}`
          : `Bs. ${bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        `$${bankAccountsTotals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Bs. ${bankAccountsTotals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${bankAccountsTotals.totalCount}`,
        '100.0%'
      ];

      addStyledTable(
        sheetConsolidado,
        '1. CLASIFICACIÓN DE INGRESOS POR CUENTAS BANCARIAS Y MÉTODOS DE PAGO',
        ['Cuenta Bancaria / Método', 'Moneda', 'Monto en Moneda Nativa', 'Equivalente USD ($)', 'Equivalente VES (Bs.)', 'N° Transacciones', '% Participación'],
        bankData,
        bankTotal,
        ['left', 'center', 'right', 'right', 'right', 'center', 'right']
      );

      // Table 2: Alicuotas
      const taxData = [
        ['Ventas Internas Gravadas (16%)', '16.00%', `$${taxSummary.baseGravada16Usd.toFixed(2)}`, `Bs. ${taxSummary.baseGravada16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${taxSummary.debitoIva16Usd.toFixed(2)}`, `Bs. ${taxSummary.debitoIva16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsGravadasCount}`, `${taxSummary.pctGravada16.toFixed(1)}%`],
        ['Ventas Internas Exentas / Exoneradas (0%)', '0.00%', `$${taxSummary.baseExentaUsd.toFixed(2)}`, `Bs. ${taxSummary.baseExentaVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, '$0.00', 'Bs. 0.00', `${taxSummary.opsExentasCount}`, `${taxSummary.pctExenta.toFixed(1)}%`],
        ['IGTF Percibido en Divisas (3%)', '3.00%', `$${taxSummary.baseIgtf3Usd.toFixed(2)}`, `Bs. ${taxSummary.baseIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${taxSummary.debitoIgtf3Usd.toFixed(2)}`, `Bs. ${taxSummary.debitoIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsIgtfCount}`, `${taxSummary.pctIgtf.toFixed(1)}%`]
      ];

      const taxTotal = ['TOTAL GENERAL BASES E IMPUESTOS', '-', `$${(taxSummary.baseGravada16Usd + taxSummary.baseExentaUsd).toFixed(2)}`, `Bs. ${(taxSummary.baseGravada16Ves + taxSummary.baseExentaVes).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `$${(taxSummary.debitoIva16Usd + taxSummary.debitoIgtf3Usd).toFixed(2)}`, `Bs. ${(taxSummary.debitoIva16Ves + taxSummary.debitoIgtf3Ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, `${taxSummary.opsGravadasCount + taxSummary.opsExentasCount}`, '100.0%'];

      addStyledTable(
        sheetConsolidado,
        '2. RESUMEN DE ALÍCUOTAS E IMPUESTOS FISCALES (SENIAT)',
        ['Concepto / Alícuota', 'Tasa', 'Base Imponible USD', 'Base Imponible VES', 'Débito Fiscal USD', 'Débito Fiscal VES', 'N° Operaciones', '% Part.'],
        taxData,
        taxTotal,
        ['left', 'center', 'right', 'right', 'right', 'right', 'center', 'right']
      );

      // Table 3: Top 10 Products
      const top10Data = topProductsList.slice(0, 10).map((p, idx) => [
        `#${idx + 1}`,
        p.name,
        p.sku,
        p.category,
        `${p.totalUnits}`,
        `Fac: ${p.unitsBySource.facturas} | NE: ${p.unitsBySource.notas} | Ped: ${p.unitsBySource.pedidos} | CxC: ${p.unitsBySource.credito}`,
        `$${p.avgPriceUsd.toFixed(2)}`,
        `$${p.totalRevenueUsd.toFixed(2)}`,
        `Bs. ${p.totalRevenueVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${p.percentage.toFixed(1)}%`
      ]);

      addStyledTable(
        sheetConsolidado,
        '3. RANKING OFICIAL: TOP 10 PRODUCTOS MÁS VENDIDOS (AUDITORÍA 4 CANALES)',
        ['Pos.', 'Producto / Artículo', 'SKU', 'Categoría', 'Unids', 'Desglose por Canal (Fac/NE/Ped/CxC)', 'P. Prom ($)', 'Total USD ($)', 'Total VES (Bs.)', '% Part.'],
        top10Data,
        undefined,
        ['center', 'left', 'center', 'left', 'center', 'left', 'right', 'right', 'right', 'right']
      );

      // Table 4: Transactions
      const txData = filteredTransactions.map(t => {
        const typeLabel = t.isCredit ? 'Crédito CxC' : t.sourceType === 'factura' ? 'Factura' : t.sourceType === 'nota_entrega' ? 'Nota Entrega' : 'Pedido Web';
        const banksText = t.bankAccountAllocations.map(b => b.bankAccountName).join(' + ') || t.paymentMethodText;
        const dateFormatted = new Date(t.date).toLocaleDateString('es-VE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return [
          dateFormatted,
          t.controlNumber,
          typeLabel,
          t.customerName,
          banksText,
          `${t.bcvRate.toFixed(2)}`,
          `$${t.totalUsd.toFixed(2)}`,
          `Bs. ${t.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          t.status
        ];
      });

      const totalUsdAll = filteredTransactions.reduce((acc, t) => acc + t.totalUsd, 0);
      const totalVesAll = filteredTransactions.reduce((acc, t) => acc + t.totalVes, 0);
      const txTotal = [
        'TOTAL GENERAL TRANSACCIONES',
        `${filteredTransactions.length} reg.`,
        '-',
        '-',
        '-',
        '-',
        `$${totalUsdAll.toFixed(2)}`,
        `Bs. ${totalVesAll.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        'Consolidado'
      ];

      addStyledTable(
        sheetConsolidado,
        `4. LIBRO DE TRANSACCIONES DETALLADO (${filteredTransactions.length} REGISTROS)`,
        ['Fecha / Hora', 'N° Comprobante', 'Tipo', 'Cliente', 'Cuenta(s) Bancaria(s)', 'Tasa BCV', 'Total USD ($)', 'Total VES (Bs.)', 'Estado'],
        txData,
        txTotal,
        ['center', 'center', 'center', 'left', 'left', 'right', 'right', 'right', 'center']
      );

      sheetConsolidado.columns = [
        { width: 32 },
        { width: 20 },
        { width: 25 },
        { width: 25 },
        { width: 28 },
        { width: 45 },
        { width: 15 },
        { width: 18 },
        { width: 22 },
        { width: 14 }
      ];

      // -------------------------------------------------------------
      // TAB 2: MÉTODOS DE PAGO
      // -------------------------------------------------------------
      const sheetMetodos = workbook.addWorksheet('Métodos de Pago', { views: [{ showGridLines: true }] });
      addHeaderBlock(sheetMetodos, 'CLASIFICACIÓN DE INGRESOS POR MÉTODOS DE PAGO');
      addStyledTable(
        sheetMetodos,
        '1. CLASIFICACIÓN DE INGRESOS POR CUENTAS BANCARIAS Y MÉTODOS DE PAGO',
        ['Cuenta Bancaria / Método', 'Moneda', 'Monto en Moneda Nativa', 'Equivalente USD ($)', 'Equivalente VES (Bs.)', 'N° Transacciones', '% Participación'],
        bankData,
        bankTotal,
        ['left', 'center', 'right', 'right', 'right', 'center', 'right']
      );
      sheetMetodos.columns = [
        { width: 40 },
        { width: 12 },
        { width: 28 },
        { width: 22 },
        { width: 25 },
        { width: 18 },
        { width: 16 }
      ];

      // -------------------------------------------------------------
      // TAB 3: ALÍCUOTAS E IMPUESTOS
      // -------------------------------------------------------------
      const sheetAlicuotas = workbook.addWorksheet('Alícuotas e Impuestos', { views: [{ showGridLines: true }] });
      addHeaderBlock(sheetAlicuotas, 'RESUMEN DE ALÍCUOTAS E IMPUESTOS FISCALES (SENIAT)');
      addStyledTable(
        sheetAlicuotas,
        '2. RESUMEN DE ALÍCUOTAS E IMPUESTOS FISCALES (SENIAT)',
        ['Concepto / Alícuota', 'Tasa', 'Base Imponible USD', 'Base Imponible VES', 'Débito Fiscal USD', 'Débito Fiscal VES', 'N° Operaciones', '% Part.'],
        taxData,
        taxTotal,
        ['left', 'center', 'right', 'right', 'right', 'right', 'center', 'right']
      );
      sheetAlicuotas.columns = [
        { width: 42 },
        { width: 10 },
        { width: 22 },
        { width: 25 },
        { width: 20 },
        { width: 22 },
        { width: 18 },
        { width: 14 }
      ];

      // -------------------------------------------------------------
      // TAB 4: TOP PRODUCTOS
      // -------------------------------------------------------------
      const sheetTopProductos = workbook.addWorksheet('Top Productos', { views: [{ showGridLines: true }] });
      addHeaderBlock(sheetTopProductos, 'RANKING OFICIAL: TOP PRODUCTOS MÁS VENDIDOS');
      const allProductsData = topProductsList.map((p, idx) => [
        `#${idx + 1}`,
        p.name,
        p.sku,
        p.category,
        `${p.totalUnits}`,
        `Fac: ${p.unitsBySource.facturas} | NE: ${p.unitsBySource.notas} | Ped: ${p.unitsBySource.pedidos} | CxC: ${p.unitsBySource.credito}`,
        `$${p.avgPriceUsd.toFixed(2)}`,
        `$${p.totalRevenueUsd.toFixed(2)}`,
        `Bs. ${p.totalRevenueVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${p.percentage.toFixed(1)}%`
      ]);
      addStyledTable(
        sheetTopProductos,
        '3. RANKING OFICIAL: TOP PRODUCTOS MÁS VENDIDOS (AUDITORÍA 4 CANALES)',
        ['Pos.', 'Producto / Artículo', 'SKU', 'Categoría', 'Unids', 'Desglose por Canal (Fac/NE/Ped/CxC)', 'P. Prom ($)', 'Total USD ($)', 'Total VES (Bs.)', '% Part.'],
        allProductsData,
        undefined,
        ['center', 'left', 'center', 'left', 'center', 'left', 'right', 'right', 'right', 'right']
      );
      sheetTopProductos.columns = [
        { width: 8 },
        { width: 40 },
        { width: 16 },
        { width: 18 },
        { width: 10 },
        { width: 45 },
        { width: 14 },
        { width: 16 },
        { width: 22 },
        { width: 12 }
      ];

      // -------------------------------------------------------------
      // TAB 5: LIBRO DE TRANSACCIONES
      // -------------------------------------------------------------
      const sheetTransacciones = workbook.addWorksheet('Libro de Transacciones', { views: [{ showGridLines: true }] });
      addHeaderBlock(sheetTransacciones, 'LIBRO DE TRANSACCIONES DETALLADO');
      addStyledTable(
        sheetTransacciones,
        `4. LIBRO DE TRANSACCIONES DETALLADO (${filteredTransactions.length} REGISTROS)`,
        ['Fecha / Hora', 'N° Comprobante', 'Tipo', 'Cliente', 'Cuenta(s) Bancaria(s)', 'Tasa BCV', 'Total USD ($)', 'Total VES (Bs.)', 'Estado'],
        txData,
        txTotal,
        ['center', 'center', 'center', 'left', 'left', 'right', 'right', 'right', 'center']
      );
      sheetTransacciones.columns = [
        { width: 22 },
        { width: 18 },
        { width: 16 },
        { width: 30 },
        { width: 35 },
        { width: 12 },
        { width: 16 },
        { width: 22 },
        { width: 14 }
      ];

      // Download file
      const fileName = `Reporte_Ventas_BellaVista_${startDate}_${endDate}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating Excel report:', err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6 font-poppins pb-16">
      {/* ------------------------------------------------------------- */}
      {/* 1. HEADER SECTION & MAIN CONTROLS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1D3557] to-[#457B9D] flex items-center justify-center text-white shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h1 id="sales-report-general-title" className="text-xl md:text-2xl font-black text-[#1D3557] tracking-tight">
                  Reporte - Ventas Generales
                </h1>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadAllData}
              disabled={isLoading}
              title="Actualizar"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 text-[#1D3557] bg-white hover:bg-slate-50 text-xs font-montserrat font-bold transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              <RefreshCw className={`w-4 h-4 text-[#005da9] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || filteredTransactions.length === 0}
              title="Exportar a Excel"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 text-[#1D3557] bg-white hover:bg-slate-50 text-xs font-montserrat font-bold transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#005da9]" />
              <span>{isExportingExcel ? 'Generando...' : 'Exportar a Excel'}</span>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isExportingPdf || filteredTransactions.length === 0}
              title="Exportar PDF"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 text-[#1D3557] bg-white hover:bg-slate-50 text-xs font-montserrat font-bold transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              <Download className={`w-4 h-4 text-[#005da9] ${isExportingPdf ? 'animate-bounce' : ''}`} />
              <span>{isExportingPdf ? 'Generando...' : 'PDF'}</span>
            </button>
          </div>
        </div>

        {/* Date Filter Quick Pills & Custom Range */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {(
              [
                { id: 'hoy', label: 'Hoy' },
                { id: 'ayer', label: 'Ayer' },
                { id: 'esta_semana', label: 'Esta Semana' },
                { id: 'este_mes', label: 'Este Mes' },
                { id: 'mes_anterior', label: 'Mes Anterior' },
                { id: 'ultimos_30', label: 'Últimos 30 días' },
                { id: 'todo', label: 'Histórico' }
              ] as const
            ).map(preset => (
              <button
                key={preset.id}
                onClick={() => handleDatePresetChange(preset.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-montserrat font-bold transition-all whitespace-nowrap cursor-pointer active:scale-98 ${
                  datePreset === preset.id
                    ? 'bg-white text-[#1D3557] border border-slate-300 shadow-2xs font-bold'
                    : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 border border-transparent'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 font-medium">Desde:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setDatePreset('personalizado');
                  }}
                  className="bg-transparent text-slate-800 font-bold outline-none cursor-pointer text-xs"
                />
                <span className="text-slate-400 font-medium ml-1">Hasta:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setDatePreset('personalizado');
                  }}
                  className="bg-transparent text-slate-800 font-bold outline-none cursor-pointer text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REPORT CLASSIFICATION TABS NAVIGATION */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-full border border-slate-200/80 shadow-2xs p-1.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Tab 1: Ventas */}
          <button
            type="button"
            onClick={() => setActiveTab('libro_ventas')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-full text-left transition-all cursor-pointer border active:scale-98 ${
              activeTab === 'libro_ventas'
                ? 'bg-white text-[#1D3557] border-[#1D3557] ring-2 ring-[#1D3557]/20 shadow-xs font-black'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs hover:shadow-xs font-bold'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-[#005da9]" />
              </div>
              <div className="truncate">
                <span className="font-montserrat text-xs md:text-sm block truncate">
                  Ventas
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full ml-1 shrink-0 bg-slate-100 text-[#1D3557] border border-slate-200">
              {filteredTransactions.length}
            </span>
          </button>

          {/* Tab 2: Métodos de Pago */}
          <button
            type="button"
            onClick={() => setActiveTab('metodo_pago')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-full text-left transition-all cursor-pointer border active:scale-98 ${
              activeTab === 'metodo_pago'
                ? 'bg-white text-[#1D3557] border-[#1D3557] ring-2 ring-[#1D3557]/20 shadow-xs font-black'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs hover:shadow-xs font-bold'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-[#005da9]" />
              </div>
              <div className="truncate">
                <span className="font-montserrat text-xs md:text-sm block truncate">
                  Método de Pago
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full ml-1 shrink-0 bg-slate-100 text-[#1D3557] border border-slate-200">
              {bankAccountsSummary.length}
            </span>
          </button>

          {/* Tab 3: Productos + Vendidos */}
          <button
            type="button"
            onClick={() => setActiveTab('top_productos')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-full text-left transition-all cursor-pointer border active:scale-98 ${
              activeTab === 'top_productos'
                ? 'bg-white text-[#1D3557] border-[#1D3557] ring-2 ring-[#1D3557]/20 shadow-xs font-black'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs hover:shadow-xs font-bold'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-[#005da9]" />
              </div>
              <div className="truncate">
                <span className="font-montserrat text-xs md:text-sm block truncate">
                  Productos + Vendidos
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full ml-1 shrink-0 bg-slate-100 text-[#1D3557] border border-slate-200">
              {topProductsList.length}
            </span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TOP METRICS & CLASSIFICATION (SOLO VISIBLE EN VENTAS) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'libro_ventas' && (
        <div id="sales-report-summary-cards" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Documentos / Ordenes */}
          <div className="bg-white hover:bg-slate-50 rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-center min-h-[100px]">
            <span className="text-xs md:text-sm font-montserrat font-bold text-[#1D3557] block mb-2">Ordenes:</span>
            <span className="text-3xl md:text-4xl font-black text-[#1D3557] tracking-tight">{metrics.count}</span>
          </div>

          {/* Card 2: Ingresos */}
          <div className="bg-white hover:bg-slate-50 rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-center min-h-[100px]">
            <span className="text-xs md:text-sm font-montserrat font-bold text-[#1D3557] block mb-2">Ingresos:</span>
            <span className="text-3xl md:text-4xl font-black text-[#1D3557] tracking-tight">
              ${metrics.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Card 3: Utilidad */}
          <div className="bg-white hover:bg-slate-50 rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-center min-h-[100px]">
            <span className="text-xs md:text-sm font-montserrat font-bold text-[#1D3557] block mb-2">Utilidad:</span>
            <span className="text-3xl md:text-4xl font-black text-[#1D3557] tracking-tight">
              ${metrics.totalUtilidad.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. ACTIVE TAB CONTENT VIEW */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'libro_ventas' && (
        <SalesLibroVentasTab
          filteredTransactions={filteredTransactions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          bankFilter={bankFilter}
          setBankFilter={setBankFilter}
          bankAccountsList={bankAccountsSummary}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          copiedCode={copiedCode}
          copyToClipboard={copyToClipboard}
          onSelectTransaction={setSelectedTransaction}
          metrics={metrics}
        />
      )}

      {activeTab === 'metodo_pago' && (
        <SalesMetodoPagoTab
          bankAccountsSummary={bankAccountsSummary}
          bankAccountsTotals={bankAccountsTotals}
          bankFilter={bankFilter}
          setBankFilter={setBankFilter}
        />
      )}

      {activeTab === 'top_productos' && (
        <SalesTopProductosTab
          topProductsList={topProductsList}
          filteredTopProducts={filteredTopProducts}
          productCategories={productCategories}
          productCategoryFilter={productCategoryFilter}
          setProductCategoryFilter={setProductCategoryFilter}
          productSortBy={productSortBy}
          setProductSortBy={setProductSortBy}
          productSearchTerm={productSearchTerm}
          setProductSearchTerm={setProductSearchTerm}
          topProductsLimit={topProductsLimit}
          setTopProductsLimit={setTopProductsLimit}
          topProductsTotals={topProductsTotals}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. MODAL: DETALLE COMPLETO DE TRANSACCIÓN */}
      {/* ------------------------------------------------------------- */}
      <SalesTransactionModal
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
