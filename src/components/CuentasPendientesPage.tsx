import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Search, ArrowLeftRight, TrendingUp, TrendingDown, DollarSign, 
  Calendar, Check, X, MoreVertical, FileText, AlertCircle, Clock, 
  Wallet, Building2, CreditCard, Receipt, ArrowDownRight, ArrowUpRight,
  ShieldCheck, RefreshCw, Printer, Trash2, Edit3, User, ChevronRight, CheckCircle2
} from 'lucide-react';
import { dbService, supabase } from '../lib/supabase';
import { AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment, BankAccount, StoreUser, PurchaseInstallment } from '../types';

const formatAmount = (val: number | undefined | null) => {
  const num = Number(val) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface CuentasPendientesPageProps {
  bcvRate: number;
  currentUser?: StoreUser | null;
  onRefreshData?: () => void;
}

interface PaymentTarget {
  type: 'group' | 'single';
  entityName: string;
  account?: AccountPayable | AccountReceivable;
  totalPending: number;
  selectedInstallment?: PurchaseInstallment;
  initialAmount?: number;
}

// Initial seed if no accounts exist in database or localStorage
const SEED_ACCOUNTS_PAYABLE: AccountPayable[] = [
  {
    id: 'cxp-seed-1',
    entity_name: 'mercado plaza',
    provider_name: 'mercado plaza',
    subject: 'carne',
    description: 'Cuenta por pagar generada por ingreso a inventario del item carne.',
    total_amount: 500.00,
    paid_amount: 0,
    remaining_amount: 500.00,
    status: 'pendiente',
    issue_date: '2024-07-10T13:48:00.000Z',
    due_date: new Date().toISOString(), // Today
    installments_count: 3,
    installments: [
      { number: 1, amount: 150.00, due_date: new Date().toISOString(), status: 'pendiente' },
      { number: 2, amount: 175.00, due_date: new Date(Date.now() + 86400000 * 7).toISOString(), status: 'pendiente' },
      { number: 3, amount: 175.00, due_date: new Date(Date.now() + 86400000 * 14).toISOString(), status: 'pendiente' }
    ],
    created_at: '2024-07-10T13:48:00.000Z'
  },
  {
    id: 'cxp-seed-2',
    entity_name: 'mercado plaza',
    provider_name: 'mercado plaza',
    subject: 'lechuga',
    description: 'Cuenta por pagar generada por ingreso a inventario del item lechuga.',
    total_amount: 150.00,
    paid_amount: 0,
    remaining_amount: 150.00,
    status: 'pendiente',
    issue_date: '2024-07-10T13:49:00.000Z',
    due_date: new Date().toISOString(), // Today
    installments_count: 2,
    installments: [
      { number: 1, amount: 75.00, due_date: new Date().toISOString(), status: 'pendiente' },
      { number: 2, amount: 75.00, due_date: new Date(Date.now() + 86400000 * 15).toISOString(), status: 'pendiente' }
    ],
    created_at: '2024-07-10T13:49:00.000Z'
  },
  {
    id: 'cxp-seed-3',
    entity_name: 'vendedor: Sebastian',
    provider_name: 'vendedor: Sebastian',
    subject: 'Factura #00001',
    description: 'Cuenta por pagar generada por servicios del personal en venta de productos.',
    total_amount: 17.50,
    paid_amount: 0,
    remaining_amount: 17.50,
    status: 'pendiente',
    issue_date: '2024-07-10T12:05:00.000Z',
    due_date: '',
    created_at: '2024-07-10T12:05:00.000Z'
  },
  {
    id: 'cxp-seed-4',
    entity_name: 'vendedor: Sebastian',
    provider_name: 'vendedor: Sebastian',
    subject: 'Factura #00002',
    description: 'Cuenta por pagar generada por servicios del personal en venta de productos.',
    total_amount: 0.90,
    paid_amount: 0,
    remaining_amount: 0.90,
    status: 'pendiente',
    issue_date: '2024-07-10T14:36:00.000Z',
    due_date: '',
    created_at: '2024-07-10T14:36:00.000Z'
  }
];

const SEED_ACCOUNTS_RECEIVABLE: AccountReceivable[] = [
  {
    id: 'cxc-seed-1',
    entity_name: 'Inversiones Los Andes C.A.',
    client_name: 'Inversiones Los Andes C.A.',
    customer_name: 'Inversiones Los Andes C.A.',
    subject: 'Factura #00451',
    description: 'Crédito otorgado por venta de material de oficina e impresiones corporativas.',
    total_amount: 320.00,
    paid_amount: 100.00,
    remaining_amount: 220.00,
    status: 'parcial',
    issue_date: '2024-07-08T10:30:00.000Z',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString(),
    installments_count: 3,
    installments: [
      { number: 1, amount: 100.00, due_date: '2024-07-08T10:30:00.000Z', status: 'pagado', paid_amount: 100.00, paid_at: '2024-07-08T10:30:00.000Z', payment_method: 'Abono Inicial' },
      { number: 2, amount: 110.00, due_date: new Date(Date.now() + 86400000 * 2).toISOString(), status: 'pendiente' },
      { number: 3, amount: 110.00, due_date: new Date(Date.now() + 86400000 * 9).toISOString(), status: 'pendiente' }
    ],
    created_at: '2024-07-08T10:30:00.000Z'
  },
  {
    id: 'cxc-seed-2',
    entity_name: 'Dra. Valentina Mendoza',
    client_name: 'Dra. Valentina Mendoza',
    customer_name: 'Dra. Valentina Mendoza',
    subject: 'Pedido #00892',
    description: 'Trabajos de diseño gráfico y encuadernado para congreso médico.',
    total_amount: 85.00,
    paid_amount: 0,
    remaining_amount: 85.00,
    status: 'pendiente',
    issue_date: '2024-07-12T15:20:00.000Z',
    due_date: new Date().toISOString(),
    created_at: '2024-07-12T15:20:00.000Z'
  }
];

export default function CuentasPendientesPage({
  bcvRate = 1,
  currentUser,
  onRefreshData
}: CuentasPendientesPageProps) {
  // Navigation tabs: 'pagar' (CxP) | 'cobrar' (CxC)
  const [activeTab, setActiveTab] = useState<'pagar' | 'cobrar'>('pagar');
  
  // Toggle: Ocultar cuentas en cero
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  
  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([]);
  const [accountsReceivable, setAccountsReceivable] = useState<AccountReceivable[]>([]);
  const [paymentsPayable, setPaymentsPayable] = useState<AccountPayablePayment[]>([]);
  const [paymentsReceivable, setPaymentsReceivable] = useState<AccountReceivablePayment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected entity for bottom detail table
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTargetAccount, setEditTargetAccount] = useState<AccountPayable | AccountReceivable | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTargetAccount, setHistoryTargetAccount] = useState<AccountPayable | AccountReceivable | null>(null);

  // Load all accounts and bank accounts
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [cxpList, cxcList, cxpPayments, cxcPayments, banks] = await Promise.all([
        dbService.getAccountsPayable().catch(() => []),
        dbService.getAccountsReceivable().catch(() => []),
        dbService.getAccountsPayablePayments().catch(() => []),
        dbService.getAccountsReceivablePayments().catch(() => []),
        dbService.getBankAccounts().catch(() => [])
      ]);

      // Seed if completely empty initially
      const hasCheckedCxP = localStorage.getItem('copias_bellavista_cxp_checked');
      let finalCxP = cxpList;
      if (!hasCheckedCxP && (!finalCxP || finalCxP.length === 0)) {
        finalCxP = SEED_ACCOUNTS_PAYABLE;
        localStorage.setItem('copias_bellavista_accounts_payable', JSON.stringify(SEED_ACCOUNTS_PAYABLE));
        SEED_ACCOUNTS_PAYABLE.forEach(item => dbService.saveAccountPayable(item).catch(() => {}));
      }
      localStorage.setItem('copias_bellavista_cxp_checked', 'true');

      const hasCheckedCxC = localStorage.getItem('copias_bellavista_cxc_checked');
      let finalCxC = cxcList;
      if (!hasCheckedCxC && (!finalCxC || finalCxC.length === 0)) {
        finalCxC = SEED_ACCOUNTS_RECEIVABLE;
        localStorage.setItem('copias_bellavista_accounts_receivable', JSON.stringify(SEED_ACCOUNTS_RECEIVABLE));
        SEED_ACCOUNTS_RECEIVABLE.forEach(item => dbService.saveAccountReceivable(item).catch(() => {}));
      }
      localStorage.setItem('copias_bellavista_cxc_checked', 'true');

      setAccountsPayable(finalCxP);
      setAccountsReceivable(finalCxC);
      setPaymentsPayable(cxpPayments || []);
      setPaymentsReceivable(cxcPayments || []);
      setBankAccounts(banks || []);
    } catch (e) {
      console.error('Error loading accounts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleCxPUpdate = (e: any) => {
      if (e.detail) setAccountsPayable(e.detail);
      else loadData();
    };
    const handleCxCUpdate = (e: any) => {
      if (e.detail) setAccountsReceivable(e.detail);
      else loadData();
    };
    const handlePaymentsUpdate = () => loadData();
    const handleBankUpdate = () => loadData();
    const handlePurchasesUpdate = () => loadData();

    window.addEventListener('bellavista_accounts_payable_updated', handleCxPUpdate);
    window.addEventListener('bellavista_accounts_receivable_updated', handleCxCUpdate);
    window.addEventListener('bellavista_accounts_payable_payments_updated', handlePaymentsUpdate);
    window.addEventListener('bellavista_accounts_receivable_payments_updated', handlePaymentsUpdate);
    window.addEventListener('bellavista_bank_accounts_updated', handleBankUpdate);
    window.addEventListener('bellavista_purchases_updated', handlePurchasesUpdate);

    // Supabase Realtime Channels
    let cxcChannel: any = null;
    let cxpChannel: any = null;
    let cxcPaymentsChannel: any = null;
    let cxpPaymentsChannel: any = null;

    if (supabase) {
      const channelSuffix = Math.random().toString(36).substring(2, 8);
      cxcChannel = supabase
        .channel(`cxc_sync_${channelSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accounts_receivable' },
          () => {
            loadData();
          }
        )
        .subscribe();

      cxpChannel = supabase
        .channel(`cxp_sync_${channelSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accounts_payable' },
          () => {
            loadData();
          }
        )
        .subscribe();

      cxcPaymentsChannel = supabase
        .channel(`cxc_pay_sync_${channelSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accounts_receivable_payments' },
          () => {
            loadData();
          }
        )
        .subscribe();

      cxpPaymentsChannel = supabase
        .channel(`cxp_pay_sync_${channelSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accounts_payable_payments' },
          () => {
            loadData();
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener('bellavista_accounts_payable_updated', handleCxPUpdate);
      window.removeEventListener('bellavista_accounts_receivable_updated', handleCxCUpdate);
      window.removeEventListener('bellavista_accounts_payable_payments_updated', handlePaymentsUpdate);
      window.removeEventListener('bellavista_accounts_receivable_payments_updated', handlePaymentsUpdate);
      window.removeEventListener('bellavista_bank_accounts_updated', handleBankUpdate);
      window.removeEventListener('bellavista_purchases_updated', handlePurchasesUpdate);

      if (cxcChannel) supabase.removeChannel(cxcChannel);
      if (cxpChannel) supabase.removeChannel(cxpChannel);
      if (cxcPaymentsChannel) supabase.removeChannel(cxcPaymentsChannel);
      if (cxpPaymentsChannel) supabase.removeChannel(cxpPaymentsChannel);
    };
  }, []);

  // Calculate helpers for days remaining
  const calculateDaysRemaining = (dueDate?: string, isPaidInFull?: boolean, isReceivable: boolean = true) => {
    if (isPaidInFull) {
      return { label: 'Pagada a tiempo', type: 'paid' };
    }
    if (!dueDate) return { label: '--', type: 'none' };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      const daysText = overdueDays === 1 ? '1 día' : `${overdueDays} días`;
      const label = isReceivable 
        ? `Cliente Moroso (${daysText})` 
        : `Vencido (${daysText})`;
      return { label, type: 'expired', overdueDays };
    }
    if (diffDays === 0) return { label: 'Hoy', type: 'today' };
    if (diffDays === 1) return { label: 'Mañana', type: 'soon' };
    return { label: `${diffDays} días`, type: 'normal' };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('es-ES', { 
        month: 'numeric', 
        day: 'numeric', 
        year: '2-digit', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    } catch {
      return dateStr;
    }
  };

  // Grouped items calculation
  interface EntityGroup {
    entityName: string;
    itemCount: number;
    totalPending: number;
    totalAmount: number;
    earliestDue?: string;
    items: (AccountPayable | AccountReceivable)[];
  }

  const currentList = activeTab === 'pagar' ? accountsPayable : accountsReceivable;

  const filteredList = useMemo(() => {
    return currentList.filter(item => {
      const entity = (item.entity_name || (item as any).provider_name || (item as any).client_name || (item as any).customer_name || '').toLowerCase();
      const subject = (item.subject || (item as any).invoice_number || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch = !q || entity.includes(q) || subject.includes(q) || desc.includes(q);
      const matchesZero = !hideZeroBalance || (Number(item.remaining_amount) > 0);

      return matchesSearch && matchesZero;
    });
  }, [currentList, searchQuery, hideZeroBalance]);

  const groupedEntities: EntityGroup[] = useMemo(() => {
    const map = new Map<string, EntityGroup>();

    filteredList.forEach(item => {
      const entity = item.entity_name || (item as any).provider_name || (item as any).client_name || (item as any).customer_name || 'Sin Asunto';
      
      if (!map.has(entity)) {
        map.set(entity, {
          entityName: entity,
          itemCount: 0,
          totalPending: 0,
          totalAmount: 0,
          earliestDue: undefined,
          items: []
        });
      }

      const group = map.get(entity)!;
      group.items.push(item);
      group.itemCount += 1;
      group.totalPending += Number(item.remaining_amount || 0);
      group.totalAmount += Number(item.total_amount || 0);

      if (item.due_date) {
        if (!group.earliestDue || new Date(item.due_date) < new Date(group.earliestDue)) {
          group.earliestDue = item.due_date;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending);
  }, [filteredList]);

  // Default selection to first group if none or invalid
  useEffect(() => {
    if (groupedEntities.length > 0) {
      if (!selectedEntity || !groupedEntities.some(g => g.entityName === selectedEntity)) {
        setSelectedEntity(groupedEntities[0].entityName);
      }
    } else {
      setSelectedEntity(null);
    }
  }, [groupedEntities, selectedEntity]);

  // Selected group items for detail view
  const selectedGroup = useMemo(() => {
    if (!selectedEntity) return null;
    return groupedEntities.find(g => g.entityName === selectedEntity) || null;
  }, [groupedEntities, selectedEntity]);

  // Grand Totals
  const totalPendingCxP = useMemo(() => {
    return accountsPayable.reduce((acc, item) => acc + Number(item.remaining_amount || 0), 0);
  }, [accountsPayable]);

  const totalPendingCxC = useMemo(() => {
    return accountsReceivable.reduce((acc, item) => acc + Number(item.remaining_amount || 0), 0);
  }, [accountsReceivable]);

  const currentTabTotalPending = useMemo(() => {
    return filteredList.reduce((acc, item) => acc + Number(item.remaining_amount || 0), 0);
  }, [filteredList]);

  // Handler to open group payment
  const handleOpenGroupPayment = (group: EntityGroup, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentTarget({
      type: 'group',
      entityName: group.entityName,
      totalPending: group.totalPending
    });
    setShowPaymentModal(true);
  };

  // Handler to open single item payment
  const handleOpenSinglePayment = (item: AccountPayable | AccountReceivable, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentTarget({
      type: 'single',
      entityName: item.entity_name || (item as any).provider_name || (item as any).client_name || '',
      account: item,
      totalPending: Number(item.remaining_amount || 0)
    });
    setShowPaymentModal(true);
  };

  // Handler to open specific installment payment with chronological validation
  const handleOpenInstallmentPayment = (
    item: AccountPayable | AccountReceivable,
    installment: PurchaseInstallment,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();

    // Sort installments in chronological order by number or due_date
    const allInsts = [...(item.installments || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
    
    // Find the very first unpaid installment
    const firstUnpaid = allInsts.find(inst => {
      const isPaid = inst.status === 'pagado' || (Number(inst.paid_amount || 0) >= Number(inst.amount || 0) - 0.001);
      return !isPaid;
    });

    const currentInstNum = installment.number || 1;
    const firstUnpaidNum = firstUnpaid ? (firstUnpaid.number || 1) : currentInstNum;

    // If user clicked an installment that is NOT the earliest unpaid installment
    let targetInstallment = installment;
    if (firstUnpaid && firstUnpaidNum < currentInstNum) {
      alert(`⚠️ Orden cronológico requerido:\nNo se puede ${activeTab === 'pagar' ? 'pagar' : 'cobrar'} la Cuota #${currentInstNum} mientras la Cuota #${firstUnpaidNum} permanezca pendiente. Se cargará automáticamente la Cuota #${firstUnpaidNum}.`);
      targetInstallment = firstUnpaid;
    }

    const instAmt = Number(targetInstallment.amount || 0);
    const instPaid = Number(targetInstallment.paid_amount || 0);
    const pendingForInst = Math.max(0, instAmt - instPaid);

    setPaymentTarget({
      type: 'single',
      entityName: item.entity_name || (item as any).provider_name || (item as any).client_name || '',
      account: item,
      totalPending: Number(item.remaining_amount || 0),
      selectedInstallment: targetInstallment,
      initialAmount: pendingForInst > 0 ? pendingForInst : instAmt
    });
    setShowPaymentModal(true);
  };

  // Delete account (Bloqueado para cuentas originadas de compras/cuentas por pagar)
  const handleDeleteAccount = async (id: string) => {
    if (activeTab === 'pagar') {
      alert('⚠️ Acción no permitida: Las cuentas por pagar / compras registradas no pueden ser eliminadas directamente para preservar la integridad contable y de inventario.');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar este registro de cuenta pendiente?')) return;
    await dbService.deleteAccountReceivable(id);
    loadData();
    if (onRefreshData) onRefreshData();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-poppins">
      {/* 1. TOP HEADER & METRIC SUMMARY */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#1D3557]/10 border border-[#1D3557]/20 flex items-center justify-center text-[#1D3557] shadow-2xs">
              <Receipt className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl font-montserrat font-extrabold text-[#1D3557] tracking-tight uppercase">
                Cuentas Pendientes
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar cuenta pendiente</span>
            </button>
          </div>
        </div>

        {/* Mini KPI Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-montserrat font-extrabold uppercase tracking-wider text-rose-600">Por Pagar (CxP)</span>
              <p className="text-xl font-black font-mono text-rose-950 mt-1">${formatAmount(totalPendingCxP)}</p>
              <p className="text-[11px] font-medium text-rose-600/80">Bs. {formatAmount(totalPendingCxP * bcvRate)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-montserrat font-extrabold uppercase tracking-wider text-emerald-600">Por Cobrar (CxC)</span>
              <p className="text-xl font-black font-mono text-emerald-950 mt-1">${formatAmount(totalPendingCxC)}</p>
              <p className="text-[11px] font-medium text-emerald-600/80">Bs. {formatAmount(totalPendingCxC * bcvRate)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#1D3557]/5 border border-[#1D3557]/15 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-montserrat font-extrabold uppercase tracking-wider text-[#1D3557]">Balance Neto</span>
              <p className={`text-xl font-black font-mono mt-1 ${totalPendingCxC >= totalPendingCxP ? 'text-emerald-700' : 'text-rose-700'}`}>
                ${formatAmount(totalPendingCxC - totalPendingCxP)}
              </p>
              <p className="text-[11px] font-medium text-[#1D3557]/80">
                {totalPendingCxC >= totalPendingCxP ? 'Superávit crediticio' : 'Déficit exigible'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#1D3557]/10 text-[#1D3557] flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-montserrat font-extrabold uppercase tracking-wider text-[#00BFFF]">Tasa BCV Oficial</span>
              <p className="text-xl font-black font-mono text-[#2B2D42] mt-1">Bs. {formatAmount(bcvRate)}</p>
              <p className="text-[11px] font-medium text-[#2B2D42]/70">Conversión en vivo</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#00BFFF]/10 text-[#00BFFF] flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. TABS & FILTER BAR */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {/* Main Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 px-6 pt-4 pb-0 gap-4">
          <div className="flex items-center gap-8">
            <button
              onClick={() => setActiveTab('pagar')}
              className={`pb-3.5 text-xs font-montserrat font-extrabold uppercase tracking-wider transition-all relative cursor-pointer ${
                activeTab === 'pagar' 
                  ? 'text-[#1D3557]' 
                  : 'text-gray-400 hover:text-[#2B2D42]'
              }`}
            >
              Cuentas por pagar
              {activeTab === 'pagar' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1D3557] rounded-t-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('cobrar')}
              className={`pb-3.5 text-xs font-montserrat font-extrabold uppercase tracking-wider transition-all relative cursor-pointer ${
                activeTab === 'cobrar' 
                  ? 'text-[#1D3557]' 
                  : 'text-gray-400 hover:text-[#2B2D42]'
              }`}
            >
              Cuentas por cobrar
              {activeTab === 'cobrar' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1D3557] rounded-t-full" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 pb-3.5 sm:pb-0">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#2B2D42]/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideZeroBalance}
                onChange={(e) => setHideZeroBalance(e.target.checked)}
                className="w-4 h-4 text-[#1D3557] rounded border-gray-300 focus:ring-[#1D3557]"
              />
              <span>Ocultar cuentas en cero</span>
            </label>
          </div>
        </div>

        {/* Subheader, Search Bar and Total Badge */}
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-base font-montserrat font-extrabold text-[#1D3557] tracking-tight">
            {activeTab === 'pagar' ? 'Cuentas pendientes por pagar' : 'Cuentas pendientes por cobrar'}
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 max-w-xl justify-end">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00BFFF]" />
              <input
                type="text"
                placeholder="Búsqueda de texto completo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-[#F8F9FA] border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#1D3557] transition-all text-[#2B2D42]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="bg-[#1D3557] text-white font-montserrat font-extrabold px-6 py-2 rounded-2xl text-xs flex items-center justify-center whitespace-nowrap shadow-2xs">
              Total: ${formatAmount(currentTabTotalPending)}
            </div>
          </div>
        </div>

        {/* 3. GROUPED UPPER TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase tracking-wider bg-[#F8F9FA]">
                <th className="py-3 px-6 w-12 text-center"></th>
                <th className="py-3 px-6">Asunto</th>
                <th className="py-3 px-6 text-center">Cuentas pendientes</th>
                <th className="py-3 px-6 text-right">
                  {activeTab === 'pagar' ? 'Por pagar' : 'Por cobrar'}
                </th>
                <th className="py-3 px-6 text-center">Días restantes</th>
                <th className="py-3 px-6 text-center w-36">
                  {activeTab === 'pagar' ? 'Pago' : 'Cobro'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {groupedEntities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Receipt className="w-8 h-8 text-gray-300" />
                      <p className="font-semibold text-gray-500">No hay cuentas pendientes registradas</p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="text-xs text-[#00BFFF] font-bold hover:underline"
                      >
                        + Agregar la primera cuenta
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedEntities.map((group) => {
                  const isSelected = selectedEntity === group.entityName;
                  const isPaidInFull = Number(group.totalPending || 0) <= 0;
                  const days = calculateDaysRemaining(group.earliestDue, isPaidInFull, activeTab === 'cobrar');

                  return (
                    <tr
                      key={group.entityName}
                      onClick={() => setSelectedEntity(group.entityName)}
                      className={`cursor-pointer transition-colors group ${
                        isSelected 
                          ? 'bg-[#1D3557]/5 border-l-4 border-l-[#1D3557]' 
                          : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      {/* Checkbox / Radio Selection */}
                      <td className="py-4 px-6 text-center">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'bg-[#1D3557] text-white shadow-2xs' 
                            : 'border-2 border-gray-300 group-hover:border-gray-400'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </td>

                      {/* Asunto */}
                      <td className="py-4 px-6 font-extrabold text-[#2B2D42]">
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{group.entityName}</span>
                        </div>
                      </td>

                      {/* Cuentas Pendientes Count */}
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center justify-center gap-1 font-bold text-[#2B2D42] bg-[#F8F9FA] border border-gray-200 px-2.5 py-0.5 rounded-full text-xs">
                          {group.itemCount}
                        </span>
                      </td>

                      {/* Por pagar / Por cobrar */}
                      <td className="py-4 px-6 text-right font-black font-mono text-[#2B2D42]">
                        ${formatAmount(group.totalPending)}
                      </td>

                      {/* Días restantes */}
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          days.type === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          days.type === 'expired' ? 'bg-rose-100 text-rose-700' :
                          days.type === 'today' ? 'bg-amber-100 text-amber-700' :
                          days.type === 'soon' ? 'bg-orange-100 text-orange-700' :
                          'text-gray-500'
                        }`}>
                          {days.label}
                        </span>
                      </td>

                      {/* Pagar Todo / Cobrar Todo CTA */}
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={(e) => handleOpenGroupPayment(group, e)}
                          disabled={group.totalPending <= 0}
                          className="w-full bg-[#40E0D0] hover:bg-[#36cebf] text-[#1D3557] font-montserrat font-extrabold text-xs py-2 px-4 rounded-xl shadow-2xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {activeTab === 'pagar' ? 'Pagar todo' : 'Cobrar todo'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. LOWER DETAIL SECTION */}
      {selectedGroup && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-md bg-[#1D3557] text-white flex items-center justify-center shadow-2xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <h3 className="text-sm md:text-base font-montserrat font-extrabold text-[#1D3557] tracking-tight">
                Detalle de <span className="uppercase font-black">{selectedGroup.entityName}</span>
              </h3>
            </div>

            <div className="text-xs text-[#2B2D42]/70 font-medium">
              {selectedGroup.items.length} {selectedGroup.items.length === 1 ? 'cuenta asociada' : 'cuentas asociadas'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase tracking-wider bg-[#F8F9FA]">
                  <th className="py-3 px-4">ASUNTO</th>
                  <th className="py-3 px-4">EMISIÓN</th>
                  <th className="py-3 px-4">EXPIRACIÓN</th>
                  <th className="py-3 px-4 text-center">DÍAS RESTANTES</th>
                  <th className="py-3 px-4">DESCRIPCIÓN</th>
                  <th className="py-3 px-4 text-right">MONTO</th>
                  <th className="py-3 px-4 text-center w-52">ACCIÓN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {selectedGroup.items.map((item) => {
                  const isPaidInFull = Number(item.remaining_amount || 0) <= 0;
                  const days = calculateDaysRemaining(item.due_date, isPaidInFull, activeTab === 'cobrar');
                  const hasInstallments = item.installments && item.installments.length > 0;

                  // Find first unpaid installment for chronological validation
                  const sortedInsts = hasInstallments
                    ? [...(item.installments || [])].sort((a, b) => (a.number || 0) - (b.number || 0))
                    : [];
                  const firstUnpaidInst = sortedInsts.find(inst => {
                    return inst.status !== 'pagado' && (Number(inst.paid_amount || 0) < Number(inst.amount || 0) - 0.001);
                  });
                  const firstUnpaidInstNumber = firstUnpaidInst ? (firstUnpaidInst.number || 1) : 1;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-[#F8F9FA]/70 transition-colors">
                        {/* Asunto / Item concept */}
                        <td className="py-3.5 px-4 font-bold text-[#1D3557]">
                          <div className="flex flex-col gap-1">
                            <span className="font-extrabold text-[#1D3557] text-xs">
                              {item.subject || (item as any).invoice_number || (item as any).purchase_id || (activeTab === 'pagar' ? 'Cuenta por Pagar' : 'Cuenta por Cobrar')}
                            </span>
                            {hasInstallments && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1D3557]/10 text-[#1D3557] font-extrabold text-[10px] uppercase tracking-wider">
                                  <CreditCard className="w-3 h-3 text-[#1D3557]" />
                                  {item.installments!.length} Cuotas registradas
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Emisión */}
                        <td className="py-3.5 px-4 text-[#2B2D42] whitespace-nowrap font-medium text-xs">
                          {formatDate(item.issue_date || item.created_at)}
                        </td>

                        {/* Expiración */}
                        <td className="py-3.5 px-4 text-[#2B2D42] whitespace-nowrap font-medium text-xs">
                          {item.due_date ? formatDate(item.due_date) : '--'}
                        </td>

                        {/* Días restantes */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`text-xs font-bold ${
                            days.type === 'paid' ? 'text-emerald-600' :
                            days.type === 'expired' ? 'text-rose-600' :
                            days.type === 'today' ? 'text-amber-600' :
                            days.type === 'soon' ? 'text-orange-600' :
                            'text-[#2B2D42]'
                          }`}>
                            {days.label}
                          </span>
                        </td>

                        {/* Descripción */}
                        <td className="py-3.5 px-4 text-[#2B2D42]/80 max-w-xs text-xs">
                          {item.description || (activeTab === 'pagar' ? 'Crédito registrado vía Compra' : 'Crédito registrado vía Venta')}
                        </td>

                        {/* Monto pendiente */}
                        <td className="py-3.5 px-4 text-right font-extrabold font-mono text-[#2B2D42] whitespace-nowrap text-xs">
                          ${formatAmount(item.remaining_amount)}
                        </td>

                        {/* Action Buttons: Pagar/Cobrar + Modificar + Historial */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => handleOpenSinglePayment(item, e)}
                              disabled={Number(item.remaining_amount) <= 0}
                              className="bg-[#40E0D0] hover:bg-[#36cebf] text-[#1D3557] font-montserrat font-extrabold text-xs py-1.5 px-4 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                            >
                              {activeTab === 'pagar' ? 'Pagar' : 'Cobrar'}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditTargetAccount(item);
                                setShowEditModal(true);
                              }}
                              title="Modificar esta cuenta"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#1D3557] font-montserrat font-bold rounded-xl border border-gray-300 transition-all active:scale-95 text-xs whitespace-nowrap cursor-pointer shadow-2xs"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#1D3557]" />
                              <span>Modificar</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistoryTargetAccount(item);
                                setShowHistoryModal(true);
                              }}
                              title="Ver historial de pagos / abonos"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-montserrat font-bold rounded-xl border border-sky-200 transition-all active:scale-95 text-xs whitespace-nowrap cursor-pointer shadow-2xs"
                            >
                              <FileText className="w-3.5 h-3.5 text-sky-500" />
                              <span>Historial</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Sub-grid of installments with individual action buttons and chronological ordering */}
                      {hasInstallments && (
                        <tr className="bg-slate-50/60 border-b border-gray-200">
                          <td colSpan={7} className="py-2.5 px-6">
                            <div className="bg-white rounded-xl border border-gray-200/80 p-3 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="w-3.5 h-3.5 text-[#1D3557]" />
                                  <span className="font-montserrat font-extrabold text-xs text-[#1D3557] uppercase tracking-wide">
                                    Cronograma de Cuotas ({item.installments!.length} cuotas)
                                  </span>
                                </div>
                                <span className="text-[11px] text-gray-500 font-medium">
                                  Pagos ordenados cronológicamente
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                                {sortedInsts.map((inst, idx) => {
                                  const instNum = inst.number || idx + 1;
                                  const isPaid = inst.status === 'pagado' || (Number(inst.paid_amount || 0) >= Number(inst.amount || 0) - 0.001);
                                  const instAmt = Number(inst.amount || 0);
                                  const instPaidAmt = Number(inst.paid_amount || 0);
                                  const instPendingAmt = Math.max(0, instAmt - instPaidAmt);
                                  const isNextInLine = !isPaid && instNum === firstUnpaidInstNumber;

                                  return (
                                    <div
                                      key={idx}
                                      className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 transition-all ${
                                        isPaid
                                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                          : isNextInLine
                                            ? 'bg-white border-[#40E0D0] ring-2 ring-[#40E0D0]/20 shadow-xs'
                                            : 'bg-white border-gray-200 text-[#2B2D42]'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                                            isPaid
                                              ? 'bg-emerald-200 text-emerald-800'
                                              : isNextInLine
                                                ? 'bg-[#1D3557] text-white'
                                                : 'bg-gray-100 text-gray-600'
                                          }`}>
                                            {instNum}
                                          </span>
                                          <div>
                                            <span className="font-montserrat font-extrabold text-xs block text-[#1D3557]">
                                              Cuota #{instNum}
                                            </span>
                                            <span className="text-[10px] text-gray-500 block">
                                              Vence: {inst.due_date ? formatDate(inst.due_date) : '--'}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="text-right">
                                          <span className="font-mono font-black text-xs block text-[#1D3557]">
                                            ${formatAmount(instAmt)}
                                          </span>
                                          {instPaidAmt > 0 && !isPaid && (
                                            <span className="text-[10px] text-amber-600 font-medium block">
                                              Abonado: ${formatAmount(instPaidAmt)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Individual action button per installment */}
                                      <div className="pt-1.5 border-t border-gray-100/80 flex items-center justify-between">
                                        <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                          isPaid
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : isNextInLine
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {isPaid ? 'Pagada' : isNextInLine ? 'Siguiente a Pagar' : 'Pendiente'}
                                        </span>

                                        {isPaid ? (
                                          <span className="inline-flex items-center gap-1 text-emerald-700 font-extrabold text-xs">
                                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                                            Saldada
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => handleOpenInstallmentPayment(item, inst, e)}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-montserrat font-extrabold transition-all active:scale-95 shadow-2xs cursor-pointer ${
                                              isNextInLine
                                                ? 'bg-[#40E0D0] hover:bg-[#36cebf] text-[#1D3557]'
                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                                            }`}
                                            title={
                                              isNextInLine
                                                ? `Pagar Cuota #${instNum} ($${formatAmount(instPendingAmt)})`
                                                : `Pagar Cuota #${instNum} (se verificará orden cronológico)`
                                            }
                                          >
                                            <DollarSign className="w-3 h-3" />
                                            <span>{activeTab === 'pagar' ? 'Pagar' : 'Cobrar'} Cuota #{instNum}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PAYMENT / COBRO MODAL (Matches Image 2 Exactly) */}
      {showPaymentModal && paymentTarget && (
        <PaymentModal
          type={activeTab}
          target={paymentTarget}
          bankAccounts={bankAccounts}
          bcvRate={bcvRate}
          currentUser={currentUser}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentTarget(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setPaymentTarget(null);
            loadData();
            if (onRefreshData) onRefreshData();
          }}
        />
      )}

      {/* 6. ADD ACCOUNT MODAL */}
      {showAddModal && (
        <AddAccountModal
          defaultType={activeTab}
          bcvRate={bcvRate}
          currentUser={currentUser}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadData();
            if (onRefreshData) onRefreshData();
          }}
        />
      )}

      {/* 6.5 EDIT ACCOUNT MODAL */}
      {showEditModal && editTargetAccount && (
        <EditAccountModal
          account={editTargetAccount}
          type={activeTab}
          bcvRate={bcvRate}
          currentUser={currentUser}
          onClose={() => {
            setShowEditModal(false);
            setEditTargetAccount(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditTargetAccount(null);
            loadData();
            if (onRefreshData) onRefreshData();
          }}
        />
      )}

      {/* 7. HISTORY MODAL */}
      {showHistoryModal && historyTargetAccount && (
        <HistoryModal
          account={historyTargetAccount}
          type={activeTab}
          bcvRate={bcvRate}
          onClose={() => {
            setShowHistoryModal(false);
            setHistoryTargetAccount(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// MODAL: PAGO / COBRO DE CUENTAS ASOCIADAS
// ============================================================================
interface PaymentModalProps {
  type: 'pagar' | 'cobrar';
  target: PaymentTarget;
  bankAccounts: BankAccount[];
  bcvRate: number;
  currentUser?: StoreUser | null;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({
  type,
  target,
  bankAccounts,
  bcvRate,
  currentUser,
  onClose,
  onSuccess
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>('EFECTIVO');
  
  // Installment selection state
  const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState<number | null>(
    target.selectedInstallment?.number || null
  );

  const initialAmountValue = target.initialAmount != null
    ? target.initialAmount
    : target.totalPending;

  const [amountUsd, setAmountUsd] = useState<string>(initialAmountValue.toString());
  
  // Filter accounts: When collecting a receivable (cobrar), "Cuentas por Cobrar (Crédito Cliente)" CANNOT be chosen as destination
  const availableBankAccounts = type === 'cobrar'
    ? (bankAccounts || []).filter(b => b.id !== 'cxc-virtual' && !b.name?.toLowerCase().includes('cuentas por cobrar'))
    : (bankAccounts || []);

  // Intelligent default bank account based on payment method / first available
  const [selectedBankId, setSelectedBankId] = useState<string>(() => {
    if (!availableBankAccounts || availableBankAccounts.length === 0) return '';
    return availableBankAccounts[0].id;
  });
  
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState<string>(() => {
    if (target.selectedInstallment) {
      return `${type === 'pagar' ? 'Pago' : 'Cobro'} de Cuota #${target.selectedInstallment.number} - ${target.account?.subject || target.entityName}`;
    }
    return '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const numAmount = parseFloat(amountUsd) || 0;
  const numAmountBs = numAmount * bcvRate;

  // Selected bank object
  const selectedBank = availableBankAccounts?.find(b => b.id === selectedBankId);
  const isBankVES = selectedBank?.currency === 'VES';
  const amountForBank = isBankVES ? numAmountBs : numAmount;

  // Update bank selection when payment method changes if not manually picked
  const handlePaymentMethodChange = (newMethod: string) => {
    setPaymentMethod(newMethod);
    if (!availableBankAccounts || availableBankAccounts.length === 0) return;

    if (newMethod === 'PAGO MÓVIL' || newMethod === 'PUNTO DE VENTA' || newMethod === 'TRANSFERENCIA') {
      const vesBank = availableBankAccounts.find(b => b.currency === 'VES');
      if (vesBank) setSelectedBankId(vesBank.id);
    } else if (newMethod === 'ZELLE') {
      const usdBank = availableBankAccounts.find(b => b.currency === 'USD');
      if (usdBank) setSelectedBankId(usdBank.id);
    } else if (newMethod === 'EFECTIVO') {
      const cashBank = availableBankAccounts.find(b => b.name?.toLowerCase().includes('efectivo') || b.name?.toLowerCase().includes('caja')) || availableBankAccounts[0];
      if (cashBank) setSelectedBankId(cashBank.id);
    }
  };

  // Handler to select an installment inside modal with chronological order validation
  const handleSelectInstallment = (inst: any) => {
    const insts = target.account?.installments || [];
    const sorted = [...insts].sort((a, b) => (a.number || 0) - (b.number || 0));
    
    // Find the first unpaid installment
    const firstUnpaid = sorted.find(i => {
      const isPaid = i.status === 'pagado' || (Number(i.paid_amount || 0) >= Number(i.amount || 0) - 0.001);
      return !isPaid;
    });

    const instNum = inst.number || 1;
    const firstUnpaidNum = firstUnpaid ? (firstUnpaid.number || 1) : instNum;

    let targetInst = inst;
    if (firstUnpaid && firstUnpaidNum < instNum) {
      setErrorMsg(`⚠️ Orden cronológico: Se cargó la Cuota #${firstUnpaidNum} porque la Cuota #${firstUnpaidNum} debe ser pagada antes de la Cuota #${instNum}.`);
      targetInst = firstUnpaid;
    } else {
      setErrorMsg('');
    }

    const finalInstNum = targetInst.number || 1;
    const instAmt = Number(targetInst.amount || 0);
    const instPaid = Number(targetInst.paid_amount || 0);
    const remainingForInst = Math.max(0, instAmt - instPaid);
    const targetAmt = remainingForInst > 0 ? remainingForInst : instAmt;

    setSelectedInstallmentNumber(finalInstNum);
    setAmountUsd(Math.min(targetAmt, target.totalPending).toString());
    setNotes(`${type === 'pagar' ? 'Pago' : 'Cobro'} de Cuota #${finalInstNum} - ${target.account?.subject || target.entityName}`);
  };

  const handleSelectTotal = () => {
    setSelectedInstallmentNumber(null);
    setAmountUsd(target.totalPending.toString());
    setNotes(`Liquidación total - ${target.account?.subject || target.entityName}`);
  };

  // Title
  const modalTitle = target.type === 'group'
    ? `${type === 'pagar' ? 'Pago' : 'Cobro'} de cuentas asociadas a ${target.entityName}`
    : selectedInstallmentNumber 
      ? `${type === 'pagar' ? 'Pago' : 'Cobro'} de Cuota #${selectedInstallmentNumber}: ${target.account?.subject || target.entityName}`
      : `${type === 'pagar' ? 'Pago' : 'Cobro'} de cuenta: ${target.account?.subject || target.entityName}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setErrorMsg('Por favor ingresa un monto válido mayor a 0');
      return;
    }
    if (numAmount > target.totalPending + 0.01) {
      setErrorMsg(`El monto ingresado ($${numAmount}) no puede exceder el total pendiente ($${target.totalPending.toFixed(2)})`);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const basePayment = {
        amount_bs: numAmountBs,
        payment_method: paymentMethod,
        bank_account_id: selectedBankId || undefined,
        payment_date: new Date().toISOString(),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        installment_number: selectedInstallmentNumber || undefined,
        created_by: currentUser?.name || 'Administrador'
      };

      if (type === 'pagar') {
        if (target.type === 'single' && target.account) {
          await dbService.payAccountPayable({
            id: crypto.randomUUID(),
            account_payable_id: target.account.id,
            cxp_id: target.account.id,
            amount: numAmount,
            ...basePayment
          });
        } else {
          await dbService.payBatchAccountsPayable(target.entityName, numAmount, basePayment);
        }
      } else {
        if (target.type === 'single' && target.account) {
          await dbService.payAccountReceivable({
            id: crypto.randomUUID(),
            account_receivable_id: target.account.id,
            cxc_id: target.account.id,
            amount: numAmount,
            ...basePayment
          });
        } else {
          await dbService.payBatchAccountsReceivable(target.entityName, numAmount, basePayment);
        }
      }

      window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated'));
      window.dispatchEvent(new CustomEvent('bellavista_bank_transfers_updated'));

      onSuccess();
    } catch (err: any) {
      console.error('Error processing payment:', err);
      setErrorMsg(err.message || 'Ocurrió un error al procesar la transacción');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-montserrat font-extrabold text-[#1D3557] tracking-tight">
              {modalTitle}
            </h3>
            {target.account?.subject && (
              <p className="text-xs text-[#2B2D42]/70 font-medium mt-0.5">
                {target.entityName} • {target.account.subject}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 font-poppins">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top Quick Summary */}
          <div className="bg-[#1D3557]/5 border border-[#1D3557]/15 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-[#2B2D42]/70 font-medium">Deuda total pendiente:</span>
              <p className="text-base font-black font-mono text-[#1D3557]">${formatAmount(target.totalPending)}</p>
            </div>
            <div className="text-right">
              <span className="text-[#2B2D42]/70 font-medium">Equivalente en Bs:</span>
              <p className="text-xs font-bold font-mono text-[#00BFFF]">Bs. {formatAmount(target.totalPending * bcvRate)}</p>
            </div>
          </div>

          {/* Dedicated Cuotas Selector when account has installments */}
          {target.account?.installments && target.account.installments.length > 0 && (
            <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-montserrat font-extrabold text-[#1D3557] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Seleccionar Cuota a {type === 'pagar' ? 'Pagar' : 'Cobrar'}:</span>
                </label>
                <span className="text-[11px] font-bold text-gray-500">
                  {target.account.installments.length} cuotas en total
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {target.account.installments.map((inst: any, idx: number) => {
                  const instNum = inst.number || idx + 1;
                  const isPaid = inst.status === 'pagado' || (Number(inst.paid_amount || 0) >= Number(inst.amount || 0) - 0.001);
                  const isSelected = selectedInstallmentNumber === instNum;
                  const instAmt = Number(inst.amount || 0);

                  if (isPaid) {
                    return (
                      <div
                        key={idx}
                        className="px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between opacity-80"
                      >
                        <span className="font-bold flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" /> Cuota #{instNum}
                        </span>
                        <span className="font-mono font-bold">${formatAmount(instAmt)} (Pagada)</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectInstallment(inst)}
                      className={`px-3 py-2 rounded-xl border text-xs font-montserrat transition-all text-left flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-md scale-[1.02]'
                          : 'bg-white text-[#2B2D42] border-gray-300 hover:border-[#40E0D0] hover:bg-[#40E0D0]/10'
                      }`}
                    >
                      <span className="font-extrabold">Cuota #{instNum}</span>
                      <span className="font-mono font-black">${formatAmount(instAmt)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSelectTotal}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                    selectedInstallmentNumber === null
                      ? 'bg-[#40E0D0] text-[#1D3557] border-[#40E0D0] font-extrabold shadow-2xs'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                  }`}
                >
                  Pagar todo el saldo (${formatAmount(target.totalPending)})
                </button>
              </div>
            </div>
          )}

          {/* Método de pago + Monto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-montserrat font-extrabold text-[#2B2D42] mb-1.5">
                Método de pago:
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold text-[#2B2D42] bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] shadow-xs"
              >
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="PAGO MÓVIL">PAGO MÓVIL</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="PUNTO DE VENTA">PUNTO DE VENTA</option>
                <option value="ZELLE">ZELLE</option>
                <option value="DÉBITO BANCARIO">DÉBITO BANCARIO</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-montserrat font-extrabold text-[#2B2D42] mb-1.5">
                Monto a {type === 'pagar' ? 'Pagar' : 'Cobrar'} (USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={target.totalPending}
                value={amountUsd}
                onChange={(e) => {
                  setAmountUsd(e.target.value);
                  setSelectedInstallmentNumber(null);
                }}
                placeholder="200"
                required
                className="w-full px-3.5 py-2.5 text-xs font-bold font-mono text-[#2B2D42] bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] shadow-xs"
              />
            </div>
          </div>

          {/* Bank Account Selection */}
          {availableBankAccounts && availableBankAccounts.length > 0 && (
            <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-montserrat font-extrabold text-[#1D3557]">
                  {type === 'cobrar' ? 'Cuenta bancaria de destino (donde se abona el dinero cobrado):' : 'Cuenta Bancaria (de donde sale el dinero):'}
                </label>
              </div>

              {type === 'cobrar' && (
                <p className="text-[11px] text-[#1D3557]/80 bg-blue-50 border border-blue-150 rounded-lg p-2 leading-relaxed">
                  💡 Al cobrar, se <strong>rebaja el saldo de Cuentas por Cobrar (Crédito Cliente)</strong> y se <strong>abona</strong> a la cuenta que elijas abajo (no se puede cobrar a la misma cuenta de crédito).
                </p>
              )}

              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-semibold text-[#2B2D42] bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#1D3557] shadow-xs"
              >
                <option value="">-- No vincular a cuenta bancaria (Solo registro contable) --</option>
                {availableBankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name || b.name} ({b.currency}) • Saldo: {b.currency === 'USD' ? '$' : 'Bs.'} {formatAmount(b.balance)}
                  </option>
                ))}
              </select>

              {selectedBank && numAmount > 0 && (
                <div className="text-[11px] bg-white border border-gray-200 rounded-lg p-2.5 text-[#2B2D42] space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span>
                      {type === 'pagar' ? 'Se debitará:' : 'Se abonará a:'}{' '}
                      <strong className="text-[#1D3557] font-mono font-bold">
                        {isBankVES ? `Bs. ${formatAmount(amountForBank)}` : `$${formatAmount(amountForBank)}`}
                      </strong>{' '}
                      en {selectedBank.bank_name || selectedBank.name}
                    </span>
                    <span className="text-[#2B2D42]/70 font-mono text-[10px]">
                      Saldo final:{' '}
                      <strong className={type === 'pagar' ? 'text-amber-700' : 'text-emerald-700'}>
                        {isBankVES ? 'Bs. ' : '$'}
                        {formatAmount(
                          type === 'pagar'
                            ? Number(selectedBank.balance) - amountForBank
                            : Number(selectedBank.balance) + amountForBank
                        )}
                      </strong>
                    </span>
                  </div>

                  {type === 'cobrar' && (
                    <div className="flex items-center justify-between text-[11px] text-rose-700 pt-1.5 border-t border-gray-100 font-medium">
                      <span>📉 Se rebaja de Cuentas por Cobrar (Crédito Cliente):</span>
                      <strong className="font-mono font-bold text-rose-800">-${formatAmount(numAmount)} USD</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reference & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Referencia bancaria:
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej. 948271"
                className="w-full px-3 py-2 text-xs text-[#2B2D42] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557]"
              />
            </div>

            <div>
              <label className="block text-xs font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Nota / Observación:
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Abono o liquidación"
                className="w-full px-3 py-2 text-xs text-[#2B2D42] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557]"
              />
            </div>
          </div>

          {/* Amount in Bs Preview */}
          <div className="text-right text-[11px] text-[#2B2D42]/70 font-poppins">
            Total en Bolívares equivalente: <span className="font-bold font-mono text-[#1D3557]">Bs. {formatAmount(numAmountBs)}</span>
          </div>

          {/* Confirm Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-[#40E0D0] hover:bg-[#36cebf] text-[#1D3557] font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Procesando...' : selectedInstallmentNumber ? `${type === 'pagar' ? 'Confirmar pago de Cuota #' : 'Confirmar cobro de Cuota #'}${selectedInstallmentNumber}` : (type === 'pagar' ? 'Confirmar pago' : 'Confirmar cobro')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: AGREGAR CUENTA PENDIENTE (+ Nueva CxP o CxC)
// ============================================================================
interface AddAccountModalProps {
  defaultType: 'pagar' | 'cobrar';
  bcvRate: number;
  currentUser?: StoreUser | null;
  onClose: () => void;
  onSuccess: () => void;
}

function AddAccountModal({
  defaultType,
  bcvRate,
  currentUser,
  onClose,
  onSuccess
}: AddAccountModalProps) {
  const [accountType, setAccountType] = useState<'pagar' | 'cobrar'>(defaultType);
  const [entityName, setEntityName] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [initialPayment, setInitialPayment] = useState('0');
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [dueDate, setDueDate] = useState<string>('');
  const [enableInstallments, setEnableInstallments] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState<number>(3);
  const [installmentFrequency, setInstallmentFrequency] = useState<'semanal' | 'quincenal' | 'mensual'>('mensual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Calculate generated installments preview
  const generateInstallmentsList = (total: number, paid: number, count: number, freq: string, startIso: string): PurchaseInstallment[] => {
    if (count <= 1) return [];
    const remainingToFinance = Math.max(0, total - paid);
    const amountPerInstallment = Number((remainingToFinance / count).toFixed(2));
    const daysStep = freq === 'semanal' ? 7 : freq === 'quincenal' ? 15 : 30;
    const baseDate = startIso ? new Date(startIso) : new Date();

    const result: PurchaseInstallment[] = [];
    let runningSum = 0;

    for (let i = 1; i <= count; i++) {
      const instDueDate = new Date(baseDate.getTime() + i * daysStep * 24 * 60 * 60 * 1000);
      const isLast = i === count;
      const finalAmt = isLast ? Number((remainingToFinance - runningSum).toFixed(2)) : amountPerInstallment;
      runningSum += finalAmt;

      result.push({
        id: crypto.randomUUID(),
        number: i,
        amount: finalAmt,
        due_date: instDueDate.toISOString(),
        status: 'pendiente',
        paid_amount: 0
      });
    }
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numTotal = parseFloat(totalAmount);
    const numPaid = parseFloat(initialPayment) || 0;

    if (!entityName.trim()) {
      setErrorMsg('Por favor ingresa el Asunto / Entidad principal (Proveedor o Cliente)');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('Por favor ingresa el Concepto / Sub-asunto (ej. Factura #, Insumo)');
      return;
    }
    if (isNaN(numTotal) || numTotal <= 0) {
      setErrorMsg('Por favor ingresa un monto total válido');
      return;
    }
    if (numPaid > numTotal) {
      setErrorMsg('El abono inicial no puede ser mayor que el monto total');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const remaining = numTotal - numPaid;
      const status = remaining <= 0 ? 'pagado' : numPaid > 0 ? 'parcial' : 'pendiente';

      const installmentsData = enableInstallments && installmentsCount > 1
        ? generateInstallmentsList(numTotal, numPaid, installmentsCount, installmentFrequency, issueDate)
        : undefined;

      const finalDueDate = dueDate
        ? new Date(dueDate).toISOString()
        : installmentsData && installmentsData.length > 0
          ? installmentsData[installmentsData.length - 1].due_date
          : undefined;

      if (accountType === 'pagar') {
        const newCxP: AccountPayable = {
          id: crypto.randomUUID(),
          entity_name: entityName.trim(),
          provider_name: entityName.trim(),
          subject: subject.trim(),
          description: description.trim() || `Cuenta por pagar generada para ${entityName.trim()}.`,
          total_amount: numTotal,
          paid_amount: numPaid,
          remaining_amount: remaining,
          status: status as any,
          installments_count: installmentsData ? installmentsData.length : undefined,
          installments: installmentsData,
          issue_date: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
          due_date: finalDueDate,
          created_at: new Date().toISOString()
        };
        await dbService.saveAccountPayable(newCxP);
        if (numPaid > 0) {
          const initialPaymentRecord: AccountPayablePayment = {
            id: crypto.randomUUID(),
            account_payable_id: newCxP.id,
            cxp_id: newCxP.id,
            amount: numPaid,
            amount_bs: Number((numPaid * bcvRate).toFixed(2)),
            payment_method: 'Abono Inicial',
            payment_date: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
            reference: 'ABONO-INICIAL-MANUAL',
            notes: `Abono inicial registrado al crear cuenta por pagar (${subject.trim()})`,
            created_by: currentUser?.name || currentUser?.email || 'Administrador',
            created_at: new Date().toISOString()
          };
          try {
            const current = await dbService.getAccountsPayablePayments();
            const updated = [initialPaymentRecord, ...current];
            localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify(updated));
            if (supabase) {
              await supabase.from('accounts_payable_payments').insert(initialPaymentRecord);
            }
            window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_payments_updated', { detail: updated }));
          } catch (e) {}
        }
      } else {
        const newCxC: AccountReceivable = {
          id: crypto.randomUUID(),
          entity_name: entityName.trim(),
          client_name: entityName.trim(),
          customer_name: entityName.trim(),
          subject: subject.trim(),
          description: description.trim() || `Cuenta por cobrar generada para ${entityName.trim()}.`,
          total_amount: numTotal,
          paid_amount: numPaid,
          remaining_amount: remaining,
          status: status as any,
          installments_count: installmentsData ? installmentsData.length : undefined,
          installments: installmentsData,
          issue_date: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
          due_date: finalDueDate,
          created_at: new Date().toISOString()
        };
        await dbService.saveAccountReceivable(newCxC);

        if (numPaid > 0) {
          const initialPaymentRecord: AccountReceivablePayment = {
            id: crypto.randomUUID(),
            account_receivable_id: newCxC.id,
            cxc_id: newCxC.id,
            amount: numPaid,
            amount_bs: Number((numPaid * bcvRate).toFixed(2)),
            payment_method: 'Abono Inicial',
            payment_date: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
            reference: 'ABONO-INICIAL-MANUAL',
            notes: `Abono inicial registrado al crear cuenta por cobrar (${subject.trim()})`,
            created_by: currentUser?.name || currentUser?.email || 'Administrador',
            created_at: new Date().toISOString()
          };
          await dbService.recordInitialAccountReceivablePayment(initialPaymentRecord);
        }
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error saving account:', err);
      setErrorMsg(err.message || 'Error al guardar la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1D3557]/10 text-[#1D3557] flex items-center justify-center font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <h3 className="text-base font-montserrat font-extrabold text-[#1D3557]">
              Agregar Cuenta Pendiente
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs font-poppins">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Type Switcher */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1.5">Tipo de Cuenta:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountType('pagar')}
                className={`py-2 px-3 rounded-xl font-montserrat font-extrabold text-xs border transition-all cursor-pointer ${
                  accountType === 'pagar'
                    ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-xs'
                    : 'bg-[#F8F9FA] border-gray-200 text-[#2B2D42] hover:bg-gray-100'
                }`}
              >
                Cuenta por Pagar (CxP)
              </button>
              <button
                type="button"
                onClick={() => setAccountType('cobrar')}
                className={`py-2 px-3 rounded-xl font-montserrat font-extrabold text-xs border transition-all cursor-pointer ${
                  accountType === 'cobrar'
                    ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-xs'
                    : 'bg-[#F8F9FA] border-gray-200 text-[#2B2D42] hover:bg-gray-100'
                }`}
              >
                Cuenta por Cobrar (CxC)
              </button>
            </div>
          </div>

          {/* Entity Name (Asunto Principal) */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
              Asunto / Entidad Principal ({accountType === 'pagar' ? 'Proveedor / Acreedor' : 'Cliente / Deudor'}):
            </label>
            <input
              type="text"
              required
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="Ej. mercado plaza, vendedor: Sebastian, Distribuidora Polar..."
              className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] font-semibold text-[#2B2D42]"
            />
          </div>

          {/* Concept / Item / Invoice */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
              Concepto / Sub-asunto (ej. carne, lechuga, Factura #00001):
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej. carne, lechuga, Factura #12345, Honorarios..."
              className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] font-semibold text-[#2B2D42]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
              Descripción detallada:
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cuenta por pagar generada por ingreso a inventario..."
              className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
            />
          </div>

          {/* Montos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
                Monto Total (USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="500.00"
                className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-[#2B2D42] focus:outline-none focus:border-[#1D3557]"
              />
            </div>

            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Abono Inicial (Opcional):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-mono text-[#2B2D42] focus:outline-none focus:border-[#1D3557]"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Fecha de Emisión:
              </label>
              <input
                type="datetime-local"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
              />
            </div>

            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Fecha de Expiración / Vencimiento:
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
              />
            </div>
          </div>

          {/* Cuotas / Financiamiento Generator */}
          <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableInstallments}
                  onChange={(e) => setEnableInstallments(e.target.checked)}
                  className="w-4 h-4 text-[#1D3557] rounded border-gray-300 focus:ring-[#1D3557]"
                />
                <span className="font-montserrat font-extrabold text-xs text-[#1D3557] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#1D3557]" />
                  ¿Dividir en cuotas / financiamiento?
                </span>
              </label>
            </div>

            {enableInstallments && (
              <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#2B2D42] text-[11px] mb-1">
                      Número de cuotas:
                    </label>
                    <select
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 2)}
                      className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-[#1D3557] focus:outline-none focus:border-[#1D3557]"
                    >
                      <option value={2}>2 Cuotas</option>
                      <option value={3}>3 Cuotas</option>
                      <option value={4}>4 Cuotas</option>
                      <option value={5}>5 Cuotas</option>
                      <option value={6}>6 Cuotas</option>
                      <option value={10}>10 Cuotas</option>
                      <option value={12}>12 Cuotas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#2B2D42] text-[11px] mb-1">
                      Frecuencia de pago:
                    </label>
                    <select
                      value={installmentFrequency}
                      onChange={(e) => setInstallmentFrequency(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-[#1D3557] focus:outline-none focus:border-[#1D3557]"
                    >
                      <option value="semanal">Semanal (cada 7 días)</option>
                      <option value="quincenal">Quincenal (cada 15 días)</option>
                      <option value="mensual">Mensual (cada 30 días)</option>
                    </select>
                  </div>
                </div>

                {/* Live Installment Preview */}
                {parseFloat(totalAmount) > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                    <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider block">
                      Plan generado ({installmentsCount} cuotas):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {generateInstallmentsList(
                        parseFloat(totalAmount) || 0,
                        parseFloat(initialPayment) || 0,
                        installmentsCount,
                        installmentFrequency,
                        issueDate
                      ).map((inst, i) => (
                        <div key={i} className="px-2 py-1 bg-[#1D3557]/5 border border-[#1D3557]/15 rounded-md text-[#1D3557]">
                          <span className="font-extrabold">C{inst.number}:</span>{' '}
                          <strong className="font-mono">${formatAmount(inst.amount)}</strong>
                          <span className="text-[10px] text-gray-500 block">
                            {new Date(inst.due_date || '').toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : 'Crear Cuenta Pendiente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: HISTORIAL DE ABONOS Y PAGOS
// ============================================================================
interface HistoryModalProps {
  account: AccountPayable | AccountReceivable;
  type: 'pagar' | 'cobrar';
  bcvRate: number;
  onClose: () => void;
}

function HistoryModal({ account, type, bcvRate, onClose }: HistoryModalProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setIsLoading(true);
        if (type === 'pagar') {
          const all = await dbService.getAccountsPayablePayments();
          setPayments(all.filter(p => p.account_payable_id === account.id || p.cxp_id === account.id));
        } else {
          const all = await dbService.getAccountsReceivablePayments();
          setPayments(all.filter(p => p.account_receivable_id === account.id || p.cxc_id === account.id));
        }
      } catch (e) {
        console.error('Error fetching payments:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPayments();
  }, [account, type]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 font-poppins">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-montserrat font-extrabold text-[#1D3557]">
              Historial de Abonos y Pagos
            </h3>
            <p className="text-xs text-[#2B2D42]/70 font-medium">
              {account.subject} - {account.entity_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* Summary Box */}
          <div className="grid grid-cols-3 gap-2 bg-[#F8F9FA] border border-gray-200 p-3 rounded-xl text-center text-xs">
            <div>
              <span className="text-[#2B2D42]/60 text-[10px] font-montserrat font-extrabold block uppercase">Total</span>
              <span className="font-black font-mono text-[#2B2D42]">${formatAmount(account.total_amount)}</span>
            </div>
            <div>
              <span className="text-emerald-600 text-[10px] font-montserrat font-extrabold block uppercase">Pagado</span>
              <span className="font-black font-mono text-emerald-600">${formatAmount(account.paid_amount)}</span>
            </div>
            <div>
              <span className="text-rose-600 text-[10px] font-montserrat font-extrabold block uppercase">Pendiente</span>
              <span className="font-black font-mono text-rose-600">${formatAmount(account.remaining_amount)}</span>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 text-xs">
            {isLoading ? (
              <p className="py-6 text-center text-gray-400">Cargando pagos...</p>
            ) : payments.length === 0 ? (
              <p className="py-6 text-center text-gray-400">No se han registrado abonos aún para esta cuenta</p>
            ) : (
              payments.map((p, idx) => (
                <div key={p.id || idx} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold font-mono text-[#2B2D42]">${formatAmount(p.amount)}</p>
                    <p className="text-[11px] text-[#2B2D42]/70">{p.payment_method} {p.reference ? `• Ref: ${p.reference}` : ''}</p>
                    {p.notes && <p className="text-[10px] text-gray-400 italic mt-0.5">{p.notes}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-[#2B2D42]/70 block">
                      {new Date(p.payment_date || p.created_at).toLocaleDateString('es-ES')}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Abonado
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-4 mt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#F8F9FA] hover:bg-gray-200 text-[#2B2D42] font-montserrat font-extrabold text-xs rounded-xl cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: MODIFICAR CUENTA PENDIENTE
// ============================================================================
interface EditAccountModalProps {
  account: AccountPayable | AccountReceivable;
  type: 'pagar' | 'cobrar';
  bcvRate: number;
  currentUser?: StoreUser | null;
  onClose: () => void;
  onSuccess: () => void;
}

function EditAccountModal({
  account,
  type,
  bcvRate,
  currentUser,
  onClose,
  onSuccess
}: EditAccountModalProps) {
  const [entityName, setEntityName] = useState(
    account.entity_name || (account as AccountPayable).provider_name || (account as AccountReceivable).client_name || ''
  );
  const [subject, setSubject] = useState(account.subject || '');
  const [description, setDescription] = useState(account.description || '');
  const [totalAmount, setTotalAmount] = useState(account.total_amount?.toString() || '0');
  const [paidAmount, setPaidAmount] = useState(account.paid_amount?.toString() || '0');
  const [installments, setInstallments] = useState<PurchaseInstallment[]>(account.installments || []);
  const [issueDate, setIssueDate] = useState<string>(() => {
    if (account.issue_date || account.created_at) {
      try {
        return new Date(account.issue_date || account.created_at || '').toISOString().slice(0, 16);
      } catch (e) {
        return new Date().toISOString().slice(0, 16);
      }
    }
    return new Date().toISOString().slice(0, 16);
  });
  const [dueDate, setDueDate] = useState<string>(() => {
    if (account.due_date) {
      try {
        return new Date(account.due_date).toISOString().slice(0, 16);
      } catch (e) {
        return '';
      }
    }
    return '';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleUpdateInstallmentAmount = (idx: number, newAmount: number) => {
    const updated = [...installments];
    updated[idx] = { ...updated[idx], amount: newAmount };
    setInstallments(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numTotal = parseFloat(totalAmount);
    const numPaid = parseFloat(paidAmount) || 0;

    if (!entityName.trim()) {
      setErrorMsg('Por favor ingresa el Asunto / Entidad principal (Proveedor o Cliente)');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('Por favor ingresa el Concepto / Sub-asunto');
      return;
    }
    if (isNaN(numTotal) || numTotal < 0) {
      setErrorMsg('Por favor ingresa un monto total válido');
      return;
    }
    if (numPaid > numTotal) {
      setErrorMsg('El monto abonado no puede ser mayor que el monto total');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const remaining = Math.max(0, numTotal - numPaid);
      let status = 'pendiente';
      if (remaining <= 0) {
        status = type === 'pagar' ? 'pagado' : 'cobrado';
      } else if (numPaid > 0) {
        status = 'parcial';
      }

      if (type === 'pagar') {
        const updatedCxP: AccountPayable = {
          ...(account as AccountPayable),
          entity_name: entityName.trim(),
          provider_name: entityName.trim(),
          subject: subject.trim(),
          description: description.trim(),
          total_amount: numTotal,
          paid_amount: numPaid,
          remaining_amount: remaining,
          status: status as any,
          installments_count: installments && installments.length > 0 ? installments.length : undefined,
          installments: installments && installments.length > 0 ? installments : undefined,
          issue_date: issueDate ? new Date(issueDate).toISOString() : account.issue_date,
          due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
          updated_at: new Date().toISOString()
        };
        await dbService.saveAccountPayable(updatedCxP);
      } else {
        const updatedCxC: AccountReceivable = {
          ...(account as AccountReceivable),
          entity_name: entityName.trim(),
          client_name: entityName.trim(),
          customer_name: entityName.trim(),
          subject: subject.trim(),
          description: description.trim(),
          total_amount: numTotal,
          paid_amount: numPaid,
          remaining_amount: remaining,
          status: status as any,
          installments_count: installments && installments.length > 0 ? installments.length : undefined,
          installments: installments && installments.length > 0 ? installments : undefined,
          issue_date: issueDate ? new Date(issueDate).toISOString() : account.issue_date,
          due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
          updated_at: new Date().toISOString()
        };
        await dbService.saveAccountReceivable(updatedCxC);
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error updating account:', err);
      setErrorMsg(err.message || 'Error al modificar la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta cuenta pendiente? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setIsDeleting(true);
      if (type === 'pagar') {
        await dbService.deleteAccountPayable(account.id);
      } else {
        await dbService.deleteAccountReceivable(account.id);
      }
      onSuccess();
    } catch (err: any) {
      console.error('Error deleting account:', err);
      setErrorMsg(err.message || 'Error al eliminar la cuenta');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1D3557]/10 text-[#1D3557] flex items-center justify-center font-bold">
              <Edit3 className="w-4 h-4" />
            </div>
            <h3 className="text-base font-montserrat font-extrabold text-[#1D3557]">
              Modificar Cuenta por {type === 'pagar' ? 'Pagar' : 'Cobrar'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs font-poppins">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Entity Name (Asunto Principal) */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
              Asunto / Entidad Principal ({type === 'pagar' ? 'Proveedor' : 'Cliente'}):
            </label>
            <input
              type="text"
              required
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] font-semibold text-[#2B2D42]"
            />
          </div>

          {/* Concept / Item / Invoice */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
              Concepto / Sub-asunto (ej. Factura #, Insumo):
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#1D3557] font-semibold text-[#2B2D42]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
              Descripción detallada:
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42] mb-1">
                Monto Total (USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-[#2B2D42] focus:outline-none focus:border-[#1D3557]"
              />
            </div>

            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Monto Abonado / Pagado (USD):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-mono text-[#2B2D42] focus:outline-none focus:border-[#1D3557]"
              />
            </div>
          </div>

          {/* Balance recalculation badge */}
          <div className="p-3 bg-[#F8F9FA] rounded-xl border border-gray-200 flex items-center justify-between text-xs">
            <span className="font-bold text-gray-600">Saldo Pendiente Calculado:</span>
            <span className="font-mono font-black text-[#1D3557] text-sm">
              ${formatAmount(Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(paidAmount) || 0)))} USD
            </span>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Fecha de Emisión:
              </label>
              <input
                type="datetime-local"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
              />
            </div>

            <div>
              <label className="block font-montserrat font-extrabold text-[#2B2D42]/80 mb-1">
                Fecha de Vencimiento:
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-[#2B2D42]"
              />
            </div>
          </div>

          {/* Installments Management if applicable */}
          {installments && installments.length > 0 && (
            <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-montserrat font-extrabold text-xs text-[#1D3557] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#1D3557]" />
                  Cuotas de la Cuenta ({installments.length} cuotas):
                </span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {installments.map((inst, idx) => {
                  const isPaid = inst.status === 'pagado' || (Number(inst.paid_amount || 0) >= Number(inst.amount || 0) - 0.001);
                  return (
                    <div
                      key={inst.id || idx}
                      className="p-2 bg-white border border-gray-200 rounded-lg flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-[#1D3557]/10 text-[#1D3557]'
                        }`}>
                          {inst.number || idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-[#2B2D42]">Cuota #{inst.number || idx + 1}</span>
                          <span className="text-[10px] text-gray-400 block">
                            Vence: {inst.due_date ? new Date(inst.due_date).toLocaleDateString('es-ES') : '--'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#2B2D42]">${formatAmount(inst.amount)}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isPaid ? 'Pagada' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center gap-3">
            {type !== 'pagar' && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-montserrat font-extrabold text-xs rounded-xl border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isDeleting}
              className="flex-1 py-3 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
