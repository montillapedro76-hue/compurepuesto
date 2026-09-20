import React, { useState, useMemo } from 'react';
import { 
  Landmark, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  Search, 
  FileText, 
  FileSpreadsheet, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Building,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  Filter
} from 'lucide-react';
import { BankAccount, BankTransfer, BusinessProfile } from '../../types';
import { exportBankStatementPDF, exportBankStatementExcel } from './accountReportsExport';

interface ReporteBancosTabProps {
  bankAccounts: BankAccount[];
  bankTransfers: BankTransfer[];
  bcvRate: number;
  businessProfile?: BusinessProfile | null;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function ReporteBancosTab({
  bankAccounts,
  bankTransfers,
  bcvRate,
  businessProfile,
  onRefresh,
  isLoading = false
}: ReporteBancosTabProps) {
  // Selected bank account (default to first active account)
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return bankAccounts.length > 0 ? bankAccounts[0].id : '';
  });

  // Keep selectedAccountId updated when bankAccounts list changes or loads
  React.useEffect(() => {
    if ((!selectedAccountId || !bankAccounts.some(a => a.id === selectedAccountId)) && bankAccounts.length > 0) {
      setSelectedAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedAccountId]);

  // Date filters
  const [datePreset, setDatePreset] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Filter by operation type
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Find currently selected account
  const currentAccount = useMemo(() => {
    return bankAccounts.find(a => a.id === selectedAccountId) || bankAccounts[0] || null;
  }, [bankAccounts, selectedAccountId]);

  // Compute all movements for the selected account
  const accountMovements = useMemo(() => {
    if (!currentAccount) return [];

    const accId = currentAccount.id;
    const list: Array<{
      id: string;
      date: string;
      fullDate: string;
      reference: string;
      type: 'Ingreso' | 'Egreso' | 'Transferencia';
      typeKey: 'income' | 'expense' | 'transfer';
      description: string;
      debit: number;
      credit: number;
      currency: string;
      exchangeRate?: number;
      created_by?: string;
    }> = [];

    const aliasIds = currentAccount.alias_ids || [accId];
    const cleanAccName = (currentAccount.name || '').toLowerCase().trim();

    bankTransfers.forEach(t => {
      const cleanFromName = (t.from_account_name || '').toLowerCase().trim();
      const cleanToName = (t.to_account_name || '').toLowerCase().trim();

      const isFrom = aliasIds.includes(t.from_account_id || '') || t.from_account_id === accId || (!!cleanAccName && cleanFromName === cleanAccName);
      const isTo = aliasIds.includes(t.to_account_id || '') || t.to_account_id === accId || (!!cleanAccName && cleanToName === cleanAccName);

      if (!isFrom && !isTo) return;

      const dateStr = t.created_at ? t.created_at.substring(0, 10) : '';
      const fullDateStr = t.created_at
        ? new Date(t.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
        : '—';

      if (isTo && !isFrom) {
        // Pure Incoming (Credit)
        const creditAmt = Number(t.converted_amount || t.amount || 0);
        list.push({
          id: t.id || Math.random().toString(),
          date: dateStr,
          fullDate: fullDateStr,
          reference: t.reference || 'N/A',
          type: 'Ingreso',
          typeKey: 'income',
          description: t.notes || (t.from_account_name ? `Transferencia desde ${t.from_account_name}` : 'Depósito bancario / Venta'),
          debit: 0,
          credit: creditAmt,
          currency: currentAccount.currency,
          exchangeRate: t.exchange_rate,
          created_by: t.created_by
        });
      } else if (isFrom && !isTo) {
        // Pure Outgoing (Debit)
        const debitAmt = Number(t.amount || 0);
        list.push({
          id: t.id || Math.random().toString(),
          date: dateStr,
          fullDate: fullDateStr,
          reference: t.reference || 'N/A',
          type: 'Egreso',
          typeKey: 'expense',
          description: t.notes || (t.to_account_name ? `Transferencia hacia ${t.to_account_name}` : 'Retiro / Pago de servicio'),
          debit: debitAmt,
          credit: 0,
          currency: currentAccount.currency,
          exchangeRate: t.exchange_rate,
          created_by: t.created_by
        });
      } else if (isFrom && isTo) {
        // Internal transfer to itself (rare adjustment)
        list.push({
          id: t.id || Math.random().toString(),
          date: dateStr,
          fullDate: fullDateStr,
          reference: t.reference || 'N/A',
          type: 'Transferencia',
          typeKey: 'transfer',
          description: t.notes || 'Ajuste interno de saldo',
          debit: 0,
          credit: 0,
          currency: currentAccount.currency,
          exchangeRate: t.exchange_rate,
          created_by: t.created_by
        });
      }
    });

    // Sort ascending chronologically to compute continuous running balance
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return list;
  }, [currentAccount, bankTransfers]);

  // Filter movements by dates, type, and search query
  const filteredData = useMemo(() => {
    if (!currentAccount) {
      return {
        initialBalance: 0,
        finalBalance: 0,
        totalIncome: 0,
        totalExpense: 0,
        movementsWithRunningBalance: []
      };
    }

    // Determine initial balance prior to startDate
    let runningPrior = 0;
    const priorMovements = accountMovements.filter(m => m.date < startDate);
    priorMovements.forEach(m => {
      runningPrior += (m.credit - m.debit);
    });

    // If account balance was set as initial balance anchor
    // We compute a baseline so the end matches currentAccount.balance if all movements are counted
    const totalAllCredits = accountMovements.reduce((sum, m) => sum + m.credit, 0);
    const totalAllDebits = accountMovements.reduce((sum, m) => sum + m.debit, 0);
    const netAllMovements = totalAllCredits - totalAllDebits;
    const baseInitialAccountBalance = Number(currentAccount.balance || 0) - netAllMovements;
    
    const initialBalancePeriod = baseInitialAccountBalance + runningPrior;

    // Filter within the date window
    let currentBalance = initialBalancePeriod;
    let periodIncome = 0;
    let periodExpense = 0;

    const inRangeMovements = accountMovements.filter(m => m.date >= startDate && m.date <= endDate);

    // Compute progressive running balance for all in-range movements
    const withBalances = inRangeMovements.map(m => {
      currentBalance += (m.credit - m.debit);
      periodIncome += m.credit;
      periodExpense += m.debit;
      return {
        ...m,
        balance: currentBalance
      };
    });

    const finalBalancePeriod = currentBalance;

    // Apply secondary filters (type and search) to displayed rows
    const query = searchQuery.trim().toLowerCase();
    const displayedRows = withBalances.filter(m => {
      if (typeFilter !== 'all' && m.typeKey !== typeFilter) return false;
      if (query) {
        const text = `${m.reference} ${m.description} ${m.type} ${m.created_by || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    return {
      initialBalance: initialBalancePeriod,
      finalBalance: finalBalancePeriod,
      totalIncome: periodIncome,
      totalExpense: periodExpense,
      movementsWithRunningBalance: displayedRows
    };
  }, [accountMovements, startDate, endDate, typeFilter, searchQuery, currentAccount]);

  // Handlers for PDF and Excel
  const handleExportPDF = () => {
    if (!currentAccount) return;
    exportBankStatementPDF({
      account: currentAccount,
      startDate,
      endDate,
      initialBalance: filteredData.initialBalance,
      finalBalance: filteredData.finalBalance,
      totalIncome: filteredData.totalIncome,
      totalExpense: filteredData.totalExpense,
      totalCommissions: 0,
      movements: filteredData.movementsWithRunningBalance.map(m => ({
        date: m.fullDate,
        reference: m.reference,
        type: m.type,
        description: m.description,
        debit: m.debit,
        credit: m.credit,
        balance: m.balance
      })),
      businessProfile,
      bcvRate
    });
  };

  const handleExportExcel = () => {
    if (!currentAccount) return;
    exportBankStatementExcel({
      account: currentAccount,
      startDate,
      endDate,
      initialBalance: filteredData.initialBalance,
      finalBalance: filteredData.finalBalance,
      totalIncome: filteredData.totalIncome,
      totalExpense: filteredData.totalExpense,
      totalCommissions: 0,
      movements: filteredData.movementsWithRunningBalance.map(m => ({
        date: m.fullDate,
        reference: m.reference,
        type: m.type,
        description: m.description,
        debit: m.debit,
        credit: m.credit,
        balance: m.balance
      })),
      businessProfile,
      bcvRate
    });
  };

  const [accountCurrencyFilter, setAccountCurrencyFilter] = useState<'all' | 'VES' | 'USD' | 'USDT' | string>('all');

  const filteredAccounts = useMemo(() => {
    if (accountCurrencyFilter === 'all') return bankAccounts;
    return bankAccounts.filter(a => (a.currency || 'VES').toUpperCase() === accountCurrencyFilter.toUpperCase());
  }, [bankAccounts, accountCurrencyFilter]);

  const formatCurr = (val: number, curr?: string) => {
    const targetCurr = (curr || currentAccount?.currency || 'VES').toUpperCase();
    const formatted = Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (targetCurr === 'USD') return `$ ${formatted}`;
    if (targetCurr === 'USDT') return `${formatted} USDT`;
    if (targetCurr === 'EUR') return `€ ${formatted}`;
    if (targetCurr === 'COP') return `COP$ ${Number(val || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
    return `Bs. ${formatted}`;
  };

  const renderBadge = (currency: string) => {
    const c = (currency || 'VES').toUpperCase();
    if (c === 'USDT') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
          USDT
        </span>
      );
    }
    if (c === 'USD') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
          USD
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
        {c}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── ACCOUNT SELECTOR BAR ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-[#1D3557]" />
              Selección de Cuenta Bancaria
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Seleccione la cuenta bancaria para auditar sus movimientos detallados y conciliación.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Actualizar datos"
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

        {/* Currency Filter Tabs for Bank Accounts */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Moneda:
          </span>
          <button
            type="button"
            onClick={() => setAccountCurrencyFilter('all')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              accountCurrencyFilter === 'all'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todas ({bankAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setAccountCurrencyFilter('VES')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              accountCurrencyFilter === 'VES'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            VES ({bankAccounts.filter(a => (a.currency || 'VES').toUpperCase() === 'VES').length})
          </button>
          <button
            type="button"
            onClick={() => setAccountCurrencyFilter('USD')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              accountCurrencyFilter === 'USD'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            USD ({bankAccounts.filter(a => (a.currency || '').toUpperCase() === 'USD').length})
          </button>
          <button
            type="button"
            onClick={() => setAccountCurrencyFilter('USDT')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              accountCurrencyFilter === 'USDT'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
            }`}
          >
            USDT / Binance ({bankAccounts.filter(a => (a.currency || '').toUpperCase() === 'USDT').length})
          </button>
        </div>

        {/* Bank Account Horizontal Scroll / Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredAccounts.map(acc => {
            const isSelected = acc.id === currentAccount?.id;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                  isSelected
                    ? 'border-[#1D3557] bg-slate-50/80 ring-2 ring-[#1D3557]/15 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-[#1D3557] text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">
                        {acc.bank_name || acc.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate max-w-[130px]">
                        {acc.account_number ? `...${acc.account_number.slice(-8)}` : acc.name}
                      </p>
                    </div>
                  </div>
                  {renderBadge(acc.currency)}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Saldo Actual</span>
                  <span className="text-sm font-black text-slate-900">
                    {formatCurr(acc.balance, acc.currency)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FILTERS BAR ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: '7 días' },
              { id: 'this_month', label: 'Este mes' },
              { id: 'last_month', label: 'Mes anterior' },
              { id: 'all', label: 'Histórico completo' }
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Operation Type Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <span className="px-2 text-slate-400 font-semibold text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Tipo:
            </span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'income', label: 'Ingresos (+)' },
              { id: 'expense', label: 'Egresos (-)' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setTypeFilter(type.id as any)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  typeFilter === type.id
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Inputs & Search Query */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Desde
            </label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Hasta
            </label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Buscar en movimientos
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Referencia, concepto, notas..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1D3557] focus:outline-none bg-slate-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Inicial */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo Inicial al Inicio</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-slate-900 mt-2">
            {formatCurr(filteredData.initialBalance)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Corte al {startDate}
          </p>
        </div>

        {/* Total Ingresos */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total Ingresos (+)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-emerald-700 mt-2">
            +{formatCurr(filteredData.totalIncome)}
          </p>
          <p className="text-[11px] text-emerald-600/70 mt-0.5">
            Depósitos, ventas y abonos
          </p>
        </div>

        {/* Total Egresos */}
        <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Total Egresos (-)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-rose-700 mt-2">
            -{formatCurr(filteredData.totalExpense)}
          </p>
          <p className="text-[11px] text-rose-600/70 mt-0.5">
            Pagos a proveedores y transferencias
          </p>
        </div>

        {/* Saldo Final al Corte */}
        <div className="bg-gradient-to-br from-[#1D3557] to-[#152740] rounded-2xl p-4 text-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Saldo Final al Corte</span>
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-white mt-2">
            {formatCurr(filteredData.finalBalance)}
          </p>
          <p className="text-[11px] text-slate-300 mt-0.5">
            {currentAccount?.currency === 'USD' || currentAccount?.currency === 'USDT'
              ? `Equivalente: Bs. ${(filteredData.finalBalance * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Equivalente: $ ${(bcvRate > 0 ? filteredData.finalBalance / bcvRate : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
      </div>

      {/* ── DETAILED MOVEMENTS TABLE ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Detalle Cronológico de Transacciones ({filteredData.movementsWithRunningBalance.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Movimientos bancarios registrados con cálculo de saldo acumulado.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Mostrando {filteredData.movementsWithRunningBalance.length} movimiento(s)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Referencia</th>
                <th className="px-4 py-3">Operación</th>
                <th className="px-4 py-3">Concepto / Beneficiario</th>
                <th className="px-4 py-3 text-right">Débito (-)</th>
                <th className="px-4 py-3 text-right">Crédito (+)</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredData.movementsWithRunningBalance.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Landmark className="w-8 h-8 text-slate-300 mb-2" />
                      <span className="font-semibold text-slate-600">No se encontraron movimientos en este rango de fechas.</span>
                      <span className="text-[11px] text-slate-400 mt-0.5">Pruebe ajustando los filtros de fecha o seleccionando otra cuenta.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.movementsWithRunningBalance.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                      {row.fullDate}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                      {row.reference || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        row.type === 'Ingreso'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : row.type === 'Egreso'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                      }`}>
                        {row.type === 'Ingreso' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[280px] truncate" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-rose-600 whitespace-nowrap">
                      {row.debit > 0 ? `-${formatCurr(row.debit)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">
                      {row.credit > 0 ? `+${formatCurr(row.credit)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-900 whitespace-nowrap bg-slate-50/40">
                      {formatCurr(row.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
