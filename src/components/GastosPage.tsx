import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Coins, DollarSign, Calendar, Search, Plus, Trash2, 
  AlertCircle, CheckCircle2, X, Clock, HelpCircle, AlertTriangle, 
  Check, Loader2, MoreVertical, CreditCard, Receipt, Printer, FileText,
  Sparkles, ChevronDown, Edit3, Pencil
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { GastoFijo, GastoFijoPayment, BankAccount, StoreUser } from '../types';

interface GastosPageProps {
  bcvRate: number;
  currentUser?: StoreUser | null;
  onRefreshData?: () => void;
}

// Categorías exactas solicitadas por el usuario
export const DEFAULT_GASTO_CATEGORIES = [
  'Alquiler',
  'Gas',
  'Electricidad / luz',
  'Agua',
  'Internet / teléfono',
  'Patente y permisos',
  'Sueldos y salarios',
  'Cotizaciones o cargas sociales',
  'Compra de mercadería / productos',
  'Materiales e insumos',
  'Limpieza',
  'Mantenimiento y reparaciones',
  'Transporte / combustible',
  'Comisiones bancarias / máquina de pago',
  'Contador',
  'Publicidad',
  'Otros gastos'
];

export default function GastosPage({
  bcvRate,
  currentUser,
  onRefreshData
}: GastosPageProps) {
  // Database states
  const [gastos, setGastos] = useState<GastoFijo[]>([]);
  const [payments, setPayments] = useState<GastoFijoPayment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Tab state: 'fijo' | 'variable' | 'todos'
  const [activeTab, setActiveTab] = useState<'fijo' | 'variable' | 'todos'>('fijo');

  // Filter state (default 'todos' so nothing is hidden on startup)
  const [timeFilter, setTimeFilter] = useState<'mes_actual' | '3_meses' | '6_meses' | 'todos'>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Notification / Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Custom categories state with LocalStorage persistence
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_custom_gasto_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Combined list of categories
  const allCategories = useMemo(() => {
    const list = [...DEFAULT_GASTO_CATEGORIES];
    customCategories.forEach(cat => {
      if (!list.includes(cat)) list.push(cat);
    });
    return list;
  }, [customCategories]);

  // Create Gasto Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gastoName, setGastoName] = useState('');
  const [gastoAmount, setGastoAmount] = useState('');
  const [gastoType, setGastoType] = useState<'fijo' | 'variable'>('fijo');
  const [gastoCategory, setGastoCategory] = useState('Alquiler');
  const [gastoDescription, setGastoDescription] = useState('Alquiler');
  const [gastoNotes, setGastoNotes] = useState('');
  
  // Fixed gasto form fields
  const [fixedPayDay, setFixedPayDay] = useState('');
  const [fixedFrequency, setFixedFrequency] = useState('Mensual');

  // Variable gasto form fields
  const [variableAccountId, setVariableAccountId] = useState('');
  const [variablePayDate, setVariablePayDate] = useState('');

  // Edit Gasto Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGasto, setEditingGasto] = useState<GastoFijo | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<'fijo' | 'variable'>('fijo');
  const [editCategory, setEditCategory] = useState('Alquiler');
  const [editDescription, setEditDescription] = useState('');
  const [editFrequency, setEditFrequency] = useState('Mensual');
  const [editNextDueDate, setEditNextDueDate] = useState('');
  const [editLastPaidDate, setEditLastPaidDate] = useState('');
  const [editStatus, setEditStatus] = useState<'pendiente' | 'pagado' | 'vencido' | 'parcial'>('pendiente');
  const [editBankAccountId, setEditBankAccountId] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Pay Fixed Gasto Modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedGastoToPay, setSelectedGastoToPay] = useState<GastoFijo | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Dropdown options state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Helper to show notification
  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(current => current?.msg === msg ? null : current);
    }, 4000);
  };

  // Helper to add custom category
  const handleSaveCustomCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (!allCategories.includes(trimmed)) {
      const updated = [...customCategories, trimmed];
      setCustomCategories(updated);
      localStorage.setItem('copias_bellavista_custom_gasto_categories', JSON.stringify(updated));
    }
    setGastoCategory(trimmed);
    setGastoDescription(trimmed);
    if (!gastoName) setGastoName(trimmed);
    setNewCategoryInput('');
    setIsAddingNewCategory(false);
    showNotification(`Categoría "${trimmed}" registrada exitosamente.`);
  };

  // Load database data
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [gList, pList, bList] = await Promise.all([
        dbService.getGastosFijos().catch(() => []),
        dbService.getGastoFijoPayments().catch(() => []),
        dbService.getBankAccounts().catch(() => [])
      ]);
      setGastos(gList);
      setPayments(pList);
      
      const activeBanks = bList.filter(a => a.is_active);
      setBankAccounts(activeBanks);

      // Auto select first bank account for variable / payment forms
      if (activeBanks.length > 0) {
        if (!variableAccountId) setVariableAccountId(activeBanks[0].id);
        if (!payAccountId) setPayAccountId(activeBanks[0].id);
      }
    } catch (e) {
      showNotification('Error al cargar datos financieros', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Event listeners for real-time sync
    const handleGastosUpdated = () => loadData();
    const handleAccountsUpdated = () => loadData();
    const handlePaymentsUpdated = () => loadData();

    window.addEventListener('bellavista_gastos_fijos_updated', handleGastosUpdated);
    window.addEventListener('bellavista_gastos_fijos_payments_updated', handlePaymentsUpdated);
    window.addEventListener('bellavista_bank_accounts_updated', handleAccountsUpdated);

    return () => {
      window.removeEventListener('bellavista_gastos_fijos_updated', handleGastosUpdated);
      window.removeEventListener('bellavista_gastos_fijos_payments_updated', handlePaymentsUpdated);
      window.removeEventListener('bellavista_bank_accounts_updated', handleAccountsUpdated);
    };
  }, []);

  // Utility to parse dates consistently
  const parseDateString = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // YYYY-MM-DD local format
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  };

  // Format date Spanish style: "21, dic 2024"
  const formatDateDisplay = (dateStr?: string): string => {
    if (!dateStr) return '--';
    const d = parseDateString(dateStr);
    if (!d || isNaN(d.getTime())) return '--';
    
    const day = d.getDate();
    const month = d.toLocaleString('es-ES', { month: 'short' });
    const year = d.getFullYear();
    return `${day < 10 ? '0' + day : day}, ${month} ${year}`;
  };

  // Utility to calculate days remaining dynamically
  const calculateDaysRemaining = (dueDateStr?: string, status?: string): { days: number; text: string; isExpired: boolean; isWarning: boolean } => {
    if (!dueDateStr) {
      return { days: 999, text: '--', isExpired: false, isWarning: false };
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const due = parseDateString(dueDateStr);
    if (!due || isNaN(due.getTime())) {
      return { days: 999, text: '--', isExpired: false, isWarning: false };
    }
    due.setHours(0,0,0,0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { days: diffDays, text: 'Expirado', isExpired: true, isWarning: true };
    } else if (diffDays === 0) {
      return { days: 0, text: '0', isExpired: false, isWarning: true };
    } else {
      return { 
        days: diffDays, 
        text: `${diffDays}`, 
        isExpired: false, 
        isWarning: diffDays <= 5 // ALERTA O RECORDATORIO DE GASTOS CON 5 DÍAS DE ANTICIPACIÓN
      };
    }
  };

  // Filter based on selected time range
  const filteredGastos = useMemo(() => {
    let list = gastos;

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q) || (g.category && g.category.toLowerCase().includes(q)));
    }

    // Time filter
    if (timeFilter === 'todos') return list;

    const today = new Date();
    const filterLimitDate = new Date();

    if (timeFilter === 'mes_actual') {
      // Start of current month
      filterLimitDate.setDate(1);
      filterLimitDate.setHours(0,0,0,0);
    } else if (timeFilter === '3_meses') {
      filterLimitDate.setMonth(today.getMonth() - 3);
    } else if (timeFilter === '6_meses') {
      filterLimitDate.setMonth(today.getMonth() - 6);
    }

    return list.filter(g => {
      const gDate = parseDateString(g.created_at || g.next_due_date || g.last_paid_date);
      return gDate ? gDate >= filterLimitDate : true;
    });
  }, [gastos, timeFilter, searchQuery]);

  // Statistics calculations based on filtered list
  const stats = useMemo(() => {
    let fixedTotal = 0;
    let variableTotal = 0;

    filteredGastos.forEach(g => {
      if (g.type === 'fijo') {
        fixedTotal += g.amount;
      } else {
        variableTotal += g.amount;
      }
    });

    const total = fixedTotal + variableTotal;

    return {
      total,
      fixed: fixedTotal,
      variable: variableTotal
    };
  }, [filteredGastos]);

  // Alert check: count of fixed expenses with <= 5 days remaining
  const pendingAlertCount = useMemo(() => {
    return gastos.filter(g => {
      if (g.type !== 'fijo') return false;
      
      const remaining = calculateDaysRemaining(g.next_due_date, g.status);
      return (remaining.isWarning || remaining.isExpired) && g.status !== 'pagado';
    }).length;
  }, [gastos]);

  // Handle Save New Gasto (Fixed or Variable)
  const handleCreateGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = (gastoName.trim() || gastoDescription.trim() || gastoCategory);
    if (!finalName || !gastoAmount) {
      showNotification('Complete los campos obligatorios (Nombre/Descripción y Monto)', 'error');
      return;
    }

    const amtVal = parseFloat(gastoAmount);
    if (isNaN(amtVal) || amtVal <= 0) {
      showNotification('Monto inválido', 'error');
      return;
    }

    try {
      const newId = crypto.randomUUID();
      const currentIso = new Date().toISOString();

      if (gastoType === 'fijo') {
        // 1. Prepare Fixed Expense
        const nextDate = fixedPayDay || new Date().toISOString().split('T')[0];
        const fixedPayload: GastoFijo = {
          id: newId,
          name: finalName,
          category: gastoCategory,
          description: gastoDescription || finalName,
          amount: amtVal,
          amount_bs: amtVal * bcvRate,
          type: 'fijo',
          frequency: fixedFrequency || 'Mensual',
          status: 'pendiente',
          next_due_date: nextDate,
          notes: gastoNotes,
          created_at: currentIso,
          updated_at: currentIso
        };

        await dbService.saveGastoFijo(fixedPayload);
        setGastos(prev => [fixedPayload, ...prev.filter(g => g.id !== newId)]);
        showNotification(`Gasto fijo "${finalName}" programado a 30 días exitosamente.`);
      } else {
        // 2. Variable Expense - registered & deducted immediately
        let selectedAcc = bankAccounts.find(a => a.id === variableAccountId);
        if (!selectedAcc && bankAccounts.length > 0) {
          selectedAcc = bankAccounts[0];
        }

        const accountName = selectedAcc ? selectedAcc.name : 'Caja en Efectivo $';
        const accountId = selectedAcc ? selectedAcc.id : undefined;
        const paymentDateVal = variablePayDate || new Date().toISOString().split('T')[0];

        // Create paid variable expense record
        const varPayload: GastoFijo = {
          id: newId,
          name: finalName,
          category: gastoCategory,
          description: gastoDescription || finalName,
          amount: amtVal,
          amount_bs: amtVal * bcvRate,
          type: 'variable',
          status: 'pagado',
          notes: gastoNotes,
          bank_account_id: accountId,
          bank_account_name: accountName,
          last_paid_date: paymentDateVal,
          created_at: currentIso,
          updated_at: currentIso
        };

        // Save immediately in DB
        await dbService.saveGastoFijo(varPayload);

        // Immediate in-memory state update so the item appears right away in UI
        setGastos(prev => [varPayload, ...prev.filter(g => g.id !== newId)]);

        // Register payment & debit from bank account
        const payPayload: GastoFijoPayment = {
          id: crypto.randomUUID(),
          gasto_fijo_id: newId,
          gasto_name: finalName,
          amount: amtVal,
          amount_bs: amtVal * bcvRate,
          payment_method: accountName,
          bank_account_id: accountId,
          bank_account_name: accountName,
          payment_date: paymentDateVal,
          notes: gastoNotes || `Pago de ${gastoCategory}: ${gastoDescription || finalName}`,
          created_by: currentUser?.name || 'Administrador',
          created_at: currentIso
        };

        await dbService.payGastoFijo(payPayload, 'pagado');
        setPayments(prev => [payPayload, ...prev]);

        showNotification(`Gasto variable "${finalName}" registrado y cancelado exitosamente.`);
      }

      // Reset form & close
      setGastoName('');
      setGastoAmount('');
      setGastoNotes('');
      setFixedPayDay('');
      setVariablePayDate('');
      setShowCreateModal(false);
      if (onRefreshData) onRefreshData();
    } catch (e) {
      showNotification('Error al registrar el gasto en base de datos', 'error');
    }
  };

  // Open pay modal for fixed gasto
  const handleOpenPayModal = (gasto: GastoFijo) => {
    setSelectedGastoToPay(gasto);
    setPayAmount(gasto.amount.toString());
    setPayNotes(`Pago de gasto fijo: ${gasto.name}`);
    if (bankAccounts.length > 0 && !payAccountId) {
      setPayAccountId(bankAccounts[0].id);
    }
    setShowPayModal(true);
  };

  // Submit payment for fixed gasto (re-schedules to 30 days)
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGastoToPay || !payAmount || !payAccountId) {
      showNotification('Complete todos los campos del pago', 'error');
      return;
    }

    const payAmtVal = parseFloat(payAmount);
    if (isNaN(payAmtVal) || payAmtVal <= 0) {
      showNotification('Monto inválido', 'error');
      return;
    }

    const selectedAcc = bankAccounts.find(a => a.id === payAccountId);
    if (!selectedAcc) {
      showNotification('Seleccione una cuenta válida', 'error');
      return;
    }

    if (selectedAcc.balance < payAmtVal) {
      showNotification(`Saldo insuficiente en "${selectedAcc.name}". Saldo disponible: $${selectedAcc.balance.toFixed(2)}`, 'error');
      return;
    }

    try {
      const todayIso = new Date().toISOString().split('T')[0];

      // 1. Calculate next due date (automatically advances exactly 30 days / 1 month)
      const currentDue = parseDateString(selectedGastoToPay.next_due_date || todayIso) || new Date();
      const nextDue = new Date(currentDue);
      nextDue.setDate(nextDue.getDate() + 30); // REGLA: Los gastos fijos se fijan a 30 días
      const nextDueStr = nextDue.toISOString().split('T')[0];

      const paymentObj: GastoFijoPayment = {
        id: crypto.randomUUID(),
        gasto_fijo_id: selectedGastoToPay.id,
        gasto_name: selectedGastoToPay.name,
        amount: payAmtVal,
        amount_bs: payAmtVal * bcvRate,
        payment_method: selectedAcc.name,
        bank_account_id: selectedAcc.id,
        bank_account_name: selectedAcc.name,
        payment_date: todayIso,
        reference: payReference,
        notes: payNotes,
        created_by: currentUser?.name || 'Administrador',
        created_at: new Date().toISOString()
      };

      // 2. Register payment, debit bank account balance in Supabase, and advance next_due_date
      await dbService.payGastoFijo(paymentObj, 'pagado', nextDueStr);

      showNotification(`Pago realizado con éxito. Siguiente fecha de pago fijada a 30 días (${formatDateDisplay(nextDueStr)}).`);
      setShowPayModal(false);
      setSelectedGastoToPay(null);
      setPayReference('');
      setPayNotes('');
      if (onRefreshData) onRefreshData();
    } catch (e) {
      showNotification('Error al procesar el pago', 'error');
    }
  };

  // Open edit modal
  const handleOpenEditModal = (gasto: GastoFijo) => {
    setEditingGasto(gasto);
    setEditName(gasto.name || '');
    setEditAmount(gasto.amount ? gasto.amount.toString() : '');
    setEditType(gasto.type || 'fijo');
    setEditCategory(gasto.category || 'Otros gastos');
    setEditDescription(gasto.description || gasto.name || '');
    setEditFrequency(gasto.frequency || 'Mensual');
    setEditNextDueDate(gasto.next_due_date || '');
    setEditLastPaidDate(gasto.last_paid_date || '');
    setEditStatus(gasto.status || 'pendiente');
    setEditBankAccountId(gasto.bank_account_id || (bankAccounts.length > 0 ? bankAccounts[0].id : ''));
    setEditNotes(gasto.notes || '');
    setActiveMenuId(null);
    setShowEditModal(true);
  };

  // Submit edited gasto
  const handleSaveEditedGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGasto) return;

    const amtVal = parseFloat(editAmount);
    if (isNaN(amtVal) || amtVal <= 0) {
      showNotification('Ingrese un monto válido mayor a 0', 'error');
      return;
    }

    const finalName = editName.trim() || editDescription.trim() || editCategory;
    const selectedAcc = bankAccounts.find(a => a.id === editBankAccountId);

    const updatedPayload: GastoFijo = {
      ...editingGasto,
      name: finalName,
      category: editCategory,
      description: editDescription.trim() || finalName,
      amount: amtVal,
      amount_bs: amtVal * bcvRate,
      type: editType,
      frequency: editType === 'fijo' ? editFrequency : undefined,
      next_due_date: editType === 'fijo' ? (editNextDueDate || editingGasto.next_due_date) : undefined,
      last_paid_date: editLastPaidDate || editingGasto.last_paid_date,
      status: editStatus,
      bank_account_id: selectedAcc ? selectedAcc.id : editingGasto.bank_account_id,
      bank_account_name: selectedAcc ? selectedAcc.name : editingGasto.bank_account_name,
      notes: editNotes.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      await dbService.saveGastoFijo(updatedPayload);
      setGastos(prev => prev.map(g => g.id === updatedPayload.id ? updatedPayload : g));
      setShowEditModal(false);
      setEditingGasto(null);
      showNotification(`Gasto "${finalName}" modificado exitosamente.`);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      showNotification('Error al modificar el gasto', 'error');
    }
  };

  // Delete expense record with instant UI update
  const handleDeleteGasto = async (id: string) => {
    const item = gastos.find(g => g.id === id);
    if (!item) return;

    if (confirm(`¿Está seguro de eliminar el gasto "${item.name}"?`)) {
      try {
        await dbService.deleteGastoFijo(id);
        setGastos(prev => prev.filter(g => g.id !== id));
        setActiveMenuId(null);
        showNotification(`Gasto "${item.name}" eliminado correctamente.`);
        if (onRefreshData) onRefreshData();
      } catch (e) {
        showNotification('Error al eliminar el gasto', 'error');
      }
    }
  };

  return (
    <div className="space-y-6 select-none font-poppins" id="gastos-module-container">
      
      {/* HEADER SECTION (Frenyer Brand Identity) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1D3557]/10 to-[#005da9]/10 border border-[#1D3557]/20 flex items-center justify-center text-[#1D3557] shadow-2xs">
            <Receipt className="w-5 h-5 text-[#005da9]" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-montserrat font-black uppercase text-[#1D3557] tracking-tight">GASTOS FIJOS/VARIABLES</h1>
            <p className="text-[11px] text-[#005da9] font-montserrat font-bold uppercase tracking-wider">Control financiero y programación a 30 días</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Time dropdown */}
          <div className="relative">
            <select 
              value={timeFilter}
              onChange={(e: any) => setTimeFilter(e.target.value)}
              className="appearance-none pl-4 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#005da9] focus:ring-1 focus:ring-[#005da9]/20 cursor-pointer transition shadow-2xs font-montserrat"
            >
              <option value="mes_actual">Mes actual</option>
              <option value="3_meses">Últimos 3 meses</option>
              <option value="6_meses">Últimos 6 meses</option>
              <option value="todos">Todos los registros</option>
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* "+ Gastos" button */}
          <button 
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-[#005da9]" />
            <span>+ Gastos</span>
          </button>
        </div>
      </div>

      {/* 5-DAY ADVANCE NOTIFICATION BANNER */}
      {pendingAlertCount > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50/40 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-2xs">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-montserrat font-extrabold text-amber-900 uppercase tracking-tight">Recordatorio de Gastos Fijos (Alerta 5 Días de Anticipación)</h4>
            <p className="text-xs font-semibold text-amber-800 mt-0.5 leading-relaxed">
              Tienes <strong className="text-amber-950 font-black">{pendingAlertCount}</strong> gasto(s) fijo(s) que vencen en los próximos 5 días o se encuentran en fecha de pago. Presiona <span className="font-bold underline text-[#005da9]">Pagar</span> para debitar de tu cuenta bancaria y reprogramar automáticamente a 30 días.
            </p>
          </div>
        </div>
      )}

      {/* METRICS DASHBOARD (Matching Figure 1: Gastos Totales, Gastos Fijos, Gastos Variables with Frenyer Identity) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* TOTAL EXPENSES */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-montserrat font-bold text-slate-400 block mb-1 uppercase tracking-wider">Gastos Totales</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl lg:text-3xl font-montserrat font-black text-[#1D3557] tracking-tight">${stats.total.toFixed(2)}</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-montserrat font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                <TrendingUp className="w-3 h-3" />
                154.55%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block mt-1">
              ≈ {(stats.total * bcvRate).toFixed(2)} VES (BCV)
            </span>
          </div>
        </div>

        {/* FIXED EXPENSES */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-montserrat font-bold text-slate-400 block mb-1 uppercase tracking-wider">Gastos Fijos</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl lg:text-3xl font-montserrat font-black text-[#2B2D42] tracking-tight">${stats.fixed.toFixed(2)}</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-montserrat font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                <TrendingUp className="w-3 h-3" />
                58.54%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block mt-1">
              ≈ {(stats.fixed * bcvRate).toFixed(2)} VES (BCV)
            </span>
          </div>
        </div>

        {/* VARIABLE EXPENSES */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-montserrat font-bold text-slate-400 block mb-1 uppercase tracking-wider">Gastos Variables</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl lg:text-3xl font-montserrat font-black text-[#005da9] tracking-tight">${stats.variable.toFixed(2)}</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-montserrat font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                <TrendingUp className="w-3 h-3" />
                435.71%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block mt-1">
              ≈ {(stats.variable * bcvRate).toFixed(2)} VES (BCV)
            </span>
          </div>
        </div>

      </div>

      {/* PESTAÑAS DENTRO DEL FORMATO: GASTOS FIJOS / GASTOS VARIABLES / TODOS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('fijo')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-montserrat font-bold text-xs transition cursor-pointer ${
              activeTab === 'fijo'
                ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/70'
            }`}
          >
            <span>📌 Gastos Fijos</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'fijo' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {gastos.filter(g => g.type === 'fijo').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('variable')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-montserrat font-bold text-xs transition cursor-pointer ${
              activeTab === 'variable'
                ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/70'
            }`}
          >
            <span>🔄 Gastos Variables</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'variable' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {gastos.filter(g => g.type === 'variable').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('todos')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-montserrat font-bold text-xs transition cursor-pointer ${
              activeTab === 'todos'
                ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/70'
            }`}
          >
            <span>📊 Todos</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'todos' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {gastos.length}
            </span>
          </button>
        </div>

        {/* Search within active view */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por nombre, categoría..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-1 focus:ring-[#005da9]/20 text-xs font-semibold text-slate-800"
          />
        </div>
      </div>

      {/* =======================================================================
          TAB CONTENT: GASTOS FIJOS (Shown when activeTab is 'fijo' or 'todos')
          ======================================================================= */}
      {(activeTab === 'fijo' || activeTab === 'todos') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-montserrat font-black uppercase text-[#1D3557] tracking-wider">GASTOS FIJOS</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                ${stats.fixed.toFixed(2)} USD
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => {
                setGastoType('fijo');
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#1D3557] to-[#005da9] hover:from-[#152741] hover:to-[#004b87] text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer text-xs font-montserrat font-bold"
              title="Agregar Gasto Fijo"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Gasto Fijo</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[#1D3557] text-[11px] font-montserrat font-black uppercase tracking-wider bg-slate-50/70">
                    <th className="py-4 px-5">Nombre / Concepto</th>
                    <th className="py-4 px-4">Categoría</th>
                    <th className="py-4 px-4">Descripción</th>
                    <th className="py-4 px-4">Monto</th>
                    <th className="py-4 px-4">Fecha de pago</th>
                    <th className="py-4 px-4">Última fecha</th>
                    <th className="py-4 px-4 text-center">Días restantes</th>
                    <th className="py-4 px-4 text-center">Acciones</th>
                    <th className="py-4 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="text-xs text-slate-800">
                  {filteredGastos.filter(g => g.type === 'fijo').length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-semibold">
                        No hay gastos fijos registrados en esta vista. Presione "+ Agregar Gasto Fijo" para comenzar.
                      </td>
                    </tr>
                  ) : (
                    filteredGastos.filter(g => g.type === 'fijo').map(g => {
                      const remaining = calculateDaysRemaining(g.next_due_date, g.status);
                      const isPaidForNow = g.status === 'pagado' && remaining.days > 5;

                      return (
                        <tr 
                          key={g.id} 
                          className={`border-b border-slate-100 hover:bg-slate-50/70 transition ${
                            remaining.isWarning || remaining.isExpired ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          {/* Nombre */}
                          <td className="py-4 px-5 font-montserrat font-bold text-slate-900">
                            {g.name}
                          </td>

                          {/* Categoría */}
                          <td className="py-4 px-4">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-montserrat font-bold bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20">
                              {g.category || 'Otros'}
                            </span>
                          </td>

                          {/* Descripción */}
                          <td className="py-4 px-4 text-slate-600 font-medium max-w-[180px] truncate" title={g.description || g.notes || g.name}>
                            {g.description || g.notes || '--'}
                          </td>

                          {/* Monto */}
                          <td className="py-4 px-4 font-montserrat font-black text-slate-900">
                            ${g.amount.toFixed(2)}
                            <span className="block text-[10px] text-slate-400 font-normal">
                              ≈ {(g.amount * bcvRate).toFixed(2)} Bs
                            </span>
                          </td>

                          {/* Fecha de pago */}
                          <td className="py-4 px-4 text-slate-700">
                            {formatDateDisplay(g.next_due_date)}
                          </td>

                          {/* Última fecha de pago */}
                          <td className="py-4 px-4 text-slate-500">
                            {g.last_paid_date ? formatDateDisplay(g.last_paid_date) : '--'}
                          </td>

                          {/* Días restantes */}
                          <td className="py-4 px-4 text-center">
                            {remaining.isExpired ? (
                              <span className="font-montserrat font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">Expirado</span>
                            ) : (
                              <span className={`font-montserrat px-2 py-0.5 rounded-md ${
                                remaining.isWarning 
                                  ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300' 
                                  : 'text-slate-800 font-semibold'
                              }`}>
                                {remaining.text} {remaining.text !== '--' ? 'días' : ''}
                              </span>
                            )}
                          </td>

                          {/* Status / Pagar Button */}
                          <td className="py-4 px-4 text-center">
                            {isPaidForNow ? (
                              <span className="text-emerald-700 font-montserrat font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg inline-flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Pagado
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenPayModal(g)}
                                className="px-3.5 py-1.5 border-2 border-[#005da9] text-[#005da9] hover:bg-[#005da9] hover:text-white rounded-lg font-montserrat font-bold transition text-xs cursor-pointer shadow-2xs"
                              >
                                Pagar
                              </button>
                            )}
                          </td>

                          {/* Action Buttons: Modificar & Eliminar */}
                          <td className="py-4 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(g)}
                                className="p-1.5 text-slate-500 hover:text-[#005da9] rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="Modificar gasto"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteGasto(g.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title="Eliminar gasto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  onClick={() => setActiveMenuId(activeMenuId === g.id ? null : g.id)}
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                                {activeMenuId === g.id && (
                                  <div className="absolute right-0 mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg w-36 py-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(g)}
                                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 font-montserrat font-bold flex items-center gap-2 cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-[#005da9]" />
                                      Modificar
                                    </button>
                                    {!isPaidForNow && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleOpenPayModal(g);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs text-[#005da9] hover:bg-blue-50 font-montserrat font-bold flex items-center gap-2 cursor-pointer"
                                      >
                                        <CreditCard className="w-3.5 h-3.5" />
                                        Pagar ahora
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteGasto(g.id)}
                                      className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 font-montserrat font-bold flex items-center gap-2 cursor-pointer border-t border-slate-100"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          TAB CONTENT: GASTOS VARIABLES (Shown when activeTab is 'variable' or 'todos')
          ======================================================================= */}
      {(activeTab === 'variable' || activeTab === 'todos') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-montserrat font-black uppercase text-[#1D3557] tracking-wider">GASTOS VARIABLES</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                ${stats.variable.toFixed(2)} USD
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => {
                setGastoType('variable');
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#1D3557] to-[#005da9] hover:from-[#152741] hover:to-[#004b87] text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer text-xs font-montserrat font-bold"
              title="Agregar Gasto Variable"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Gasto Variable</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[#1D3557] text-[11px] font-montserrat font-black uppercase tracking-wider bg-slate-50/70">
                    <th className="py-4 px-5">Nombre / Concepto</th>
                    <th className="py-4 px-4">Categoría</th>
                    <th className="py-4 px-4">Descripción</th>
                    <th className="py-4 px-4">Monto</th>
                    <th className="py-4 px-4">Fecha de pago</th>
                    <th className="py-4 px-4">Cuenta debitada</th>
                    <th className="py-4 px-4 text-center">Estado</th>
                    <th className="py-4 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-xs text-slate-800">
                  {filteredGastos.filter(g => g.type === 'variable').length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-semibold">
                        No hay gastos variables registrados en esta vista.
                      </td>
                    </tr>
                  ) : (
                    filteredGastos.filter(g => g.type === 'variable').map(g => {
                      const linkedPayment = payments.find(p => p.gasto_fijo_id === g.id);

                      return (
                        <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition">
                          {/* Nombre */}
                          <td className="py-4 px-5 font-montserrat font-bold text-slate-900">
                            {g.name}
                          </td>

                          {/* Categoría */}
                          <td className="py-4 px-4">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-montserrat font-bold bg-[#005da9]/10 text-[#005da9] border border-[#005da9]/20">
                              {g.category || 'Otros'}
                            </span>
                          </td>

                          {/* Descripción */}
                          <td className="py-4 px-4 text-slate-600 font-medium max-w-[180px] truncate" title={g.description || g.notes || g.name}>
                            {g.description || g.notes || '--'}
                          </td>

                          {/* Monto */}
                          <td className="py-4 px-4 font-montserrat font-black text-slate-900">
                            ${g.amount.toFixed(2)}
                            <span className="block text-[10px] text-slate-400 font-normal">
                              ≈ {(g.amount * bcvRate).toFixed(2)} Bs
                            </span>
                          </td>

                          {/* Fecha de pago */}
                          <td className="py-4 px-4 text-slate-700">
                            {formatDateDisplay(g.last_paid_date || g.created_at)}
                          </td>

                          {/* Cuenta debitada */}
                          <td className="py-4 px-4 text-slate-700 font-medium">
                            {g.bank_account_name || linkedPayment?.bank_account_name || 'Caja en Efectivo $'}
                          </td>

                          {/* Estado */}
                          <td className="py-4 px-4 text-center">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-montserrat font-bold bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[11px]">
                              <Check className="w-3 h-3" />
                              Pagado
                            </span>
                          </td>

                          {/* Action Buttons: Modificar & Eliminar */}
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(g)}
                                className="p-1.5 text-slate-500 hover:text-[#005da9] rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="Modificar gasto"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGasto(g.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title="Eliminar gasto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: GASTOS (Frenyer Brand Identity + Categoría & Descripción)
          ======================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form 
            onSubmit={handleCreateGasto}
            className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-[#005da9]/20 animate-in fade-in zoom-in duration-150 overflow-hidden"
          >
            {/* Modal Header: Frenyer Brand Gradient */}
            <div className="bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white px-6 py-4 flex items-center justify-between border-b border-[#005da9]/30 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl border border-white/20">
                  <Receipt className="w-5 h-5 text-[#40E0D0]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-montserrat font-extrabold uppercase tracking-wider text-white">
                    Gastos
                  </h3>
                  <p className="text-[11px] text-white/80 font-medium">Registro, categorización y control financiero</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4.5 max-h-[80vh] overflow-y-auto">
              
              {/* Row: Tipo de Gasto (Gasto Fijo vs Gasto Variable) */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Tipo de Gasto</label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setGastoType('fijo')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-montserrat font-bold text-xs transition cursor-pointer ${
                      gastoType === 'fijo' 
                        ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs' 
                        : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📌 Gasto Fijo (Programado)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGastoType('variable')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-montserrat font-bold text-xs transition cursor-pointer ${
                      gastoType === 'variable' 
                        ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs' 
                        : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🔄 Gasto Variable (Inmediato)</span>
                  </button>
                </div>
              </div>

              {/* Row: Categoría (17 categorías + Personalizadas) & Descripción */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Categoría */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-montserrat font-bold text-slate-700">
                      Categoría <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCategory(!isAddingNewCategory)}
                      className="text-[11px] font-montserrat font-bold text-[#005da9] hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isAddingNewCategory ? 'Cancelar' : '+ Nueva'}</span>
                    </button>
                  </div>

                  {isAddingNewCategory ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveCustomCategory();
                          }
                        }}
                        placeholder="Nombre de categoría..."
                        className="flex-1 px-3 py-2 bg-slate-50 border border-[#005da9] rounded-xl text-xs font-medium focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomCategory}
                        className="px-3 py-2 bg-[#005da9] text-white rounded-xl text-xs font-bold font-montserrat cursor-pointer hover:bg-[#004b87]"
                      >
                        Grabar
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={gastoCategory}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          if (newCat === '__NEW__') {
                            setIsAddingNewCategory(true);
                            return;
                          }
                          setGastoCategory(newCat);
                          setGastoDescription(newCat);
                          if (!gastoName || allCategories.includes(gastoName)) {
                            setGastoName(newCat);
                          }
                        }}
                        className="w-full appearance-none pl-3.5 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-semibold text-slate-800 cursor-pointer font-poppins"
                      >
                        {allCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__NEW__" className="text-[#005da9] font-bold">+ Agregar otra categoría...</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Descripción / Concepto */}
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                    Descripción / Concepto <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      required
                      value={gastoDescription}
                      onChange={(e) => {
                        setGastoDescription(e.target.value);
                        if (!gastoName || gastoName === gastoDescription) {
                          setGastoName(e.target.value);
                        }
                      }}
                      placeholder="Ej: Electricidad / luz, Alquiler..."
                      className="w-full pl-3.5 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800"
                    />
                    {gastoDescription.trim().length > 0 && (
                      <Check className="absolute right-2.5 top-3 w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              </div>

              {/* Categorías Rápidas Seleccionables */}
              <div>
                <label className="block text-[11px] font-montserrat font-bold text-slate-500 mb-1">
                  Categorías frecuentes (haz clic para seleccionar):
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                  {allCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setGastoCategory(cat);
                        setGastoDescription(cat);
                        if (!gastoName || allCategories.includes(gastoName)) {
                          setGastoName(cat);
                        }
                      }}
                      className={`text-[10px] font-montserrat font-bold px-2.5 py-1 rounded-lg transition border cursor-pointer ${
                        gastoCategory === cat
                          ? 'bg-[#005da9] text-white border-[#005da9]'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row: Nombre del Gasto y Monto USD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Nombre / Identificador</label>
                  <div className="relative">
                    <input 
                      type="text"
                      required
                      value={gastoName}
                      onChange={(e) => setGastoName(e.target.value)}
                      placeholder="Ej: Local Bellavista, Luz Corpoelec..."
                      className="w-full pl-3.5 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800"
                    />
                    {gastoName.trim().length > 0 && (
                      <Check className="absolute right-2.5 top-3 w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Monto (USD)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      required
                      step="any"
                      value={gastoAmount}
                      onChange={(e) => setGastoAmount(e.target.value)}
                      placeholder="100.00"
                      className="w-full pl-3.5 pr-14 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-bold text-slate-900"
                    />
                    <div className="absolute right-3 top-2.5 flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-400">USD</span>
                    </div>
                  </div>
                  {parseFloat(gastoAmount) > 0 && (
                    <span className="text-[10px] text-[#005da9] font-bold block mt-1">
                      ≈ {(parseFloat(gastoAmount) * bcvRate).toFixed(2)} Bs (Tasa BCV)
                    </span>
                  )}
                </div>
              </div>

              {/* Conditional: Fixed vs Variable inputs */}
              {gastoType === 'fijo' ? (
                /* GASTO FIJO */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Fecha límite / Vencimiento inicial</label>
                    <input 
                      type="date"
                      value={fixedPayDay}
                      onChange={(e) => setFixedPayDay(e.target.value)}
                      className="w-full pl-3.5 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Frecuencia de Reprogramación</label>
                    <div className="relative">
                      <select 
                        value={fixedFrequency}
                        onChange={(e) => setFixedFrequency(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-9 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800 cursor-pointer"
                      >
                        <option value="Mensual">Mensual (Cada 30 días)</option>
                        <option value="Quincenal">Quincenal (Cada 15 días)</option>
                        <option value="Semanal">Semanal (Cada 7 días)</option>
                        <option value="Anual">Anual</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              ) : (
                /* GASTO VARIABLE */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Cuenta a debitar</label>
                    <div className="relative">
                      <select 
                        required
                        value={variableAccountId}
                        onChange={(e) => setVariableAccountId(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-9 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800 cursor-pointer"
                      >
                        {bankAccounts.length === 0 ? (
                          <option value="">CAJA EN EFECTIVO $</option>
                        ) : (
                          bankAccounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name} (Disp: ${a.balance.toFixed(2)})
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Fecha de pago</label>
                    <input 
                      type="date"
                      value={variablePayDate}
                      onChange={(e) => setVariablePayDate(e.target.value)}
                      className="w-full pl-3.5 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Notas adicionales */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Notas adicionales (Opcional)</label>
                <textarea 
                  rows={2}
                  value={gastoNotes}
                  onChange={(e) => setGastoNotes(e.target.value)}
                  placeholder="Detalles sobre el proveedor, factura o comprobante..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800 resize-none"
                />
              </div>

            </div>

            {/* Bottom Button */}
            <div className="p-5 pt-3 flex justify-end gap-3 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-xs font-montserrat font-bold shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
              >
                <X className="w-4 h-4 text-[#005da9]" />
                <span>Cancelar</span>
              </button>
              <button 
                type="submit"
                className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-[#005da9]" />
                <span>Guardar Gasto</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =======================================================================
          MODAL: EDITAR / MODIFICAR GASTO (Frenyer Brand Identity)
          ======================================================================= */}
      {showEditModal && editingGasto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form 
            onSubmit={handleSaveEditedGasto}
            className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-[#005da9]/20 animate-in fade-in zoom-in duration-150 overflow-hidden"
          >
            {/* Modal Header: Frenyer Brand Gradient */}
            <div className="bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white px-6 py-4.5 flex items-center justify-between border-b border-[#005da9]/30 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-montserrat font-extrabold uppercase tracking-wider text-white">
                    Modificar Gasto
                  </h3>
                  <p className="text-[11px] text-white/80 font-medium">Edición de detalles y estado financiero</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingGasto(null);
                }}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4.5 max-h-[78vh] overflow-y-auto">
              
              {/* Tipo de Gasto (Pills) */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                  Tipo de Gasto <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100/90 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditType('fijo')}
                    className={`py-2 rounded-lg text-xs font-montserrat font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      editType === 'fijo'
                        ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📌 Gasto Fijo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType('variable')}
                    className={`py-2 rounded-lg text-xs font-montserrat font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      editType === 'variable'
                        ? 'bg-gradient-to-r from-[#1D3557] to-[#005da9] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🔄 Gasto Variable</span>
                  </button>
                </div>
              </div>

              {/* Row: Categoría & Descripción */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Categoría */}
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                    Categoría <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={editCategory}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setEditCategory(newCat);
                        if (!editDescription || allCategories.includes(editDescription)) {
                          setEditDescription(newCat);
                        }
                      }}
                      className="w-full appearance-none pl-3.5 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-semibold text-slate-800 cursor-pointer font-poppins"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Descripción / Concepto */}
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                    Concepto / Detalle
                  </label>
                  <input 
                    type="text"
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value);
                      if (!editName) setEditName(e.target.value);
                    }}
                    placeholder="Ej: Pago de alquiler oficina"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Nombre identificador */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                  Nombre visible <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nombre del gasto..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-semibold text-slate-800"
                />
              </div>

              {/* Row: Monto en USD & Equivalencia en Bs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">
                    Monto (USD $) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      required
                      step="any"
                      min="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-3.5 pr-12 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-bold text-slate-800"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">USD</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-500 mb-1.5">
                    Equivalente en Bs (Tasa BCV)
                  </label>
                  <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>{((parseFloat(editAmount) || 0) * bcvRate).toFixed(2)} Bs</span>
                    <span className="text-[10px] text-slate-400 font-normal">Tasa: {bcvRate.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Campos específicos si es Fijo */}
              {editType === 'fijo' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Próxima fecha</label>
                    <input 
                      type="date"
                      value={editNextDueDate}
                      onChange={(e) => setEditNextDueDate(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Frecuencia</label>
                    <select
                      value={editFrequency}
                      onChange={(e) => setEditFrequency(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    >
                      <option value="Mensual">Mensual (30 días)</option>
                      <option value="Quincenal">Quincenal (15 días)</option>
                      <option value="Semanal">Semanal (7 días)</option>
                      <option value="Anual">Anual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Estado</label>
                    <select
                      value={editStatus}
                      onChange={(e: any) => setEditStatus(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="vencido">Vencido</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Campos específicos si es Variable */}
              {editType === 'variable' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Cuenta bancaria</label>
                    <select
                      value={editBankAccountId}
                      onChange={(e) => setEditBankAccountId(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    >
                      {bankAccounts.length === 0 ? (
                        <option value="">Caja en Efectivo $</option>
                      ) : (
                        bankAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (${a.balance.toFixed(2)})</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Fecha de pago</label>
                    <input 
                      type="date"
                      value={editLastPaidDate}
                      onChange={(e) => setEditLastPaidDate(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Notas adicionales */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Notas adicionales</label>
                <textarea 
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Detalles sobre el proveedor, factura o comprobante..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] text-xs font-medium text-slate-800 resize-none"
                />
              </div>

            </div>

            {/* Bottom Button */}
            <div className="p-5 pt-3 flex justify-end gap-3 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingGasto(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-montserrat font-bold text-slate-600 hover:bg-slate-200/80 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-7 py-2 bg-gradient-to-r from-[#1D3557] to-[#005da9] hover:from-[#152741] hover:to-[#004b87] text-white font-montserrat font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition cursor-pointer"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =======================================================================
          MODAL: PAGAR GASTO FIJO (Frenyer Brand Identity)
          ======================================================================= */}
      {showPayModal && selectedGastoToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form 
            onSubmit={handleConfirmPayment}
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-[#005da9]/20 animate-in fade-in zoom-in duration-150 overflow-hidden"
          >
            {/* Header: Frenyer Brand Gradient */}
            <div className="bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white px-6 py-4.5 flex items-center justify-between border-b border-[#005da9]/30 shadow-md">
              <div>
                <h3 className="text-sm sm:text-base font-montserrat font-extrabold uppercase tracking-wider text-white">
                  Gasto fijo: {selectedGastoToPay.name}
                </h3>
                <p className="text-xs font-montserrat font-bold text-[#40E0D0] mt-0.5">
                  Total ${selectedGastoToPay.amount.toFixed(2)} | Saldo restante $0.00
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowPayModal(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              
              {/* Row: Metodo de pago & Monto (USD) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Método de pago / Cuenta</label>
                  <div className="relative">
                    <select 
                      required
                      value={payAccountId}
                      onChange={(e) => setPayAccountId(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800 cursor-pointer font-poppins"
                    >
                      {bankAccounts.length === 0 ? (
                        <option value="">EFECTIVO EN DÓLARES</option>
                      ) : (
                        bankAccounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} (${a.balance.toFixed(2)})
                          </option>
                        ))
                      )}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Monto a Pagar (USD)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      required
                      step="any"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full pl-3.5 pr-12 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">USD</span>
                  </div>
                </div>
              </div>

              {/* Referencia & Notas */}
              <div>
                <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1.5">Referencia bancaria (Opcional)</label>
                <input 
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="Ej: Ref #92819"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#005da9] focus:ring-2 focus:ring-[#005da9]/20 text-xs font-medium text-slate-800"
                />
              </div>

            </div>

            {/* Bottom Centered Button (Frenyer Brand Identity) */}
            <div className="p-6 pt-2 flex justify-center bg-slate-50/50 border-t border-slate-100">
              <button 
                type="submit"
                className="px-8 py-2.5 bg-gradient-to-r from-[#1D3557] to-[#005da9] hover:from-[#152741] hover:to-[#004b87] text-white font-montserrat font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition cursor-pointer"
              >
                Confirmar pago
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TOAST SYSTEM */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-4 flex items-start gap-3.5 animate-in slide-in-from-bottom-5 duration-200">
          <div className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-montserrat font-extrabold text-slate-900 uppercase tracking-tight">{toast.type === 'success' ? 'Éxito' : 'Error'}</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5 leading-normal">{toast.msg}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-50 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

    </div>
  );
}

