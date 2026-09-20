import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  SlidersHorizontal, Calendar, Search, ArrowUpRight, ArrowDownLeft, 
  TrendingUp, TrendingDown, Wallet, DollarSign, Plus, Trash2, 
  Download, Unlock, Lock, FileText, Check, Loader2, RefreshCw, X, Tag, AlertTriangle, Sparkles, User, Printer, Eye, Share2,
  ChevronLeft, ChevronRight, Package
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { GASTO_CATEGORIES, GASTO_PAYMENT_METHODS } from './GastoAssistant';
import ClosureTicketModal from './ClosureTicketModal';
import OpenCashSessionModal from './OpenCashSessionModal.tsx';
import { formatCurrency } from '../lib/currency';
import { 
  parseUniversalDate, 
  getLocalDateString, 
  getStartOfWeek, 
  getEndOfWeek, 
  formatDateSpanish, 
  formatWeekRangeSpanish 
} from '../lib/dateUtils';
import { StoreUser } from '../types';
import * as XLSX from 'xlsx';
import { exportBalanceToPdf } from '../lib/pdfExport';

interface BalancePageProps {
  cashOps: any[];
  cashSessions: any[];
  activeSession: any | null;
  bcvRate: number;
  currentUser?: StoreUser | null;
  storeUsers?: StoreUser[];
  onRefreshData: () => void;
  orders: any[];
}

