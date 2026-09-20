import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Calendar, 
  FileText, 
  FileSpreadsheet, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Filter, 
  RefreshCw, 
  ChevronRight, 
  UserCheck, 
  ShieldAlert, 
  PieChart, 
  Phone,
  BadgeAlert
} from 'lucide-react';
import { AccountReceivable, AccountReceivablePayment, BusinessProfile } from '../../types';
import { exportCxCPDF, exportCxCExcel } from './accountReportsExport';

interface ReporteCxCTabProps {
  receivables: AccountReceivable[];
  payments: AccountReceivablePayment[];
  bcvRate: number;
  businessProfile?: BusinessProfile | null;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function ReporteCxCTab({
  receivables,
  payments,
  bcvRate,
  businessProfile,
  onRefresh,
  isLoading = false
}: ReporteCxCTabProps) {
  // Sub-view mode
  const [subMode, setSubMode] = useState<'consolidado' | 'por_cliente' | 'por_vencer' | 'detallado' | 'historial'>('consolidado');

  // Selected client for 'por_cliente' mode
  const [selectedClientName, setSelectedClientName] = useState<string>('');

  // Date filters
  const [datePreset, setDatePreset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Additional filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendiente' | 'parcial' | 'pagado' | 'vencido'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [venceFilter, setVenceFilter] = useState<'all' | 'overdue' | 'today' | '7days' | '15days' | '30days'>('all');

  // Handle Preset changes
  const applyPreset = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      const d = new Date();
      d.setDate(1);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'last_month') {
      const d1 = new Date();
      d1.setMonth(d1.getMonth() - 1);
      d1.setDate(1);
      const d2 = new Date(d1.getFullYear(), d1.getMonth() + 1, 0);
      setStartDate(d1.toISOString().split('T')[0]);
      setEndDate(d2.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate(todayStr);
    }
  };

  // Helper to calculate days diff
  const getDaysDiff = (dateStr?: string) => {
    if (!dateStr) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Enrich receivables with calculated fields
  const enrichedReceivables = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return receivables.map(r => {
      const remaining = Number(r.remaining_amount != null ? r.remaining_amount : (r.total_amount - (r.paid_amount || 0)));
      const daysDiff = getDaysDiff(r.due_date);
      const isOverdue = r.due_date && daysDiff < 0 && remaining > 0;
      const isDueToday = r.due_date && daysDiff === 0 && remaining > 0;
      const daysOverdue = isOverdue ? Math.abs(daysDiff) : 0;

      let computedStatus: 'pendiente' | 'parcial' | 'pagado' | 'vencido' = 'pendiente';
      if (remaining <= 0) {
        computedStatus = 'pagado';
      } else if (isOverdue) {
        computedStatus = 'vencido';
      } else if (Number(r.paid_amount || 0) > 0) {
        computedStatus = 'parcial';
      }

      const clientName = r.client_name || r.customer_name || r.entity_name || 'Cliente sin nombre';

      return {
        ...r,
        clientName,
        remaining,
        daysDiff,
        isOverdue,
        isDueToday,
        daysOverdue,
        computedStatus
      };
    });
  }, [receivables]);

