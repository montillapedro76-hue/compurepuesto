import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Landmark, 
  Users, 
  Building2, 
  TrendingUp, 
  RefreshCw, 
  FileSpreadsheet, 
  ShieldCheck, 
  CheckCircle2,
  Calendar,
  Layers,
  PieChart,
  Cloud,
  Radio
} from 'lucide-react';
import { supabase, dbService } from '../lib/supabase';
import { getCachedCurrencyRates } from '../lib/currency';
import { 
  BankAccount, 
  BankTransfer, 
  AccountReceivable, 
  AccountReceivablePayment, 
  AccountPayable, 
  AccountPayablePayment, 
  BusinessProfile,
  StoreUser 
} from '../types';
import ReporteBancosTab from './account-reports/ReporteBancosTab';
import ReporteCxCTab from './account-reports/ReporteCxCTab';
import ReporteCxPTab from './account-reports/ReporteCxPTab';

interface ReportesCuentasPageProps {
  bcvRate: number;
  currentUser?: StoreUser | null;
  onRefreshData?: () => void;
}

export default function ReportesCuentasPage({
  bcvRate = getCachedCurrencyRates().VES,
  currentUser,
  onRefreshData
}: ReportesCuentasPageProps) {
  // Main Tab State
  const [activeTab, setActiveTab] = useState<'bancos' | 'cxc' | 'cxp'>('bancos');

  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(Boolean(supabase));
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString('es-VE'));

  // Core Data Collections
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankTransfers, setBankTransfers] = useState<BankTransfer[]>([]);
  const [accountsReceivable, setAccountsReceivable] = useState<AccountReceivable[]>([]);
  const [accountsReceivablePayments, setAccountsReceivablePayments] = useState<AccountReceivablePayment[]>([]);
  const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([]);
  const [accountsPayablePayments, setAccountsPayablePayments] = useState<AccountPayablePayment[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  const debounceTimerRef = useRef<any>(null);

  // Fetch all accounts and transaction records from Supabase cloud
  const loadAllData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const [
        accounts,
        transfers,
        cxc,
        cxcPays,
        cxp,
        cxpPays,
        profile
      ] = await Promise.all([
        dbService.getBankAccounts().catch(() => []),
        dbService.getBankTransfers().catch(() => []),
        dbService.getAccountsReceivable().catch(() => []),
        dbService.getAccountsReceivablePayments().catch(() => []),
        dbService.getAccountsPayable().catch(() => []),
        dbService.getAccountsPayablePayments().catch(() => []),
        dbService.getBusinessProfile().catch(() => null)
      ]);

      setBankAccounts(accounts || []);
      setBankTransfers(transfers || []);
      setAccountsReceivable(cxc || []);
      setAccountsReceivablePayments(cxcPays || []);
      setAccountsPayable(cxp || []);
      setAccountsPayablePayments(cxpPays || []);
      setBusinessProfile(profile);
      setLastSyncTime(new Date().toLocaleTimeString('es-VE'));
      setIsCloudConnected(Boolean(supabase));
    } catch (err) {
      console.error('Error fetching account reports data:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  const debouncedReload = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      loadAllData(false);
    }, 400);
  }, [loadAllData]);

  useEffect(() => {
    loadAllData(true);

    // 1. Set up Supabase Realtime Channels for Instant Cloud Sync
    const channelSuffix = Math.random().toString(36).substring(2, 7);
    let channels: any[] = [];

    if (supabase) {
      const bankAccChannel = supabase
        .channel(`reportes_bank_acc_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => {
          debouncedReload();
        })
        .subscribe();

      const bankTransfChannel = supabase
        .channel(`reportes_bank_transf_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transfers' }, () => {
          debouncedReload();
        })
        .subscribe();

      const cxcChannel = supabase
        .channel(`reportes_cxc_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_receivable' }, () => {
          debouncedReload();
        })
        .subscribe();

      const cxcPaysChannel = supabase
        .channel(`reportes_cxc_pays_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_receivable_payments' }, () => {
          debouncedReload();
        })
        .subscribe();

      const cxpChannel = supabase
        .channel(`reportes_cxp_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_payable' }, () => {
          debouncedReload();
        })
        .subscribe();

      const cxpPaysChannel = supabase
        .channel(`reportes_cxp_pays_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_payable_payments' }, () => {
          debouncedReload();
        })
        .subscribe();

      const invoicesChannel = supabase
        .channel(`reportes_inv_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
          debouncedReload();
        })
        .subscribe();

      const purchasesChannel = supabase
        .channel(`reportes_pur_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
          debouncedReload();
        })
        .subscribe();

      channels = [
        bankAccChannel,
        bankTransfChannel,
        cxcChannel,
        cxcPaysChannel,
        cxpChannel,
        cxpPaysChannel,
        invoicesChannel,
        purchasesChannel
      ];
    }

    // 2. Listen to internal window events
    const handleAccountUpdate = () => debouncedReload();
    window.addEventListener('bellavista_bank_accounts_updated', handleAccountUpdate);
    window.addEventListener('bellavista_bank_transfers_updated', handleAccountUpdate);
    window.addEventListener('bellavista_accounts_receivable_updated', handleAccountUpdate);
    window.addEventListener('bellavista_accounts_receivable_payments_updated', handleAccountUpdate);
    window.addEventListener('bellavista_accounts_payable_updated', handleAccountUpdate);
    window.addEventListener('bellavista_accounts_payable_payments_updated', handleAccountUpdate);
    window.addEventListener('bellavista_invoices_updated', handleAccountUpdate);
    window.addEventListener('bellavista_purchases_updated', handleAccountUpdate);

    // 3. Periodic fallback poll every 20 seconds
    const intervalId = setInterval(() => {
      loadAllData(false);
    }, 20000);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearInterval(intervalId);

      if (supabase && channels.length > 0) {
        channels.forEach(ch => {
          try {
            supabase.removeChannel(ch);
          } catch (e) {}
        });
      }

      window.removeEventListener('bellavista_bank_accounts_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_bank_transfers_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_accounts_receivable_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_accounts_receivable_payments_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_accounts_payable_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_accounts_payable_payments_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_invoices_updated', handleAccountUpdate);
      window.removeEventListener('bellavista_purchases_updated', handleAccountUpdate);
    };
  }, [loadAllData, debouncedReload]);

  const handleManualRefresh = () => {
    loadAllData(true);
    if (onRefreshData) onRefreshData();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* ── HEADER HERO / TITLE BAR ── */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1D3557] flex items-center justify-center text-white shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Reportes de Cuentas
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                  Módulo Oficial
                </span>
                {/* Cloud Connection Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Supabase en la Nube (Tiempo Real)</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Auditoría financiera, estados de cuenta bancarios, cuentas por cobrar (CxC) y cuentas por pagar (CxP).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Last sync time badge */}
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 font-medium px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200/60">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span>Sincronizado: {lastSyncTime}</span>
            </div>

            {/* Tasa BCV Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs font-black text-emerald-800">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tasa BCV: Bs. {Number(bcvRate || getCachedCurrencyRates().VES).toFixed(2)}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-all cursor-pointer shadow-xs"
              title="Refrescar y sincronizar datos en tiempo real desde Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#1D3557] ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Sincronizando...' : 'Sincronizar Datos'}
            </button>
          </div>
        </div>

        {/* ── 3 PRIMARY TABS SWITCHER ── */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap gap-2">
          {/* TAB 1: BANCOS */}
          <button
            onClick={() => setActiveTab('bancos')}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'bancos'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Landmark className={`w-4 h-4 ${activeTab === 'bancos' ? 'text-amber-300' : 'text-slate-500'}`} />
            1. Estado de Cuenta Bancaria Detallada
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'bancos' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {bankAccounts.length} cuentas
            </span>
          </button>

          {/* TAB 2: CUENTAS POR COBRAR */}
          <button
            onClick={() => setActiveTab('cxc')}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'cxc'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Users className={`w-4 h-4 ${activeTab === 'cxc' ? 'text-emerald-300' : 'text-slate-500'}`} />
            2. Cuentas por Cobrar (CxC)
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'cxc' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {accountsReceivable.length} créditos
            </span>
          </button>

          {/* TAB 3: CUENTAS POR PAGAR */}
          <button
            onClick={() => setActiveTab('cxp')}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'cxp'
                ? 'bg-[#1D3557] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Building2 className={`w-4 h-4 ${activeTab === 'cxp' ? 'text-rose-300' : 'text-slate-500'}`} />
            3. Cuentas por Pagar (CxP)
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'cxp' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {accountsPayable.length} facturas
            </span>
          </button>
        </div>
      </div>

      {/* ── ACTIVE TAB VIEW ── */}
      {activeTab === 'bancos' && (
        <ReporteBancosTab
          bankAccounts={bankAccounts}
          bankTransfers={bankTransfers}
          bcvRate={bcvRate}
          businessProfile={businessProfile}
          onRefresh={handleManualRefresh}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'cxc' && (
        <ReporteCxCTab
          receivables={accountsReceivable}
          payments={accountsReceivablePayments}
          bcvRate={bcvRate}
          businessProfile={businessProfile}
          onRefresh={handleManualRefresh}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'cxp' && (
        <ReporteCxPTab
          payables={accountsPayable}
          payments={accountsPayablePayments}
          bcvRate={bcvRate}
          businessProfile={businessProfile}
          onRefresh={handleManualRefresh}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