export default function BalancePage({
  cashOps,
  cashSessions,
  activeSession,
  bcvRate,
  currentUser,
  storeUsers,
  onRefreshData,
  orders
}: BalancePageProps) {
  // Inner tabs: 'transacciones' | 'cierres'
  const [innerTab, setInnerTab] = useState<'transacciones' | 'cierres'>('transacciones');

  // Local synchronized states for all financial sources
  const [localCashOps, setLocalCashOps] = useState<any[]>(cashOps || []);
  const [localInvoices, setLocalInvoices] = useState<any[]>([]);
  const [localOrders, setLocalOrders] = useState<any[]>(orders || []);
  const [isLoadingFinancialData, setIsLoadingFinancialData] = useState(false);

  // Helper to format date as YYYY-MM-DD locally
  const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Sync props and fetch fresh data from storage / database
  const refreshAllData = async () => {
    try {
      setIsLoadingFinancialData(true);
      const [ops, invs, ords] = await Promise.all([
        dbService.getCashOps().catch(() => []),
        dbService.getInvoices().catch(() => []),
        dbService.getOrders().catch(() => [])
      ]);
      if (ops && Array.isArray(ops)) setLocalCashOps(ops);
      if (invs && Array.isArray(invs)) setLocalInvoices(invs);
      if (ords && Array.isArray(ords)) setLocalOrders(ords);
    } catch (e) {
      console.warn('Error refreshing balance financial data:', e);
    } finally {
      setIsLoadingFinancialData(false);
    }
  };

  useEffect(() => {
    if (cashOps && cashOps.length > 0) setLocalCashOps(cashOps);
  }, [cashOps]);

  useEffect(() => {
    if (orders && orders.length > 0) setLocalOrders(orders);
  }, [orders]);

  useEffect(() => {
    refreshAllData();

    const handleCashUpdated = () => refreshAllData();
    const handleInvoicesUpdated = () => refreshAllData();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'copias_bellavista_cash_ops' || e.key === 'copias_bellavista_local_invoices' || e.key === 'copias_bellavista_local_orders') {
        refreshAllData();
      }
    };

    window.addEventListener('bellavista_cash_updated', handleCashUpdated);
    window.addEventListener('bellavista_invoices_updated', handleInvoicesUpdated);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('bellavista_cash_updated', handleCashUpdated);
      window.removeEventListener('bellavista_invoices_updated', handleInvoicesUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Filters state
  const [timeRange, setTimeRange] = useState<'diario' | 'semanal' | 'mensual' | 'todos'>('semanal');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateString(new Date());
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('todas');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sub-tabs in transacciones
  const [subTab, setSubTab] = useState<'ingresos' | 'egresos' | 'inventario' | 'cobrar' | 'pagar'>('ingresos');

  // Gasto Assistant Modal State
  const [showGastoModal, setShowGastoModal] = useState(false);

  // Manual Movement Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualType, setManualType] = useState<'ingreso' | 'egreso'>('egreso');
  const [manualCategory, setManualCategory] = useState<string>('Otros gastos');
  const [manualConcept, setManualConcept] = useState('');
  const [manualAmountUsd, setManualAmountUsd] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState('Efectivo USD');
  const [manualObservations, setManualObservations] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Por Pagar state and modal states
  const [porPagarList, setPorPagarList] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_cuentas_por_pagar');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', provider_name: 'Distribuidora Grafipress', concept: 'Suministro de papel Bond base 20 (10 cajas)', amount: 150.00, amount_bs: 150.00 * (bcvRate || 36.5), due_date: '2026-08-25', created_at: new Date().toISOString(), status: 'pendiente' },
      { id: '2', provider_name: 'Repuestos Copiadoras Bella Vista', concept: 'Tóner negro compatible Ricoh MP 301', amount: 45.00, amount_bs: 45.00 * (bcvRate || 36.5), due_date: '2026-08-18', created_at: new Date().toISOString(), status: 'pendiente' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('copias_bellavista_cuentas_por_pagar', JSON.stringify(porPagarList));
  }, [porPagarList]);

  const [showPagarModal, setShowPagarModal] = useState(false);
  const [pagarProviderName, setPagarProviderName] = useState('');
  const [pagarConcept, setPagarConcept] = useState('');
  const [pagarAmount, setPagarAmount] = useState('');
  const [pagarDueDate, setPagarDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [pagarObservation, setPagarObservation] = useState('');

  // States for settling Accounts Payable (CXP)
  const [payingCxpItem, setPayingCxpItem] = useState<any | null>(null);
  const [cxpPayAmount, setCxpPayAmount] = useState<string>('');
  const [cxpPayMethod, setCxpPayMethod] = useState<string>('Efectivo USD');
  const [cxpPayRegisterEgreso, setCxpPayRegisterEgreso] = useState<boolean>(true);

  // Universal detail viewer state
  const [selectedViewItem, setSelectedViewItem] = useState<any | null>(null);
  const [selectedViewType, setSelectedViewType] = useState<'ingreso' | 'egreso' | 'cobrar' | 'pagar' | 'sesion' | null>(null);

  // 🔐 Store Users & Permissions for Cash Register
  const [localStoreUsers, setLocalStoreUsers] = useState<StoreUser[]>([]);

  useEffect(() => {
    if (storeUsers && storeUsers.length > 0) {
      setLocalStoreUsers(storeUsers);
    } else {
      dbService.getStoreUsers().then(users => {
        if (users && users.length > 0) {
          setLocalStoreUsers(users);
        }
      }).catch(console.error);
    }
  }, [storeUsers]);

  // Filter active registered store personnel who have caja permissions
  const authorizedCajaUsers = useMemo(() => {
    const list = localStoreUsers.length > 0 ? localStoreUsers : (storeUsers || []);
    return list.filter(u => {
      if (u.is_active === false) return false;
      const role = (u.role || '').toLowerCase();
      if (role === 'cliente') return false;

      if (role === 'gerente' || role === 'admin' || role === 'administrador' || role === 'cajero') {
        return true;
      }

      if (u.permissions && u.permissions.length > 0) {
        return u.permissions.some(p => p === 'caja' || p === 'sales' || p === 'orders');
      }

      return false;
    });
  }, [localStoreUsers, storeUsers]);

  // Cash Session Modals State
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openAmountBs, setOpenAmountBs] = useState('10.00');
  const [openEmployee, setOpenEmployee] = useState('');
  const [closeAmountBs, setCloseAmountBs] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isSavingSessionAction, setIsSavingSessionAction] = useState(false);

  useEffect(() => {
    if (showOpenModal && !openEmployee) {
      const defaultUser = currentUser?.name || currentUser?.email;
      if (defaultUser && currentUser?.role !== 'Cliente') {
        setOpenEmployee(defaultUser);
      } else if (authorizedCajaUsers.length > 0) {
        setOpenEmployee(authorizedCajaUsers[0].name || authorizedCajaUsers[0].email);
      }
    }
  }, [showOpenModal, openEmployee, currentUser, authorizedCajaUsers]);

  // Ticket modal state for inspecting or printing closure
  const [viewTicketSession, setViewTicketSession] = useState<any | null>(null);

  const handleShare = (type: 'ingreso' | 'egreso' | 'cobrar' | 'pagar' | 'sesion', item: any) => {
    let text = '';
    if (type === 'ingreso' || type === 'egreso') {
      text = `📝 *COMPROBANTE DE MOVIMIENTO - COPIAS BELLA VISTA*\n\n` +
             `*Tipo:* ${type === 'ingreso' ? '📥 INGRESO' : '📤 EGRESO'}\n` +
             `*Concepto:* ${item.concept}\n` +
             `*Monto:* $${Number(item.amount || 0).toFixed(2)} USD (Bs. ${Number(item.amount_bs || 0).toFixed(2)})\n` +
             `*Método de Pago:* ${item.payment_method || 'N/E'}\n` +
             `*Fecha:* ${new Date(item.created_at || item.date || Date.now()).toLocaleString('es-VE')}\n` +
             `*Operador:* ${item.empleado_nombre || 'Bella Vista'}\n`;
      if (item.observation) text += `*Observaciones:* ${item.observation}\n`;
    } else if (type === 'cobrar') {
      text = `📊 *CUENTA POR COBRAR - COPIAS BELLA VISTA*\n\n` +
             `*Pedido:* #${String(item.order_number || '').padStart(6, '0')}\n` +
             `*Cliente:* ${item.customer_name || 'Consumidor final'}\n` +
             `*Monto:* $${Number(item.total_price || 0).toFixed(2)} USD (Bs. ${Number((item.total_price || 0) * bcvRate).toFixed(2)})\n` +
             `*Método Esperado:* ${item.payment_method || 'N/E'}\n` +
             `*Fecha:* ${new Date(item.created_at || Date.now()).toLocaleString('es-VE')}\n` +
             `*Estado:* 🟡 PENDIENTE DE PAGO\n`;
    } else if (type === 'pagar') {
      text = `⚠️ *CUENTA POR PAGAR (PROVEEDOR) - COPIAS BELLA VISTA*\n\n` +
             `*Proveedor:* ${item.provider_name}\n` +
             `*Concepto:* ${item.concept}\n` +
             `*Monto:* $${Number(item.amount || 0).toFixed(2)} USD (Bs. ${Number(item.amount_bs || 0).toFixed(2)})\n` +
             `*Fecha Vence:* ${item.due_date || 'N/E'}\n` +
             `*Estado:* 🔴 PENDIENTE\n`;
    } else if (type === 'sesion') {
      text = `🧾 *CIERRE DE CAJA / ARQUEO - COPIAS BELLA VISTA*\n\n` +
             `*Sesión:* #${item.session_code || item.id?.slice(0,8)}\n` +
             `*Cajero:* ${item.empleado_nombre || 'Cajero Responsable'}\n` +
             `*Apertura:* Bs. ${Number(item.apertura_bs || 0).toFixed(2)} ($${Number(item.apertura_usd || 0).toFixed(2)} USD)\n` +
             `*Cierre Real:* Bs. ${Number(item.cierre_bs || 0).toFixed(2)}\n` +
             `*Diferencia:* $${Number(item.diferencia_usd || 0).toFixed(2)} USD (Bs. ${Number(item.diferencia_bs || 0).toFixed(2)})\n` +
             `*Estado Arqueo:* ${String(item.estado_arqueo || 'cuadrada').toUpperCase()}\n`;
    }
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handlePrint = (type: 'ingreso' | 'egreso' | 'cobrar' | 'pagar' | 'sesion', item: any) => {
    if (type === 'sesion') {
      setViewTicketSession(item);
      setTimeout(() => {
        window.print();
      }, 500);
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes (popups) para poder imprimir el comprobante.');
      return;
    }

    let title = '';
    let contentHtml = '';

    if (type === 'ingreso' || type === 'egreso') {
      title = `Comprobante de Caja - ${type.toUpperCase()}`;
      contentHtml = `
        <div class="ticket">
          <h2>COPIAS BELLA VISTA, C.A.</h2>
          <p class="subtitle">Comprobante de Caja de ${type.toUpperCase()}</p>
          <hr />
          <p><strong>Concepto:</strong> ${item.concept}</p>
          <p><strong>Monto USD:</strong> $${Number(item.amount || 0).toFixed(2)} USD</p>
          <p><strong>Monto Bs. (BCV):</strong> Bs. ${Number(item.amount_bs || 0).toFixed(2)}</p>
          <p><strong>Método de Pago:</strong> ${item.payment_method || 'Efectivo USD'}</p>
          <p><strong>Fecha:</strong> ${new Date(item.created_at || item.date || Date.now()).toLocaleString('es-VE')}</p>
          <p><strong>Operador:</strong> ${item.empleado_nombre || 'N/E'}</p>
          ${item.observation ? `<p><strong>Observaciones:</strong> ${item.observation}</p>` : ''}
          <hr />
          <p class="footer">¡Gracias por preferirnos!</p>
        </div>
      `;
    } else if (type === 'cobrar') {
      title = `Comprobante de Cuenta por Cobrar`;
      contentHtml = `
        <div class="ticket">
          <h2>COPIAS BELLA VISTA, C.A.</h2>
          <p class="subtitle">Documento por Cobrar</p>
          <hr />
          <p><strong>Pedido:</strong> #${String(item.order_number || '').padStart(6, '0')}</p>
          <p><strong>Cliente:</strong> ${item.customer_name || 'Consumidor final'}</p>
          <p><strong>Total Pedido:</strong> $${Number(item.total_price || 0).toFixed(2)} USD</p>
          <p><strong>Total Bs. (BCV):</strong> Bs. ${Number((item.total_price || 0) * bcvRate).toFixed(2)}</p>
          <p><strong>Método de Pago:</strong> ${item.payment_method || 'N/E'}</p>
          <p><strong>Fecha Registro:</strong> ${new Date(item.created_at || Date.now()).toLocaleString('es-VE')}</p>
          <p><strong>Estado:</strong> PENDIENTE DE PAGO</p>
          <hr />
          <p class="footer">¡Gracias por preferirnos!</p>
        </div>
      `;
    } else if (type === 'pagar') {
      title = `Orden de Pago - Proveedor`;
      contentHtml = `
        <div class="ticket">
          <h2>COPIAS BELLA VISTA, C.A.</h2>
          <p class="subtitle">Cuenta por Pagar a Proveedor</p>
          <hr />
          <p><strong>Proveedor:</strong> ${item.provider_name}</p>
          <p><strong>Concepto:</strong> ${item.concept}</p>
          <p><strong>Monto USD:</strong> $${Number(item.amount || 0).toFixed(2)} USD</p>
          <p><strong>Monto Bs.:</strong> Bs. ${Number(item.amount_bs || 0).toFixed(2)}</p>
          <p><strong>Fecha de Vencimiento:</strong> ${item.due_date || 'N/E'}</p>
          <p><strong>Estado:</strong> PENDIENTE</p>
          <hr />
          <p class="footer">Control Interno Bella Vista</p>
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 13px; margin: 15px; color: #111; }
            .ticket { max-width: 280px; margin: 0 auto; text-align: left; }
            h2 { text-align: center; margin: 0 0 5px 0; font-size: 16px; font-weight: bold; }
            .subtitle { text-align: center; margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase; }
            hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
            p { margin: 4px 0; line-height: 1.4; }
            strong { font-weight: bold; }
            .footer { text-align: center; font-size: 11px; margin-top: 15px; font-style: italic; }
          </style>
        </head>
        <body>
          ${contentHtml}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Calculate session metrics for current active session
  const activeSessionOps = useMemo(() => {
    return activeSession 
      ? cashOps.filter((op: any) => op.session_id === activeSession.id) 
      : [];
  }, [activeSession, cashOps]);

  const initialFondoBs = activeSession ? activeSession.apertura_bs : 0;
  const initialFondoUsd = activeSession ? activeSession.apertura_usd : 0;

  const sessionIngressesOps = activeSessionOps.filter((op: any) => op.type === 'ingreso' && op.concept !== 'Apertura de Caja - Fondo Inicial');
  const sessionIngressesBs = sessionIngressesOps.reduce((acc: number, curr: any) => acc + (curr.amount_bs || (curr.amount * bcvRate)), 0);
  const sessionIngressesUsd = sessionIngressesOps.reduce((acc: number, curr: any) => acc + curr.amount, 0);

  const sessionEgressesOps = activeSessionOps.filter((op: any) => op.type === 'egreso');
  const sessionEgressesBs = sessionEgressesOps.reduce((acc: number, curr: any) => acc + (curr.amount_bs || (curr.amount * bcvRate)), 0);
  const sessionEgressesUsd = sessionEgressesOps.reduce((acc: number, curr: any) => acc + curr.amount, 0);

  const esperadoSessionBs = initialFondoBs + sessionIngressesBs - sessionEgressesBs;
  const esperadoSessionUsd = initialFondoUsd + sessionIngressesUsd - sessionEgressesUsd;

  // Calculate live equivalent in Bs during manual input
  const manualAmountBs = useMemo(() => {
    const usd = parseFloat(manualAmountUsd) || 0;
    return (usd * bcvRate).toFixed(2);
  }, [manualAmountUsd, bcvRate]);

  // Handle manual movement submit
  const handleAddManualMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const usdAmount = parseFloat(manualAmountUsd);
    if (!manualConcept.trim() || isNaN(usdAmount) || usdAmount <= 0) {
      alert('Por favor, ingrese un concepto válido y un monto mayor a cero.');
      return;
    }

    setIsSavingManual(true);
    try {
      const bsAmount = usdAmount * bcvRate;
      await dbService.addCashOp({
        type: manualType,
        concept: manualType === 'egreso' 
          ? `[Gasto] [${manualCategory}] ${manualConcept.trim()}`
          : manualConcept.trim(),
        amount: usdAmount,
        amount_bs: bsAmount,
        payment_method: manualPaymentMethod,
        category: manualType === 'egreso' ? manualCategory : null,
        observation: manualObservations.trim() || null,
        empleado_nombre: currentUser?.name || currentUser?.email || 'Cajero'
      });

      setManualConcept('');
      setManualAmountUsd('');
      setManualObservations('');
      setShowManualModal(false);
      onRefreshData();
      alert('¡Movimiento financiero registrado con éxito!');
    } catch (err: any) {
      console.error(err);
      alert(`Error al registrar movimiento: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Open Cash Session
  const handleOpenCashSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeSession) {
      alert(`Ya existe una caja abierta asignada a: ${activeSession.empleado_nombre || 'otro empleado'}. Debe realizar el cierre primero.`);
      return;
    }

    const bs = parseFloat(openAmountBs);
    if (isNaN(bs) || bs < 0) {
      alert('Por favor, ingrese un fondo inicial válido.');
      return;
    }

    const empName = openEmployee.trim() || currentUser?.name || currentUser?.email || 'Cajero Responsable';

    setIsSavingSessionAction(true);
    try {
      const openingUsd = bs / bcvRate;
      await dbService.createCashSession({
        empleado_nombre: empName,
        empleado_id: currentUser?.id || null,
        apertura_bs: bs,
        apertura_usd: openingUsd,
        observaciones: sessionNotes.trim()
      });

      await dbService.addCashOp({
        type: 'ingreso',
        concept: 'Apertura de Caja - Fondo Inicial',
        amount: openingUsd,
        amount_bs: bs,
        payment_method: 'Efectivo VES',
        empleado_nombre: empName
      });

      setShowOpenModal(false);
      setSessionNotes('');
      onRefreshData();
      alert(`¡Caja registradora abierta exitosamente por ${empName}!`);
    } catch (err: any) {
      console.error(err);
      alert('Error al abrir la caja registradora.');
    } finally {
      setIsSavingSessionAction(false);
    }
  };

  // Close Cash Session
  const handleCloseCashSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const bs = parseFloat(closeAmountBs);
    if (isNaN(bs) || bs < 0) {
      alert('Por favor, ingrese el monto real contado.');
      return;
    }

    if (!activeSession) return;

    setIsSavingSessionAction(true);
    try {
      const diferenciaBs = bs - esperadoSessionBs;
      const cierreUsd = bs / bcvRate;
      const diferenciaUsd = cierreUsd - esperadoSessionUsd;

      let estadoArqueo = 'cuadrada';
      if (Math.abs(diferenciaBs) >= 0.01) {
        estadoArqueo = diferenciaBs > 0 ? 'descuadre_sobrante' : 'descuadre_faltante';
      }

      const closedSession = await dbService.updateCashSession(activeSession.id, {
        cierre: new Date().toLocaleString('es-VE'),
        cierre_bs: bs,
        cierre_usd: cierreUsd,
        esperado_bs: esperadoSessionBs,
        esperado_usd: esperadoSessionUsd,
        diferencia_bs: diferenciaBs,
        diferencia_usd: diferenciaUsd,
        estado: 'cerrada',
        estado_arqueo: estadoArqueo,
        observaciones: sessionNotes.trim()
      });

      await dbService.addCashOp({
        type: 'egreso',
        concept: 'Cierre de Caja - Entrega de Efectivo (Arqueo)',
        amount: cierreUsd,
        amount_bs: bs,
        payment_method: 'Efectivo VES',
        empleado_nombre: activeSession.empleado_nombre || currentUser?.name || 'Cajero'
      });

      setShowCloseModal(false);
      setCloseAmountBs('');
      setSessionNotes('');
      onRefreshData();

      // Open ticket for closure receipt
      setViewTicketSession(closedSession || {
        ...activeSession,
        cierre_bs: bs,
        cierre_usd: cierreUsd,
        esperado_bs: esperadoSessionBs,
        esperado_usd: esperadoSessionUsd,
        diferencia_bs: diferenciaBs,
        diferencia_usd: diferenciaUsd,
        estado: 'cerrada',
        estado_arqueo: estadoArqueo,
        observaciones: sessionNotes.trim()
      });

      alert(`¡Caja arqueada y cerrada exitosamente! (${estadoArqueo === 'cuadrada' ? 'Caja Cuadrada' : 'Descuadre Registrado'})`);
    } catch (err: any) {
      console.error(err);
      alert('Error al cerrar la caja registradora.');
    } finally {
      setIsSavingSessionAction(false);
    }
  };

  // Helper to parse dates securely and universally
  const getOpDate = (op: any): Date => {
    return parseUniversalDate(op.created_at || op.fecha || op.date) || new Date();
  };

  // Unified financial operations consolidation (combining CashOps, POS Invoices, Orders)
  const allUnifiedOps = useMemo(() => {
    const list: any[] = [];
    const processedInvoiceKeys = new Set<string>();

    // 1. Process localCashOps
    localCashOps.forEach(op => {
      const opDate = getOpDate(op);
      const concept = op.concept || '';
      
      const facMatch = concept.match(/(?:FAC|NE|ORD|ord|fac|ne)-[A-Za-z0-9\-_]+/i);
      let docNumber = op.doc_number || op.document_number || op.reference_number || '';
      if (!docNumber && facMatch) {
        docNumber = facMatch[0].toUpperCase();
      }
      if (facMatch) {
        processedInvoiceKeys.add(facMatch[0].toUpperCase());
      }
      if (op.id) {
        processedInvoiceKeys.add(String(op.id).toUpperCase());
      }

      list.push({
        id: op.id || `op-${Math.random()}`,
        type: op.type, // 'ingreso' | 'egreso'
        source: 'caja',
        doc_number: docNumber || (op.type === 'ingreso' ? 'OP-ING' : 'OP-EGR'),
        concept: op.concept,
        amount: Number(op.amount) || 0,
        amount_bs: Number(op.amount_bs) || ((Number(op.amount) || 0) * (bcvRate || 36.5)),
        amount_eur: op.amount_eur,
        amount_cop: op.amount_cop,
        currency_code: op.currency_code || 'USD',
        payment_method: op.payment_method || 'Efectivo USD',
        category: op.category,
        observation: op.observation || op.observacion,
        empleado_nombre: op.empleado_nombre || op.user_name || 'Caja Registradora',
        created_at: op.created_at || new Date().toISOString(),
        date_obj: opDate,
        time: op.time || opDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
        items: op.items || [],
        raw: op
      });
    });

    // 2. Process localInvoices (Ventas Flash POS) that aren't duplicate cashOps
    localInvoices.forEach(inv => {
      const controlNum = (inv.control_number || inv.numero || inv.id || '').toString().trim().toUpperCase();
      const invId = (inv.id || '').toString().trim().toUpperCase();
      
      if ((controlNum && processedInvoiceKeys.has(controlNum)) || (invId && processedInvoiceKeys.has(invId))) {
        return;
      }

      const invTotal = typeof inv.total === 'number' ? inv.total : parseFloat(String(inv.total ?? inv.subtotal ?? 0)) || 0;
      if (invTotal <= 0 && (!inv.items || inv.items.length === 0)) return;

      const invDate = getOpDate(inv);
      const isNotaEntrega = inv.document_type === 'nota_entrega' || controlNum.startsWith('NE-');
      const docLabel = isNotaEntrega ? 'Nota de Entrega' : 'Factura';
      
      let formattedDocNumber = controlNum;
      if (isNotaEntrega) {
        formattedDocNumber = controlNum.startsWith('NE-') ? controlNum : `NE-${controlNum.padStart(6, '0')}`;
      } else {
        formattedDocNumber = controlNum.startsWith('FAC-') ? controlNum : `FAC-${controlNum.padStart(6, '0')}`;
      }

      const clientName = (inv.customer_name || inv.cliente || '').trim() || 'Consumidor final';
      
      list.push({
        id: inv.id || `inv-${controlNum}`,
        type: 'ingreso',
        source: 'pos_factura',
        doc_number: formattedDocNumber,
        concept: `Venta Flash - ${docLabel} ${formattedDocNumber} (${clientName})`,
        amount: invTotal,
        amount_bs: invTotal * (bcvRate || 36.5),
        payment_method: inv.payment_method || 'Efectivo USD',
        category: 'Ventas de Mostrador / POS',
        observation: inv.notes || '',
        empleado_nombre: inv.seller_name || 'Caja POS',
        created_at: inv.created_at || invDate.toISOString(),
        date_obj: invDate,
        time: invDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
        items: inv.items || [],
        raw: inv
      });
    });

    // 3. Process completed / delivered orders
    localOrders.forEach(order => {
      const status = (order.status || '').toLowerCase();
      if (['cancelado', 'anulado', 'rechazado', 'pendiente', 'en_espera'].includes(status)) {
        return;
      }
      const rawNum = String(order.order_number || order.id || '').replace(/^ORD-/i, '');
      const formattedDocNumber = `ORD-${rawNum.padStart(6, '0')}`.toUpperCase();
      
      if (processedInvoiceKeys.has(formattedDocNumber) || processedInvoiceKeys.has(String(order.id).toUpperCase())) {
        return;
      }

      const orderTotal = Number(order.total_price) || (order.items && Array.isArray(order.items) 
        ? order.items.reduce((acc: number, it: any) => acc + (parseFloat(String(it.price)) || 0) * (parseFloat(String(it.quantity)) || 1), 0)
        : 0);

      if (orderTotal <= 0) return;

      const orderDate = getOpDate(order);
      const clientName = (order.customer_name || '').trim() || 'Cliente Online';

      list.push({
        id: order.id || `ord-${Math.random()}`,
        type: 'ingreso',
        source: 'pedido_online',
        doc_number: formattedDocNumber,
        concept: `Pedido #${formattedDocNumber} (${clientName})`,
        amount: orderTotal,
        amount_bs: orderTotal * (bcvRate || 36.5),
        payment_method: order.payment_method || 'Pago Móvil',
        category: 'Ventas Tienda Online',
        observation: order.comments || '',
        empleado_nombre: order.seller_name || 'Tienda Web',
        created_at: order.created_at || orderDate.toISOString(),
        date_obj: orderDate,
        time: orderDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
        items: order.items || [],
        raw: order
      });
    });

    return list.sort((a, b) => b.date_obj.getTime() - a.date_obj.getTime());
  }, [localCashOps, localInvoices, localOrders, bcvRate]);

  // Compute all available weeks from operations + current week
  const availableWeeks = useMemo(() => {
    const weeksMap = new Map<string, {
      key: string;
      label: string;
      startDate: Date;
      endDate: Date;
      count: number;
      totalIncomes: number;
      totalEgresses: number;
      isCurrent: boolean;
    }>();

    const today = new Date();
    const currentWeekStart = getStartOfWeek(today);
    const currentWeekEnd = getEndOfWeek(today);
    const currentKey = getLocalDateString(currentWeekStart);

    weeksMap.set(currentKey, {
      key: currentKey,
      label: formatWeekRangeSpanish(currentWeekStart),
      startDate: currentWeekStart,
      endDate: currentWeekEnd,
      count: 0,
      totalIncomes: 0,
      totalEgresses: 0,
      isCurrent: true
    });

    allUnifiedOps.forEach(op => {
      const opDate = op.date_obj;
      const weekStart = getStartOfWeek(opDate);
      const weekEnd = getEndOfWeek(opDate);
      const key = getLocalDateString(weekStart);

      if (!weeksMap.has(key)) {
        const isCurr = key === currentKey;
        weeksMap.set(key, {
          key,
          label: formatWeekRangeSpanish(weekStart),
          startDate: weekStart,
          endDate: weekEnd,
          count: 0,
          totalIncomes: 0,
          totalEgresses: 0,
          isCurrent: isCurr
        });
      }

      const wk = weeksMap.get(key)!;
      wk.count += 1;
      if (op.type === 'ingreso' && op.concept !== 'Apertura de Caja - Fondo Inicial') {
        wk.totalIncomes += op.amount;
      } else if (op.type === 'egreso' && op.concept !== 'Cierre de Caja - Entrega de Efectivo (Arqueo)') {
        wk.totalEgresses += op.amount;
      }
    });

    return Array.from(weeksMap.values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  }, [allUnifiedOps]);

  // Compute all available months from operations + current month
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, {
      key: string;
      label: string;
      year: number;
      month: number;
      count: number;
      totalIncomes: number;
      totalEgresses: number;
      isCurrent: boolean;
    }>();

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    monthsMap.set(currentMonthKey, {
      key: currentMonthKey,
      label: `${monthNames[today.getMonth()]} ${today.getFullYear()}`,
      year: today.getFullYear(),
      month: today.getMonth(),
      count: 0,
      totalIncomes: 0,
      totalEgresses: 0,
      isCurrent: true
    });

    allUnifiedOps.forEach(op => {
      const opDate = op.date_obj;
      const y = opDate.getFullYear();
      const m = opDate.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;

      if (!monthsMap.has(key)) {
        const isCurr = key === currentMonthKey;
        monthsMap.set(key, {
          key,
          label: `${monthNames[m]} ${y}`,
          year: y,
          month: m,
          count: 0,
          totalIncomes: 0,
          totalEgresses: 0,
          isCurrent: isCurr
        });
      }

      const mObj = monthsMap.get(key)!;
      mObj.count += 1;
      if (op.type === 'ingreso' && op.concept !== 'Apertura de Caja - Fondo Inicial') {
        mObj.totalIncomes += op.amount;
      } else if (op.type === 'egreso' && op.concept !== 'Cierre de Caja - Entrega de Efectivo (Arqueo)') {
        mObj.totalEgresses += op.amount;
      }
    });

    return Array.from(monthsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [allUnifiedOps]);

  // Compute all available days from operations + today
  const availableDays = useMemo(() => {
    const daysMap = new Map<string, {
      key: string;
      label: string;
      date: Date;
      count: number;
      isCurrent: boolean;
    }>();

    const today = new Date();
    const todayKey = getLocalDateString(today);

    daysMap.set(todayKey, {
      key: todayKey,
      label: formatDateSpanish(todayKey),
      date: today,
      count: 0,
      isCurrent: true
    });

    allUnifiedOps.forEach(op => {
      const opDate = op.date_obj;
      const key = getLocalDateString(opDate);

      if (!daysMap.has(key)) {
        daysMap.set(key, {
          key,
          label: formatDateSpanish(key),
          date: opDate,
          count: 0,
          isCurrent: key === todayKey
        });
      }

      const dObj = daysMap.get(key)!;
      dObj.count += 1;
    });

    return Array.from(daysMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allUnifiedOps]);

  // Current selected week object
  const currentWeekObj = useMemo(() => {
    const selDate = parseUniversalDate(selectedDate) || new Date();
    const start = getStartOfWeek(selDate);
    const key = getLocalDateString(start);
    const match = availableWeeks.find(w => w.key === key);
    if (match) return match;
    return {
      key,
      label: formatWeekRangeSpanish(start),
      startDate: start,
      endDate: getEndOfWeek(selDate),
      count: 0,
      totalIncomes: 0,
      totalEgresses: 0,
      isCurrent: key === getLocalDateString(getStartOfWeek(new Date()))
    };
  }, [selectedDate, availableWeeks]);

  // Current selected month object
  const currentMonthObj = useMemo(() => {
    const selDate = parseUniversalDate(selectedDate) || new Date();
    const monthKey = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, '0')}`;
    const match = availableMonths.find(m => m.key === monthKey);
    if (match) return match;
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return {
      key: monthKey,
      label: `${monthNames[selDate.getMonth()]} ${selDate.getFullYear()}`,
      year: selDate.getFullYear(),
      month: selDate.getMonth(),
      count: 0,
      totalIncomes: 0,
      totalEgresses: 0,
      isCurrent: monthKey === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    };
  }, [selectedDate, availableMonths]);

  // Find most recent day with operations if today has zero
  const latestActiveDay = useMemo(() => {
    return availableDays.find(d => d.count > 0) || null;
  }, [availableDays]);

  // Find most recent week with operations if current selected week has zero
  const latestActiveWeek = useMemo(() => {
    return availableWeeks.find(w => w.count > 0) || null;
  }, [availableWeeks]);

  // Find most recent month with operations if current month has zero
  const latestActiveMonth = useMemo(() => {
    return availableMonths.find(m => m.count > 0) || null;
  }, [availableMonths]);

  // Auto-default when switching tabs so user NEVER gets stuck at zero if data exists
  const handleSelectTimeRange = (newRange: 'diario' | 'semanal' | 'mensual' | 'todos') => {
    setTimeRange(newRange);
    refreshAllData();
    
    const currentBaseDate = parseUniversalDate(selectedDate) || new Date();
    
    if (newRange === 'diario') {
      setSelectedDate(getLocalDateString(currentBaseDate));
    } else if (newRange === 'semanal') {
      const currentWeekStart = getStartOfWeek(currentBaseDate);
      setSelectedDate(getLocalDateString(currentWeekStart));
    } else if (newRange === 'mensual') {
      const y = currentBaseDate.getFullYear();
      const m = String(currentBaseDate.getMonth() + 1).padStart(2, '0');
      setSelectedDate(`${y}-${m}-01`);
    }
  };

  // Auto-initialize with data when first loaded if today has no ops
  const hasInitializedPeriod = useRef(false);
  useEffect(() => {
    if (!hasInitializedPeriod.current && allUnifiedOps.length > 0) {
      hasInitializedPeriod.current = true;
      const now = new Date();
      const todayKey = getLocalDateString(now);
      const hasToday = allUnifiedOps.some(op => getLocalDateString(op.date_obj) === todayKey);
      
      if (!hasToday) {
        if (timeRange === 'semanal') {
          const currentWeekStart = getStartOfWeek(now);
          const currentWeekEnd = getEndOfWeek(now);
          const hasCurrWeek = allUnifiedOps.some(op => op.date_obj.getTime() >= currentWeekStart.getTime() && op.date_obj.getTime() <= currentWeekEnd.getTime());
          if (!hasCurrWeek && latestActiveWeek) {
            setSelectedDate(latestActiveWeek.key);
          }
        } else if (timeRange === 'mensual') {
          const hasCurrMonth = allUnifiedOps.some(op => op.date_obj.getMonth() === now.getMonth() && op.date_obj.getFullYear() === now.getFullYear());
          if (!hasCurrMonth && latestActiveMonth) {
            setSelectedDate(`${latestActiveMonth.key}-01`);
          }
        } else if (timeRange === 'diario') {
          if (latestActiveDay) {
            setSelectedDate(latestActiveDay.key);
          }
        }
      }
    }
  }, [allUnifiedOps, timeRange, latestActiveWeek, latestActiveMonth, latestActiveDay]);

  // Step period navigation (previous / next)
  const handleShiftPeriod = (direction: 'prev' | 'next') => {
    const current = parseUniversalDate(selectedDate) || new Date();
    const nextDate = new Date(current);

    if (timeRange === 'diario') {
      nextDate.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
    } else if (timeRange === 'semanal') {
      nextDate.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
    } else if (timeRange === 'mensual') {
      nextDate.setMonth(current.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setSelectedDate(getLocalDateString(nextDate));
  };

  const handleResetToToday = () => {
    setSelectedDate(getLocalDateString(new Date()));
  };

  // Settle Accounts Payable (CXP)
  const handleSettleCxp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCxpItem) return;

    const payAmt = parseFloat(cxpPayAmount);
    if (isNaN(payAmt) || payAmt <= 0) {
      alert('Por favor ingrese un monto válido para pagar');
      return;
    }

    if (payAmt > payingCxpItem.amount) {
      if (!confirm(`El monto ingresado ($${payAmt}) supera la deuda de la cuenta ($${payingCxpItem.amount}). ¿Desea continuar?`)) {
        return;
      }
    }

    try {
      // 1. If register egreso is enabled, add cash registry outflow
      if (cxpPayRegisterEgreso) {
        await dbService.addCashOp({
          type: 'egreso',
          concept: `PAGO CXP: ${payingCxpItem.provider_name} - ${payingCxpItem.concept} (${payAmt === payingCxpItem.amount ? 'Pago Total' : 'Pago Parcial'})`,
          amount: payAmt,
          amount_bs: payAmt * (bcvRate || 36.5),
          payment_method: cxpPayMethod,
          session_id: activeSession?.id || '',
          empleado_nombre: currentUser?.name || 'Sistema'
        });
      }

      // 2. Update accounts payable list
      setPorPagarList(prev => prev.map(p => {
        if (p.id === payingCxpItem.id) {
          const remaining = Math.max(0, p.amount - payAmt);
          if (remaining === 0) {
            return {
              ...p,
              status: 'pagado',
              amount_paid: (p.amount_paid || 0) + payAmt,
              observation: `${p.observation || p.observation || ''} | Pago total de $${payAmt} vía ${cxpPayMethod} en fecha ${new Date().toLocaleDateString()}`.trim()
            };
          } else {
            return {
              ...p,
              amount: remaining,
              amount_bs: remaining * (bcvRate || 36.5),
              amount_paid: (p.amount_paid || 0) + payAmt,
              observation: `${p.observation || p.observation || ''} | Abono parcial de $${payAmt} vía ${cxpPayMethod} en fecha ${new Date().toLocaleDateString()}. Resta $${remaining.toFixed(2)}`.trim()
            };
          }
        }
        return p;
      }));

      // 3. Refresh parent data
      onRefreshData();
      refreshAllData();

      // 4. Reset & Close
      setPayingCxpItem(null);
      setCxpPayAmount('');
      alert('¡Pago registrado con éxito!');
    } catch (err: any) {
      console.error('Error settling CXP:', err);
      alert(`Error al registrar el pago: ${err.message || err.toString()}`);
    }
  };

  // Delete Accounts Payable (CXP)
  const handleDeleteCxp = (id: string, provider: string, amount: number) => {
    if (confirm(`¿Estás seguro de que deseas eliminar/anular esta cuenta por pagar a ${provider} por $${amount.toFixed(2)} USD? Esta acción no se puede deshacer.`)) {
      setPorPagarList(prev => prev.filter(p => p.id !== id));
      alert('¡Cuenta por pagar eliminada con éxito!');
    }
  };

  // Filtered unified operations
  const filteredOps = useMemo(() => {
    const res = allUnifiedOps.filter(op => {
      const opDate = op.date_obj;
      const opDateStr = getLocalDateString(opDate);

      // Time Range Filter
      if (timeRange === 'diario') {
        if (opDateStr !== selectedDate) return false;
      } else if (timeRange === 'semanal') {
        const selDate = parseUniversalDate(selectedDate) || new Date();
        const startOfWeek = getStartOfWeek(selDate);
        const endOfWeek = getEndOfWeek(selDate);
        if (opDate < startOfWeek || opDate > endOfWeek) return false;
      } else if (timeRange === 'mensual') {
        const selDate = parseUniversalDate(selectedDate) || new Date();
        if (opDate.getMonth() !== selDate.getMonth() || opDate.getFullYear() !== selDate.getFullYear()) {
          return false;
        }
      }

      // Search Filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const conceptMatch = (op.concept || '').toLowerCase().includes(query);
        const docMatch = (op.doc_number || '').toLowerCase().includes(query);
        const idMatch = String(op.id || '').toLowerCase().includes(query);
        const methodMatch = (op.payment_method || '').toLowerCase().includes(query);
        const clientMatch = (op.raw?.customer_name || op.raw?.cliente || '').toLowerCase().includes(query);
        if (!conceptMatch && !docMatch && !idMatch && !methodMatch && !clientMatch) return false;
      }

      // Payment Method Filter
      if (paymentMethodFilter !== 'todos') {
        const method = (op.payment_method || 'Efectivo USD').toLowerCase();
        if (!method.includes(paymentMethodFilter.toLowerCase())) return false;
      }

      // Category Filter
      if (categoryFilter !== 'todas') {
        let cat = op.category;
        if (!cat && op.concept) {
          const match = op.concept.match(/\[Gasto\]\s*\[(.*?)\]/);
          cat = match ? match[1] : null;
        }
        if (!cat) {
          const lowerConcept = (op.concept || '').toLowerCase();
          if (categoryFilter === 'Alquiler' && (lowerConcept.includes('arriendo') || lowerConcept.includes('alquiler') || lowerConcept.includes('renta'))) cat = 'Alquiler';
          else if (categoryFilter === 'Electricidad / luz' && (lowerConcept.includes('luz') || lowerConcept.includes('electricidad') || lowerConcept.includes('corpoelec'))) cat = 'Electricidad / luz';
          else if (categoryFilter === 'Agua' && lowerConcept.includes('agua')) cat = 'Agua';
          else if (categoryFilter === 'Internet / teléfono' && (lowerConcept.includes('internet') || lowerConcept.includes('telefono') || lowerConcept.includes('teléfono') || lowerConcept.includes('cantv') || lowerConcept.includes('inter'))) cat = 'Internet / teléfono';
          else if (categoryFilter === 'Patente y permisos' && (lowerConcept.includes('patente') || lowerConcept.includes('permiso') || lowerConcept.includes('alcaldia') || lowerConcept.includes('alcaldía') || lowerConcept.includes('impuesto'))) cat = 'Patente y permisos';
          else if (categoryFilter === 'Sueldos y salarios' && (lowerConcept.includes('sueldo') || lowerConcept.includes('salario') || lowerConcept.includes('nomina') || lowerConcept.includes('nómina'))) cat = 'Sueldos y salarios';
          else if (categoryFilter === 'Cotizaciones o cargas sociales' && (lowerConcept.includes('cotizacion') || lowerConcept.includes('cotizaciones') || lowerConcept.includes('cargas sociales') || lowerConcept.includes('ivss'))) cat = 'Cotizaciones o cargas sociales';
          else if (categoryFilter === 'Compra de mercadería / productos' && (lowerConcept.includes('mercaderia') || lowerConcept.includes('mercadería') || lowerConcept.includes('mercancia') || lowerConcept.includes('mercancía') || lowerConcept.includes('bebidas'))) cat = 'Compra de mercadería / productos';
          else if (categoryFilter === 'Materiales e insumos' && (lowerConcept.includes('bolsa') || lowerConcept.includes('papel') || lowerConcept.includes('insumos') || lowerConcept.includes('material') || lowerConcept.includes('resma'))) cat = 'Materiales e insumos';
          else if (categoryFilter === 'Limpieza' && (lowerConcept.includes('limpieza') || lowerConcept.includes('desinfectante') || lowerConcept.includes('cloro'))) cat = 'Limpieza';
          else if (categoryFilter === 'Mantenimiento y reparaciones' && (lowerConcept.includes('reparacion') || lowerConcept.includes('reparación') || lowerConcept.includes('mantenimiento') || lowerConcept.includes('reparar'))) cat = 'Mantenimiento y reparaciones';
          else if (categoryFilter === 'Transporte / combustible' && (lowerConcept.includes('transporte') || lowerConcept.includes('combustible') || lowerConcept.includes('gasolina') || lowerConcept.includes('moto'))) cat = 'Transporte / combustible';
          else if (categoryFilter === 'Comisiones bancarias / máquina de pago' && (lowerConcept.includes('comision') || lowerConcept.includes('comisión') || lowerConcept.includes('maquina de pago') || lowerConcept.includes('punto'))) cat = 'Comisiones bancarias / máquina de pago';
          else if (categoryFilter === 'Contador' && lowerConcept.includes('contador')) cat = 'Contador';
          else if (categoryFilter === 'Publicidad' && (lowerConcept.includes('publicidad') || lowerConcept.includes('facebook') || lowerConcept.includes('instagram'))) cat = 'Publicidad';
          else cat = 'Otros gastos';
        }
        if (cat !== categoryFilter) return false;
      }

      return true;
    });

    return res.sort((a, b) => b.date_obj.getTime() - a.date_obj.getTime());
  }, [allUnifiedOps, timeRange, selectedDate, searchQuery, paymentMethodFilter, categoryFilter]);

  // Operations divided into sub-tabs
  const displayOps = useMemo(() => {
    if (subTab === 'ingresos') {
      return filteredOps.filter(op => op.type === 'ingreso');
    } else if (subTab === 'egresos') {
      return filteredOps.filter(op => op.type === 'egreso');
    }
    return [];
  }, [filteredOps, subTab]);

  // Por Cobrar (unpaid client orders)
  const pendingIncomes = useMemo(() => {
    return localOrders.filter(o => {
      const statusLower = (o.status || '').toLowerCase();
      const isPending = ['pendiente', 'en_espera', 'en_proceso', 'esperando_pago'].includes(statusLower);
      
      const oDate = parseUniversalDate(o.created_at || o.date) || new Date();
      const oDateStr = getLocalDateString(oDate);

      // Filter by date if applicable
      if (timeRange === 'diario') {
        if (oDateStr !== selectedDate) return false;
      } else if (timeRange === 'semanal') {
        const selDate = parseUniversalDate(selectedDate) || new Date();
        const startOfWeek = getStartOfWeek(selDate);
        const endOfWeek = getEndOfWeek(selDate);
        if (oDate < startOfWeek || oDate > endOfWeek) return false;
      } else if (timeRange === 'mensual') {
        const selDate = parseUniversalDate(selectedDate) || new Date();
        if (oDate.getMonth() !== selDate.getMonth() || oDate.getFullYear() !== selDate.getFullYear()) {
          return false;
        }
      }
      
      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const numMatch = String(o.order_number || '').includes(q);
        const clientMatch = (o.customer_name || '').toLowerCase().includes(q);
        if (!numMatch && !clientMatch) return false;
      }

      return isPending;
    });
  }, [localOrders, timeRange, selectedDate, searchQuery]);

  // Aggregated sold products for "Inventario Vendido" tab based on filtered date range
  const soldProductsList = useMemo(() => {
    const productMap = new Map<string, {
      sku: string;
      name: string;
      totalQty: number;
      totalUsd: number;
      totalBs: number;
      docNumbers: Set<string>;
      salesCount: number;
    }>();

    const selDate = parseUniversalDate(selectedDate) || new Date();
    const selYear = selDate.getFullYear();
    const selMonth = selDate.getMonth();
    const startWk = getStartOfWeek(selDate);
    const endWk = getEndOfWeek(selDate);

    // 1. Process localInvoices (Ventas Flash POS)
    localInvoices.forEach(inv => {
      const invDate = getOpDate(inv);
      const invDateStr = getLocalDateString(invDate);

      if (timeRange === 'diario' && invDateStr !== selectedDate) return;
      if (timeRange === 'semanal' && (invDate < startWk || invDate > endWk)) return;
      if (timeRange === 'mensual' && (invDate.getMonth() !== selMonth || invDate.getFullYear() !== selYear)) return;

      const controlNum = (inv.control_number || inv.numero || inv.id || '').toString().trim().toUpperCase();
      const isNE = inv.document_type === 'nota_entrega' || controlNum.startsWith('NE-');
      const docNum = isNE ? (controlNum.startsWith('NE-') ? controlNum : `NE-${controlNum.padStart(6, '0')}`)
                          : (controlNum.startsWith('FAC-') ? controlNum : `FAC-${controlNum.padStart(6, '0')}`);

      const items = Array.isArray(inv.items) ? inv.items : [];
      items.forEach((item: any) => {
        const sku = (item.sku || item.product_id || item.id || 'S/N').toString().trim();
        const name = (item.name || item.title || item.product_name || 'Producto General').toString().trim();
        const key = `${sku.toLowerCase()}_${name.toLowerCase()}`;

        const qty = Number(item.qty || item.quantity || 1);
        const price = Number(item.price || item.unit_price || 0);
        const itemTotalUsd = Number(item.total || (qty * price));
        const itemTotalBs = itemTotalUsd * (bcvRate || 36.5);

        if (!productMap.has(key)) {
          productMap.set(key, {
            sku,
            name,
            totalQty: 0,
            totalUsd: 0,
            totalBs: 0,
            docNumbers: new Set<string>(),
            salesCount: 0
          });
        }

        const entry = productMap.get(key)!;
        entry.totalQty += qty;
        entry.totalUsd += itemTotalUsd;
        entry.totalBs += itemTotalBs;
        entry.docNumbers.add(docNum);
        entry.salesCount += 1;
      });
    });

    // 2. Process localOrders (Pedidos Tienda / Online)
    localOrders.forEach(order => {
      const statusLower = (order.status || '').toLowerCase();
      if (['cancelado', 'anulado', 'rechazado'].includes(statusLower)) return;

      const orderDate = getOpDate(order);
      const orderDateStr = getLocalDateString(orderDate);

      if (timeRange === 'diario' && orderDateStr !== selectedDate) return;
      if (timeRange === 'semanal' && (orderDate < startWk || orderDate > endWk)) return;
      if (timeRange === 'mensual' && (orderDate.getMonth() !== selMonth || orderDate.getFullYear() !== selYear)) return;

      const rawNum = String(order.order_number || order.id || '').replace(/^ORD-/i, '');
      const docNum = `ORD-${rawNum.padStart(6, '0')}`.toUpperCase();

      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item: any) => {
        const sku = (item.sku || item.product_id || item.id || 'S/N').toString().trim();
        const name = (item.name || item.title || item.product_title || 'Producto Web').toString().trim();
        const key = `${sku.toLowerCase()}_${name.toLowerCase()}`;

        const qty = Number(item.qty || item.quantity || 1);
        const price = Number(item.price || 0);
        const itemTotalUsd = Number(item.total || (qty * price));
        const itemTotalBs = itemTotalUsd * (bcvRate || 36.5);

        if (!productMap.has(key)) {
          productMap.set(key, {
            sku,
            name,
            totalQty: 0,
            totalUsd: 0,
            totalBs: 0,
            docNumbers: new Set<string>(),
            salesCount: 0
          });
        }

        const entry = productMap.get(key)!;
        entry.totalQty += qty;
        entry.totalUsd += itemTotalUsd;
        entry.totalBs += itemTotalBs;
        entry.docNumbers.add(docNum);
        entry.salesCount += 1;
      });
    });

    const result = Array.from(productMap.values()).map(p => ({
      ...p,
      docNumbersList: Array.from(p.docNumbers)
    }));

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q) ||
        p.docNumbersList.some(d => d.toLowerCase().includes(q))
      ).sort((a, b) => b.totalQty - a.totalQty);
    }

    return result.sort((a, b) => b.totalQty - a.totalQty);
  }, [localInvoices, localOrders, timeRange, selectedDate, searchQuery, bcvRate]);

  // Metrics calculations
  const metrics = useMemo(() => {
    let totalIncomes = 0;
    let totalEgresses = 0;

    filteredOps.forEach(op => {
      const amount = Number(op.amount) || 0;
      if (op.type === 'ingreso') {
        if (op.concept !== 'Apertura de Caja - Fondo Inicial') {
          totalIncomes += amount;
        }
      } else {
        if (op.concept !== 'Cierre de Caja - Entrega de Efectivo (Arqueo)') {
          totalEgresses += amount;
        }
      }
    });

    return {
      incomes: totalIncomes,
      egresses: totalEgresses,
      balance: totalIncomes - totalEgresses
    };
  }, [filteredOps]);

  // Payment methods breakdown for reporting
  const paymentMethodsSummary = useMemo(() => {
    const map: Record<string, { method: string; incomes: number; egresses: number; net: number }> = {};
    filteredOps.forEach(op => {
      const method = op.payment_method || 'Efectivo USD';
      if (!map[method]) {
        map[method] = { method, incomes: 0, egresses: 0, net: 0 };
      }
      const amt = Number(op.amount) || 0;
      if (op.type === 'ingreso') {
        if (op.concept !== 'Apertura de Caja - Fondo Inicial') {
          map[method].incomes += amt;
          map[method].net += amt;
        }
      } else {
        if (op.concept !== 'Cierre de Caja - Entrega de Efectivo (Arqueo)') {
          map[method].egresses += amt;
          map[method].net -= amt;
        }
      }
    });
    return Object.values(map).sort((a, b) => (b.incomes + b.egresses) - (a.incomes + a.egresses));
  }, [filteredOps]);

  // Dynamic period label for exports
  const activePeriodLabel = useMemo(() => {
    if (timeRange === 'semanal') return currentWeekObj.label;
    if (timeRange === 'mensual') return currentMonthObj.label;
    if (timeRange === 'diario') return formatDateSpanish(selectedDate);
    return 'Histórico Completo';
  }, [timeRange, currentWeekObj, currentMonthObj, selectedDate]);

  // PDF report export
  const handleExportPdf = () => {
    try {
      exportBalanceToPdf({
        businessName: 'INVERSIONES Y COPIAS BELLA VISTA, C.A.',
        rif: 'J-50123456-7',
        periodLabel: activePeriodLabel,
        frequency: timeRange,
        selectedDate,
        generatedAt: new Date().toLocaleString('es-VE'),
        bcvRate,
        incomesUsd: metrics.incomes,
        egressesUsd: metrics.egresses,
        balanceUsd: metrics.balance,
        incomesBs: metrics.incomes * bcvRate,
        egressesBs: metrics.egresses * bcvRate,
        balanceBs: metrics.balance * bcvRate,
        operationsCount: filteredOps.length,
        paymentMethodsSummary,
        operations: filteredOps.map(op => ({
          id: String(op.id || '').substring(0, 14),
          type: op.type,
          source: op.source === 'pos_factura' ? 'Venta POS' : op.source === 'pedido_online' ? 'Tienda Online' : 'Caja',
          concept: op.concept || 'Movimiento de caja',
          amountUsd: Number(op.amount || 0),
          amountBs: Number(op.amount_bs || (Number(op.amount || 0) * bcvRate)),
          paymentMethod: op.payment_method || 'Efectivo USD',
          time: op.time || '',
          date: op.date_obj ? op.date_obj.toLocaleDateString('es-VE') : '',
          operator: op.empleado_nombre || 'N/E'
        }))
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Ocurrió un error al intentar exportar el reporte en formato PDF.');
    }
  };

  // Excel report export
  const handleExportExcel = () => {
    try {
      const dataToExport = filteredOps.map(op => ({
        'ID Operación': op.id,
        'Documento / Orden N°': op.doc_number || 'N/A',
        'Tipo': op.type === 'ingreso' ? 'Ingreso 🟢' : 'Egreso 🔴',
        'Origen': op.source === 'pos_factura' ? 'Venta POS Flash' : op.source === 'pedido_online' ? 'Tienda Online' : 'Caja Registradora',
        'Concepto / Detalle': op.concept,
        'Monto ($)': Number(op.amount || 0).toFixed(2),
        'Monto (Bs)': Number(op.amount_bs || 0).toFixed(2),
        'Medio de Pago': op.payment_method || 'Efectivo USD',
        'Hora': op.time || 'N/A',
        'Fecha': op.date_obj.toLocaleDateString('es-VE'),
        'Operador': op.empleado_nombre || 'N/E'
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Movimientos Financieros');

      if (soldProductsList.length > 0) {
        const inventoryExportData = soldProductsList.map(p => ({
          'SKU / Código': p.sku,
          'Producto': p.name,
          'Unidades Vendidas': p.totalQty,
          'Documentos Asociados': p.docNumbersList.join(', '),
          'Total ($ USD)': p.totalUsd.toFixed(2),
          'Total (Bs)': p.totalBs.toFixed(2)
        }));
        const wsInv = XLSX.utils.json_to_sheet(inventoryExportData);
        XLSX.utils.book_append_sheet(wb, wsInv, 'Inventario Vendido');
      }

      const summaryData = [
        { 'Métrica': 'Total Ventas / Ingresos ($)', 'Valor': metrics.incomes.toFixed(2) },
        { 'Métrica': 'Total Ventas / Ingresos (Bs)', 'Valor': (metrics.incomes * bcvRate).toFixed(2) },
        { 'Métrica': 'Total Gastos / Egresos ($)', 'Valor': metrics.egresses.toFixed(2) },
        { 'Métrica': 'Total Gastos / Egresos (Bs)', 'Valor': (metrics.egresses * bcvRate).toFixed(2) },
        { 'Métrica': 'Balance Operativo ($)', 'Valor': metrics.balance.toFixed(2) },
        { 'Métrica': 'Balance Operativo (Bs)', 'Valor': (metrics.balance * bcvRate).toFixed(2) },
        { 'Métrica': 'Período', 'Valor': activePeriodLabel }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Financiero');

      XLSX.writeFile(wb, `Reporte_Balance_BellaVista_${selectedDate}.xlsx`);
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Ocurrió un error al intentar exportar el reporte en formato Excel.');
    }
  };

  return (
    <div id="balance-panel" className="bg-[#fcfdfd] min-h-screen p-6 text-gray-900">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#131921] uppercase tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-[#005da9]" />
            <span>Balance de Operaciones</span>
          </h1>
          <p className="text-xs text-gray-400 font-bold mt-0.5">
            Control consolidado de ingresos, egresos, caja y arqueos financieros.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Ingreso/Egreso Button */}
          <button
            type="button"
            onClick={() => {
              setManualType('egreso');
              setManualCategory('Otros gastos');
              setManualConcept('');
              setManualAmountUsd('');
              setManualPaymentMethod('Efectivo USD');
              setManualObservations('');
              setShowManualModal(true);
            }}
            className="px-4 py-2 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4 text-[#ffb700]" />
            <span>ingreso/egreso</span>
          </button>

          {/* Caja Status Button */}
          {!activeSession ? (
            <button 
              type="button"
              onClick={() => {
                setOpenAmountBs('10.00');
                setSessionNotes('');
                const defaultEmp = currentUser?.name || currentUser?.email || (authorizedCajaUsers.length > 0 ? (authorizedCajaUsers[0].name || authorizedCajaUsers[0].email) : 'Cajero Responsable');
                setOpenEmployee(defaultEmp);
                setShowOpenModal(true);
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-[#ffb700] text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Unlock className="w-4 h-4 shrink-0 text-[#ffb700]" />
              <span>Abrir caja</span>
            </button>
          ) : (
            <button 
              type="button"
              onClick={() => {
                setCloseAmountBs('');
                setSessionNotes('');
                setShowCloseModal(true);
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Lock className="w-3.5 h-3.5 text-white shrink-0" />
              <span>Cerrar caja</span>
            </button>
          )}

          {/* Export PDF Button */}
          <button 
            type="button"
            onClick={handleExportPdf}
            title="Exportar balance a documento PDF formateado para impresión"
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>PDF</span>
          </button>

          {/* Export Excel Button */}
          <button 
            type="button"
            onClick={handleExportExcel}
            title="Exportar datos a hoja de cálculo Excel"
            className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {/* CARD 1: Balance Card */}
        <div className="bg-white border border-gray-150 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">Balance</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight">
                ${(metrics?.balance || 0).toFixed(2)}
              </span>
              <span className="text-xs font-bold text-gray-500">USD</span>
            </div>
            <span className="text-[11px] font-bold text-gray-500 block leading-none">
              Bs. {((metrics?.balance || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (BCV)
            </span>
          </div>
          <div className={`p-3 rounded-2xl ${(metrics?.balance || 0) >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {(metrics?.balance || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
        </div>

        {/* CARD 2: Ventas Totales */}
        <div className="bg-white border border-gray-150 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">Ventas totales</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 tracking-tight">
                ${(metrics?.incomes || 0).toFixed(2)}
              </span>
              <span className="text-xs font-bold text-emerald-600">USD</span>
            </div>
            <span className="text-[11px] font-bold text-gray-500 block leading-none">
              Bs. {((metrics?.incomes || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (BCV)
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* CARD 3: Gastos Totales */}
        <div className="bg-white border border-gray-150 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">Gastos totales</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600 tracking-tight">
                ${(metrics?.egresses || 0).toFixed(2)}
              </span>
              <span className="text-xs font-bold text-rose-600">USD</span>
            </div>
            <span className="text-[11px] font-bold text-gray-500 block leading-none">
              Bs. {((metrics?.egresses || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (BCV)
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-rose-50 text-rose-600">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>
      </div>



      {/* CORE INNER SEGMENT TAB (Transacciones vs Cierres) */}
      <div className="bg-gray-100 p-1.5 rounded-2xl max-w-md mb-6 flex gap-1 border border-gray-200/50 shadow-inner">
        <button
          type="button"
          onClick={() => setInnerTab('transacciones')}
          className={`flex-1 py-2 text-center text-xs font-black rounded-xl transition cursor-pointer ${
            innerTab === 'transacciones'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50/50'
          }`}
        >
          Transacciones
        </button>
        <button
          type="button"
          onClick={() => setInnerTab('cierres')}
          className={`flex-1 py-2 text-center text-xs font-black rounded-xl transition cursor-pointer ${
            innerTab === 'cierres'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50/50'
          }`}
        >
          Cierres de caja
        </button>
      </div>

      {innerTab === 'transacciones' ? (
        <div className="space-y-6">
          
          {/* FILTER BAR PANEL */}
          <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3 py-2 border rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    showAdvancedFilters 
                      ? 'bg-gray-100 border-gray-300 text-gray-900' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filtrar</span>
                </button>

                <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-bold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleSelectTimeRange('diario')}
                    className={`px-3 py-1.5 rounded-lg transition font-bold cursor-pointer flex items-center gap-1 ${
                      timeRange === 'diario'
                        ? 'bg-white text-gray-900 shadow-xs font-extrabold ring-1 ring-black/5'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                    }`}
                  >
                    <span>📅</span>
                    <span>Diario</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTimeRange('semanal')}
                    className={`px-3 py-1.5 rounded-lg transition font-bold cursor-pointer flex items-center gap-1 ${
                      timeRange === 'semanal'
                        ? 'bg-white text-[#005da9] shadow-xs font-extrabold ring-1 ring-blue-500/20'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                    }`}
                  >
                    <span>🗓️</span>
                    <span>Semanal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTimeRange('mensual')}
                    className={`px-3 py-1.5 rounded-lg transition font-bold cursor-pointer flex items-center gap-1 ${
                      timeRange === 'mensual'
                        ? 'bg-white text-indigo-700 shadow-xs font-extrabold ring-1 ring-indigo-500/20'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                    }`}
                  >
                    <span>📆</span>
                    <span>Mensual</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTimeRange('todos')}
                    className={`px-3 py-1.5 rounded-lg transition font-bold cursor-pointer flex items-center gap-1 ${
                      timeRange === 'todos'
                        ? 'bg-white text-emerald-700 shadow-xs font-extrabold ring-1 ring-emerald-500/20'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                    }`}
                  >
                    <span>📋</span>
                    <span>Todos</span>
                  </button>
                </div>

                {timeRange !== 'todos' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Weekly Select Dropdown */}
                    {timeRange === 'semanal' && availableWeeks.length > 0 && (
                      <select
                        value={currentWeekObj.key}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-blue-50/90 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#005da9] transition cursor-pointer shadow-2xs"
                      >
                        {availableWeeks.map(w => (
                          <option key={w.key} value={w.key}>
                            {w.label} {w.isCurrent ? '(Actual)' : ''} {w.count > 0 ? `• ${w.count} ops` : '(Sin ops)'}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Monthly Select Dropdown */}
                    {timeRange === 'mensual' && availableMonths.length > 0 && (
                      <select
                        value={currentMonthObj.key}
                        onChange={(e) => setSelectedDate(e.target.value + '-01')}
                        className="px-2.5 py-1.5 bg-indigo-50/90 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition cursor-pointer shadow-2xs"
                      >
                        {availableMonths.map(m => (
                          <option key={m.key} value={m.key}>
                            {m.label} {m.isCurrent ? '(Actual)' : ''} {m.count > 0 ? `• ${m.count} ops` : '(Sin ops)'}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Daily Select Dropdown */}
                    {timeRange === 'diario' && availableDays.length > 0 && (
                      <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-emerald-50/90 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 transition cursor-pointer shadow-2xs"
                      >
                        {availableDays.map(d => (
                          <option key={d.key} value={d.key}>
                            {d.label} {d.isCurrent ? '(Hoy)' : ''} {d.count > 0 ? `• ${d.count} ops` : '(Sin ops)'}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-0.5 shadow-2xs">
                      {/* Previous Period Button */}
                      <button
                        type="button"
                        onClick={() => handleShiftPeriod('prev')}
                        title={`Ir a ${timeRange === 'semanal' ? 'semana' : timeRange === 'mensual' ? 'mes' : 'día'} anterior`}
                        className="p-1.5 hover:bg-white text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      {/* Date / Week Display Button */}
                      <div className="relative flex items-center">
                        <button
                          type="button"
                          className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 hover:bg-gray-50 transition flex items-center gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5 text-[#005da9]" />
                          <span>
                            {timeRange === 'semanal' 
                              ? currentWeekObj.label
                              : timeRange === 'mensual'
                                ? currentMonthObj.label
                                : formatDateSpanish(selectedDate)
                            }
                          </span>
                        </button>
                        <input 
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {/* Next Period Button */}
                      <button
                        type="button"
                        onClick={() => handleShiftPeriod('next')}
                        title={`Ir a ${timeRange === 'semanal' ? 'semana' : timeRange === 'mensual' ? 'mes' : 'día'} siguiente`}
                        className="p-1.5 hover:bg-white text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Reset to Today / Current Week / Month */}
                      <button
                        type="button"
                        onClick={handleResetToToday}
                        title="Volver a la fecha actual"
                        className="px-2 py-1 text-[11px] font-extrabold text-[#005da9] hover:bg-blue-50 rounded-lg transition cursor-pointer ml-0.5"
                      >
                        {timeRange === 'semanal' ? 'Esta semana' : timeRange === 'mensual' ? 'Este mes' : 'Hoy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative w-full lg:max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Search className="w-4 h-4 text-gray-400" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar concepto..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition"
                />
              </div>

            </div>

            {showAdvancedFilters && (
              <div className="pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                <div className="space-y-1">
                  <span className="block text-[10px] font-black uppercase text-gray-400 tracking-wider">Filtrar por medio de pago:</span>
                  <select
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 cursor-pointer"
                  >
                    <option value="todos">Todos los métodos de pago</option>
                    <option value="Efectivo USD">Efectivo Dólares (USD)</option>
                    <option value="Efectivo VES">Efectivo Bolívares (VES)</option>
                    <option value="Pago Móvil">Pago Móvil</option>
                    <option value="Punto de Venta">Punto de Venta</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] font-black uppercase text-gray-400 tracking-wider">Filtrar por categoría de gasto:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 cursor-pointer"
                  >
                    <option value="todas">Todas las categorías</option>
                    {GASTO_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end self-end">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethodFilter('todos');
                      setCategoryFilter('todas');
                      setSearchQuery('');
                      setTimeRange('diario');
                      setSelectedDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="text-[11px] font-extrabold text-gray-500 hover:text-[#005da9] underline cursor-pointer"
                  >
                    Restablecer filtros
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SUB-TABS NAVIGATION BAR */}
          <div className="border-b border-gray-200">
            <div className="flex gap-6 overflow-x-auto pb-0.5">
              {(['ingresos', 'egresos', 'inventario', 'cobrar', 'pagar'] as const).map((tabId) => {
                const label = tabId === 'ingresos' ? 'Ingresos' :
                              tabId === 'egresos' ? 'Egresos' :
                              tabId === 'inventario' ? '📦 Inventario Vendido' :
                              tabId === 'cobrar' ? 'Por cobrar' : 'Por pagar';
                
                const count = tabId === 'ingresos' ? filteredOps.filter(o => o.type === 'ingreso').length :
                              tabId === 'egresos' ? filteredOps.filter(o => o.type === 'egreso').length :
                              tabId === 'inventario' ? soldProductsList.length :
                              tabId === 'cobrar' ? pendingIncomes.length : 0;

                const isActive = subTab === tabId;
                
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setSubTab(tabId)}
                    className={`pb-3.5 text-xs font-black transition relative whitespace-nowrap cursor-pointer ${
                      isActive 
                        ? 'text-slate-900 font-extrabold' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {count}
                    </span>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TRANSACTION CONTENT LISTS */}
          <div className="bg-white border border-gray-150 rounded-3xl overflow-hidden shadow-xs">
            
            {subTab === 'inventario' ? (
              <div>
                {/* Inventario Header Metrics Bar */}
                <div className="bg-slate-900 p-5 text-white grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-800">
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                    <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Productos Distintos</p>
                    <p className="text-xl font-black text-white mt-0.5">{soldProductsList.length}</p>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                    <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Unidades Vendidas</p>
                    <p className="text-xl font-black text-[#ffb700] mt-0.5">
                      {soldProductsList.reduce((acc, p) => acc + p.totalQty, 0)} <span className="text-xs font-bold text-gray-300">ud.</span>
                    </p>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                    <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Monto Total USD</p>
                    <p className="text-xl font-black text-emerald-400 mt-0.5">
                      ${soldProductsList.reduce((acc, p) => acc + p.totalUsd, 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                    <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Monto Total Bs</p>
                    <p className="text-xl font-black text-sky-300 mt-0.5">
                      Bs. {soldProductsList.reduce((acc, p) => acc + p.totalBs, 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                {soldProductsList.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs font-extrabold text-gray-600">No hay registro de productos vendidos en el rango de fechas seleccionado.</p>
                    <p className="text-[11px] text-gray-400 mt-1">Sugerencia: Cambie el filtro de rango (diario, semanal, mensual o todos) o ajuste el texto de búsqueda.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                          <th className="px-5 py-3">SKU / Código</th>
                          <th className="px-5 py-3">Producto / Descripción</th>
                          <th className="px-5 py-3 text-center">Unidades Vendidas</th>
                          <th className="px-5 py-3">Documento(s) N° (Ventas)</th>
                          <th className="px-5 py-3 text-right">Total Ventas ($ / Bs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                        {soldProductsList.map((product, idx) => (
                          <tr key={`${product.sku}_${idx}`} className="hover:bg-gray-50/50 transition">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="font-mono font-extrabold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-[11px] border border-slate-200">
                                {product.sku || 'S/N'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="font-extrabold text-gray-900 leading-tight">{product.name}</p>
                              <p className="text-[10px] text-gray-400 font-medium">Registrado en {product.salesCount} transacción(es)</p>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {product.totalQty} {product.totalQty === 1 ? 'unidad' : 'unidades'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                                {product.docNumbersList.slice(0, 5).map((docNum) => {
                                  const isNE = docNum.startsWith('NE-');
                                  const isORD = docNum.startsWith('ORD-');
                                  return (
                                    <span
                                      key={docNum}
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                        isNE
                                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                                          : isORD
                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                            : 'bg-sky-50 text-sky-800 border-sky-200'
                                      }`}
                                    >
                                      {docNum}
                                    </span>
                                  );
                                })}
                                {product.docNumbersList.length > 5 && (
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    +{product.docNumbersList.length - 5} más
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <p className="font-mono font-black text-sm text-gray-900">${product.totalUsd.toFixed(2)} USD</p>
                              <p className="text-[10px] text-gray-400 font-extrabold font-mono">Bs. {product.totalBs.toFixed(2)}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : subTab === 'cobrar' ? (
              pendingIncomes.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <FileText className="w-9 h-9 mx-auto mb-2 text-gray-300" />
                  <p className="text-xs font-bold text-gray-500">No hay pedidos de cliente con cobranza pendiente en este rango.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-5 py-3">Nº Pedido / Cliente</th>
                        <th className="px-5 py-3">Monto Total</th>
                        <th className="px-5 py-3">Método de Cobro</th>
                        <th className="px-5 py-3">Fecha y hora</th>
                        <th className="px-5 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                      {pendingIncomes.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50/50 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-extrabold text-gray-900">Pedido #{String(order.order_number || '').padStart(6, '0')}</p>
                                <p className="text-[11px] text-gray-500 font-bold">{order.customer_name || 'Consumidor final'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-mono font-bold text-amber-700">${Number(order.total_price || 0).toFixed(2)} USD</p>
                            <p className="text-[10px] text-gray-400 font-bold">Bs. {((order.total_price || 0) * bcvRate).toFixed(2)}</p>
                          </td>
                          <td className="px-5 py-3.5 font-bold text-gray-600">
                            {order.payment_method || 'No especificado'}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-gray-500">
                            {order.created_at ? new Date(order.created_at).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}
                          </td>
                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              {/* 👁️ VER / DETAILS */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedViewItem(order);
                                  setSelectedViewType('cobrar');
                                }}
                                className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#005da9] flex items-center justify-center hover:bg-sky-50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                title="Ver Detalle"
                              >
                                <Eye className="w-4 h-4 text-[#005da9]" />
                              </button>

                              {/* 🖨️ IMPRIMIR / PRINT */}
                              <button
                                type="button"
                                onClick={() => handlePrint('cobrar', order)}
                                className="w-8 h-8 rounded-full bg-white border border-gray-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                title="Imprimir Comprobante"
                              >
                                <Printer className="w-4 h-4 text-slate-700" />
                              </button>

                              {/* 🔗 COMPARTIR / SHARE */}
                              <button
                                type="button"
                                onClick={() => handleShare('cobrar', order)}
                                className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                title="Compartir por WhatsApp"
                              >
                                <Share2 className="w-4 h-4 text-emerald-700" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : subTab === 'pagar' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm">Control de Cuentas por Pagar</h4>
                    <p className="text-[11px] text-gray-500 font-bold">Invoices y compromisos pendientes con proveedores</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPagarProviderName('');
                      setPagarConcept('');
                      setPagarAmount('');
                      setPagarDueDate(new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]);
                      setPagarObservation('');
                      setShowPagarModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#005da9] hover:bg-[#005da9]/90 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registrar Cuenta</span>
                  </button>
                </div>

                {porPagarList.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 bg-white border border-gray-100 rounded-2xl">
                    <Tag className="w-9 h-9 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs font-black text-gray-500">No hay facturas o compromisos de pago pendientes.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-white border border-gray-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                          <th className="px-5 py-3">Proveedor / Concepto</th>
                          <th className="px-5 py-3">Monto Total</th>
                          <th className="px-5 py-3">Fecha Vencimiento</th>
                          <th className="px-5 py-3">Estado</th>
                          <th className="px-5 py-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                        {porPagarList.map((item) => {
                          const isOverdue = new Date(item.due_date) < new Date() && item.status !== 'pagado';
                          return (
                            <tr key={item.id} className="hover:bg-gray-50/50 transition">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                                    <Tag className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="font-extrabold text-gray-900">{item.provider_name}</p>
                                    <p className="text-[11px] text-gray-500 font-bold">{item.concept}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="font-mono font-bold text-gray-900">${Number(item.amount || 0).toFixed(2)} USD</p>
                                <p className="text-[10px] text-gray-400 font-bold">Bs. {Number(item.amount_bs || 0).toFixed(2)}</p>
                              </td>
                              <td className="px-5 py-3.5 font-bold text-gray-500">
                                {item.due_date}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  item.status === 'pagado'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : isOverdue
                                      ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
                                      : 'bg-amber-50 border-amber-200 text-amber-700'
                                }`}>
                                  {item.status === 'pagado' ? 'Pagado' : isOverdue ? 'Vencido' : 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-2">
                                  {/* 👁️ VER / DETAILS */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedViewItem(item);
                                      setSelectedViewType('pagar');
                                    }}
                                    className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#005da9] flex items-center justify-center hover:bg-sky-50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                    title="Ver Detalle"
                                  >
                                    <Eye className="w-4 h-4 text-[#005da9]" />
                                  </button>

                                  {/* 🖨️ IMPRIMIR / PRINT */}
                                  <button
                                    type="button"
                                    onClick={() => handlePrint('pagar', item)}
                                    className="w-8 h-8 rounded-full bg-white border border-gray-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                    title="Imprimir Orden de Pago"
                                  >
                                    <Printer className="w-4 h-4 text-slate-700" />
                                  </button>

                                  {/* 🔗 COMPARTIR / SHARE */}
                                  <button
                                    type="button"
                                    onClick={() => handleShare('pagar', item)}
                                    className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                    title="Compartir por WhatsApp"
                                  >
                                    <Share2 className="w-4 h-4 text-emerald-700" />
                                  </button>

                                  {/* ✅ COMPLETAR PAGO */}
                                  {item.status !== 'pagado' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayingCxpItem(item);
                                        setCxpPayAmount(String(item.amount));
                                        setCxpPayMethod('Efectivo USD');
                                        setCxpPayRegisterEgreso(true);
                                      }}
                                      className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center hover:bg-emerald-200 active:scale-95 transition-all cursor-pointer"
                                      title="Pagar / Abonar a la cuenta"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* ❌ ELIMINAR / ANULAR CUENTA */}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCxp(item.id, item.provider_name, item.amount)}
                                    className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center hover:bg-rose-100 active:scale-95 transition-all cursor-pointer"
                                    title="Eliminar o Anular cuenta por pagar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              displayOps.length === 0 ? (
                <div className="p-12 text-center text-gray-400 space-y-3">
                  <Wallet className="w-10 h-10 mx-auto text-gray-300" />
                  <div>
                    <p className="text-sm font-bold text-gray-700">No se encontraron movimientos en este período</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {timeRange === 'semanal' 
                        ? `No hay ${subTab === 'ingresos' ? 'ingresos' : 'egresos'} registrados en la semana seleccionada.`
                        : timeRange === 'diario'
                          ? `No hay ${subTab === 'ingresos' ? 'ingresos' : 'egresos'} registrados en la fecha seleccionada.`
                          : `No hay ${subTab === 'ingresos' ? 'ingresos' : 'egresos'} registrados con los filtros actuales.`}
                    </p>
                  </div>
                  {timeRange !== 'todos' && (
                    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                      {timeRange === 'semanal' && latestActiveWeek && latestActiveWeek.count > 0 && latestActiveWeek.key !== currentWeekObj.key && (
                        <button
                          type="button"
                          onClick={() => setSelectedDate(latestActiveWeek.key)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <span>Ver semana activa ({latestActiveWeek.label} • {latestActiveWeek.count} ops)</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTimeRange('todos')}
                        className="px-3.5 py-1.5 bg-[#005da9] text-white text-xs font-bold rounded-xl hover:bg-[#004884] transition shadow-xs cursor-pointer"
                      >
                        Ver todos los registros históricos
                      </button>
                      <button
                        type="button"
                        onClick={handleResetToToday}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition cursor-pointer"
                      >
                        Ir a fecha actual
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-5 py-3">Doc / Orden N°</th>
                        <th className="px-5 py-3">Concepto</th>
                        <th className="px-5 py-3 text-right">Valor</th>
                        <th className="px-5 py-3">Medio de pago</th>
                        <th className="px-5 py-3">Fecha y hora</th>
                        <th className="px-5 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                      {displayOps.map((op) => {
                        const isIncome = op.type === 'ingreso';
                        const opDate = getOpDate(op);
                        const formattedDate = opDate.toLocaleDateString('es-VE', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        }) + ` | ${op.time || opDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

                        // Clean concept text if it has [Gasto] tag
                        let displayConcept = op.concept || '';
                        let displayCategory = op.category;

                        if (displayConcept.startsWith('[Gasto]')) {
                          const match = displayConcept.match(/\[Gasto\]\s*\[(.*?)\]\s*(.*)/);
                          if (match) {
                            displayCategory = displayCategory || match[1];
                            displayConcept = match[2];
                          }
                        }

                        const docNum = op.doc_number || 'N/A';
                        const isNE = docNum.startsWith('NE-');
                        const isORD = docNum.startsWith('ORD-');
                        const isFAC = docNum.startsWith('FAC-');

                        return (
                          <tr key={op.id} className="hover:bg-gray-50/50 transition">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-black border ${
                                isFAC
                                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                                  : isNE
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : isORD
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {docNum}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl shrink-0 ${
                                  isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                }`}>
                                  {isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                                </div>
                                <div className="max-w-xs md:max-w-md space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-extrabold text-gray-900 leading-tight break-words">{displayConcept}</p>
                                    {displayCategory && (
                                      <span className="inline-block text-[9px] bg-rose-50 text-rose-700 border border-rose-100 font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                        {displayCategory}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                    {op.session_id && (
                                      <span className="inline-block text-[9px] bg-slate-100 text-slate-500 font-mono font-bold px-1 rounded">
                                        Sesión: {op.session_id.slice(0, 8)}
                                      </span>
                                    )}
                                    {op.observation && (
                                      <span className="text-gray-400 font-medium italic">
                                        Obs: {op.observation}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <p className={`font-mono font-black text-sm ${isIncome ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {isIncome ? '+' : '-'}${Number(op.amount || 0).toFixed(2)} USD
                              </p>
                              <p className="text-[10px] text-gray-400 font-extrabold font-mono">
                                {isIncome ? '+' : '-'}Bs. {Number(op.amount_bs || 0).toFixed(2)}
                              </p>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-50 border border-gray-150 text-gray-600">
                                {op.payment_method || 'Efectivo USD'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-bold text-gray-500 whitespace-nowrap">
                              {formattedDate}
                            </td>
                            <td className="px-5 py-3.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-2">
                                {/* 👁️ VER / DETAILS */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedViewItem(op);
                                    setSelectedViewType(op.type as any);
                                  }}
                                  className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#005da9] flex items-center justify-center hover:bg-sky-50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                  title="Ver Detalle"
                                >
                                  <Eye className="w-4 h-4 text-[#005da9]" />
                                </button>

                                {/* 🖨️ IMPRIMIR / PRINT */}
                                <button
                                  type="button"
                                  onClick={() => handlePrint(op.type as any, op)}
                                  className="w-8 h-8 rounded-full bg-white border border-gray-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                  title="Imprimir Comprobante"
                                >
                                  <Printer className="w-4 h-4 text-slate-700" />
                                </button>

                                {/* 🔗 COMPARTIR / SHARE */}
                                <button
                                  type="button"
                                  onClick={() => handleShare(op.type as any, op)}
                                  className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                                  title="Compartir por WhatsApp"
                                >
                                  <Share2 className="w-4 h-4 text-emerald-700" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>



        </div>
      ) : (
        /* CIERRES DE CAJA HISTORY VIEW */
        <div className="bg-white border border-gray-150 rounded-3xl overflow-hidden shadow-xs">
          {cashSessions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Lock className="w-9 h-9 mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold text-gray-500">No se encontraron sesiones o cierres de caja en el historial.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                    <th className="px-5 py-3">Código / Empleado</th>
                    <th className="px-5 py-3">Apertura (Fondo)</th>
                    <th className="px-5 py-3">Cierre (Efectivo Real)</th>
                    <th className="px-5 py-3 text-right">Diferencia</th>
                    <th className="px-5 py-3">Estado / Arqueo</th>
                    <th className="px-5 py-3 text-center">Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                  {cashSessions.map((session) => {
                    const isOpen = session.estado === 'abierta';
                    const diffBs = session.diferencia_bs || 0;
                    const diffUsd = session.diferencia_usd || 0;
                    const cleanId = session.id ? session.id.slice(0, 8) : 'N/A';

                    let estadoArqueoBadge = <span className="text-gray-400 italic">En Curso</span>;
                    if (!isOpen) {
                      if (session.estado_arqueo === 'cuadrada' || Math.abs(diffBs) < 0.01) {
                        estadoArqueoBadge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">🟢 Cuadrada</span>;
                      } else if (session.estado_arqueo === 'descuadre_sobrante' || diffBs > 0) {
                        estadoArqueoBadge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-50 text-blue-800 border border-blue-200">🔵 Sobrante</span>;
                      } else {
                        estadoArqueoBadge = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-50 text-rose-800 border border-rose-200">🔴 Faltante</span>;
                      }
                    }

                    return (
                      <tr key={session.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-mono font-black text-slate-900 uppercase">#{session.session_code || cleanId}</p>
                            <p className="text-[11px] font-extrabold text-[#005da9] flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3 text-gray-400" />
                              {session.empleado_nombre || 'Cajero Responsable'}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-gray-900">{session.apertura || 'N/A'}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            Bs. {Number(session.apertura_bs || 0).toFixed(2)} (${Number(session.apertura_usd || 0).toFixed(2)} USD)
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {isOpen ? (
                            <p className="text-gray-400 font-bold italic">Turno en curso</p>
                          ) : (
                            <>
                              <p className="font-bold text-gray-900">{session.cierre || 'N/A'}</p>
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                Real: Bs. {Number(session.cierre_bs || 0).toFixed(2)} (${Number(session.cierre_usd || 0).toFixed(2)})
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          {isOpen ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            <div>
                              <p className={`font-mono font-black ${
                                Math.abs(diffUsd) < 0.01 ? 'text-gray-600' : diffUsd > 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}>
                                {diffUsd > 0 ? '+' : ''}${diffUsd.toFixed(2)} USD
                              </p>
                              <p className={`text-[10px] font-mono font-extrabold ${
                                Math.abs(diffBs) < 0.01 ? 'text-gray-400' : diffBs > 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {diffBs > 0 ? '+' : ''}Bs. {diffBs.toFixed(2)}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {estadoArqueoBadge}
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            {/* 👁️ VER / DETAILS */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedViewItem(session);
                                setSelectedViewType('sesion');
                              }}
                              className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#005da9] flex items-center justify-center hover:bg-sky-50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                              title="Ver Detalle"
                            >
                              <Eye className="w-4 h-4 text-[#005da9]" />
                            </button>

                            {/* 🖨️ IMPRIMIR / PRINT */}
                            <button
                              type="button"
                              onClick={() => setViewTicketSession(session)}
                              className="w-8 h-8 rounded-full bg-white border border-gray-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                              title="Imprimir Comprobante de Arqueo"
                            >
                              <Printer className="w-4 h-4 text-slate-700" />
                            </button>

                            {/* 🔗 COMPARTIR / SHARE */}
                            <button
                              type="button"
                              onClick={() => handleShare('sesion', session)}
                              className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                              title="Compartir por WhatsApp"
                            >
                              <Share2 className="w-4 h-4 text-emerald-700" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 💰 REGISTRAR MOVIMIENTO MANUAL MODAL */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left">
            
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Wallet className="w-5 h-5 text-[#ffb700]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Registrar Movimiento Financiero
                  </h3>
                  <p className="text-[10px] text-gray-300 font-medium">
                    Asigne gastos, egresos u otros ingresos directamente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddManualMovement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Tipo de Operación *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-xl border border-gray-150">
                  <button
                    type="button"
                    onClick={() => setManualType('ingreso')}
                    className={`py-1.5 text-center text-xs font-black rounded-lg transition cursor-pointer ${
                      manualType === 'ingreso'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Ingreso 🟢
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualType('egreso')}
                    className={`py-1.5 text-center text-xs font-black rounded-lg transition cursor-pointer ${
                      manualType === 'egreso'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Egreso 🔴
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Concepto / Detalle *
                </label>
                <input
                  type="text"
                  required
                  value={manualConcept}
                  onChange={(e) => setManualConcept(e.target.value)}
                  placeholder="Ej: Pago de papelería, Compra de cartuchos, etc."
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition"
                />
              </div>

              {manualType === 'egreso' && (
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Categoría de Gasto *
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition cursor-pointer"
                  >
                    {GASTO_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Monto ($ USD) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={manualAmountUsd}
                      onChange={(e) => setManualAmountUsd(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1">
                    Monto (Bs VES) (Live)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-gray-400">Bs</span>
                    <input
                      type="text"
                      disabled
                      value={manualAmountBs}
                      className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-xs font-black text-gray-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Medio de Pago / Cobro *
                </label>
                <select
                  value={manualPaymentMethod}
                  onChange={(e) => setManualPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition cursor-pointer"
                >
                  <option value="Efectivo USD">💵 Efectivo Dólares (USD)</option>
                  <option value="Efectivo VES">💵 Efectivo Bolívares (VES)</option>
                  <option value="Pago Móvil">📱 Pago Móvil</option>
                  <option value="Punto de Venta">💳 Punto de Venta</option>
                  <option value="Transferencia Bancaria">🏢 Transferencia VES</option>
                  <option value="Zelle">🇺🇸 Transferencia USD (Zelle)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Notas / Observaciones adicionales
                </label>
                <input
                  type="text"
                  value={manualObservations}
                  onChange={(e) => setManualObservations(e.target.value)}
                  placeholder="Ej: Factura Nº 12345..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  disabled={isSavingManual}
                  className="px-4 py-2 border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-[#ffb700] font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-[#ffb700]" />}
                  <span>Registrar Movimiento</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 🔐 MODAL: APERTURAR CAJA */}
      <OpenCashSessionModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={async ({ aperturaBs, observaciones, empleadoNombre }) => {
          const rateToUse = bcvRate > 0 ? bcvRate : 36.5;
          const openingUsd = aperturaBs / rateToUse;
          const empName = empleadoNombre.trim() || currentUser?.name || currentUser?.email || 'Cajero Responsable';
          const newSession = await dbService.createCashSession({
            empleado_nombre: empName,
            empleado_id: currentUser?.id || null,
            apertura_bs: aperturaBs,
            apertura_usd: openingUsd,
            observaciones: observaciones
          });
          await dbService.addCashOp({
            session_id: newSession?.id,
            type: 'ingreso',
            concept: 'Apertura de Caja - Fondo Inicial',
            amount: openingUsd,
            amount_bs: aperturaBs,
            payment_method: 'Efectivo VES',
            empleado_nombre: empName
          });
          setShowOpenModal(false);
          setSessionNotes('');
          onRefreshData();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
          }
          alert(`¡Caja registradora abierta exitosamente por ${empName}!`);
        }}
        bcvRate={bcvRate}
        currentUser={currentUser}
        storeUsers={storeUsers}
        initialBs={openAmountBs}
        initialObs={sessionNotes}
      />

      {/* 🔒 MODAL: CERRAR CAJA / ARQUEO */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left">
            <div className="bg-rose-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Cierre de Caja y Arqueo
                  </h3>
                  <p className="text-[10px] text-rose-100 font-medium">
                    Verifique el efectivo y efectúe el cierre del turno.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloseCashSession} className="p-5 space-y-4">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3.5 space-y-1.5 text-xs font-mono text-gray-700">
                <div className="flex justify-between items-center">
                  <span>Fondo Inicial:</span>
                  <span className="font-bold">
                    {initialFondoBs.toFixed(2)} Bs (${initialFondoUsd.toFixed(2)} USD)
                  </span>
                </div>
                <div className="flex justify-between items-center text-emerald-700 font-bold">
                  <span>(+) Ingresos del Turno:</span>
                  <span>
                    +{sessionIngressesBs.toFixed(2)} Bs (+${sessionIngressesUsd.toFixed(2)} USD)
                  </span>
                </div>
                <div className="flex justify-between items-center text-rose-700 font-bold">
                  <span>(-) Egresos del Turno:</span>
                  <span>
                    -{sessionEgressesBs.toFixed(2)} Bs (-${sessionEgressesUsd.toFixed(2)} USD)
                  </span>
                </div>
                <div className="pt-1.5 border-t border-rose-200 flex justify-between items-center font-black text-rose-950 text-sm">
                  <span>Arqueo Esperado en Caja:</span>
                  <span>
                    {esperadoSessionBs.toFixed(2)} Bs (${esperadoSessionUsd.toFixed(2)} USD)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Efectivo Real Contado en Caja (Bs) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-xs text-gray-400">Bs</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={closeAmountBs}
                    onChange={(e) => setCloseAmountBs(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
                  />
                </div>
                {/* Diferencia live indicator */}
                {(() => {
                  const inputVal = parseFloat(closeAmountBs) || 0;
                  const diff = inputVal - esperadoSessionBs;
                  if (Math.abs(diff) < 0.01) {
                    return <p className="text-[10px] text-emerald-600 font-bold mt-1">🟢 Cuadre exacto: Sin diferencia</p>;
                  } else if (diff > 0) {
                    return <p className="text-[10px] text-blue-600 font-bold mt-1">🔵 Sobrante: +{diff.toFixed(2)} Bs</p>;
                  } else {
                    return <p className="text-[10px] text-rose-600 font-bold mt-1">🔴 Faltante: {diff.toFixed(2)} Bs</p>;
                  }
                })()}
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Observaciones de Cierre
                </label>
                <input
                  type="text"
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Ej: Cierre de turno sin novedades..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  disabled={isSavingSessionAction}
                  className="px-4 py-2 border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingSessionAction}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingSessionAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>Confirmar y Cerrar Caja</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🧾 MODAL TICKET / COMPROBANTE DE ARQUEO Y CIERRE DE CAJA */}
      {viewTicketSession && (
        <ClosureTicketModal
          session={viewTicketSession}
          sessionOps={cashOps}
          bcvRate={bcvRate}
          onClose={() => setViewTicketSession(null)}
        />
      )}

      {/* 💳 MODAL: ABONAR / CANCELAR CUENTA POR PAGAR */}
      {payingCxpItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left">
            <div className="bg-emerald-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Pagar / Abonar Cuenta
                  </h3>
                  <p className="text-[10px] text-emerald-100 font-medium text-left">
                    Registre abonos parciales o la cancelación total del compromiso.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayingCxpItem(null)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSettleCxp} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-gray-600 space-y-1">
                <div><strong>Proveedor:</strong> {payingCxpItem.provider_name}</div>
                <div><strong>Concepto:</strong> {payingCxpItem.concept}</div>
                <div><strong>Monto pendiente:</strong> <span className="font-mono font-bold text-gray-900">${Number(payingCxpItem.amount || 0).toFixed(2)} USD</span></div>
                {payingCxpItem.amount_paid > 0 && (
                  <div><strong>Monto ya pagado:</strong> <span className="font-mono text-emerald-600">${Number(payingCxpItem.amount_paid).toFixed(2)} USD</span></div>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Monto a Pagar (USD) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={cxpPayAmount}
                  onChange={(e) => setCxpPayAmount(e.target.value)}
                  placeholder="Ej: 50.00"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
                <p className="text-[10px] text-gray-400 mt-1 font-bold">
                  Ingrese un monto menor para realizar un abono parcial, o deje el monto completo para cancelarla por completo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Método de Pago *
                </label>
                <select
                  value={cxpPayMethod}
                  onChange={(e) => setCxpPayMethod(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                >
                  <option value="Efectivo USD">💵 Efectivo USD</option>
                  <option value="Efectivo Bs">💵 Efectivo Bs</option>
                  <option value="Transferencia">🏦 Transferencia Bancaria</option>
                  <option value="Pago Móvil">📱 Pago Móvil</option>
                  <option value="Punto de Venta">💳 Punto de Venta</option>
                  <option value="Zelle">🇺🇸 Zelle</option>
                </select>
              </div>

              <div className="pt-2 flex items-center">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cxpPayRegisterEgreso}
                    onChange={(e) => setCxpPayRegisterEgreso(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs font-extrabold text-gray-700">
                    Registrar egreso de caja automáticamente
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPayingCxpItem(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-black rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar Pago</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ MODAL: REGISTRAR CUENTA POR PAGAR */}
      {showPagarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left">
            <div className="bg-[#005da9] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Tag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Registrar Cuenta por Pagar
                  </h3>
                  <p className="text-[10px] text-sky-100 font-medium">
                    Añada un compromiso de pago o factura de proveedor.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPagarModal(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!pagarProviderName || !pagarConcept || !pagarAmount) {
                  alert('Por favor complete todos los campos obligatorios');
                  return;
                }
                const newAccount = {
                  id: String(Date.now()),
                  provider_name: pagarProviderName,
                  concept: pagarConcept,
                  amount: parseFloat(pagarAmount),
                  amount_bs: parseFloat(pagarAmount) * (bcvRate || 36.5),
                  due_date: pagarDueDate,
                  observation: pagarObservation,
                  created_at: new Date().toISOString(),
                  status: 'pendiente'
                };
                setPorPagarList(prev => [newAccount, ...prev]);
                setShowPagarModal(false);
                alert('¡Cuenta por pagar registrada con éxito!');
              }} 
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Nombre del Proveedor *
                </label>
                <input
                  type="text"
                  required
                  value={pagarProviderName}
                  onChange={(e) => setPagarProviderName(e.target.value)}
                  placeholder="Ej: Distribuidora Grafipress"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Concepto / Descripción *
                </label>
                <input
                  type="text"
                  required
                  value={pagarConcept}
                  onChange={(e) => setPagarConcept(e.target.value)}
                  placeholder="Ej: Compra de 10 resmas de papel"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Monto Total ($ USD) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={pagarAmount}
                      onChange={(e) => setPagarAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">
                    Equivale a: Bs. {Number((parseFloat(pagarAmount) || 0) * (bcvRate || 36.5)).toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Fecha Vencimiento *
                  </label>
                  <input
                    type="date"
                    required
                    value={pagarDueDate}
                    onChange={(e) => setPagarDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Observaciones / Notas adicionales
                </label>
                <textarea
                  value={pagarObservation}
                  onChange={(e) => setPagarObservation(e.target.value)}
                  placeholder="Detalles sobre términos de pago, cuentas bancarias, etc..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowPagarModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005da9] hover:bg-[#005da9]/90 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  Registrar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 👁️ MODAL UNIVERSAL: CONSULTA / COMPROBANTE DE REGISTRO */}
      {selectedViewItem && selectedViewType && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left">
            <div className="bg-[#131921] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl text-[#FF9900]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white uppercase">
                    Detalle del Registro
                  </h3>
                  <p className="text-[10px] text-gray-300 font-medium">
                    Vista de consulta y comprobante oficial.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedViewItem(null);
                  setSelectedViewType(null);
                }}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3.5 text-xs text-gray-800">
                {selectedViewType === 'ingreso' || selectedViewType === 'egreso' ? (
                  <>
                    <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                      <span className="text-gray-400 font-bold">Documento / Orden N°:</span>
                      <span className={`font-mono font-black uppercase px-2 py-0.5 rounded-lg text-xs ${
                        String(selectedViewItem.doc_number || '').startsWith('FAC-')
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : String(selectedViewItem.doc_number || '').startsWith('NE-')
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : String(selectedViewItem.doc_number || '').startsWith('ORD-')
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {selectedViewItem.doc_number || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                      <span className="text-gray-400 font-bold">Tipo Movimiento:</span>
                      <span className={`font-black uppercase px-2 py-0.5 rounded-full text-[10px] ${
                        selectedViewType === 'ingreso' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {selectedViewType === 'ingreso' ? '📥 Ingreso' : '📤 Egreso'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Concepto:</span>
                      <span className="font-extrabold text-gray-900 text-right">{selectedViewItem.concept}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Dólares:</span>
                      <span className="font-mono font-black text-gray-900">${Number(selectedViewItem.amount || 0).toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Bolívares:</span>
                      <span className="font-mono font-extrabold text-gray-600">Bs. {Number(selectedViewItem.amount_bs || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Método Pago:</span>
                      <span className="font-black text-gray-700">{selectedViewItem.payment_method || 'Efectivo USD'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Fecha / Hora:</span>
                      <span className="font-bold text-gray-600">{new Date(selectedViewItem.created_at || selectedViewItem.date || Date.now()).toLocaleString('es-VE')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Operador Responsable:</span>
                      <span className="font-extrabold text-gray-800">{selectedViewItem.empleado_nombre || 'Administrador'}</span>
                    </div>
                    {Array.isArray(selectedViewItem.items) && selectedViewItem.items.length > 0 && (
                      <div className="pt-2 border-t border-gray-200/60">
                        <p className="text-gray-400 font-bold mb-1.5">Productos incluidos ({selectedViewItem.items.length}):</p>
                        <div className="bg-white rounded-xl border border-gray-150 p-2 divide-y divide-gray-100 max-h-36 overflow-y-auto text-[11px]">
                          {selectedViewItem.items.map((it: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between items-center">
                              <span className="font-extrabold text-gray-800">{it.qty || it.quantity || 1}x {it.name || it.title || 'Producto'}</span>
                              <span className="font-mono font-bold text-gray-600">${Number(it.total || ((it.qty || 1) * (it.price || 0))).toFixed(2)} USD</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedViewItem.observation && (
                      <div className="pt-2 border-t border-gray-200/60">
                        <p className="text-gray-400 font-bold mb-1">Observaciones:</p>
                        <p className="font-medium text-gray-700 leading-relaxed bg-white p-2 rounded-xl border border-gray-100">{selectedViewItem.observation}</p>
                      </div>
                    )}
                  </>
                ) : selectedViewType === 'cobrar' ? (
                  <>
                    <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                      <span className="text-gray-400 font-bold">Documento:</span>
                      <span className="font-black text-amber-700">Pedido #{String(selectedViewItem.order_number || '').padStart(6, '0')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Cliente:</span>
                      <span className="font-extrabold text-gray-900">{selectedViewItem.customer_name || 'Consumidor final'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto USD:</span>
                      <span className="font-mono font-black text-amber-700">${Number(selectedViewItem.total_price || 0).toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Bolívares:</span>
                      <span className="font-mono font-extrabold text-gray-600">Bs. {Number((selectedViewItem.total_price || 0) * bcvRate).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Estado:</span>
                      <span className="bg-amber-50 text-amber-700 font-black border border-amber-200 rounded-full px-2 py-0.5 text-[10px]">🟡 Pendiente de Pago</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Método Esperado:</span>
                      <span className="font-bold text-gray-700">{selectedViewItem.payment_method || 'No especificado'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Registrado:</span>
                      <span className="font-bold text-gray-600">{new Date(selectedViewItem.created_at || Date.now()).toLocaleString('es-VE')}</span>
                    </div>
                  </>
                ) : selectedViewType === 'pagar' ? (
                  <>
                    <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                      <span className="text-gray-400 font-bold">Proveedor:</span>
                      <span className="font-black text-slate-800">{selectedViewItem.provider_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Concepto / Factura:</span>
                      <span className="font-extrabold text-gray-900 text-right">{selectedViewItem.concept}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto total USD:</span>
                      <span className="font-mono font-black text-gray-900">${Number(selectedViewItem.amount || 0).toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Bs. (BCV):</span>
                      <span className="font-mono font-extrabold text-gray-600">Bs. {Number(selectedViewItem.amount_bs || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Vence el:</span>
                      <span className="font-black text-rose-700">{selectedViewItem.due_date}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Estado:</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        selectedViewItem.status === 'pagado'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {selectedViewItem.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </div>
                    {selectedViewItem.observation && (
                      <div className="pt-2 border-t border-gray-200/60">
                        <p className="text-gray-400 font-bold mb-1">Observaciones:</p>
                        <p className="font-medium text-gray-700 leading-relaxed bg-white p-2 rounded-xl border border-gray-100">{selectedViewItem.observation}</p>
                      </div>
                    )}
                  </>
                ) : selectedViewType === 'sesion' ? (
                  <>
                    <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                      <span className="text-gray-400 font-bold">Código de Sesión:</span>
                      <span className="font-mono font-black text-gray-800">#{selectedViewItem.session_code || selectedViewItem.id?.slice(0, 8)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Cajero / Operador:</span>
                      <span className="font-extrabold text-gray-900">{selectedViewItem.empleado_nombre || 'Cajero'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Apertura Bs:</span>
                      <span className="font-mono font-bold text-gray-800">Bs. {Number(selectedViewItem.apertura_bs || 0).toFixed(2)} (${Number(selectedViewItem.apertura_usd || 0).toFixed(2)})</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Monto Cierre Bs (Real):</span>
                      <span className="font-mono font-black text-emerald-700">Bs. {Number(selectedViewItem.cierre_bs || 0).toFixed(2)} (${Number(selectedViewItem.cierre_usd || 0).toFixed(2)})</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Diferencia:</span>
                      <span className={`font-mono font-black ${
                        Math.abs(selectedViewItem.diferencia_usd || 0) < 0.01 ? 'text-gray-600' : (selectedViewItem.diferencia_usd || 0) > 0 ? 'text-blue-700' : 'text-rose-700'
                      }`}>
                        Bs. {Number(selectedViewItem.diferencia_bs || 0).toFixed(2)} (${Number(selectedViewItem.diferencia_usd || 0).toFixed(2)} USD)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Estado Arqueo:</span>
                      <span className="bg-slate-100 text-slate-800 font-black border border-slate-200 rounded-full px-2 py-0.5 text-[10px] uppercase">{selectedViewItem.estado_arqueo || 'Cuadrada'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Apertura:</span>
                      <span className="font-medium text-gray-600">{selectedViewItem.apertura || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-bold">Cierre:</span>
                      <span className="font-medium text-gray-600">{selectedViewItem.cierre || 'Turno activo'}</span>
                    </div>
                    {selectedViewItem.observations && (
                      <div className="pt-2 border-t border-gray-200/60">
                        <p className="text-gray-400 font-bold mb-1">Notas del Cajero:</p>
                        <p className="font-medium text-gray-700 leading-relaxed bg-white p-2 rounded-xl border border-gray-100">{selectedViewItem.observations}</p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Functional Actions Row */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handlePrint(selectedViewType, selectedViewItem)}
                  className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl cursor-pointer transition shadow-2xs border border-gray-200"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Imprimir Ticket</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleShare(selectedViewType, selectedViewItem)}
                  className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs rounded-xl cursor-pointer transition border border-emerald-200 shadow-2xs"
                >
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  <span>Compartir WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