  // Unique clients list for dropdown
  const uniqueClients = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; count: number; totalPending: number }>();
    enrichedReceivables.forEach(r => {
      const existing = map.get(r.clientName) || { name: r.clientName, phone: r.client_phone || r.customer_phone, count: 0, totalPending: 0 };
      existing.count += 1;
      existing.totalPending += r.remaining;
      if (!existing.phone && (r.client_phone || r.customer_phone)) {
        existing.phone = r.client_phone || r.customer_phone;
      }
      map.set(r.clientName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending);
  }, [enrichedReceivables]);

  // Filtered dataset
  const filteredReceivables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return enrichedReceivables.filter(r => {
      // Date filter (by issue date or due date)
      const docDate = r.issue_date ? r.issue_date.substring(0, 10) : '';
      if (docDate && (docDate < startDate || docDate > endDate)) {
        return false;
      }

      // Sub-mode specific client filter
      if (subMode === 'por_cliente' && selectedClientName && r.clientName !== selectedClientName) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'vencido' && !r.isOverdue) return false;
        if (statusFilter !== 'vencido' && r.computedStatus !== statusFilter) return false;
      }

      // Cuentas por vencer filter
      if (venceFilter !== 'all') {
        if (venceFilter === 'overdue' && !r.isOverdue) return false;
        if (venceFilter === 'today' && !r.isDueToday) return false;
        if (venceFilter === '7days' && (r.daysDiff < 0 || r.daysDiff > 7)) return false;
        if (venceFilter === '15days' && (r.daysDiff < 0 || r.daysDiff > 15)) return false;
        if (venceFilter === '30days' && (r.daysDiff < 0 || r.daysDiff > 30)) return false;
      }

      // Text search
      if (query) {
        const text = `${r.clientName} ${r.invoice_number || ''} ${r.subject || ''} ${r.client_phone || ''} ${r.customer_document || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [enrichedReceivables, startDate, endDate, subMode, selectedClientName, statusFilter, venceFilter, searchQuery]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return payments.filter(p => {
      const pDate = p.payment_date ? p.payment_date.substring(0, 10) : '';
      if (pDate && (pDate < startDate || pDate > endDate)) return false;
      if (query) {
        const text = `${p.payment_method} ${p.reference || ''} ${p.notes || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
  }, [payments, startDate, endDate, searchQuery]);

  // Macro Summary Metrics
  const summaryTotals = useMemo(() => {
    let totalPendingUSD = 0;
    let totalOriginalUSD = 0;
    let totalPaidUSD = 0;
    let overdueCount = 0;
    let overdueAmountUSD = 0;
    const clientsWithPendingDebt = new Set<string>();

    // Aging categories
    let agingCurrent = 0;
    let aging1to15 = 0;
    let aging16to30 = 0;
    let aging31to60 = 0;
    let agingMore60 = 0;

    enrichedReceivables.forEach(r => {
      totalOriginalUSD += Number(r.total_amount || 0);
      totalPaidUSD += Number(r.paid_amount || 0);

      if (r.remaining > 0) {
        totalPendingUSD += r.remaining;
        clientsWithPendingDebt.add(r.clientName);

        if (r.isOverdue) {
          overdueCount += 1;
          overdueAmountUSD += r.remaining;

          if (r.daysOverdue <= 15) {
            aging1to15 += r.remaining;
          } else if (r.daysOverdue <= 30) {
            aging16to30 += r.remaining;
          } else if (r.daysOverdue <= 60) {
            aging31to60 += r.remaining;
          } else {
            agingMore60 += r.remaining;
          }
        } else {
          agingCurrent += r.remaining;
        }
      }
    });

    const totalPendingVES = totalPendingUSD * bcvRate;

    return {
      totalPendingUSD,
      totalPendingVES,
      totalOriginalUSD,
      totalPaidUSD,
      overdueCount,
      overdueAmountUSD,
      activeClientsCount: clientsWithPendingDebt.size,
      aging: {
        agingCurrent,
        aging1to15,
        aging16to30,
        aging31to60,
        agingMore60
      }
    };
  }, [enrichedReceivables, bcvRate]);

  // Export handlers
  const handleExportPDF = () => {
    exportCxCPDF({
      mode: subMode,
      selectedClientName: subMode === 'por_cliente' ? selectedClientName : undefined,
      startDate,
      endDate,
      totals: summaryTotals,
      receivables: filteredReceivables,
      payments: filteredPayments,
      businessProfile,
      bcvRate
    });
  };

  const handleExportExcel = () => {
    exportCxCExcel({
      mode: subMode,
      selectedClientName: subMode === 'por_cliente' ? selectedClientName : undefined,
      startDate,
      endDate,
      totals: summaryTotals,
      receivables: filteredReceivables,
      payments: filteredPayments,
      businessProfile,
      bcvRate
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── TOP NAV / SUB-MODES BAR ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#1D3557]" />
              Estado de Cuentas por Cobrar (CxC)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditoría consolidada, cartera vencida, desglose por cliente y trazabilidad de abonos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1D3557] hover:bg-[#152740] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-rose-300" />
              Descargar PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Exportar Excel
            </button>
          </div>
        </div>

        {/* 5 Sub-mode Navigation Pills */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          {[
            { id: 'consolidado', label: 'Consolidado General', icon: PieChart },
            { id: 'por_cliente', label: 'Por Cliente', icon: Users },
            { id: 'por_vencer', label: 'Cuentas por Vencer', icon: Clock },
            { id: 'detallado', label: 'Detalle de Facturas', icon: FileText },
            { id: 'historial', label: 'Historial de Abonos', icon: CheckCircle2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = subMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubMode(tab.id as any)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1D3557] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SUMMARY KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total por cobrar USD & VES */}
        <div className="bg-gradient-to-br from-[#1D3557] to-[#152740] rounded-2xl p-4 text-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Total por Cobrar</span>
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-white mt-2">
            ${summaryTotals.totalPendingUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
            Bs. {summaryTotals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Tasa: {bcvRate.toFixed(2)})
          </p>
        </div>

        {/* Total Facturado Crédito */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Facturado Crédito</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-slate-900 mt-2">
            ${summaryTotals.totalOriginalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {receivables.length} documento(s) a crédito
          </p>
        </div>

        {/* Total Recuperado / Cobrado */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total Cobrado</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-emerald-700 mt-2">
            ${summaryTotals.totalPaidUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5 font-medium">
            {summaryTotals.totalOriginalUSD > 0
              ? `${((summaryTotals.totalPaidUSD / summaryTotals.totalOriginalUSD) * 100).toFixed(1)}% recuperado`
              : '0%'}
          </p>
        </div>

        {/* Cartera Vencida (Overdue) */}
        <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Cartera Vencida</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-rose-700 mt-2">
            ${summaryTotals.overdueAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-rose-600 font-semibold mt-0.5">
            {summaryTotals.overdueCount} cuenta(s) en mora de {summaryTotals.activeClientsCount} cliente(s)
          </p>
        </div>
      </div>

      {/* ── AGING MATRIX (ANTIGÜEDAD DE SALDOS) ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          Antigüedad de Saldos por Cobrar
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Al Día / Vigente</span>
            <span className="text-sm font-black text-emerald-700 block mt-1">
              ${summaryTotals.aging.agingCurrent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400">Sin vencimiento</span>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60">
            <span className="text-[10px] uppercase font-bold text-amber-700 block">1 a 15 Días</span>
            <span className="text-sm font-black text-amber-800 block mt-1">
              ${summaryTotals.aging.aging1to15.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-amber-600">Vencimiento reciente</span>
          </div>
          <div className="p-3 bg-orange-50/60 rounded-xl border border-orange-200/60">
            <span className="text-[10px] uppercase font-bold text-orange-700 block">16 a 30 Días</span>
            <span className="text-sm font-black text-orange-800 block mt-1">
              ${summaryTotals.aging.aging16to30.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-orange-600">Riesgo moderado</span>
          </div>
          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/60">
            <span className="text-[10px] uppercase font-bold text-rose-700 block">31 a 60 Días</span>
            <span className="text-sm font-black text-rose-800 block mt-1">
              ${summaryTotals.aging.aging31to60.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-rose-600">Gestión urgente</span>
          </div>
          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
            <span className="text-[10px] uppercase font-bold text-red-700 block">+60 Días</span>
            <span className="text-sm font-black text-red-800 block mt-1">
              ${summaryTotals.aging.agingMore60.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-red-600">Mora crítica</span>
          </div>
        </div>
      </div>

      {/* ── FILTERS BAR ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Preset Fechas */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Período de Fecha
            </label>
            <select
              value={datePreset}
              onChange={e => applyPreset(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
            >
              <option value="today">Hoy</option>
              <option value="week">Últimos 7 días</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="all">Histórico completo</option>
            </select>
          </div>

          {/* Sub-mode 'por_cliente' Selector */}
          {subMode === 'por_cliente' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Cliente Específico
              </label>
              <select
                value={selectedClientName}
                onChange={e => setSelectedClientName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              >
                <option value="">-- Todos los Clientes --</option>
                {uniqueClients.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} (Pendiente: ${c.totalPending.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Estado Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Estado de Cuenta
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendiente (100%)</option>
              <option value="parcial">Con Abono Parcial</option>
              <option value="pagado">Totalmente Cobrado</option>
              <option value="vencido">Vencido / En Mora</option>
            </select>
          </div>

          {/* Cuentas por Vencer Filter */}
          {subMode === 'por_vencer' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Ventana de Vencimiento
              </label>
              <select
                value={venceFilter}
                onChange={e => setVenceFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              >
                <option value="all">Todas</option>
                <option value="overdue">Ya Vencidas (Mora)</option>
                <option value="today">Vencen Hoy</option>
                <option value="7days">Próximos 7 días</option>
                <option value="15days">Próximos 15 días</option>
                <option value="30days">Próximos 30 días</option>
              </select>
            </div>
          )}

          {/* Quick Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Búsqueda Rápida
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cliente, factura, teléfono..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── SUB-VIEW CONTENT ── */}
      {subMode === 'consolidado' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Consolidado de Cartera por Cliente ({uniqueClients.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Resumen de créditos activos, deuda acumulada y estado de cobranza por cliente.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Teléfono / RIF</th>
                  <th className="px-4 py-3 text-center">Facturas</th>
                  <th className="px-4 py-3 text-right">Total Facturado</th>
                  <th className="px-4 py-3 text-right">Saldo Pendiente ($)</th>
                  <th className="px-4 py-3 text-right">Saldo Pendiente (Bs.)</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {uniqueClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No hay clientes con cuentas por cobrar registradas.
                    </td>
                  </tr>
                ) : (
                  uniqueClients.map(c => {
                    const clientReceivables = enrichedReceivables.filter(r => r.clientName === c.name);
                    const totalFact = clientReceivables.reduce((s, r) => s + Number(r.total_amount || 0), 0);
                    return (
                      <tr key={c.name} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {c.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                          {c.phone || 'N/D'}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                          {c.count}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                          ${totalFact.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-rose-600">
                          ${c.totalPending.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                          Bs. {(c.totalPending * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedClientName(c.name);
                              setSubMode('por_cliente');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#1D3557] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Ver Estado
                            <ChevronRight className="w-3 h-3" />
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
      )}

      {/* Sub-mode: DETALLADO / POR_CLIENTE / POR_VENCER */}
      {(subMode === 'detallado' || subMode === 'por_cliente' || subMode === 'por_vencer') && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {subMode === 'por_cliente'
                  ? `Estado de Cuenta Individual: ${selectedClientName || 'Todos los clientes'}`
                  : subMode === 'por_vencer'
                  ? 'Cuentas con Vencimiento Próximo y en Mora'
                  : 'Detalle de Facturas y Créditos Emitidos'} ({filteredReceivables.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detalle documento a documento con fecha de emisión, vencimiento y estado de cobro.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Doc / Factura</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3">Vence</th>
                  <th className="px-4 py-3 text-right">Total ($)</th>
                  <th className="px-4 py-3 text-right">Abonado ($)</th>
                  <th className="px-4 py-3 text-right">Pendiente ($)</th>
                  <th className="px-4 py-3 text-right">Pendiente (Bs.)</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredReceivables.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No se encontraron registros con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredReceivables.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.invoice_number || r.subject || 'Crédito'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {r.clientName}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {r.issue_date ? r.issue_date.substring(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {r.due_date ? r.due_date.substring(0, 10) : 'Al Válido'}
                          {r.isOverdue && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              +{r.daysOverdue}d
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        ${Number(r.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">
                        ${Number(r.paid_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-rose-600">
                        ${r.remaining.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                        Bs. {(r.remaining * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.isOverdue
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : r.computedStatus === 'pagado'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : r.computedStatus === 'parcial'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {r.isOverdue ? 'Vencido' : r.computedStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-mode: HISTORIAL DE ABONOS */}
      {subMode === 'historial' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Historial de Cobros y Abonos Recibidos ({filteredPayments.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Registro cronológico de pagos procesados para amortización de cuentas por cobrar.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Documento / ID</th>
                  <th className="px-4 py-3">Método de Pago</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3 text-right">Monto ($)</th>
                  <th className="px-4 py-3 text-right">Monto (Bs.)</th>
                  <th className="px-4 py-3">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No hay abonos registrados en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {p.payment_date ? p.payment_date.substring(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {p.account_receivable_id || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {p.payment_method || 'Efectivo'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {p.reference || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        +${Number(p.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                        Bs. {(Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">
                        {p.notes || 'Abono registrado'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
