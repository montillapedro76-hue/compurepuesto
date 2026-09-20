/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, Lock, Unlock, ShieldCheck, Activity, Settings, Coins, Megaphone, 
  Save, Printer, Clock, Truck, FileText, Sliders, Bell, Volume2, 
  Trash2, Plus, Search, Image as ImageIcon, FileCheck, Check, AlertTriangle, 
  HelpCircle, Sparkles, Code, Copy, LayoutDashboard, Database,
  Building2, Monitor, Edit2, X, CheckCircle2, Power, MapPin, Phone, Globe, Mail,
  GripVertical, ChevronUp, ChevronDown, Layers, BarChart2, RefreshCw, Download,
  CreditCard, Smartphone, Banknote, Landmark, QrCode, ToggleLeft, ToggleRight,
  Edit3, UserCheck, Percent
} from 'lucide-react';
import { StoreUser, Tax, BannerSlide, LandingConfig, HomeCarouselCardItem, BusinessProfile, BusinessBranch, BusinessTerminal, ReportModuleConfig, PaymentMethodConfig, BankAccount, SystemCurrency } from '../types.ts';
import { dbService, supabase } from '../lib/supabase.ts';
import { playCashRegisterSound, playLowStockBeep } from '../lib/soundEffects.ts';
import { useI18n, LanguageCode, ThemeCode, setStoredLanguage, applyTheme, getStoredLanguage, getStoredTheme } from '../lib/i18n.ts';
import { CurrencyCode, CURRENCIES, DEFAULT_RATES, formatCurrency, saveCurrency, getCachedCurrencyRates } from '../lib/currency.ts';

interface SystemConfigPanelProps {
  currentUser: StoreUser | null;
  activeCurrency?: CurrencyCode;
  onCurrencyChange?: (currency: CurrencyCode) => void;
  currencyRates?: Record<CurrencyCode, number>;
  onUpdateCurrencyRate: (code: string, rate: number) => Promise<void>;
  bcvInputValue: string;
  setBcvInputValue: (val: string) => void;
  adminTaxes: Tax[];
  loadAdminTaxes: () => Promise<void>;
  configStoreName: string;
  setConfigStoreName: (val: string) => void;
  configRif: string;
  setConfigRif: (val: string) => void;
  configIva: number;
  setConfigIva: (val: number) => void;
  configPhone: string;
  setConfigPhone: (val: string) => void;
  initialSubTab?: 'mi_cuenta' | 'mi_negocio' | 'usuarios_asociados' | 'facturacion' | 'inventario' | 'impresion' | 'dashboard' | 'notificaciones' | 'planes_suscripcion' | 'mantenimiento';
  activeSubTab?: 'mi_cuenta' | 'mi_negocio' | 'usuarios_asociados' | 'facturacion' | 'inventario' | 'impresion' | 'dashboard' | 'notificaciones' | 'planes_suscripcion' | 'mantenimiento';
  hideInternalTabs?: boolean;
  storeUsers?: StoreUser[];
  loadingUsers?: boolean;
  fetchStoreUsers?: () => Promise<void>;
  lastStoreUsersSync?: string | null;
  handleToggleStoreUserStatus?: (userId: string, currentStatus: boolean) => Promise<void>;
  handleOpenPermissionsModal?: (user: StoreUser) => void;
  setEditingUserId?: (id: string | null) => void;
  setUserFormName?: (name: string) => void;
  setUserFormEmail?: (email: string) => void;
  setUserFormPassword?: (pwd: string) => void;
  setUserFormRole?: (role: string) => void;
  setUserFormError?: (error: string) => void;
  setShowUserModal?: (show: boolean) => void;
  handleDeleteStoreUser?: (userId: string, name: string, email?: string) => any;
}

export const SystemConfigPanel: React.FC<SystemConfigPanelProps> = ({
  currentUser,
  activeCurrency = 'USD',
  onCurrencyChange,
  currencyRates = DEFAULT_RATES,
  onUpdateCurrencyRate,
  bcvInputValue,
  setBcvInputValue,
  adminTaxes,
  loadAdminTaxes,
  configStoreName,
  setConfigStoreName,
  configRif,
  setConfigRif,
  configIva,
  setConfigIva,
  configPhone,
  setConfigPhone,
  initialSubTab,
  activeSubTab,
  hideInternalTabs = false,
  storeUsers = [],
  loadingUsers = false,
  fetchStoreUsers,
  lastStoreUsersSync,
  handleToggleStoreUserStatus,
  handleOpenPermissionsModal,
  setEditingUserId,
  setUserFormName,
  setUserFormEmail,
  setUserFormPassword,
  setUserFormRole,
  setUserFormError,
  setShowUserModal,
  handleDeleteStoreUser
}) => {
  // ⚙️ SUB-TABS INTERNOS DE CONFIGURACIÓN
  const { t, lang, theme, setLang: setGlobalLang } = useI18n();
  const [configSubTab, setConfigSubTab] = useState<'mi_cuenta' | 'mi_negocio' | 'usuarios_asociados' | 'facturacion' | 'inventario' | 'impresion' | 'dashboard' | 'notificaciones' | 'planes_suscripcion' | 'mantenimiento'>(activeSubTab || initialSubTab || 'mi_negocio');

  useEffect(() => {
    if (activeSubTab) {
      setConfigSubTab(activeSubTab);
    } else if (initialSubTab) {
      setConfigSubTab(initialSubTab);
    }
  }, [activeSubTab, initialSubTab]);

  // 🧹 ESTADOS DE DEPURACIÓN / LIMPIEZA DE OPERACIONES
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleanConfirmText, setCleanConfirmText] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ success: boolean; details: Record<string, number | string> } | null>(null);

  // 💾 ESTADOS DE RESPALDO DE BASE DE DATOS
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupDownloadMsg, setBackupDownloadMsg] = useState<{ filename: string; timestamp: string; count: number } | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupModalData, setBackupModalData] = useState<{ filename: string; summary: Record<string, number>; jsonStr: string } | null>(null);
  const [copiedBackup, setCopiedBackup] = useState(false);

  const handleDownloadFullBackup = async () => {
    setIsExportingBackup(true);
    setCopiedBackup(false);
    try {
      const res = await dbService.downloadSystemBackup();
      const totalRecords = Object.values(res.summary).reduce((a, b) => a + b, 0);
      setBackupModalData({
        filename: res.filename,
        summary: res.summary,
        jsonStr: res.jsonStr
      });
      setBackupDownloadMsg({
        filename: res.filename,
        timestamp: new Date().toLocaleTimeString(),
        count: totalRecords
      });
      setShowBackupModal(true);
    } catch (err: any) {
      console.error("Backup trigger error:", err);
      alert('Error al generar respaldo del sistema: ' + (err?.message || err));
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleDirectDownloadAgain = () => {
    if (!backupModalData) return;
    try {
      const blob = new Blob([backupModalData.jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', backupModalData.filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch {}
      }, 1000);
    } catch (e) {
      const encodedData = 'data:application/json;charset=utf-8,' + encodeURIComponent(backupModalData.jsonStr);
      window.open(encodedData, '_blank');
    }
  };

  const handleCopyBackupToClipboard = async () => {
    if (!backupModalData?.jsonStr) return;
    try {
      await navigator.clipboard.writeText(backupModalData.jsonStr);
      setCopiedBackup(true);
      setTimeout(() => setCopiedBackup(false), 3000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = backupModalData.jsonStr;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedBackup(true);
      setTimeout(() => setCopiedBackup(false), 3000);
    }
  };

  const handleExecuteOperationalClean = async () => {
    setIsCleaning(true);
    try {
      const res = await dbService.cleanOperationalTransactions();
      setCleanResult(res);
      setShowCleanModal(false);
      setCleanConfirmText('');
    } catch (err: any) {
      alert('Error al limpiar bases de datos operacionales: ' + (err?.message || err));
    } finally {
      setIsCleaning(false);
    }
  };
  
  // 👤 1. MI CUENTA (Ajustes de Usuario)
  const [userPerfilNombre, setUserPerfilNombre] = useState<string>(currentUser?.name || '');
  const [userPerfilDoc, setUserPerfilDoc] = useState<string>(currentUser?.document || currentUser?.documento || '');
  const [userPerfilPhone, setUserPerfilPhone] = useState<string>(currentUser?.phone || currentUser?.telefono || '');
  const [userPerfilEmail, setUserPerfilEmail] = useState<string>(currentUser?.email || '');
  const [userPerfilPhoto, setUserPerfilPhoto] = useState<string>('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150');
  
  const [userPassword, setUserPassword] = useState<string>('');
  const [userNewPassword, setUserNewPassword] = useState<string>('');
  const [userConfirmPassword, setUserConfirmPassword] = useState<string>('');
  const [user2FA, setUser2FA] = useState<boolean>(false);
  const [userInterfaceLang, setUserInterfaceLang] = useState<LanguageCode>(getStoredLanguage);
  const [userInterfaceTheme, setUserInterfaceTheme] = useState<ThemeCode>(getStoredTheme);

  useEffect(() => {
    setUserInterfaceLang(lang);
    setUserInterfaceTheme(theme);
  }, [lang, theme]);
  const [activeSessions, setActiveSessions] = useState<any[]>([
    { id: '1', device: 'Chrome / Windows 11', ip: '190.142.34.8', active: true, date: 'Ahora mismo' },
    { id: '2', device: 'Safari / iPhone 13', ip: '186.24.112.50', active: false, date: 'Hace 3 horas' }
  ]);

  // 🏢 2. MI NEGOCIO (Parámetros Generales)
  const [businessLogo, setBusinessLogo] = useState<string>('');
  const [businessAddress, setBusinessAddress] = useState<string>(() => localStorage.getItem('business_address') || 'Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4');
  const [businessCity, setBusinessCity] = useState<string>(() => localStorage.getItem('business_city') || 'Barinitas');
  const [businessEmail, setBusinessEmail] = useState<string>(() => localStorage.getItem('business_email') || 'Fotocopiasfyp@gmail.com');
  const [businessBusinessType, setBusinessBusinessType] = useState<string>(() => localStorage.getItem('business_type') || 'Papelería y libros');
  const [businessWebsite, setBusinessWebsite] = useState<string>(() => localStorage.getItem('business_website') || 'https://copiasbellavista.vercel.app/');
  const [businessSlogan, setBusinessSlogan] = useState<string>('Equipando Tus Proyectos');
  const [businessSaaSPlan, setBusinessSaaSPlan] = useState<'gratuito' | 'basico' | 'pro' | 'enterprise'>('pro');
  const [businessBranches, setBusinessBranches] = useState<BusinessBranch[]>([
    { id: 'branch_main_barinitas', name: 'Tienda Bella Vista', code: 'SP-01', address: 'Carrera 6 entre calle 19 y 20, Barinitas, Edo. Barinas', phone: '+58 412-5043857', active: true },
    { id: 'branch_agua_dulce', name: 'Almacén Agua Dulce', code: 'SUC-02', address: 'Sector Agua Dulce, Barinitas, Edo. Barinas', phone: '+58 412-5043857', active: true },
    { id: 'branch_online', name: 'Tienda Online - Almacén', code: 'SUC-03', address: 'Barinitas, Edo. Barinas', phone: '+58 412-5043857', active: true }
  ]);
  const [businessCajas, setBusinessCajas] = useState<BusinessTerminal[]>([
    { id: 'term_main_01', name: 'Caja Principal (Mostrador)', code: 'C1', branch_id: 'branch_main_barinitas', active: true },
    { id: 'term_main_02', name: 'Caja Copias e Impresiones', code: 'C2', branch_id: 'branch_main_barinitas', active: true }
  ]);

  // Modal states for Branches & Terminals
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [editingBranch, setEditingBranch] = useState<Partial<BusinessBranch> | null>(null);
  const [showTerminalModal, setShowTerminalModal] = useState<boolean>(false);
  const [selectedBranchForTerminals, setSelectedBranchForTerminals] = useState<BusinessBranch | null>(null);
  const [editingTerminal, setEditingTerminal] = useState<Partial<BusinessTerminal> | null>(null);
  const [isSavingBusiness, setIsSavingBusiness] = useState<boolean>(false);

  // In-app Delete Confirmation Dialog states (avoids browser iframe confirm issues)
  const [branchToDelete, setBranchToDelete] = useState<BusinessBranch | null>(null);
  const [terminalToDelete, setTerminalToDelete] = useState<BusinessTerminal | null>(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState<boolean>(false);
  const [isDeletingTerminal, setIsDeletingTerminal] = useState<boolean>(false);

  // 💳 3. FACTURACIÓN Y TRANSACCIONES
  const [facturacionMultiCurrency, setFacturacionMultiCurrency] = useState<boolean>(true);
  const [facturacionMainCurrency, setFacturacionMainCurrency] = useState<CurrencyCode>(activeCurrency || 'VES');
  const [facturacionExchangeAuto, setFacturacionExchangeAuto] = useState<boolean>(false);
  const [facturacionExenciones, setFacturacionExenciones] = useState<string>('Servicios Educativos, Fotocopias Escolares');
  const [facturacionRetencionesISLR, setFacturacionRetencionesISLR] = useState<number>(2);
  const [facturacionRetencionesIGTF, setFacturacionRetencionesIGTF] = useState<number>(3);
  const [facturacionCorrelativoFactura, setFacturacionCorrelativoFactura] = useState<number>(1024);
  const [facturacionCorrelativoCotizacion, setFacturacionCorrelativoCotizacion] = useState<number>(350);
  const [facturacionCorrelativoTicket, setFacturacionCorrelativoTicket] = useState<number>(5412);
  const [newTaxName, setNewTaxName] = useState<string>('');
  const [newTaxRate, setNewTaxRate] = useState<string>('');
  const [taxMessage, setTaxMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [taxToDelete, setTaxToDelete] = useState<Tax | null>(null);
  const [isDeletingTax, setIsDeletingTax] = useState<boolean>(false);
  const [isSavingTax, setIsSavingTax] = useState<boolean>(false);

  // 💱 MONEDAS PRINCIPALES Y TASAS DE CAMBIO (REAL-TIME SUPABASE)
  const [systemCurrencies, setSystemCurrencies] = useState<SystemCurrency[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState<boolean>(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState<boolean>(false);
  const [editingCurrency, setEditingCurrency] = useState<SystemCurrency | null>(null);
  const [currencyToDelete, setCurrencyToDelete] = useState<SystemCurrency | null>(null);
  const [isDeletingCurrency, setIsDeletingCurrency] = useState<boolean>(false);
  const [isSavingCurrency, setIsSavingCurrency] = useState<boolean>(false);
  const [currencyActionSuccess, setCurrencyActionSuccess] = useState<string | null>(null);

  // Form state for creating/modifying currency
  const [currencyForm, setCurrencyForm] = useState<{
    code: string;
    name: string;
    symbol: string;
    rate: string;
    country_code: string;
    decimals: number;
    position: 'prefix' | 'suffix';
    is_active: boolean;
  }>({
    code: '',
    name: '',
    symbol: '$',
    rate: '1',
    country_code: 'US',
    decimals: 2,
    position: 'prefix',
    is_active: true
  });

  const [manualRates, setManualRates] = useState<Record<string, string>>({
    USD: '1.00',
    VES: currencyRates?.VES ? currencyRates.VES.toString() : (bcvInputValue || getCachedCurrencyRates().VES.toString()),
    EUR: currencyRates?.EUR ? currencyRates.EUR.toString() : '0.92',
    COP: currencyRates?.COP ? currencyRates.COP.toString() : '4100'
  });

  const [rateSavingStatus, setRateSavingStatus] = useState<Record<string, { loading?: boolean, message?: { type: 'success' | 'error', text: string } }>>({});
  const [isFetchingLiveBCV, setIsFetchingLiveBCV] = useState<boolean>(false);
  const [mainCurrencySuccessMsg, setMainCurrencySuccessMsg] = useState<string | null>(null);

  const loadSystemCurrencies = async () => {
    try {
      setLoadingCurrencies(true);
      const currencies = await dbService.getCurrencies();
      setSystemCurrencies(currencies || []);
      
      setManualRates(prev => {
        const next = { ...prev };
        currencies.forEach(c => {
          next[c.code] = c.rate.toString();
        });
        return next;
      });
    } catch (e) {
      console.error('Error loading currencies:', e);
    } finally {
      setLoadingCurrencies(false);
    }
  };

  useEffect(() => {
    loadSystemCurrencies();
    window.addEventListener('bellavista_currencies_updated', loadSystemCurrencies);

    let channel: any = null;
    if (supabase) {
      try {
        channel = supabase
          .channel('system_currencies_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'system_currencies' }, () => {
            loadSystemCurrencies();
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime subscription for currencies note:', err);
      }
    }

    return () => {
      window.removeEventListener('bellavista_currencies_updated', loadSystemCurrencies);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const sysConfig = localStorage.getItem('copias_bellavista_sys_config');
      if (sysConfig) {
        const parsed = JSON.parse(sysConfig);
        if (parsed.facturacionMainCurrency) {
          setFacturacionMainCurrency(parsed.facturacionMainCurrency);
        } else {
          setFacturacionMainCurrency('VES');
        }
      } else {
        setFacturacionMainCurrency('VES');
      }
    } catch (e) {
      setFacturacionMainCurrency('VES');
    }
  }, []);

  useEffect(() => {
    setManualRates(prev => ({
      ...prev,
      VES: currencyRates?.VES ? currencyRates.VES.toString() : (bcvInputValue || prev.VES || '842.2067'),
      EUR: currencyRates?.EUR ? currencyRates.EUR.toString() : (prev.EUR || '0.92'),
      COP: currencyRates?.COP ? currencyRates.COP.toString() : (prev.COP || '4100'),
    }));
  }, [currencyRates, bcvInputValue]);

  const handleSelectMainCurrency = (code: string) => {
    setFacturacionMainCurrency(code);
    if (onCurrencyChange) {
      onCurrencyChange(code as any);
    }
    window.dispatchEvent(new CustomEvent('bellavista_currency_changed', { detail: code }));

    setMainCurrencySuccessMsg(`¡Moneda principal cambiada a ${CURRENCIES[code]?.label || code}! Todos los precios del catálogo, vitrina, notas de entrega, facturación y pedidos operarán con esta divisa temporalmente.`);
    setTimeout(() => {
      setMainCurrencySuccessMsg(null);
    }, 4500);
  };

  const handleOpenCreateCurrency = () => {
    setEditingCurrency(null);
    setCurrencyForm({
      code: '',
      name: '',
      symbol: '$',
      rate: '1.00',
      country_code: 'US',
      decimals: 2,
      position: 'prefix',
      is_active: true
    });
    setShowCurrencyModal(true);
  };

  const handleOpenEditCurrency = (currency: SystemCurrency) => {
    setEditingCurrency(currency);
    setCurrencyForm({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      rate: (manualRates[currency.code] ?? currency.rate).toString(),
      country_code: currency.country_code || (currency.code === 'VES' ? 'VE' : currency.code === 'EUR' ? 'EU' : currency.code === 'COP' ? 'CO' : currency.code.slice(0, 2)),
      decimals: currency.decimals !== undefined ? currency.decimals : 2,
      position: currency.position || 'prefix',
      is_active: currency.is_active !== false
    });
    setShowCurrencyModal(true);
  };

  const handleSaveCurrencyModal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = currencyForm.code.trim().toUpperCase();
    if (!cleanCode) {
      alert('Por favor ingrese el código de la moneda (ej. USD, VES, EUR, BRL).');
      return;
    }
    if (!currencyForm.name.trim()) {
      alert('Por favor ingrese el nombre descriptivo de la moneda.');
      return;
    }
    const parsedRate = parseFloat(currencyForm.rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      alert('Por favor ingrese una tasa de cambio numérica válida mayor a 0.');
      return;
    }

    try {
      setIsSavingCurrency(true);
      const saved = await dbService.saveCurrency({
        id: editingCurrency ? editingCurrency.id : undefined,
        code: cleanCode,
        name: currencyForm.name.trim(),
        symbol: currencyForm.symbol.trim() || '$',
        rate: parsedRate,
        country_code: currencyForm.country_code.trim().toUpperCase() || cleanCode.slice(0, 2),
        decimals: Number(currencyForm.decimals),
        position: currencyForm.position,
        is_active: currencyForm.is_active
      }, currentUser?.name || 'Administrador');

      if (cleanCode === 'VES') {
        setBcvInputValue(parsedRate.toString());
      }
      try {
        await onUpdateCurrencyRate(cleanCode, parsedRate);
      } catch (rateErr) {
        console.warn('onUpdateCurrencyRate exception:', rateErr);
      }

      // Immediately update local state so the new/modified currency displays without delay
      setSystemCurrencies(prev => {
        const idx = prev.findIndex(c => c.code === saved.code);
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        }
        return [...prev, saved];
      });

      setManualRates(prev => ({
        ...prev,
        [saved.code]: saved.rate.toString()
      }));

      setShowCurrencyModal(false);
      setEditingCurrency(null);
      await loadSystemCurrencies();

      setCurrencyActionSuccess(`¡Moneda ${saved.code} (${saved.name}) guardada con éxito!`);
      setTimeout(() => setCurrencyActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error saving currency in modal:', err);
      alert('Error al guardar la moneda: ' + (err?.message || 'Error de conexión'));
    } finally {
      setIsSavingCurrency(false);
    }
  };

  const handleDeleteCurrencyConfirm = async () => {
    if (!currencyToDelete) return;
    if (currencyToDelete.code === 'USD') {
      alert('No es posible eliminar el Dólar (USD) ya que es la divisa base del sistema.');
      setCurrencyToDelete(null);
      return;
    }
    try {
      setIsDeletingCurrency(true);
      await dbService.deleteCurrency(currencyToDelete.id || currencyToDelete.code);
      setCurrencyToDelete(null);
      await loadSystemCurrencies();
      setCurrencyActionSuccess(`Moneda ${currencyToDelete.code} eliminada.`);
      setTimeout(() => setCurrencyActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error deleting currency:', err);
      alert('Error al eliminar moneda: ' + (err?.message || 'Error'));
    } finally {
      setIsDeletingCurrency(false);
    }
  };

  const handleSaveManualRate = async (code: string) => {
    const rawVal = manualRates[code];
    const val = parseFloat(rawVal);
    if (isNaN(val) || val <= 0) {
      setRateSavingStatus(prev => ({
        ...prev,
        [code]: {
          loading: false,
          message: { type: 'error', text: 'Por favor ingrese un valor numérico válido mayor a 0.' }
        }
      }));
      return;
    }

    try {
      setRateSavingStatus(prev => ({
        ...prev,
        [code]: { loading: true, message: undefined }
      }));

      // Find existing currency config or fallback
      const existing = systemCurrencies.find(c => c.code === code);
      if (existing) {
        await dbService.saveCurrency({
          ...existing,
          rate: val
        }, currentUser?.name || 'Administrador');
      } else {
        await onUpdateCurrencyRate(code, val);
      }

      if (code === 'VES') {
        setBcvInputValue(val.toString());
      }

      setRateSavingStatus(prev => ({
        ...prev,
        [code]: {
          loading: false,
          message: {
            type: 'success',
            text: `Tasa ${code} guardada en el sistema: ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}.`
          }
        }
      }));

      setTimeout(() => {
        setRateSavingStatus(prev => ({
          ...prev,
          [code]: { loading: false, message: undefined }
        }));
      }, 4000);
    } catch (err: any) {
      console.error(`Error updating rate for ${code}:`, err);
      setRateSavingStatus(prev => ({
        ...prev,
        [code]: {
          loading: false,
          message: { type: 'error', text: 'No se pudo guardar la tasa. Verifique su conexión.' }
        }
      }));
    }
  };

  const handleFetchLiveBCVRate = async () => {
    setIsFetchingLiveBCV(true);
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (!res.ok) throw new Error('Error al consultar DolarAPI');
      const data = await res.json();
      if (Array.isArray(data)) {
        const oficial = data.find((item: any) => item && item.fuente === 'oficial');
        if (oficial && typeof oficial.promedio === 'number') {
          const liveRate = oficial.promedio;
          setManualRates(prev => ({ ...prev, VES: liveRate.toString() }));
          setBcvInputValue(liveRate.toString());
          await onUpdateCurrencyRate('VES', liveRate);
          setRateSavingStatus(prev => ({
            ...prev,
            VES: {
              loading: false,
              message: {
                type: 'success',
                text: `Tasa oficial BCV obtenida en vivo (Bs. ${liveRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}) y guardada en el sistema.`
              }
            }
          }));
          setTimeout(() => {
            setRateSavingStatus(prev => ({
              ...prev,
              VES: { loading: false, message: undefined }
            }));
          }, 4500);
        } else {
          throw new Error('Formato de tasa no reconocido');
        }
      }
    } catch (err: any) {
      setRateSavingStatus(prev => ({
        ...prev,
        VES: {
          loading: false,
          message: {
            type: 'error',
            text: 'No se pudo consultar la API en línea. Puede ingresar la tasa manualmente en el campo.'
          }
        }
      }));
    } finally {
      setIsFetchingLiveBCV(false);
    }
  };

  // 💳 MÉTODOS DE PAGO Y CUENTAS BANCARIAS (CONFIGURACIÓN GLOBAL Y EN TIEMPO REAL)
  const [paymentMethodsList, setPaymentMethodsList] = useState<PaymentMethodConfig[]>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState<boolean>(true);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState<boolean>(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState<boolean>(false);
  const [showEditSingleModal, setShowEditSingleModal] = useState<boolean>(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<Partial<PaymentMethodConfig> | null>(null);
  const [paymentMethodToDelete, setPaymentMethodToDelete] = useState<PaymentMethodConfig | null>(null);
  const [paymentMethodMsg, setPaymentMethodMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for "Registrar nuevo método de pago" in the "Métodos de Pago del Sistema" modal
  const [mgrNewName, setMgrNewName] = useState<string>('');
  const [mgrNewCurrency, setMgrNewCurrency] = useState<'VES' | 'USD'>('VES');
  const [mgrNewType, setMgrNewType] = useState<'movil' | 'efectivo' | 'transferencia' | 'punto' | 'digital' | 'otro'>('movil');
  const [mgrTargetAccountId, setMgrTargetAccountId] = useState<string>('');
  const [isRegisteringMethod, setIsRegisteringMethod] = useState<boolean>(false);

  const loadPaymentMethods = async () => {
    try {
      setLoadingPaymentMethods(true);
      const methods = await dbService.getPaymentMethods();
      setPaymentMethodsList(methods || []);
    } catch (err) {
      console.error('Error loading payment methods:', err);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  const loadBankAccounts = async () => {
    try {
      setLoadingBankAccounts(true);
      const accs = await dbService.getBankAccounts();
      setBankAccounts(accs || []);
    } catch (err) {
      console.error('Error loading bank accounts:', err);
    } finally {
      setLoadingBankAccounts(false);
    }
  };

  useEffect(() => {
    loadPaymentMethods();
    loadBankAccounts();
    const handlePmUpdated = () => {
      loadPaymentMethods();
      loadBankAccounts();
    };
    window.addEventListener('bellavista_payment_methods_updated', handlePmUpdated);
    return () => {
      window.removeEventListener('bellavista_payment_methods_updated', handlePmUpdated);
    };
  }, []);

  // Helper to determine if a method is bound to an account and get the account name
  const getMethodBoundAccount = (pm: PaymentMethodConfig) => {
    // 1. Direct ID match
    if (pm.bank_account_id) {
      const acc = bankAccounts.find(a => a.id === pm.bank_account_id);
      if (acc) return { isBound: true, accountName: acc.name, accountId: acc.id };
    }
    // 2. Direct name match
    if (pm.bank_account_name) {
      return { isBound: true, accountName: pm.bank_account_name, accountId: pm.bank_account_id || '' };
    }
    // 3. Check JSON notes in accounts
    for (const acc of bankAccounts) {
      if (acc.notes) {
        try {
          const parsed = JSON.parse(acc.notes);
          if (Array.isArray(parsed)) {
            const found = parsed.find((m: any) => 
              (m.id && m.id === pm.id) || 
              (m.code && m.code === pm.code) || 
              (m.name && m.name.trim().toLowerCase() === pm.name.trim().toLowerCase())
            );
            if (found) {
              return { isBound: true, accountName: acc.name, accountId: acc.id };
            }
          }
        } catch (e) {}
      }
      // Or matches default system names (e.g. Efectivo Bolivares / Efectivo Dolares)
      if (
        (pm.type === 'efectivo' || pm.name.toLowerCase().includes('efectivo')) &&
        ((pm.currency === 'VES' && acc.currency === 'VES' && acc.name.toLowerCase().includes('efectivo')) ||
         (pm.currency === 'USD' && acc.currency === 'USD' && acc.name.toLowerCase().includes('efectivo')))
      ) {
        return { isBound: true, accountName: acc.name, accountId: acc.id };
      }
    }
    return { isBound: false, accountName: '', accountId: '' };
  };

  const handleOpenAddPaymentMethod = () => {
    setMgrNewName('');
    setMgrNewCurrency('VES');
    setMgrNewType('movil');
    setMgrTargetAccountId('');
    setShowPaymentMethodModal(true);
    loadBankAccounts();
    loadPaymentMethods();
  };

  const handleCreateManagerPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgrNewName.trim()) {
      setPaymentMethodMsg({ type: 'error', text: 'El nombre del método de cobro es obligatorio.' });
      return;
    }

    setIsRegisteringMethod(true);
    const newId = `pm-${Date.now()}`;
    const targetAcc = bankAccounts.find(a => a.id === mgrTargetAccountId);

    const newPm: PaymentMethodConfig = {
      id: newId,
      code: mgrNewName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      name: mgrNewName.trim(),
      currency: mgrNewCurrency,
      type: mgrNewType as any,
      is_active: true,
      requires_reference: mgrNewType !== 'efectivo',
      allow_pos: true,
      allow_online: true,
      bank_account_id: targetAcc?.id || undefined,
      bank_account_name: targetAcc?.name || undefined,
      incoming_commission: 0,
      outgoing_commission: 0,
      sort_order: paymentMethodsList.length + 1
    };

    try {
      await dbService.savePaymentMethod(newPm);

      // If an account was assigned, also update that account's notes
      if (targetAcc) {
        let existingMethods: any[] = [];
        if (targetAcc.notes) {
          try {
            const parsed = JSON.parse(targetAcc.notes);
            if (Array.isArray(parsed)) existingMethods = parsed;
          } catch (e) {}
        }
        const updated = [
          ...existingMethods,
          {
            id: newId,
            code: newPm.code,
            name: newPm.name,
            currency: newPm.currency,
            type: newPm.type,
            incomingCommission: 0,
            outgoingCommission: 0
          }
        ];
        await dbService.saveBankAccount({
          ...targetAcc,
          notes: JSON.stringify(updated)
        });
      }

      setPaymentMethodMsg({ type: 'success', text: `Método "${newPm.name}" registrado en el sistema exitosamente.` });
      setMgrNewName('');
      setMgrTargetAccountId('');
      await loadPaymentMethods();
      await loadBankAccounts();
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
      setTimeout(() => setPaymentMethodMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      setPaymentMethodMsg({ type: 'error', text: err.message || 'Error al crear el método de pago.' });
    } finally {
      setIsRegisteringMethod(false);
    }
  };

  const handleOpenEditPaymentMethod = (pm: PaymentMethodConfig) => {
    setEditingPaymentMethod({ ...pm });
    setShowEditSingleModal(true);
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPaymentMethod || !editingPaymentMethod.name?.trim()) {
      setPaymentMethodMsg({ type: 'error', text: 'El nombre del método de pago es obligatorio.' });
      return;
    }
    try {
      await dbService.savePaymentMethod(editingPaymentMethod as PaymentMethodConfig);
      setShowEditSingleModal(false);
      setEditingPaymentMethod(null);
      setPaymentMethodMsg({ type: 'success', text: `Método de pago "${editingPaymentMethod.name}" guardado correctamente.` });
      await loadPaymentMethods();
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
      setTimeout(() => setPaymentMethodMsg(null), 3500);
    } catch (err: any) {
      setPaymentMethodMsg({ type: 'error', text: err.message || 'Error al guardar el método de pago.' });
    }
  };

  const handleTogglePaymentMethod = async (pm: PaymentMethodConfig) => {
    try {
      await dbService.savePaymentMethod({ ...pm, is_active: !pm.is_active });
      await loadPaymentMethods();
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
    } catch (err: any) {
      alert(`Error al cambiar estado: ${err.message}`);
    }
  };

  const confirmDeletePaymentMethod = async () => {
    if (!paymentMethodToDelete) return;
    try {
      await dbService.deletePaymentMethod(paymentMethodToDelete.id);
      setPaymentMethodToDelete(null);
      setPaymentMethodMsg({ type: 'success', text: `Método "${paymentMethodToDelete.name}" eliminado.` });
      await loadPaymentMethods();
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
      setTimeout(() => setPaymentMethodMsg(null), 3000);
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  // 📦 4. INVENTARIO Y CATÁLOGO
  const [inventarioLowStockThreshold, setInventarioLowStockThreshold] = useState<number>(5);
  const [inventarioBlockNoStockSale, setInventarioBlockNoStockSale] = useState<boolean>(false);
  const [inventarioVirtualLink, setInventarioVirtualLink] = useState<string>('https://bellavista.sistemapos.com/tienda');
  const [inventarioScheduleMonFri, setInventarioScheduleMonFri] = useState<string>('08:00 - 18:00');
  const [inventarioScheduleSat, setInventarioScheduleSat] = useState<string>('09:00 - 14:00');
  const [inventarioScheduleSun, setInventarioScheduleSun] = useState<string>('Cerrado');
  const [inventarioHideOutOfStock, setInventarioHideOutOfStock] = useState<boolean>(false);
  const [inventarioGlobalUnits, setInventarioGlobalUnits] = useState<string[]>(['Unidades', 'Metros', 'Kilos', 'Servicios', 'Resmas']);
  const [newGlobalUnit, setNewGlobalUnit] = useState<string>('');

  // 📢 PUBLICIDAD COMPATIBILITY INSIDE INVENTORY TAB
  const [adSubTab, setAdSubTab] = useState<'banner' | 'carrusel' | 'landing'>('banner');
  const [bannerSlidesList, setBannerSlidesList] = useState<BannerSlide[]>([]);
  const [homeCarouselCardsList, setHomeCarouselCardsList] = useState<HomeCarouselCardItem[]>([]);
  const [landingConfigState, setLandingConfigState] = useState<LandingConfig>({
    is_active: true,
    title: '¡Novedad Dulce! Tres Leches Especial Gourmet',
    subtitle: 'Disfruta de nuestra exquisita torta Tres Leches artesanal preparada con la receta original Bella Vista.',
    badge: '🍰 Novedad Especial',
    image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=600&h=400',
    button_text: 'Explorar Colección Gourmet'
  });
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Partial<BannerSlide> | null>(null);
  const [adSaveSuccessMsg, setAdSaveSuccessMsg] = useState<string | null>(null);

  // 🖨️ 5. IMPRESIÓN Y TICKET (Hardware)
  const [impresionTicketFormat, setImpresionTicketFormat] = useState<'80mm' | '58mm' | 'carta' | 'pdf'>('58mm');
  const [impresionGreeting, setImpresionGreeting] = useState<string>('¡Gracias por su compra en Bella Vista!');
  const [impresionWarranty, setImpresionWarranty] = useState<string>('Conserve su ticket para cambios dentro de las 48 horas.');
  const [impresionPrinterConnected, setImpresionPrinterConnected] = useState<boolean>(true);
  const [impresionTriggerDrawer, setImpresionTriggerDrawer] = useState<boolean>(true);
  const [isScanningPrinters, setIsScanningPrinters] = useState<boolean>(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<string[]>([]);

  // 📊 6. PANEL Y ESTADÍSTICAS
  const [dashboardShowProfits, setDashboardShowProfits] = useState<boolean>(true);
  const [dashboardShowSales, setDashboardShowSales] = useState<boolean>(true);
  const [dashboardShowExpenses, setDashboardShowExpenses] = useState<boolean>(true);
  const [dashboardShowEmployeeSales, setDashboardShowEmployeeSales] = useState<boolean>(true);
  const [dashboardEmailReports, setDashboardEmailReports] = useState<'ninguno' | 'diario' | 'semanal' | 'mensual'>('diario');
  const [dashboardEmailReportsAddress, setDashboardEmailReportsAddress] = useState<string>('administracion@bellavista.com');

  // Local state for Reportes "Tu Gestión" modules configuration
  const [reportConfigs, setReportConfigs] = useState<ReportModuleConfig[]>([]);
  const [loadingReportConfigs, setLoadingReportConfigs] = useState<boolean>(true);
  const [savingReportConfigs, setSavingReportConfigs] = useState<boolean>(false);
  const [reportConfigSuccessMsg, setReportConfigSuccessMsg] = useState<string | null>(null);
  const [draggedConfigIndex, setDraggedConfigIndex] = useState<number | null>(null);

  const loadReportConfigs = async () => {
    try {
      setLoadingReportConfigs(true);
      const configs = await dbService.getReportModulesConfig();
      setReportConfigs(configs);
    } catch (err) {
      console.error("Error loading report configs in SystemConfigPanel:", err);
    } finally {
      setLoadingReportConfigs(false);
    }
  };

  useEffect(() => {
    loadReportConfigs();
    const handleUpdate = () => loadReportConfigs();
    window.addEventListener('bellavista_report_modules_updated', handleUpdate);
    return () => {
      window.removeEventListener('bellavista_report_modules_updated', handleUpdate);
    };
  }, []);

  const moveReportItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= reportConfigs.length) return;

    const updated = [...reportConfigs];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const sorted = updated.map((item, idx) => ({ ...item, sort_order: idx + 1 }));
    setReportConfigs(sorted);
  };

  const toggleReportItemActive = (id: string) => {
    const updated = reportConfigs.map(item => {
      if (item.id === id) {
        return { ...item, enabled: !item.enabled };
      }
      return item;
    });
    setReportConfigs(updated);
  };

  const handleDragStartConfig = (e: React.DragEvent, index: number) => {
    setDraggedConfigIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverConfig = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedConfigIndex === null || draggedConfigIndex === index) return;

    const updated = [...reportConfigs];
    const temp = updated[draggedConfigIndex];
    updated.splice(draggedConfigIndex, 1);
    updated.splice(index, 0, temp);

    setDraggedConfigIndex(index);
    setReportConfigs(updated.map((item, idx) => ({ ...item, sort_order: idx + 1 })));
  };

  const handleDragEndConfig = () => {
    setDraggedConfigIndex(null);
  };

  const handleSaveReportConfigs = async () => {
    try {
      setSavingReportConfigs(true);
      await dbService.saveReportModulesConfig(reportConfigs);
      setReportConfigSuccessMsg("¡Configuración del panel de gráficas guardada con éxito!");
      setTimeout(() => setReportConfigSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Error saving report configs:", err);
    } finally {
      setSavingReportConfigs(false);
    }
  };

  // 🔔 7. SISTEMA Y NOTIFICACIONES
  const [notifSoundOnSale, setNotifSoundOnSale] = useState<boolean>(true);
  const [notifAlertUnopenedCash, setNotifAlertUnopenedCash] = useState<boolean>(true);
  const [notifPushLowStock, setNotifPushLowStock] = useState<boolean>(true);
  const [notifPushDailyClose, setNotifPushDailyClose] = useState<boolean>(true);

  const [configSaved, setConfigSaved] = useState<boolean>(false);
  const [billingCycle, setBillingCycle] = useState<'mensual' | 'trimestral' | 'anual'>('mensual');
  const [selectedPlanId, setSelectedPlanId] = useState<'gratuito' | 'basico' | 'pro' | 'enterprise'>('pro');

  // LOAD VALUES ON MOUNT
  useEffect(() => {
    try {
      // 1. Load real Business Profile from Supabase / localStorage
      dbService.getBusinessProfile().then(p => {
        if (p) {
          if (p.name) setConfigStoreName(p.name);
          if (p.business_type) setBusinessBusinessType(p.business_type);
          if (p.address) setBusinessAddress(p.address);
          if (p.city) setBusinessCity(p.city);
          if (p.phone) setConfigPhone(p.phone);
          if (p.email) setBusinessEmail(p.email);
          if (p.rif) setConfigRif(p.rif);
          if (p.website) setBusinessWebsite(p.website);
          if (p.logo_url) setBusinessLogo(p.logo_url);
          if (p.slogan) setBusinessSlogan(p.slogan);
          if (p.saas_plan) {
            setBusinessSaaSPlan(p.saas_plan as any);
            setSelectedPlanId(p.saas_plan as any);
          }
        }
      });

      // 2. Load real Branches and Terminals
      dbService.getBusinessBranches().then(branches => {
        if (branches) setBusinessBranches(branches);
      });
      dbService.getBusinessTerminals().then(terminals => {
        if (terminals) setBusinessCajas(terminals);
      });

      const saved = localStorage.getItem('copias_bellavista_sys_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.userPerfilNombre) setUserPerfilNombre(parsed.userPerfilNombre);
        if (parsed.userPerfilDoc) setUserPerfilDoc(parsed.userPerfilDoc);
        if (parsed.userPerfilPhone) setUserPerfilPhone(parsed.userPerfilPhone);
        if (parsed.userPerfilEmail) setUserPerfilEmail(parsed.userPerfilEmail);
        if (parsed.userPerfilPhoto) setUserPerfilPhoto(parsed.userPerfilPhoto);
        if (parsed.user2FA !== undefined) setUser2FA(parsed.user2FA);
        if (parsed.userInterfaceLang) setUserInterfaceLang(parsed.userInterfaceLang);
        if (parsed.userInterfaceTheme) setUserInterfaceTheme(parsed.userInterfaceTheme);

        if (parsed.facturacionMultiCurrency !== undefined) setFacturacionMultiCurrency(parsed.facturacionMultiCurrency);
        if (parsed.facturacionMainCurrency) setFacturacionMainCurrency(parsed.facturacionMainCurrency);
        if (parsed.facturacionExchangeAuto !== undefined) setFacturacionExchangeAuto(parsed.facturacionExchangeAuto);
        if (parsed.facturacionExenciones) setFacturacionExenciones(parsed.facturacionExenciones);
        if (parsed.facturacionRetencionesISLR !== undefined) setFacturacionRetencionesISLR(parsed.facturacionRetencionesISLR);
        if (parsed.facturacionRetencionesIGTF !== undefined) setFacturacionRetencionesIGTF(parsed.facturacionRetencionesIGTF);
        if (parsed.facturacionCorrelativoFactura !== undefined) setFacturacionCorrelativoFactura(parsed.facturacionCorrelativoFactura);
        if (parsed.facturacionCorrelativoCotizacion !== undefined) setFacturacionCorrelativoCotizacion(parsed.facturacionCorrelativoCotizacion);
        if (parsed.facturacionCorrelativoTicket !== undefined) setFacturacionCorrelativoTicket(parsed.facturacionCorrelativoTicket);

        if (parsed.inventarioLowStockThreshold !== undefined) setInventarioLowStockThreshold(parsed.inventarioLowStockThreshold);
        if (parsed.inventarioBlockNoStockSale !== undefined) setInventarioBlockNoStockSale(parsed.inventarioBlockNoStockSale);
        if (parsed.inventarioVirtualLink) setInventarioVirtualLink(parsed.inventarioVirtualLink);
        if (parsed.inventarioScheduleMonFri) setInventarioScheduleMonFri(parsed.inventarioScheduleMonFri);
        if (parsed.inventarioScheduleSat) setInventarioScheduleSat(parsed.inventarioScheduleSat);
        if (parsed.inventarioScheduleSun) setInventarioScheduleSun(parsed.inventarioScheduleSun);
        if (parsed.inventarioHideOutOfStock !== undefined) setInventarioHideOutOfStock(parsed.inventarioHideOutOfStock);
        if (parsed.inventarioGlobalUnits) setInventarioGlobalUnits(parsed.inventarioGlobalUnits);

        if (parsed.impresionTicketFormat) setImpresionTicketFormat(parsed.impresionTicketFormat);
        if (parsed.impresionGreeting) setImpresionGreeting(parsed.impresionGreeting);
        if (parsed.impresionWarranty) setImpresionWarranty(parsed.impresionWarranty);
        if (parsed.impresionPrinterConnected !== undefined) setImpresionPrinterConnected(parsed.impresionPrinterConnected);
        if (parsed.impresionTriggerDrawer !== undefined) setImpresionTriggerDrawer(parsed.impresionTriggerDrawer);

        if (parsed.dashboardShowProfits !== undefined) setDashboardShowProfits(parsed.dashboardShowProfits);
        if (parsed.dashboardShowSales !== undefined) setDashboardShowSales(parsed.dashboardShowSales);
        if (parsed.dashboardShowExpenses !== undefined) setDashboardShowExpenses(parsed.dashboardShowExpenses);
        if (parsed.dashboardShowEmployeeSales !== undefined) setDashboardShowEmployeeSales(parsed.dashboardShowEmployeeSales);
        if (parsed.dashboardEmailReports) setDashboardEmailReports(parsed.dashboardEmailReports);
        if (parsed.dashboardEmailReportsAddress) setDashboardEmailReportsAddress(parsed.dashboardEmailReportsAddress);

        if (parsed.notifSoundOnSale !== undefined) setNotifSoundOnSale(parsed.notifSoundOnSale);
        if (parsed.notifAlertUnopenedCash !== undefined) setNotifAlertUnopenedCash(parsed.notifAlertUnopenedCash);
        if (parsed.notifPushLowStock !== undefined) setNotifPushLowStock(parsed.notifPushLowStock);
        if (parsed.notifPushDailyClose !== undefined) setNotifPushDailyClose(parsed.notifPushDailyClose);
      } else if (currentUser) {
        setUserPerfilNombre(currentUser.name || '');
        setUserPerfilEmail(currentUser.email || '');
        setUserPerfilPhone(currentUser.phone || currentUser.telefono || '');
        setUserPerfilDoc(currentUser.document || currentUser.documento || '');
      }

      // Load marketing/publicidad lists
      dbService.getBannerSlides().then(slides => setBannerSlidesList(slides || []));
      dbService.getLandingConfig().then(cfg => {
        if (cfg) setLandingConfigState(cfg);
      });
      dbService.getHomeCarouselCards().then(cards => setHomeCarouselCardsList(cards || []));
    } catch (e) {
      console.error("Error loading config inside SystemConfigPanel:", e);
    }
  }, [currentUser]);

  // SAVE CORE CONFIG ROUTINE
  const handleSaveAll = async () => {
    setIsSavingBusiness(true);
    const payload = {
      userPerfilNombre,
      userPerfilDoc,
      userPerfilPhone,
      userPerfilEmail,
      userPerfilPhoto,
      user2FA,
      userInterfaceLang,
      userInterfaceTheme,
      businessLogo,
      businessAddress,
      businessCity,
      businessEmail,
      businessBusinessType,
      businessWebsite,
      businessSlogan,
      businessSaaSPlan,
      businessBranches,
      businessCajas,
      configStoreName,
      configRif,
      configIva,
      configPhone,
      facturacionMultiCurrency,
      facturacionMainCurrency,
      facturacionExchangeAuto,
      facturacionExenciones,
      facturacionRetencionesISLR,
      facturacionRetencionesIGTF,
      facturacionCorrelativoFactura,
      facturacionCorrelativoCotizacion,
      facturacionCorrelativoTicket,
      inventarioLowStockThreshold,
      inventarioBlockNoStockSale,
      inventarioVirtualLink,
      inventarioScheduleMonFri,
      inventarioScheduleSat,
      inventarioScheduleSun,
      inventarioHideOutOfStock,
      inventarioGlobalUnits,
      impresionTicketFormat,
      impresionGreeting,
      impresionWarranty,
      impresionPrinterConnected,
      impresionTriggerDrawer,
      dashboardShowProfits,
      dashboardShowSales,
      dashboardShowExpenses,
      dashboardShowEmployeeSales,
      dashboardEmailReports,
      dashboardEmailReportsAddress,
      notifSoundOnSale,
      notifAlertUnopenedCash,
      notifPushLowStock,
      notifPushDailyClose
    };

    // Save locally
    localStorage.setItem('copias_bellavista_sys_config', JSON.stringify(payload));
    setStoredLanguage(userInterfaceLang);
    applyTheme(userInterfaceTheme);
    localStorage.setItem('copias_bellavista_sound_on_sale', String(notifSoundOnSale));
    localStorage.setItem('copias_bellavista_push_low_stock', String(notifPushLowStock));
    localStorage.setItem('copias_bellavista_block_no_stock_sale', String(inventarioBlockNoStockSale));
    localStorage.setItem('business_address', businessAddress);
    localStorage.setItem('business_city', businessCity);
    localStorage.setItem('business_email', businessEmail);
    localStorage.setItem('business_type', businessBusinessType);
    localStorage.setItem('business_website', businessWebsite);

    // Apply properties to parent states
    setConfigStoreName(configStoreName);
    setConfigRif(configRif);
    setConfigIva(configIva);
    setConfigPhone(configPhone);

    // 🌟 Save real Business Profile and Report Modules Config to Supabase
    try {
      if (reportConfigs && reportConfigs.length > 0) {
        await dbService.saveReportModulesConfig(reportConfigs);
      }
      await dbService.saveBusinessProfile({
        name: configStoreName,
        business_type: businessBusinessType,
        address: businessAddress,
        city: businessCity,
        phone: configPhone,
        email: businessEmail,
        rif: configRif,
        website: businessWebsite,
        logo_url: businessLogo,
        slogan: businessSlogan,
        saas_plan: businessSaaSPlan
      });
    } catch (e) {
      console.warn("dbService saveBusinessProfile/reportConfigs error:", e);
    }

    // Sync generic app_config as well
    const { supabase } = dbService as any;
    try {
      if (supabase) {
        await supabase.from('app_config').upsert({
          key: 'sys_config',
          value: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      }
    } catch (e) {
      console.warn("Supabase configs upsert failed:", e);
    }

    // Dispatch events
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
    window.dispatchEvent(new CustomEvent('bellavista_theme_updated'));

    setIsSavingBusiness(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 4000);
    alert('¡Información del negocio y ajustes del sistema guardados exitosamente!');
  };

  // 📍 BRANCH CRUD METHODS
  const handleSaveBranch = async (branchData: Partial<BusinessBranch>) => {
    if (!branchData.name?.trim() || !branchData.code?.trim()) {
      alert('Por favor ingrese el código y nombre de la sede.');
      return;
    }
    const id = branchData.id || `branch_${Date.now()}`;
    const branchToSave: BusinessBranch = {
      id,
      code: branchData.code.trim().toUpperCase(),
      name: branchData.name.trim(),
      address: branchData.address || '',
      phone: branchData.phone || '',
      active: branchData.active !== undefined ? branchData.active : true,
      created_at: branchData.created_at || new Date().toISOString()
    };

    try {
      await dbService.saveBusinessBranch(branchToSave);
      const updated = await dbService.getBusinessBranches();
      setBusinessBranches(updated);
      setShowBranchModal(false);
      setEditingBranch(null);
    } catch (err: any) {
      console.warn('Error al guardar sede:', err);
    }
  };

  const confirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeletingBranch(true);
    const targetId = branchToDelete.id;
    try {
      // Optimistic update
      setBusinessBranches(prev => prev.filter(b => b.id !== targetId));
      setBusinessCajas(prev => prev.filter(t => t.branch_id !== targetId));
      
      await dbService.deleteBusinessBranch(targetId);
      const updatedBranches = await dbService.getBusinessBranches();
      setBusinessBranches(updatedBranches);
      const updatedTerminals = await dbService.getBusinessTerminals();
      setBusinessCajas(updatedTerminals);
      if (selectedBranchForTerminals?.id === targetId) {
        setShowTerminalModal(false);
        setSelectedBranchForTerminals(null);
      }
    } catch (err: any) {
      console.warn('Error al eliminar sede de Supabase:', err);
    } finally {
      setIsDeletingBranch(false);
      setBranchToDelete(null);
    }
  };

  // 💻 TERMINAL CRUD METHODS
  const handleSaveTerminal = async (terminalData: Partial<BusinessTerminal>) => {
    if (!terminalData.name?.trim() || !terminalData.code?.trim() || !terminalData.branch_id) {
      alert('Por favor ingrese el código, nombre y asigne una sede a la caja.');
      return;
    }
    const id = terminalData.id || `term_${Date.now()}`;
    const terminalToSave: BusinessTerminal = {
      id,
      branch_id: terminalData.branch_id,
      code: terminalData.code.trim().toUpperCase(),
      name: terminalData.name.trim(),
      active: terminalData.active !== undefined ? terminalData.active : true,
      created_at: terminalData.created_at || new Date().toISOString()
    };

    try {
      await dbService.saveBusinessTerminal(terminalToSave);
      const updated = await dbService.getBusinessTerminals();
      setBusinessCajas(updated);
      setEditingTerminal(null);
    } catch (err: any) {
      console.warn('Error al guardar terminal:', err);
    }
  };

  const confirmDeleteTerminal = async () => {
    if (!terminalToDelete) return;
    setIsDeletingTerminal(true);
    const targetId = terminalToDelete.id;
    try {
      // Optimistic update
      setBusinessCajas(prev => prev.filter(c => c.id !== targetId));
      
      await dbService.deleteBusinessTerminal(targetId);
      const updated = await dbService.getBusinessTerminals();
      setBusinessCajas(updated);
    } catch (err: any) {
      console.warn('Error al eliminar terminal de Supabase:', err);
    } finally {
      setIsDeletingTerminal(false);
      setTerminalToDelete(null);
    }
  };

  // 🏷️ TAX MANAGEMENT HANDLERS (SUPABASE REAL-TIME COMPATIBLE)
  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateVal = parseFloat(newTaxRate);
    if (!newTaxName.trim() || isNaN(rateVal) || rateVal < 0) {
      setTaxMessage({ type: 'error', text: 'Por favor ingrese un nombre y porcentaje válido (ej: IVA General, 16).' });
      return;
    }
    try {
      await dbService.saveTax({ name: newTaxName.trim(), rate: rateVal, is_active: true });
      setNewTaxName('');
      setNewTaxRate('');
      setTaxMessage({ type: 'success', text: `Impuesto "${newTaxName.trim()}" registrado y sincronizado exitosamente.` });
      await loadAdminTaxes();
      setTimeout(() => setTaxMessage(null), 3500);
    } catch (err: any) {
      setTaxMessage({ type: 'error', text: err.message || 'Error al registrar el impuesto.' });
    }
  };

  const handleSaveEditedTax = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTax) return;
    const rateVal = parseFloat(editingTax.rate.toString());
    if (!editingTax.name.trim() || isNaN(rateVal) || rateVal < 0) {
      setTaxMessage({ type: 'error', text: 'Nombre y porcentaje de impuesto requeridos.' });
      return;
    }
    setIsSavingTax(true);
    try {
      await dbService.saveTax({
        id: editingTax.id,
        name: editingTax.name.trim(),
        rate: rateVal,
        is_active: editingTax.is_active,
        created_at: editingTax.created_at
      });
      setTaxMessage({ type: 'success', text: `Impuesto "${editingTax.name.trim()}" actualizado y sincronizado correctamente.` });
      setEditingTax(null);
      await loadAdminTaxes();
      setTimeout(() => setTaxMessage(null), 3500);
    } catch (err: any) {
      setTaxMessage({ type: 'error', text: err.message || 'Error al actualizar el impuesto.' });
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleConfirmDeleteTax = async () => {
    if (!taxToDelete) return;
    setIsDeletingTax(true);
    try {
      const deletedName = taxToDelete.name;
      await dbService.deleteTax(taxToDelete.id);
      setTaxMessage({ type: 'success', text: `Impuesto "${deletedName}" eliminado exitosamente.` });
      setTaxToDelete(null);
      await loadAdminTaxes();
      setTimeout(() => setTaxMessage(null), 3500);
    } catch (err: any) {
      setTaxMessage({ type: 'error', text: err.message || 'Error al eliminar el impuesto.' });
    } finally {
      setIsDeletingTax(false);
    }
  };

  // TOGGLE TAX METHOD
  const handleToggleTax = async (tax: Tax) => {
    try {
      const updatedStatus = !tax.is_active;
      await dbService.saveTax({ ...tax, is_active: updatedStatus });
      setTaxMessage({ 
        type: 'success', 
        text: `Impuesto "${tax.name}" ${updatedStatus ? 'activado' : 'desactivado'} para facturación.` 
      });
      await loadAdminTaxes();
      setTimeout(() => setTaxMessage(null), 3000);
    } catch (err: any) {
      setTaxMessage({ type: 'error', text: `Error al cambiar estado del impuesto: ${err.message}` });
    }
  };

  // SCAN PRINTERS MOCK METHOD
  const handleScanPrinters = () => {
    setIsScanningPrinters(true);
    setDiscoveredPrinters([]);
    setTimeout(() => {
      setIsScanningPrinters(false);
      setDiscoveredPrinters([
        '🖨️ XP-58 POS Thermal Printer (Bluetooth 4.0)',
        '🖨️ Epson TM-T88VI Ticket Dispenser (USB/LAN)',
        '🖨️ Star Micronics TSP143III (Wireless)'
      ]);
    }, 2000);
  };

  // MARKETING SAVES FOR SLIDES & CAROUSELS
  const handleSaveLandingConfig = async () => {
    try {
      await dbService.saveLandingConfig(landingConfigState);
      setAdSaveSuccessMsg('¡Configuración de Landing guardada exitosamente!');
      setTimeout(() => setAdSaveSuccessMsg(null), 4000);
    } catch (e) {
      alert('Error saving landing config');
    }
  };

  const menuItems = [
    { id: 'mi_negocio', label: t('business.my_business_tab', 'Mi Negocio'), desc: t('business.my_business_desc', 'Empresa, SaaS, sedes y cajas') },
    { id: 'mi_cuenta', label: t('account.my_account_tab', 'Mi Cuenta'), desc: t('account.my_account_desc', 'Perfil, seguridad y contraseña') },
    { id: 'usuarios_asociados', label: 'Usuarios Asociados', desc: 'Gestionar operarios y permisos del sistema' },
    { id: 'planes_suscripcion', label: t('saas.subscription_tab', 'Planes'), desc: t('saas.subscription_desc', 'Gestionar licencia, Free, Básico o Pro') },
    { id: 'facturacion', label: t('billing.billing_tab', 'Facturación'), desc: t('billing.billing_desc', 'Monedas, tasas e impuestos') },
    { id: 'inventario', label: t('inventory.inventory_tab', 'Inventario'), desc: t('inventory.inventory_desc', 'Stock, e-commerce y banners') },
    { id: 'impresion', label: t('print.printing_tab', 'Impresión'), desc: t('print.printing_desc', 'Ticket, garantía e impresoras') },
    { id: 'dashboard', label: t('dash.dashboard_tab', 'Panel de Gráficas'), desc: t('dash.dashboard_desc', 'Personalizar reportes y vistas') },
    { id: 'notificaciones', label: t('notif.notifications_tab', 'Sistema y Alertas'), desc: t('notif.notifications_desc', 'Sonidos, correos y alertas') },
    { id: 'mantenimiento', label: 'Respaldo y Mantenimiento', desc: 'Descargar copia de seguridad y depurar operaciones' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs text-left" id="general_system_configuration_center">
      {configSaved && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-pulse">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>¡Sincronización Completada! Los ajustes se guardaron correctamente en el sistema.</span>
        </div>
      )}

      {/* HORIZONTAL SUBTABS (MATCHING REFERENCE IMAGE) */}
      {!hideInternalTabs && (
        <div className="flex items-center gap-6 sm:gap-8 border-b border-gray-200 overflow-x-auto pb-1 text-xs sm:text-sm font-medium mb-6">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setConfigSubTab(item.id as any)}
              className={`pb-3 transition font-montserrat cursor-pointer whitespace-nowrap ${
                configSubTab === item.id
                  ? 'text-[#7928CA] font-bold border-b-2 border-[#7928CA]'
                  : 'text-gray-400 hover:text-gray-700 font-medium'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ACTIVE SUB-TAB CONTAINER */}
      <div className="space-y-6 font-poppins">
          {/* TAB: USUARIOS ASOCIADOS */}
          {configSubTab === 'usuarios_asociados' && (
            <div className="space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2 font-montserrat">
                  <UserCheck className="w-4 h-4 text-[#7928CA]" />
                  <span>Usuarios Asociados y Accesos</span>
                </h4>
                <p className="text-xs text-gray-400">Administre los accesos de los operadores, cajeros y personal administrativo de su negocio.</p>
              </div>

              {/* ACTION BAR: + Agregar usuario & REALTIME AUDIT INDICATOR */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => {
                      if (setEditingUserId) setEditingUserId(null);
                      if (setUserFormName) setUserFormName('');
                      if (setUserFormEmail) setUserFormEmail('');
                      if (setUserFormPassword) setUserFormPassword('');
                      if (setUserFormRole) setUserFormRole('Cajero');
                      if (setUserFormError) setUserFormError('');
                      if (setShowUserModal) setShowUserModal(true);
                    }}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#7928CA] hover:opacity-95 text-white font-montserrat font-bold text-xs tracking-wider uppercase transition shadow-md hover:shadow-lg active:scale-98 flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#40E0D0] stroke-[2.5]" />
                    <span>+ Agregar usuario</span>
                  </button>

                  {/* Botón Sincronizar en tiempo real */}
                  <button
                    type="button"
                    onClick={() => { if (fetchStoreUsers) fetchStoreUsers(); }}
                    disabled={loadingUsers}
                    className="px-4 py-2 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-montserrat font-bold text-xs shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Sincronizar usuarios registrados"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#005da9] ${loadingUsers ? 'animate-spin' : ''}`} />
                    <span>{loadingUsers ? 'Sincronizando...' : 'Sincronizar'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px] shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>En línea: <strong className="font-mono">Usuarios</strong></span>
                    <span className="text-emerald-600 font-normal">| Conectado</span>
                  </span>

                  {lastStoreUsersSync && (
                    <span className="text-[11px] text-gray-400 font-mono hidden sm:inline-block">
                      {lastStoreUsersSync}
                    </span>
                  )}

                  <span className="px-3 py-1 rounded-full bg-slate-100 text-[#1D3557] font-bold text-[11px] border border-slate-200">
                    Total operadores: {storeUsers.filter(u => u.role !== 'Cliente').length}
                  </span>
                </div>
              </div>

              {/* CARDS GRID AS SHOWN IN IMAGE 1 */}
              {loadingUsers && storeUsers.length === 0 ? (
                <div className="p-12 text-center text-gray-400 font-medium bg-white rounded-2xl border border-gray-150 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 text-[#7928CA] animate-spin" />
                  <span>Consultando operadores en tiempo real...</span>
                </div>
              ) : storeUsers.filter(u => u.role !== 'Cliente').length === 0 ? (
                <div className="p-12 text-center text-gray-500 font-medium bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3">
                  <UserCheck className="w-10 h-10 text-gray-300" />
                  <div>
                    <h4 className="font-bold text-gray-800 mb-1">Sin operadores registrados</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      Agrega operadores para otorgar acceso administrativo independiente.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (setEditingUserId) setEditingUserId(null);
                      if (setUserFormName) setUserFormName('');
                      if (setUserFormEmail) setUserFormEmail('');
                      if (setUserFormPassword) setUserFormPassword('');
                      if (setUserFormRole) setUserFormRole('Cajero');
                      if (setUserFormError) setUserFormError('');
                      if (setShowUserModal) setShowUserModal(true);
                    }}
                    className="mt-2 px-5 py-2 rounded-full bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#7928CA] text-white font-bold text-xs cursor-pointer shadow-xs hover:shadow-md transition"
                  >
                    + Registrar Primer Operador
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                  {storeUsers
                    .filter(u => u.role !== 'Cliente')
                    .map((user) => {
                      const isOwner = (user.role || '').toLowerCase() === 'propietario' ||
                                      user.role === 'Propietario' || 
                                      user.email?.toLowerCase().includes('sebastian@') || 
                                      user.name?.toLowerCase().includes('sebastian sanchez') || 
                                      user.email === 'copiasbellavistafp@gmail.com';

                      // Extract initials for circular avatar
                      const nameParts = (user.name || 'Usuario').trim().split(/\s+/);
                      const initials = nameParts.length >= 2
                        ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
                        : (user.name ? user.name.slice(0, 2).toUpperCase() : 'US');

                      return (
                        <div 
                          key={user.id || user.email}
                          className="bg-white border border-gray-150 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-gray-300 hover:shadow-sm transition"
                        >
                          {/* Left: Avatar + Details */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-montserrat font-black text-sm shrink-0 shadow-2xs">
                              {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-montserrat font-bold text-gray-900 text-sm truncate">
                                  {user.name}
                                </span>
                                {isOwner && (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white bg-gradient-to-r from-[#FF0080] via-[#E10098] to-[#7928CA] shadow-2xs tracking-wider uppercase">
                                    Propietario
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                                {/* Purple toggle switch for Activo / Inactivo */}
                                <button
                                  type="button"
                                  onClick={() => { if (handleToggleStoreUserStatus) handleToggleStoreUserStatus(user.id || user.email, user.is_active); }}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                    user.is_active ? 'bg-[#7928CA]' : 'bg-gray-200'
                                  }`}
                                  title={user.is_active ? 'Desactivar operador' : 'Activar operador'}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                      user.is_active ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span className={`text-xs font-semibold ${user.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                                  {user.is_active ? 'Activo' : 'Inactivo'}
                                </span>
                                <span className="text-[11px] text-gray-400 font-medium">
                                  • {user.role}
                                </span>
                              </div>

                              <span className="text-xs text-gray-400 font-medium truncate mt-0.5 font-mono">
                                {user.email}
                              </span>
                            </div>
                          </div>

                          {/* Right: Actions (Permisos, Editar, Eliminar) */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                            {/* Botón de Permisos granular */}
                            <button
                              onClick={() => { if (handleOpenPermissionsModal) handleOpenPermissionsModal(user); }}
                              className="p-2 text-slate-400 hover:text-[#005da9] hover:bg-blue-50 rounded-full transition cursor-pointer"
                              title="Configurar accesos y módulos"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                            {/* Botón Editar */}
                            <button
                              onClick={() => {
                                if (setEditingUserId) setEditingUserId(user.id || user.email);
                                if (setUserFormName) setUserFormName(user.name);
                                if (setUserFormEmail) setUserFormEmail(user.email);
                                if (setUserFormPassword) setUserFormPassword(user.password || '');
                                if (setUserFormRole) setUserFormRole(user.role);
                                if (setUserFormError) setUserFormError('');
                                if (setShowUserModal) setShowUserModal(true);
                              }}
                              className="p-2 text-[#7928CA] hover:bg-[#7928CA]/10 rounded-full transition cursor-pointer"
                              title="Editar operador / Propietario"
                            >
                              <Edit3 className="w-4 h-4 stroke-[2.2]" />
                            </button>
                            {/* Botón Eliminar */}
                            <button
                              onClick={() => { if (handleDeleteStoreUser) handleDeleteStoreUser(user.id || user.email, user.name, user.email); }}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-full transition cursor-pointer"
                              title="Eliminar operador / Propietario"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.2]" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Informative footer explaining segregation */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3 text-xs text-slate-600">
                <ShieldCheck className="w-5 h-5 text-[#005da9] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 font-bold block mb-0.5 font-montserrat">Separación Estricta de Cuentas:</strong>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Los usuarios de esta sección son los <strong>operadores internos</strong> de la tienda (registrados en la tabla <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">store_users</code>). Al iniciar sesión, ingresan directamente al <strong>Panel Administrativo</strong> según sus permisos. Los clientes externos se registran de manera independiente en la tabla de clientes y no tienen acceso a la consola administrativa.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: MI CUENTA */}
          {configSubTab === 'mi_cuenta' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">👤 {t('account.title', 'Ajustes de Cuenta y Perfil')}</h4>
                <p className="text-xs text-gray-400">{t('account.subtitle', 'Configure los datos del usuario conectado, seguridad de acceso y personalice el idioma de la aplicación.')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.full_name', 'Nombre Completo')}</label>
                  <input
                    type="text"
                    value={userPerfilNombre}
                    onChange={(e) => setUserPerfilNombre(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.id_doc', 'Documento de Identidad / Cédula')}</label>
                  <input
                    type="text"
                    value={userPerfilDoc}
                    onChange={(e) => setUserPerfilDoc(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.phone', 'Número de Teléfono')}</label>
                  <input
                    type="text"
                    value={userPerfilPhone}
                    onChange={(e) => setUserPerfilPhone(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.email', 'Correo Electrónico')}</label>
                  <input
                    type="email"
                    value={userPerfilEmail}
                    onChange={(e) => setUserPerfilEmail(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
              </div>

              {/* SECURITY & 2FA */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/50 space-y-4">
                <h5 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-slate-600" />
                  <span>{t('account.2fa_title', 'Seguridad y Acceso en 2 Pasos')}</span>
                </h5>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-gray-700 block">{t('account.2fa_title', 'Doble Factor de Autenticación (2FA)')}</span>
                    <span className="text-[10px] text-gray-500 font-medium">{t('account.2fa_desc', 'Añada una capa de seguridad extra requiriendo un código temporal en su teléfono.')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUser2FA(!user2FA)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      user2FA ? 'bg-[#005da9]' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      user2FA ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {user2FA && (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-4 animate-fadeIn">
                    <div className="bg-gray-100 p-2 rounded-lg font-mono text-[10px] border border-gray-200">
                      [ QR CODE SIMULADO ]
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-black text-gray-800 block">Llave de configuración manual:</span>
                      <code className="text-[10px] font-mono text-[#005da9] bg-[#005da9]/5 px-2 py-0.5 rounded font-black">BELLA-VISTA-SECURITY-KEY-2026</code>
                      <p className="text-[10px] text-gray-400 font-medium">Escanee el código QR con Google Authenticator o Duo Mobile para sincronizar sus códigos.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* SESSIONS */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">{t('account.active_sessions', 'Sesiones Activas')}</span>
                <div className="border border-gray-150 rounded-2xl overflow-hidden bg-white shadow-3xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black uppercase text-gray-400">
                        <th className="px-4 py-2.5">{t('account.device', 'Dispositivo / Sistema')}</th>
                        <th className="px-4 py-2.5">{t('account.ip_address', 'Dirección IP')}</th>
                        <th className="px-4 py-2.5">{t('app.status', 'Estado')}</th>
                        <th className="px-4 py-2.5 text-right">{t('app.actions', 'Acción')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeSessions.map(sess => (
                        <tr key={sess.id}>
                          <td className="px-4 py-3 font-bold text-gray-800">{sess.device}</td>
                          <td className="px-4 py-3 font-mono text-gray-500">{sess.ip}</td>
                          <td className="px-4 py-3">
                            {sess.active ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-black border border-emerald-200">Actual</span>
                            ) : (
                              <span className="text-gray-400 font-medium">{sess.date}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!sess.active && (
                              <button
                                onClick={() => setActiveSessions(activeSessions.filter(s => s.id !== sess.id))}
                                className="text-rose-600 hover:text-rose-800 text-[10px] font-black cursor-pointer"
                              >
                                {t('account.unlink', 'Desvincular')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PREFERENCES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.system_language', 'Idioma del Sistema')}</label>
                  <select
                    value={userInterfaceLang}
                    onChange={(e) => {
                      const val = e.target.value as LanguageCode;
                      setUserInterfaceLang(val);
                      setStoredLanguage(val);
                    }}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  >
                    <option value="es">{t('account.lang_es', 'Español (Castellano)')}</option>
                    <option value="en">{t('account.lang_en', 'English (United States)')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">{t('account.visual_theme', 'Tema Visual')}</label>
                  <select
                    value={userInterfaceTheme}
                    onChange={(e) => {
                      const val = e.target.value as ThemeCode;
                      setUserInterfaceTheme(val);
                      applyTheme(val);
                    }}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  >
                    <option value="claro">{t('account.theme_light', '☀️ Opción 1: Tema Claro Operativo (Azul Bellavista / Alta Legibilidad)')}</option>
                    <option value="minimalista_premium">{t('account.theme_minimalista_premium', '✨ MINIMALISTA PREMIUM')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MI NEGOCIO */}
          {configSubTab === 'mi_negocio' && (
            <div className="space-y-6">
              {/* Encabezado fuera de la tarjeta */}
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#005da9]" />
                    <span>Información del negocio</span>
                  </h3>
                  <p className="text-xs text-gray-500">Datos fiscales, comerciales y de contacto utilizados en encabezados, reportes e impresiones de comprobantes.</p>
                </div>
              </div>

              {/* Contenedor Principal (Tarjeta / Card) */}
              <div className="bg-white border border-gray-200/90 rounded-2xl p-6 shadow-xs space-y-6">
                
                {/* 1. Botón de Carga de Logo */}
                <div className="flex items-center gap-4">
                  <label className="w-28 h-28 border-2 border-dashed border-blue-400 bg-blue-50/40 hover:bg-blue-50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all shrink-0 relative group overflow-hidden">
                    {businessLogo ? (
                      <img src={businessLogo} alt="Logo del negocio" className="w-full h-full object-contain p-2 rounded-2xl" />
                    ) : (
                      <div className="flex flex-col items-center text-center p-2">
                        <span className="text-xl font-bold text-blue-600 mb-1">↑</span>
                        <span className="text-[11px] font-bold text-blue-600 leading-tight">Carga tu logo</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBusinessLogo(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-gray-800">Logo del negocio</h4>
                    <p className="text-xs text-gray-500">Aparece en el encabezado principal, tickets de venta, cotizaciones y reportes contables.</p>
                    {businessLogo && (
                      <button
                        type="button"
                        onClick={() => setBusinessLogo('')}
                        className="text-xs text-rose-600 hover:text-rose-700 font-bold underline cursor-pointer pt-0.5"
                      >
                        Quitar logo actual
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Formulario en 2 Columnas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nombre del negocio */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del negocio*</label>
                    <input
                      type="text"
                      value={configStoreName}
                      onChange={(e) => setConfigStoreName(e.target.value)}
                      placeholder="Copias Bella Vista, C.A."
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Tipo de negocio (Select con categorías completas) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de negocio*</label>
                    <select
                      value={businessBusinessType}
                      onChange={(e) => setBusinessBusinessType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    >
                      <option value="Papelería y libros">Papelería y libros</option>
                      <optgroup label="1. Alimentos y Bebidas (Venta Directa / Al Por Menor)">
                        <option value="Bodega">Bodega</option>
                        <option value="Minimercado">Minimercado</option>
                        <option value="Carnicería">Carnicería</option>
                        <option value="Charcutería">Charcutería</option>
                        <option value="Panadería y Repostería">Panadería y Repostería</option>
                        <option value="Licorería">Licorería</option>
                        <option value="Tienda naturista y/o suplementos">Tienda naturista y/o suplementos</option>
                      </optgroup>
                      <optgroup label="2. Gastronomía y Servicios de Comida">
                        <option value="Restaurante o comida rápida">Restaurante o comida rápida</option>
                        <option value="Cafetería">Cafetería</option>
                        <option value="Bar">Bar</option>
                      </optgroup>
                      <optgroup label="3. Moda, Calzado y Accesorios Personales">
                        <option value="Ropa y calzado">Ropa y calzado</option>
                        <option value="Artículos de belleza">Artículos de belleza</option>
                        <option value="Accesorios y bisutería">Accesorios y bisutería</option>
                        <option value="Tiendas de regalo (Variedades)">Tiendas de regalo (Variedades)</option>
                      </optgroup>
                      <optgroup label="4. Salud, Belleza y Cuidado Personal">
                        <option value="Farmacia y droguería">Farmacia y droguería</option>
                        <option value="Barbería y salón de belleza">Barbería y salón de belleza</option>
                        <option value="Estética y salud">Estética y salud</option>
                        <option value="Gimnasio">Gimnasio</option>
                        <option value="Tatuajes y piercings">Tatuajes y piercings</option>
                      </optgroup>
                      <optgroup label="5. Hogar, Papelería y Tecnología">
                        <option value="Artículos para el hogar">Artículos para el hogar</option>
                        <option value="Papelería y libros">Papelería y libros</option>
                        <option value="Electrónica e informática">Electrónica e informática</option>
                      </optgroup>
                      <optgroup label="6. Automotriz y Ferretería">
                        <option value="Venta de automóviles">Venta de automóviles</option>
                        <option value="Artículos automotrices">Artículos automotrices</option>
                        <option value="Taller automotriz">Taller automotriz</option>
                        <option value="Ferretería y construcción">Ferretería y construcción</option>
                      </optgroup>
                      <optgroup label="7. Agropecuario y Mascotas">
                        <option value="Insumos agropecuarios">Insumos agropecuarios</option>
                        <option value="Tienda de mascotas o vet">Tienda de mascotas o vet</option>
                      </optgroup>
                      <optgroup label="8. Comercio al Por Mayor y Cadena de Suministro">
                        <option value="Distribuidora mayorista">Distribuidora mayorista</option>
                        <option value="Industria o manufactura">Industria o manufactura</option>
                        <option value="Transporte y logística">Transporte y logística</option>
                      </optgroup>
                      <optgroup label="9. Servicios Profesionales, Financieros y Otros">
                        <option value="Servicios educativos">Servicios educativos</option>
                        <option value="Organización de eventos">Organización de eventos</option>
                        <option value="Marketing y publicidad">Marketing y publicidad</option>
                        <option value="Préstamos y financiamiento">Préstamos y financiamiento</option>
                        <option value="Reparaciones y mantenimiento">Reparaciones y mantenimiento</option>
                        <option value="Entretenimiento y ocio">Entretenimiento y ocio</option>
                        <option value="Hoteles y turismo">Hoteles y turismo</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Dirección / Dirección fiscal */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Dirección fiscal</label>
                    <input
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      placeholder="Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Ciudad */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Ciudad</label>
                    <input
                      type="text"
                      value={businessCity}
                      onChange={(e) => setBusinessCity(e.target.value)}
                      placeholder="Barinitas"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Número de celular / Contacto (WhatsApp) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Número de celular (WhatsApp)</label>
                    <div className="flex items-center gap-2 border border-gray-300 rounded-xl p-1 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs font-bold text-gray-700 shrink-0 border border-gray-200">
                        <span>🇻🇪</span>
                        <span>+58</span>
                      </div>
                      <input
                        type="text"
                        value={configPhone}
                        onChange={(e) => setConfigPhone(e.target.value)}
                        placeholder="4125043857"
                        className="w-full p-1 bg-transparent text-xs font-medium outline-none"
                      />
                    </div>
                  </div>

                  {/* Correo electrónico */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Correo electrónico</label>
                    <input
                      type="email"
                      value={businessEmail}
                      onChange={(e) => setBusinessEmail(e.target.value)}
                      placeholder="Fotocopiasfyp@gmail.com"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Número de documento / RIF */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Número de documento / RIF</label>
                    <input
                      type="text"
                      value={configRif}
                      onChange={(e) => setConfigRif(e.target.value)}
                      placeholder="J-50987654-3"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Lema / Slogan del Encabezado */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Lema / Slogan (Encabezado)</label>
                    <input
                      type="text"
                      value={businessSlogan}
                      onChange={(e) => setBusinessSlogan(e.target.value)}
                      placeholder="Equipando Tus Proyectos"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Sitio web */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Sitio web</label>
                    <input
                      type="text"
                      value={businessWebsite}
                      onChange={(e) => setBusinessWebsite(e.target.value)}
                      placeholder="https://copiasbellavista.vercel.app/"
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                    />
                  </div>
                </div>

                {/* Zona de Acción Crítica / Advertencia (Pie de la tarjeta) */}
                <div className="pt-5 border-t border-gray-150 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <p className="text-gray-400 font-medium">Una vez confirmado el guardado, los datos se actualizarán en tiempo real en la barra principal, reportes e impresiones.</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Deseas reiniciar los datos de tu negocio a los valores por defecto?')) {
                        setConfigStoreName('Copias Bella Vista, C.A.');
                        setBusinessAddress('Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4');
                        setBusinessCity('Barinitas');
                        setBusinessEmail('Fotocopiasfyp@gmail.com');
                        setConfigPhone('+58 412-5043857');
                        setConfigRif('J-50987654-3');
                        setBusinessWebsite('https://copiasbellavista.vercel.app/');
                        setBusinessSlogan('Equipando Tus Proyectos');
                      }
                    }}
                    className="text-rose-600 hover:text-rose-700 font-bold underline cursor-pointer shrink-0 transition-colors"
                  >
                    Restablecer campos
                  </button>
                </div>
              </div>

              {/* Barra de Acciones Globales (Footer fuera de la tarjeta) */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    dbService.getBusinessProfile().then(p => {
                      if (p) {
                        setConfigStoreName(p.name);
                        setBusinessBusinessType(p.business_type);
                        setBusinessAddress(p.address);
                        setBusinessCity(p.city);
                        setConfigPhone(p.phone);
                        setBusinessEmail(p.email);
                        setConfigRif(p.rif);
                        setBusinessWebsite(p.website);
                        setBusinessLogo(p.logo_url);
                        setBusinessSlogan(p.slogan || 'Equipando Tus Proyectos');
                      }
                    });
                  }}
                  className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-bold text-xs rounded-full transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Descartar</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isSavingBusiness}
                  className="px-6 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  <Save className="w-4 h-4 text-[#005da9]" />
                  <span>{isSavingBusiness ? 'Guardando en Supabase...' : 'Guardar cambios'}</span>
                </button>
              </div>

              {/* 📍 SUCURSALES Y SEDES (DATOS REALES Y CRUD COMPLETO) */}
              <div className="space-y-4 pt-6 border-t border-gray-200/80 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#005da9]" />
                      <span>Sedes y Terminales (Puntos de Venta)</span>
                    </h4>
                    <p className="text-xs text-gray-500">Cree, modifique y gestione las sucursales físicas y sus puntos de venta asociados con sincronización a Supabase.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingBranch({
                        code: `SUC-0${businessBranches.length + 1}`,
                        name: '',
                        address: '',
                        phone: '',
                        active: true
                      });
                      setShowBranchModal(true);
                    }}
                    className="px-3.5 py-2 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Agregar Sede</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {businessBranches.map(branch => {
                    const branchTerminals = businessCajas.filter(c => c.branch_id === branch.id);
                    return (
                      <div 
                        key={branch.id} 
                        className="p-5 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 transition-all shadow-xs flex flex-col justify-between gap-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider block mb-0.5">
                              {branch.code}
                            </span>
                            <h6 className="text-sm font-black text-gray-900 leading-snug">{branch.name}</h6>
                            <span className="text-xs text-gray-500 font-medium block mt-1">
                              {branch.address || 'Sin dirección física especificada'}
                            </span>
                            {branch.phone && (
                              <span className="text-[11px] text-gray-400 font-medium block mt-0.5 flex items-center gap-1">
                                📞 {branch.phone}
                              </span>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border shrink-0 ${
                            branch.active 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                              : 'bg-gray-100 border-gray-300 text-gray-500'
                          }`}>
                            {branch.active ? 'Habilitada' : 'Inactiva'}
                          </span>
                        </div>

                        {/* Actions for this Sede */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBranchForTerminals(branch);
                              setShowTerminalModal(true);
                            }}
                            className="text-[#005da9] hover:text-[#004a87] font-extrabold flex items-center gap-1.5 bg-blue-50/70 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                          >
                            <Monitor className="w-3.5 h-3.5" />
                            <span>Gestionar Cajas ({branchTerminals.length})</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBranch(branch);
                                setShowBranchModal(true);
                              }}
                              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                              title="Modificar Sede"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBranchToDelete(branch)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Eliminar Sede"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FACTURACIÓN */}
          {configSubTab === 'facturacion' && (
            <div className="space-y-6">
              {/* MONEDA PRINCIPAL CONTAINER */}
              <div className="bg-white border border-slate-200 rounded-[16px] p-6 shadow-2xs">
                {/* Header section with MONEDAS PRINCIPALES and + Nueva Moneda button */}
                <div className="border-b border-slate-100 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#103b6e]/10 text-[#103b6e] flex items-center justify-center font-bold">
                      <Coins className="w-4 h-4 text-[#103b6e]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-montserrat">MONEDAS PRINCIPALES</h3>
                      <p className="text-[11px] text-gray-500 font-medium">Gestione las divisas del sistema, sus tasas de conversión respecto al Dólar (USD) y sincronización en tiempo real.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenCreateCurrency}
                    className="px-3.5 py-2 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition self-start sm:self-auto shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Nueva Moneda</span>
                  </button>
                </div>

                {/* Success feedback alerts */}
                {currencyActionSuccess && (
                  <div className="p-3 mb-4 text-xs font-bold rounded-xl flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{currencyActionSuccess}</span>
                  </div>
                )}

                {mainCurrencySuccessMsg && (
                  <div className="p-3 mb-4 text-xs font-bold rounded-xl flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>{mainCurrencySuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Selector de Moneda Activa Principal */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-tight block font-montserrat">DIVISA PRINCIPAL DE FACTURACIÓN Y CATÁLOGO</span>
                      <span className="text-[11px] text-slate-500 font-medium">Define la moneda activa en la que operan por defecto el POS, la tienda online y los reportes.</span>
                    </div>
                    
                    <div className="relative shrink-0">
                      <select 
                        value={facturacionMainCurrency}
                        onChange={(e) => handleSelectMainCurrency(e.target.value)}
                        className="px-4 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-bold rounded-xl cursor-pointer focus:outline-hidden uppercase tracking-wider font-montserrat shadow-2xs"
                      >
                        {systemCurrencies.map(c => (
                          <option key={c.code} value={c.code}>
                            ACTIVA: {c.name} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* List of Main Currencies with Action Buttons: Modificar, Eliminar, Guardar */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-montserrat">
                        LISTADO DE MONEDAS CONFIGURADAS ({systemCurrencies.length})
                      </span>
                    </div>

                    {loadingCurrencies ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 font-bold">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#005da9]" />
                        <span>Cargando monedas...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {systemCurrencies.map(curr => {
                          const isMain = facturacionMainCurrency === curr.code;
                          const isUSD = curr.code === 'USD';
                          const status = rateSavingStatus[curr.code];

                          return (
                            <div 
                              key={curr.code}
                              className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                isMain 
                                  ? 'bg-blue-50/40 border-blue-200 shadow-xs' 
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {/* Left: Flag Tag & Details */}
                              <div className="flex items-center gap-3.5 min-w-[220px]">
                                <span className="bg-[#103b6e]/10 text-[#103b6e] px-3 py-2 font-black text-xs rounded-xl min-w-[46px] text-center font-montserrat shrink-0 border border-[#103b6e]/20">
                                  {curr.country_code || curr.code.slice(0, 2)}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h6 className="text-xs font-black text-slate-900 font-montserrat">
                                      {curr.name}
                                    </h6>
                                    {isMain && (
                                      <span className="px-2 py-0.5 bg-[#005da9] text-white text-[9px] font-black rounded-full uppercase tracking-wider">
                                        Principal
                                      </span>
                                    )}
                                    {!curr.is_active && (
                                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-bold rounded-full uppercase">
                                        Inactiva
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Center: Rate Input */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                  <span className="bg-slate-100 text-slate-600 px-3 py-2 font-bold text-[11px] select-none border-r border-slate-200 whitespace-nowrap">
                                    1 USD =
                                  </span>
                                  <input
                                    type="text"
                                    value={manualRates[curr.code] ?? curr.rate.toString()}
                                    onChange={(e) => setManualRates(prev => ({ ...prev, [curr.code]: e.target.value }))}
                                    disabled={isUSD}
                                    className="px-3 py-2 bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-hidden w-28 text-right disabled:bg-slate-50 disabled:text-slate-400"
                                  />
                                  <span className="bg-slate-50 text-slate-500 px-2.5 py-2 font-bold text-[11px] select-none border-l border-slate-200">
                                    {curr.symbol}
                                  </span>
                                </div>

                                {curr.code === 'VES' && (
                                  <button
                                    type="button"
                                    onClick={handleFetchLiveBCVRate}
                                    disabled={isFetchingLiveBCV}
                                    className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-xl border border-emerald-200 transition cursor-pointer flex items-center gap-1 shrink-0"
                                    title="Consultar tasa oficial en vivo desde el portal BCV / DolarAPI"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingLiveBCV ? 'animate-spin' : ''}`} />
                                    <span>Tasa BCV en Vivo</span>
                                  </button>
                                )}
                              </div>

                              {/* Right: Action Buttons (Guardar, Modificar, Eliminar) */}
                              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                {/* Botón Guardar Tasa */}
                                <button
                                  type="button"
                                  onClick={() => handleSaveManualRate(curr.code)}
                                  disabled={status?.loading || isUSD}
                                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                                  title="Guardar tasa de cambio en Supabase"
                                >
                                  {status?.loading ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5" />
                                  )}
                                  <span>Guardar</span>
                                </button>

                                {/* Botón Modificar Moneda */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditCurrency(curr)}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
                                  title="Modificar propiedades de la moneda"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                                  <span>Modificar</span>
                                </button>

                                {/* Botón Eliminar Moneda */}
                                <button
                                  type="button"
                                  onClick={() => setCurrencyToDelete(curr)}
                                  disabled={isUSD}
                                  className={`p-2 rounded-xl transition flex items-center justify-center ${
                                    isUSD 
                                      ? 'text-gray-300 bg-gray-50 cursor-not-allowed' 
                                      : 'text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer'
                                  }`}
                                  title={isUSD ? 'El Dólar (USD) es la moneda base del sistema y no puede eliminarse' : 'Eliminar moneda de Supabase'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Status notification per currency if present */}
                              {status?.message && (
                                <div className={`w-full text-left md:col-span-3 text-[11px] font-bold p-2 rounded-lg ${
                                  status.message.type === 'success' 
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                                }`}>
                                  {status.message.text}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>



              {/* TAXES MANAGEMENT */}
              <div className="card-minimalist bg-white border border-slate-200 rounded-[16px] p-6 mb-5 shadow-2xs">
                <div className="border-b border-slate-100 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#103b6e]/10 text-[#103b6e] flex items-center justify-center font-bold">
                      <Percent className="w-4 h-4 text-[#103b6e]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-montserrat">GESTIÓN DE IMPUESTOS</h3>
                      <p className="text-[11px] text-gray-500 font-medium">Configure, modifique y elimine las tasas impositivas del sistema (IVA, IGTF, Reducido, etc.).</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
                    {adminTaxes.length} impuesto(s) configurado(s)
                  </span>
                </div>

                <div className="space-y-4">
                  {taxMessage && (
                    <div className={`p-3 text-xs font-bold rounded-xl flex items-center justify-between gap-2 animate-fadeIn ${
                      taxMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {taxMessage.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{taxMessage.text}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setTaxMessage(null)}
                        className="text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleAddTax} className="flex flex-col sm:flex-row items-stretch gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-150">
                    <div className="flex-1">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 font-montserrat">
                        Nombre del Impuesto *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: IVA Reducido, IVA General, etc."
                        value={newTaxName}
                        onChange={(e) => setNewTaxName(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-[#103b6e] transition shadow-xs"
                      />
                    </div>
                    <div className="w-full sm:w-36">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 font-montserrat">
                        Tasa (%) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Ej: 16"
                          value={newTaxRate}
                          onChange={(e) => setNewTaxRate(e.target.value)}
                          className="w-full p-2.5 pr-7 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-[#103b6e] transition shadow-xs font-mono"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">%</span>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full sm:w-auto h-[38px] px-5 bg-linear-to-r from-[#103b6e] via-[#2052a0] to-[#7835d6] text-white font-montserrat font-bold text-xs rounded-xl shadow-xs hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Agregar Impuesto</span>
                      </button>
                    </div>
                  </form>

                  <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black uppercase text-slate-400 tracking-wider font-montserrat">
                          <th className="px-4 py-3.5">Impuesto</th>
                          <th className="px-4 py-3.5 text-center">Porcentaje (%)</th>
                          <th className="px-4 py-3.5 text-center">Estado</th>
                          <th className="px-4 py-3.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminTaxes.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-medium text-xs">
                              No hay tasas de impuestos configuradas actualmente. Agregue una nueva arriba.
                            </td>
                          </tr>
                        ) : (
                          adminTaxes.map(tax => (
                            <tr key={tax.id} className="hover:bg-slate-50/70 transition">
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#103b6e] flex items-center justify-center shrink-0">
                                    <Percent className="w-3 h-3" />
                                  </div>
                                  <span className="font-bold text-slate-800 font-montserrat">{tax.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg text-xs border border-slate-200">
                                  {tax.rate}%
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTax(tax)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-montserrat transition cursor-pointer ${
                                    tax.is_active 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                                      : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                                  }`}
                                  title={tax.is_active ? 'Haga clic para desactivar' : 'Haga clic para activar'}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${tax.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  <span>{tax.is_active ? 'Vigente' : 'Inactivo'}</span>
                                </button>
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingTax({ ...tax })}
                                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#005da9] text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95"
                                    title="Modificar nombre, porcentaje o estado"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Modificar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTaxToDelete(tax)}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95"
                                    title="Eliminar impuesto"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Eliminar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 💳 GESTIÓN DE MÉTODOS DE PAGO */}
              <div className="card-minimalist bg-white border border-slate-200 rounded-[16px] p-6 mb-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <span className="text-xs font-black text-gray-800 uppercase flex items-center gap-1.5 font-montserrat">
                      <CreditCard className="w-4 h-4 text-[#005da9]" />
                      <span>Configuración de Métodos de Pago</span>
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Incorpore, modifique datos bancarios/instrucciones, active o desactive pasarelas y formas de cobro.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddPaymentMethod}
                    className="btn-guardar flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(90deg, #103b6e 0%, #2052a0 50%, #7835d6 100%)',
                      color: '#ffffff',
                      fontWeight: 700,
                      borderRadius: '9999px',
                      padding: '12px 32px',
                      border: 'none',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      fontSize: '14px',
                      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.15)',
                      transition: 'transform 0.2s ease, opacity 0.2s ease'
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Incorporar Método</span>
                  </button>
                </div>

                {paymentMethodMsg && (
                  <div className={`p-3 text-xs font-bold rounded-xl flex items-center gap-2 ${
                    paymentMethodMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{paymentMethodMsg.text}</span>
                  </div>
                )}

                <div className="border border-gray-150 rounded-2xl overflow-hidden bg-white shadow-3xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black uppercase text-gray-400">
                        <th className="px-4 py-2.5">Método / Canal</th>
                        <th className="px-3 py-2.5 text-center">Tipo</th>
                        <th className="px-3 py-2.5 text-center">Moneda</th>
                        <th className="px-3 py-2.5 text-center">Canales</th>
                        <th className="px-3 py-2.5 text-center">Estado</th>
                        <th className="px-4 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loadingPaymentMethods ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-[#005da9]" />
                            Cargando métodos de pago...
                          </td>
                        </tr>
                      ) : paymentMethodsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-medium">
                            No hay métodos de pago configurados. Haga clic en "Incorporar Método" para agregar uno.
                          </td>
                        </tr>
                      ) : (
                        paymentMethodsList.map(pm => (
                          <tr key={pm.id} className="hover:bg-gray-50/60 transition">
                            <td className="px-4 py-3">
                              <div className="font-bold text-gray-900 flex items-center gap-1.5">
                                {pm.type === 'movil' && <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                {pm.type === 'efectivo' && <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                {pm.type === 'transferencia' && <Landmark className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                {pm.type === 'punto' && <CreditCard className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                                {pm.type === 'digital' && <QrCode className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                                <span>{pm.name}</span>
                              </div>
                              {pm.account_details && (
                                <div className="text-[11px] text-gray-500 font-mono mt-0.5 truncate max-w-xs">
                                  {pm.account_details}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-100 text-gray-600">
                                {pm.type}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                pm.currency === 'USD' ? 'bg-emerald-50 text-emerald-700' :
                                pm.currency === 'VES' ? 'bg-blue-50 text-blue-700' :
                                'bg-amber-50 text-amber-700'
                              }`}>
                                {pm.currency}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {pm.allow_pos && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-bold" title="Habilitado en Caja / POS">
                                    POS
                                  </span>
                                )}
                                {pm.allow_online && (
                                  <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[9px] font-bold" title="Habilitado en Tienda Online">
                                    WEB
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                pm.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pm.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                {pm.is_active ? 'Activo' : 'Desactivado'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePaymentMethod(pm)}
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                                    pm.is_active 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                  title={pm.is_active ? 'Desactivar método' : 'Activar método'}
                                >
                                  {pm.is_active ? 'Desactivar' : 'Activar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPaymentMethod(pm)}
                                  className="p-1.5 text-gray-500 hover:text-[#005da9] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                  title="Modificar Método de Pago"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPaymentMethodToDelete(pm)}
                                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Eliminar Método de Pago"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SERIES & CORRELATIVES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Próximo Núm. Factura</label>
                  <input
                    type="number"
                    value={facturacionCorrelativoFactura}
                    onChange={(e) => setFacturacionCorrelativoFactura(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Próximo Núm. Cotización</label>
                  <input
                    type="number"
                    value={facturacionCorrelativoCotizacion}
                    onChange={(e) => setFacturacionCorrelativoCotizacion(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Próximo Núm. Ticket Venta</label>
                  <input
                    type="number"
                    value={facturacionCorrelativoTicket}
                    onChange={(e) => setFacturacionCorrelativoTicket(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INVENTARIO */}
          {configSubTab === 'inventario' && (
            <div className="space-y-6">
              {/* PARAMETERS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Alerta de Inventario Crítico (Umbral)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={inventarioLowStockThreshold}
                      onChange={(e) => setInventarioLowStockThreshold(parseInt(e.target.value) || 0)}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                    />
                    <span className="absolute right-3 top-3 text-[10px] text-gray-400 font-extrabold">Unidades</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">Bloquear Venta sin Stock</span>
                    <p className="text-[10px] text-gray-400 font-medium">Impide añadir artículos al carrito si su saldo disponible es menor o igual a cero.</p>
                  </div>
                  <button
                    onClick={() => setInventarioBlockNoStockSale(!inventarioBlockNoStockSale)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      inventarioBlockNoStockSale ? 'bg-[#005da9]' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-3xs ring-0 transition duration-200 ease-in-out ${
                      inventarioBlockNoStockSale ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: IMPRESIÓN */}
          {configSubTab === 'impresion' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">🖨️ Impresión, Tickets y Periféricos</h4>
                <p className="text-xs text-gray-400">Defina el formato por defecto de los comprobantes y administre las impresoras de tickets conectadas.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Formato de Comprobante por Defecto</label>
                  <select
                    value={impresionTicketFormat}
                    onChange={(e) => setImpresionTicketFormat(e.target.value as any)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  >
                    <option value="58mm">Ticket Térmico (58mm - Compacto)</option>
                    <option value="80mm">Ticket Térmico (80mm - Estándar)</option>
                    <option value="carta">Documento Carta (Para cotizaciones)</option>
                    <option value="pdf">Descargar PDF Automatizado</option>
                  </select>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">Disparo de Cajón Monedero</span>
                    <p className="text-[10px] text-gray-400 font-medium">Envía la señal de apertura de gaveta automáticamente al imprimir comprobante.</p>
                  </div>
                  <button
                    onClick={() => setImpresionTriggerDrawer(!impresionTriggerDrawer)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      impresionTriggerDrawer ? 'bg-[#005da9]' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-3xs ring-0 transition duration-200 ease-in-out ${
                      impresionTriggerDrawer ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Mensaje de Encabezado / Bienvenida</label>
                  <input
                    type="text"
                    value={impresionGreeting}
                    onChange={(e) => setImpresionGreeting(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Garantía / Términos de Compra (Pie)</label>
                  <input
                    type="text"
                    value={impresionWarranty}
                    onChange={(e) => setImpresionWarranty(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                  />
                </div>
              </div>

              {/* PRINTER SCANNER */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>Hardware e Impresoras Térmicas</span>
                  </span>
                  <button
                    onClick={handleScanPrinters}
                    disabled={isScanningPrinters}
                    className="px-3 py-1 bg-[#005da9] hover:bg-[#004a87] disabled:bg-gray-300 text-white text-[10px] font-black rounded-lg transition"
                  >
                    {isScanningPrinters ? 'Buscando puertos...' : 'Buscar Impresoras'}
                  </button>
                </div>

                {discoveredPrinters.length > 0 ? (
                  <div className="space-y-1.5">
                    {discoveredPrinters.map((printer, idx) => (
                      <div key={idx} className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-extrabold text-gray-700 flex items-center justify-between">
                        <span>{printer}</span>
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] px-2 py-0.5 rounded-full border border-emerald-200">Sincronizada</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 font-medium">Haga clic en "Buscar Impresoras" para escanear dispositivos térmicos USB, LAN o Bluetooth en la red local.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: DASHBOARD */}
          {configSubTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-[#005da9]" />
                    <span>Formulario Panel de Gráficas ("Tu Gestión")</span>
                  </h4>
                  <p className="text-xs text-gray-400">
                    Arrastre y reordene los módulos para estructurar el panel a su gusto. Active o desactive qué estadísticas visualizar en el informe financiero.
                  </p>
                </div>
                <span className="text-[10px] bg-blue-50 border border-blue-200 text-[#005da9] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider self-start md:self-auto">
                  Modo Personalización
                </span>
              </div>

              {reportConfigSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">{reportConfigSuccessMsg}</span>
                </div>
              )}

              {loadingReportConfigs ? (
                <div className="space-y-3 py-4">
                  <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
                  <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
                  <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* SECCIÓN 1: GRÁFICAS PRINCIPALES */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>1. Gráficas Principales</span>
                      </h5>
                      <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-extrabold px-2.5 py-0.5 rounded uppercase">
                        Layout: 2 Columnas
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 space-y-2">
                      {reportConfigs.filter(c => c.section === 'graficas').map((item) => {
                        const globalIdx = reportConfigs.findIndex(r => r.id === item.id);
                        return (
                          <div 
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStartConfig(e, globalIdx)}
                            onDragOver={(e) => handleDragOverConfig(e, globalIdx)}
                            onDragEnd={handleDragEndConfig}
                            className={`flex items-center justify-between p-3 border rounded-xl transition-all ${
                              item.enabled 
                                ? 'border-emerald-500/50 bg-white shadow-3xs' 
                                : 'border-gray-200 bg-gray-50/50 opacity-70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex items-center gap-1">
                                <div className="cursor-grab text-gray-400 p-1 hover:text-gray-600 shrink-0" title="Arrastrar para reordenar">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'up')}
                                    disabled={globalIdx === 0}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'down')}
                                    disabled={globalIdx === reportConfigs.length - 1}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <h6 className="text-xs font-black text-gray-800 leading-tight">{item.title}</h6>
                                <p className="text-[10px] text-gray-400 font-medium truncate">{item.description}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleReportItemActive(item.id)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                item.enabled ? 'bg-emerald-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  item.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECCIÓN 2: COMPARATIVOS Y LISTADOS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <span>2. Comparativos y Listados</span>
                      </h5>
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold px-2.5 py-0.5 rounded uppercase">
                        Layout: 3 Columnas
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 space-y-2">
                      {reportConfigs.filter(c => c.section === 'comparativos').map((item) => {
                        const globalIdx = reportConfigs.findIndex(r => r.id === item.id);
                        return (
                          <div 
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStartConfig(e, globalIdx)}
                            onDragOver={(e) => handleDragOverConfig(e, globalIdx)}
                            onDragEnd={handleDragEndConfig}
                            className={`flex items-center justify-between p-3 border rounded-xl transition-all ${
                              item.enabled 
                                ? 'border-emerald-500/50 bg-white shadow-3xs' 
                                : 'border-gray-200 bg-gray-50/50 opacity-70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex items-center gap-1">
                                <div className="cursor-grab text-gray-400 p-1 hover:text-gray-600 shrink-0" title="Arrastrar para reordenar">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'up')}
                                    disabled={globalIdx === 0}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'down')}
                                    disabled={globalIdx === reportConfigs.length - 1}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <h6 className="text-xs font-black text-gray-800 leading-tight">{item.title}</h6>
                                <p className="text-[10px] text-gray-400 font-medium truncate">{item.description}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleReportItemActive(item.id)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                item.enabled ? 'bg-emerald-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  item.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECCIÓN 3: DETALLE DE GASTOS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span>3. Detalle de Gastos</span>
                      </h5>
                      <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 font-extrabold px-2.5 py-0.5 rounded uppercase">
                        Layout: Ancho Completo
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 space-y-2">
                      {reportConfigs.filter(c => c.section === 'detalle').map((item) => {
                        const globalIdx = reportConfigs.findIndex(r => r.id === item.id);
                        return (
                          <div 
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStartConfig(e, globalIdx)}
                            onDragOver={(e) => handleDragOverConfig(e, globalIdx)}
                            onDragEnd={handleDragEndConfig}
                            className={`flex items-center justify-between p-3 border rounded-xl transition-all ${
                              item.enabled 
                                ? 'border-emerald-500/50 bg-white shadow-3xs' 
                                : 'border-gray-200 bg-gray-50/50 opacity-70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex items-center gap-1">
                                <div className="cursor-grab text-gray-400 p-1 hover:text-gray-600 shrink-0" title="Arrastrar para reordenar">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'up')}
                                    disabled={globalIdx === 0}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => moveReportItem(globalIdx, 'down')}
                                    disabled={globalIdx === reportConfigs.length - 1}
                                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                  </button>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <h6 className="text-xs font-black text-gray-800 leading-tight">{item.title}</h6>
                                <p className="text-[10px] text-gray-400 font-medium truncate">{item.description}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleReportItemActive(item.id)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                item.enabled ? 'bg-emerald-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  item.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* MÁS OPCIONES: REPORTES AUTOMÁTICOS POR CORREO */}
                  <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl space-y-3">
                    <span className="text-xs font-black text-amber-900 uppercase tracking-wider block">
                      📬 Reportes de Cierre y Correo Automático
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">
                          Frecuencia de Envío por Correo
                        </label>
                        <select
                          value={dashboardEmailReports}
                          onChange={(e) => setDashboardEmailReports(e.target.value as any)}
                          className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                        >
                          <option value="ninguno">No enviar reportes</option>
                          <option value="diario">Resumen Diario al Cierre</option>
                          <option value="semanal">Resumen Semanal los Domingos</option>
                          <option value="mensual">Resumen Mensual de Fin de Mes</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">
                          Correo Electrónico Destinatario
                        </label>
                        <input
                          type="email"
                          value={dashboardEmailReportsAddress}
                          onChange={(e) => setDashboardEmailReportsAddress(e.target.value)}
                          className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:outline-[#005da9]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* BOTÓN DE GUARDAR ESPECÍFICO */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-150">
                    <span className="text-xs font-bold text-gray-400">
                      {reportConfigs.filter(r => r.enabled).length} de {reportConfigs.length} módulos activados
                    </span>

                    <button
                      type="button"
                      onClick={handleSaveReportConfigs}
                      disabled={savingReportConfigs}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {savingReportConfigs ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Guardar Configuración de Gráficas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: NOTIFICACIONES */}
          {configSubTab === 'notificaciones' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#005da9]" />
                    <span>Alertas Visuales, Sonoras y Push</span>
                  </h4>
                  <p className="text-xs text-gray-400">
                    Controle los efectos de sonido y alertas acústicas al completar ventas o detectar bajo stock.
                  </p>
                </div>
                <span className="text-[10px] bg-sky-50 border border-sky-200 text-[#005da9] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider self-start md:self-auto">
                  Audio & Alertas POS
                </span>
              </div>

              <div className="space-y-4">
                {/* 1. SONIDO DE CAJA REGISTRADORA AL VENDER */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-300">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl shrink-0 mt-0.5">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">
                          Sonido de Caja Registradora al Vender
                        </span>
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
                          Cha-Ching! 🔔
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                        Genera el timbre característico de caja registradora a través de los altavoces al completar una venta o cobro.
                      </p>

                      <button
                        type="button"
                        onClick={() => playCashRegisterSound()}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-[11px] font-extrabold rounded-xl transition shadow-3xs cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>🔊 Probar Sonido de Caja Registradora</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !notifSoundOnSale;
                      setNotifSoundOnSale(nextVal);
                      if (nextVal) playCashRegisterSound();
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out self-end sm:self-center ${
                      notifSoundOnSale ? 'bg-[#005da9]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-3xs ring-0 transition duration-200 ease-in-out ${
                        notifSoundOnSale ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. ALERTA CRÍTICA DE BAJO STOCK (BEEP) */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-300">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">
                          Alerta Crítica de Bajo Stock (Beep)
                        </span>
                        <span className="bg-amber-50 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-amber-200">
                          Aviso Acústico ⚠️
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                        Emite un tono acústico de advertencia (Beep) y notificación en pantalla cuando un artículo alcanza o baja del umbral crítico configurado.
                      </p>

                      <button
                        type="button"
                        onClick={() => playLowStockBeep()}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 text-[11px] font-extrabold rounded-xl transition shadow-3xs cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5 text-amber-600" />
                        <span>🔔 Probar Alerta (Beep)</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !notifPushLowStock;
                      setNotifPushLowStock(nextVal);
                      if (nextVal) playLowStockBeep();
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out self-end sm:self-center ${
                      notifPushLowStock ? 'bg-[#005da9]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-3xs ring-0 transition duration-200 ease-in-out ${
                        notifPushLowStock ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {configSubTab === 'planes_suscripcion' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-600" />
                    <span>Planes de Suscripción</span>
                  </h4>
                  <p className="text-xs text-gray-400">Seleccione el plan que mejor se adapte a las necesidades operativas de su negocio.</p>
                </div>
                <div className="px-3 py-1 bg-sky-50 text-sky-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                  SaaS Licenciamiento
                </div>
              </div>

              {/* BILLING CYCLE SELECTOR */}
              <div className="flex justify-center my-4">
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 w-full max-w-md">
                  <button
                    onClick={() => setBillingCycle('mensual')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      billingCycle === 'mensual' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    onClick={() => setBillingCycle('trimestral')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      billingCycle === 'trimestral' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Trimestral</span>
                    <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded-md">-10%</span>
                  </button>
                  <button
                    onClick={() => setBillingCycle('anual')}
                    className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      billingCycle === 'anual' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Anual</span>
                    <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded-md">-25%</span>
                  </button>
                </div>
              </div>

              {/* PLANS CONTAINER */}
              <div className="space-y-4 max-w-3xl mx-auto">
                
                {/* 1. PLAN PRO */}
                <div 
                  onClick={() => setSelectedPlanId('pro')}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-4 ${
                    selectedPlanId === 'pro' 
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedPlanId === 'pro' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                    }`}>
                      {selectedPlanId === 'pro' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">Plan Pro</span>
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                          <span>Recomendado</span>
                        </span>
                        <span className="bg-sky-100 text-sky-800 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          App + Web
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Acceso a terminales ilimitados, sincronización web y backups continuos en la nube.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="bg-sky-50 text-sky-700 text-xs font-black px-2.5 py-1 rounded-xl">
                      {billingCycle === 'mensual' && '$19.99 / mensual'}
                      {billingCycle === 'trimestral' && '$17.99 / mensual'}
                      {billingCycle === 'anual' && '$14.99 / mensual'}
                    </span>
                  </div>
                </div>

                {/* 2. PLAN BASICO */}
                <div 
                  onClick={() => setSelectedPlanId('basico')}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-4 ${
                    selectedPlanId === 'basico' 
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedPlanId === 'basico' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                    }`}>
                      {selectedPlanId === 'basico' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">Plan básico</span>
                        <span className="bg-teal-100 text-teal-800 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          App
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Perfecto para una única sede de ventas local con respaldo estándar de inventario.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="bg-sky-50 text-sky-700 text-xs font-black px-2.5 py-1 rounded-xl">
                      {billingCycle === 'mensual' && '$9.99 / mensual'}
                      {billingCycle === 'trimestral' && '$8.99 / mensual'}
                      {billingCycle === 'anual' && '$7.49 / mensual'}
                    </span>
                  </div>
                </div>

                {/* 3. PLAN GRATUITO */}
                <div 
                  onClick={() => setSelectedPlanId('gratuito')}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-4 ${
                    selectedPlanId === 'gratuito' 
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedPlanId === 'gratuito' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                    }`}>
                      {selectedPlanId === 'gratuito' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">Plan Free / Demostración</span>
                        <span className="bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          Prueba local
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Ideal para probar la aplicación offline con catálogo y reportes simplificados.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="bg-slate-100 text-slate-700 text-xs font-black px-2.5 py-1 rounded-xl">
                      $0.00 / mensual
                    </span>
                  </div>
                </div>

              </div>

              {/* ACTION BUTTON IN THE FORM OF FOOTER INDICATOR */}
              <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => {
                    setBusinessSaaSPlan(selectedPlanId as any);
                    setTimeout(() => {
                      handleSaveAll();
                    }, 50);
                  }}
                  className="w-full max-w-sm px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl flex items-center justify-between shadow-lg hover:shadow-xl transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-slate-800 text-slate-300 w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center">
                      {selectedPlanId === 'pro' ? '2' : selectedPlanId === 'basico' ? '1' : '0'}
                    </span>
                    <span>Actualizar plan</span>
                  </div>
                  <span className="font-extrabold text-sm flex items-center gap-1 text-emerald-400">
                    {selectedPlanId === 'pro' && (billingCycle === 'mensual' ? '$19.99' : billingCycle === 'trimestral' ? '$17.99' : '$14.99')}
                    {selectedPlanId === 'basico' && (billingCycle === 'mensual' ? '$9.99' : billingCycle === 'trimestral' ? '$8.99' : '$7.49')}
                    {selectedPlanId === 'gratuito' && '$0.00'}
                    <span>&nbsp;›</span>
                  </span>
                </button>
              </div>

              {/* PLAN SUMMARY CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-gray-100 space-y-2">
                  <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span>Beneficios Free</span>
                  </div>
                  <ul className="text-[10px] text-gray-500 space-y-1 text-left list-disc list-inside">
                    <li>1 Terminal de venta</li>
                    <li>Hasta 50 productos</li>
                    <li>Soporte comunitario</li>
                    <li>Reportes simplificados</li>
                  </ul>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-gray-100 space-y-2">
                  <div className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-teal-500" />
                    <span>Beneficios Básico</span>
                  </div>
                  <ul className="text-[10px] text-gray-500 space-y-1 text-left list-disc list-inside">
                    <li>Hasta 2 Terminales</li>
                    <li>Hasta 1,000 productos</li>
                    <li>Soporte WhatsApp</li>
                    <li>Respaldo diario nube</li>
                  </ul>
                </div>
                <div className="p-4 bg-sky-50/40 rounded-2xl border border-sky-100/50 space-y-2">
                  <div className="text-xs font-bold text-sky-800 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                    <span>Beneficios Pro</span>
                  </div>
                  <ul className="text-[10px] text-gray-500 space-y-1 text-left list-disc list-inside">
                    <li>Terminales ILIMITADOS</li>
                    <li>Productos ILIMITADOS</li>
                    <li>E-Commerce Integrado</li>
                    <li>Ejecutivo dedicado 24/7</li>
                  </ul>
                </div>
              </div>

            </div>
          )}

          {/* TAB 9: RESPALDO INTEGRAL Y DEPURACIÓN DE DATOS */}
          {configSubTab === 'mantenimiento' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <span>Respaldo y Mantenimiento de Bases de Datos</span>
                  </h4>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Descargue una copia de seguridad íntegra de toda la información de su negocio (catálogo, operaciones, finanzas, clientes y configuración) y gestione el mantenimiento del sistema.
                  </p>
                </div>
                <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Seguridad y Datos</span>
                </div>
              </div>

              {/* 💾 NOTIFICACIÓN DE RESPALDO DESCARGADO */}
              {backupDownloadMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl space-y-1 animate-scaleUp">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>¡Respaldo descargado exitosamente a su dispositivo!</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Archivo generado: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-200">{backupDownloadMsg.filename}</span> ({backupDownloadMsg.count} registros totales respaldados a las {backupDownloadMsg.timestamp}).
                  </p>
                </div>
              )}

              {/* 1. SECCIÓN PRINCIPAL: DESCARGA DE RESPALDO TOTAL */}
              <div className="p-6 bg-linear-to-br from-slate-900 via-slate-800 to-[#1D3557] rounded-3xl text-white shadow-xl border border-slate-700 relative overflow-hidden space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/30 rounded-full text-emerald-300 text-[11px] font-extrabold uppercase tracking-wider">
                      <Download className="w-3.5 h-3.5" />
                      <span>Copia de Seguridad Completa</span>
                    </div>
                    <h3 className="text-base font-black text-white tracking-wide">
                      Exportar Respaldo de Todos los Registros y Operaciones
                    </h3>
                    <p className="text-xs text-slate-300 font-medium max-w-2xl">
                      Genera un archivo estructurado estándar <code className="text-[#40E0D0] font-mono font-bold">.JSON</code> descargable con el 100% de la información comercial, contable, inventarios, clientes y configuraciones de su sistema.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadFullBackup}
                    disabled={isExportingBackup}
                    className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-xs rounded-2xl shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center gap-2.5 shrink-0 cursor-pointer border border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExportingBackup ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Generando y Empaquetando...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-slate-950" />
                        <span>Descargar Respaldo Completo (.JSON)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* DETALLE DE LO QUE CONTIENE EL RESPALDO */}
                <div className="pt-3 border-t border-slate-700/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1">
                    <span className="text-[11px] font-bold text-emerald-300 block">📦 Catálogo y Stock</span>
                    <p className="text-[10px] text-slate-300">Productos, códigos de barra, costos, precios, categorías y marcas.</p>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1">
                    <span className="text-[11px] font-bold text-sky-300 block">🧾 Operaciones y Ventas</span>
                    <p className="text-[10px] text-slate-300">Facturas, notas de entrega, pedidos e-commerce, compras y cotizaciones.</p>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1">
                    <span className="text-[11px] font-bold text-amber-300 block">🏦 Finanzas y Cuentas</span>
                    <p className="text-[10px] text-slate-300">Cuentas bancarias, transferencias, CxC, CxP, gastos fijos y caja chica.</p>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1">
                    <span className="text-[11px] font-bold text-purple-300 block">⚙️ Configuración y Directorios</span>
                    <p className="text-[10px] text-slate-300">Clientes, proveedores, usuarios, sedes, terminales, impuestos y tasas.</p>
                  </div>
                </div>
              </div>

              {/* 2. SECCIÓN DE DEPURACIÓN / LIMPIEZA DE TRANSACCIONES */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Depuración y Limpieza de Operaciones Realizadas</span>
                    </h5>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                      Permite vaciar de forma segura las operaciones históricas (ventas, pedidos, notas de entrega, cuentas bancarias, CxC y CxP) conservando el inventario, catálogo, clientes, usuarios y configuraciones.
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                    Acción Administrativa
                  </div>
                </div>

                {cleanResult && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>¡Limpieza completada exitosamente!</span>
                    </div>
                    <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                      {Object.entries(cleanResult.details).map(([k, v]) => (
                        <li key={k}>
                          <strong>{k}:</strong> {String(v)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* COMPARATIVE CARDS: PURGED VS PRESERVED */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. SE ELIMINAN / PURGAN */}
                  <div className="p-5 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-3">
                    <div className="flex items-center gap-2 text-rose-900 font-black text-xs uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Datos y Operaciones que se Purgarán (0)</span>
                    </div>
                    <p className="text-[11px] text-rose-700 font-medium">
                      Se borrarán las operaciones registradas para reiniciar la contabilidad y transacciones desde cero:
                    </p>
                    <ul className="text-xs text-rose-950 font-semibold space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Ventas y Facturas:</strong> Histórico de facturas emitidas y anuladas.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Notas de Entrega:</strong> Borradores y comprobantes de entrega.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Pedidos (Orders):</strong> Pedidos de tienda física y catálogo e-commerce.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Cuentas Bancarias:</strong> Movimientos/transferencias bancarias y saldos reseteados a $0.00 / Bs. 0.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Cuentas por Cobrar (CxC):</strong> Saldos pendientes y pagos de clientes.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Cuentas por Pagar (CxP):</strong> Saldos pendientes y pagos a proveedores.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-rose-600 font-bold">•</span>
                        <span><strong>Caja Chica:</strong> Operaciones de ingresos/egresos y sesiones históricas.</span>
                      </li>
                    </ul>
                  </div>

                  {/* 2. SE MANTIENEN 100% INTACTOS */}
                  <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase tracking-wide">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Datos que se CONSERVAN Íntegros</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      Su configuración maestra, catálogo e información estructural no sufrirán ningún cambio:
                    </p>
                    <ul className="text-xs text-emerald-950 font-semibold space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Catálogo de Productos:</strong> Artículos, códigos de barra, costos y precios.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Categorías y Marcas:</strong> Estructura completa de clasificación.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Directorio de Clientes:</strong> Datos de contacto, RIF/Cédula y teléfonos.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Directorio de Proveedores:</strong> Contactos y fichas de proveedores.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Cuentas Bancarias Registradas:</strong> Cuentas bancarias listas para operar.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Usuarios y Contraseñas:</strong> Accesos y roles de administradores/cajeros.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Sedes, Cajas y Parámetros:</strong> Sucursales, impuestos y diseño de tickets.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* ACTION TRIGGER BOX */}
                <div className="p-5 bg-slate-900 rounded-3xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                  <div>
                    <h5 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-400" />
                      <span>Ejecutar Limpieza Exclusiva de Operaciones</span>
                    </h5>
                    <p className="text-xs text-slate-300 font-medium mt-1">
                      Esta acción vacía únicamente las operaciones transaccionales y reinicia los contadores de ventas y balances. Recuerde descargar un respaldo antes si desea conservar copias históricas.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCleanConfirmText('');
                      setShowCleanModal(true);
                    }}
                    className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg hover:shadow-rose-600/30 transition-all flex items-center gap-2 shrink-0 cursor-pointer border border-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpiar Operaciones Realizadas</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* 💾 MODAL DE RESPALDO Y COPIA DE SEGURIDAD GENERADA */}
      {showBackupModal && backupModalData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-emerald-200 w-full max-w-xl p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <span>¡Respaldo Completo Generado con Éxito!</span>
                  </h4>
                  <p className="text-[11px] text-emerald-700 font-bold">
                    El archivo .JSON se ha descargado a su dispositivo.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-900 text-white rounded-2xl space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-black">Nombre del archivo:</span>
              <p className="text-xs font-mono font-bold text-slate-100 break-all select-all">
                {backupModalData.filename}
              </p>
            </div>

            {/* RESUMEN DE REGISTROS PROCESADOS */}
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wide">Registros empaquetados en este respaldo:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">📦 Productos:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.productos || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">🧾 Ventas/Facturas:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.ventas_facturas || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">🚚 Notas Entrega:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.notas_entrega || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">🛒 Pedidos:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.pedidos || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">🏦 Cuentas Banco:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.cuentas_bancarias || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">💰 Cuentas x Cobrar:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.cuentas_por_cobrar || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">📑 Cuentas x Pagar:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.cuentas_por_pagar || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">👥 Clientes:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.clientes || 0}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">🏢 Proveedores:</span>
                  <span className="font-mono font-black text-slate-900">{backupModalData.summary.proveedores || 0}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed">
                Si su navegador bloqueó la descarga automática, haga clic en <strong>"Descargar Archivo Nuevamente"</strong> o utilice el botón de <strong>"Copiar JSON"</strong> para guardar los datos manualmente en un archivo de texto.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCopyBackupToClipboard}
                className={`px-4 py-2.5 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-2 cursor-pointer ${
                  copiedBackup
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-200'
                }`}
              >
                {copiedBackup ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>¡JSON Copiado al Portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-gray-600" />
                    <span>Copiar JSON</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleDirectDownloadAgain}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer shadow-emerald-600/30"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Archivo Nuevamente</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🧹 MODAL DE CONFIRMACIÓN: LIMPIEZA DE OPERACIONES */}
      {showCleanModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-rose-200 w-full max-w-lg p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">¿Confirmar Limpieza de Operaciones?</h4>
                <p className="text-[11px] text-gray-500 font-medium">Esta acción eliminará todas las transacciones realizadas (ventas, pedidos, notas de entrega, movimientos bancarios, CxC y CxP).</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs">
              <p className="font-bold text-rose-900 flex items-center gap-1.5">
                <span>⚠️ Por favor escribe</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-rose-300 text-rose-700 font-black">LIMPIAR</span>
                <span>para habilitar la confirmación:</span>
              </p>
              <input
                type="text"
                value={cleanConfirmText}
                onChange={(e) => setCleanConfirmText(e.target.value.toUpperCase())}
                placeholder="Escribe LIMPIAR aquí"
                className="w-full p-2.5 bg-white border border-rose-300 rounded-xl text-xs font-bold text-rose-900 focus:outline-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isCleaning}
                onClick={() => {
                  setShowCleanModal(false);
                  setCleanConfirmText('');
                }}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={cleanConfirmText !== 'LIMPIAR' || isCleaning}
                onClick={handleExecuteOperationalClean}
                className={`px-5 py-2.5 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-2 ${
                  cleanConfirmText === 'LIMPIAR' && !isCleaning
                    ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer shadow-rose-600/30'
                    : 'bg-rose-300 cursor-not-allowed opacity-60'
                }`}
              >
                {isCleaning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Limpiando base de datos...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sí, Limpiar Todas las Operaciones</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📍 MODAL: CREAR / EDITAR SEDE */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border border-gray-200 w-full max-w-lg p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#005da9]" />
                <span>{editingBranch?.id && editingBranch.id.length > 5 ? 'Editar Sede / Sucursal' : 'Nueva Sede / Sucursal'}</span>
              </h4>
              <button
                onClick={() => {
                  setShowBranchModal(false);
                  setEditingBranch(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Código*</label>
                  <input
                    type="text"
                    value={editingBranch?.code || ''}
                    onChange={(e) => setEditingBranch({ ...editingBranch, code: e.target.value })}
                    placeholder="SP-01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono uppercase font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Nombre de la Sede*</label>
                  <input
                    type="text"
                    value={editingBranch?.name || ''}
                    onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                    placeholder="Sede Principal Bella Vista"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Dirección Física</label>
                <input
                  type="text"
                  value={editingBranch?.address || ''}
                  onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                  placeholder="Calle 72 con Av. Bella Vista"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Teléfono / Celular de Contacto</label>
                <input
                  type="text"
                  value={editingBranch?.phone || ''}
                  onChange={(e) => setEditingBranch({ ...editingBranch, phone: e.target.value })}
                  placeholder="+58 412-5043857"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="font-bold text-gray-800 block text-xs">Estado de la Sede</span>
                  <span className="text-[10px] text-gray-500">Permite realizar cobros y asociar terminales activos</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingBranch({ ...editingBranch, active: !(editingBranch?.active ?? true) })}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                    (editingBranch?.active ?? true)
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {(editingBranch?.active ?? true) ? 'Habilitada' : 'Inactiva'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowBranchModal(false);
                  setEditingBranch(null);
                }}
                className="px-4 py-2 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingBranch) handleSaveBranch(editingBranch);
                }}
                className="px-5 py-2 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Sede</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💻 MODAL: GESTIONAR CAJAS / TERMINALES DE UNA SEDE */}
      {showTerminalModal && selectedBranchForTerminals && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border border-gray-200 w-full max-w-xl p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-[#005da9]" />
                  <span>Terminales y Cajas: {selectedBranchForTerminals.name}</span>
                </h4>
                <p className="text-xs text-gray-400 font-mono">Código Sede: {selectedBranchForTerminals.code}</p>
              </div>
              <button
                onClick={() => {
                  setShowTerminalModal(false);
                  setSelectedBranchForTerminals(null);
                  setEditingTerminal(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario para Crear / Editar Caja */}
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
              <span className="text-xs font-black text-[#005da9] block">
                {editingTerminal?.id ? 'Modificar Terminal / Caja' : '+ Agregar Nueva Terminal a esta Sede'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Código*</label>
                  <input
                    type="text"
                    value={editingTerminal?.code || ''}
                    onChange={(e) => setEditingTerminal({ ...(editingTerminal || {}), code: e.target.value, branch_id: selectedBranchForTerminals.id })}
                    placeholder="C1"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono uppercase font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Nombre descriptivo*</label>
                  <input
                    type="text"
                    value={editingTerminal?.name || ''}
                    onChange={(e) => setEditingTerminal({ ...(editingTerminal || {}), name: e.target.value, branch_id: selectedBranchForTerminals.id })}
                    placeholder="Caja Principal #1 (Mostrador)"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                {editingTerminal && (
                  <button
                    type="button"
                    onClick={() => setEditingTerminal(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-bold"
                  >
                    Cancelar edición
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (editingTerminal) {
                      handleSaveTerminal({
                        ...editingTerminal,
                        branch_id: selectedBranchForTerminals.id
                      });
                    } else {
                      alert('Por favor ingrese los datos de la terminal.');
                    }
                  }}
                  className="px-4 py-2 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingTerminal?.id ? 'Guardar Cambios' : 'Registrar Caja'}</span>
                </button>
              </div>
            </div>

            {/* Listado de Cajas existentes de esta sede */}
            <div className="space-y-2">
              <span className="text-xs font-black text-gray-800 uppercase block">Cajas registradas en esta sede</span>
              {businessCajas.filter(c => c.branch_id === selectedBranchForTerminals.id).length === 0 ? (
                <div className="p-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-250 text-gray-400 text-xs">
                  No hay cajas registradas para esta sede. Utiliza el formulario superior para crear la primera.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white">
                  {businessCajas
                    .filter(c => c.branch_id === selectedBranchForTerminals.id)
                    .map(terminal => (
                      <div key={terminal.id} className="p-3 flex items-center justify-between hover:bg-gray-50/80 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-mono font-bold text-xs text-slate-700">
                            {terminal.code}
                          </div>
                          <div>
                            <h6 className="text-xs font-bold text-gray-900">{terminal.name}</h6>
                            <span className={`text-[10px] font-bold ${terminal.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {terminal.active ? '● Activa y en servicio' : '○ Inactiva'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveTerminal({ ...terminal, active: !terminal.active })}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                              terminal.active 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                : 'bg-gray-100 text-gray-600 border-gray-250 hover:bg-gray-200'
                            }`}
                          >
                            {terminal.active ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTerminal(terminal)}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                            title="Editar Caja"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTerminalToDelete(terminal)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Eliminar Caja"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowTerminalModal(false);
                  setSelectedBranchForTerminals(null);
                  setEditingTerminal(null);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ MODAL CONFIRMACIÓN: ELIMINAR SEDE */}
      {branchToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border border-rose-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">¿Eliminar Sede?</h4>
                <p className="text-xs text-gray-500 font-medium">Esta acción eliminará la sede y sus terminales asociadas.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1 text-xs">
              <p className="font-bold text-rose-900">
                {branchToDelete.name} ({branchToDelete.code})
              </p>
              {branchToDelete.address && (
                <p className="text-[11px] text-rose-700">{branchToDelete.address}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingBranch}
                onClick={() => setBranchToDelete(null)}
                className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingBranch}
                onClick={confirmDeleteBranch}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingBranch ? 'Eliminando...' : 'Sí, Eliminar Sede'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ MODAL CONFIRMACIÓN: ELIMINAR TERMINAL / CAJA */}
      {terminalToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border border-rose-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">¿Eliminar Terminal / Caja?</h4>
                <p className="text-xs text-gray-500 font-medium">Esta acción eliminará el punto de venta de la base de datos.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1 text-xs">
              <p className="font-bold text-rose-900">
                {terminalToDelete.name} ({terminalToDelete.code})
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingTerminal}
                onClick={() => setTerminalToDelete(null)}
                className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingTerminal}
                onClick={confirmDeleteTerminal}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingTerminal ? 'Eliminando...' : 'Sí, Eliminar Caja'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💳 MODAL: MÉTODOS DE PAGO DEL SISTEMA (MATCHING USER REFERENCE) */}
      {showPaymentMethodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-gray-150 w-full max-w-xl p-6 shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto animate-scaleUp">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#103b6e]/10 text-[#103b6e] flex items-center justify-center font-black">
                  <CreditCard className="w-4 h-4 text-[#103b6e]" />
                </div>
                <h4 className="text-sm sm:text-base font-montserrat font-extrabold text-[#1D3557]">
                  Métodos de Pago del Sistema
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentMethodModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DESCRIPTION */}
            <p className="text-xs text-gray-600 leading-relaxed">
              Aquí puede ver todos los métodos de cobro registrados en el sistema y a cuál cuenta bancaria están fijados actualmente.
            </p>

            {paymentMethodMsg && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                paymentMethodMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {paymentMethodMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
                <span>{paymentMethodMsg.text}</span>
              </div>
            )}

            {/* FORM CONTAINER: REGISTRAR NUEVO MÉTODO DE PAGO */}
            <form onSubmit={handleCreateManagerPaymentMethod} className="bg-[#f8fafd] border border-[#e2e8f0] p-4 sm:p-5 rounded-2xl space-y-3.5">
              <div className="text-[11px] font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                REGISTRAR NUEVO MÉTODO DE PAGO:
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                  NOMBRE DEL MÉTODO *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago móvil Banesco, Zelle Empresa"
                  value={mgrNewName}
                  onChange={(e) => setMgrNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:border-[#103b6e] focus:ring-1 focus:ring-[#103b6e] transition outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                    MONEDA
                  </label>
                  <select
                    value={mgrNewCurrency}
                    onChange={(e) => setMgrNewCurrency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-medium text-gray-800 focus:border-[#103b6e] transition outline-none cursor-pointer"
                  >
                    {systemCurrencies && systemCurrencies.length > 0 ? (
                      systemCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.symbol || c.code} - {c.code})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="VES">Bolívares (VES)</option>
                        <option value="USD">Dólares (USD)</option>
                        <option value="EUR">Euros (EUR)</option>
                        <option value="COP">Pesos Colombianos (COP)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                    TIPO
                  </label>
                  <select
                    value={mgrNewType}
                    onChange={(e) => setMgrNewType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-medium text-gray-800 focus:border-[#103b6e] transition outline-none cursor-pointer"
                  >
                    <option value="movil">Pago Móvil</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="punto">Punto de Venta</option>
                    <option value="digital">Digital (Zelle/Binance)</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                    FIJAR A CUENTA
                  </label>
                  <select
                    value={mgrTargetAccountId}
                    onChange={(e) => setMgrTargetAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-medium text-gray-800 focus:border-[#103b6e] transition outline-none cursor-pointer"
                  >
                    <option value="">-- Sin fijar aún --</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isRegisteringMethod}
                className="w-full mt-2 py-2.5 bg-[#1D3557] hover:bg-[#152741] text-white font-montserrat font-extrabold text-xs rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {isRegisteringMethod ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : null}
                <span>Registrar método en el sistema</span>
              </button>
            </form>

            {/* LIST: MÉTODOS Y CUENTAS VINCULADAS */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase tracking-wide">
                MÉTODOS Y CUENTAS VINCULADAS
              </div>

              {loadingPaymentMethods ? (
                <div className="p-6 text-center text-xs text-gray-400 font-medium">
                  Cargando métodos de pago...
                </div>
              ) : paymentMethodsList.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400 font-medium bg-slate-50 rounded-xl border border-dashed border-gray-200">
                  No hay métodos de pago registrados en el sistema.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                  {paymentMethodsList.map((pm) => {
                    const bound = getMethodBoundAccount(pm);
                    const isMovil = pm.type === 'movil' || pm.name.toLowerCase().includes('movil') || pm.name.toLowerCase().includes('móvil');
                    const isEfectivo = pm.type === 'efectivo' || pm.name.toLowerCase().includes('efectivo');
                    
                    return (
                      <div
                        key={pm.id}
                        className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between shadow-2xs hover:border-slate-300 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isMovil
                                ? 'bg-purple-50 text-[#7928CA]'
                                : isEfectivo
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-blue-50 text-[#005da9]'
                            }`}
                          >
                            {isMovil ? (
                              <Smartphone className="w-4 h-4" />
                            ) : isEfectivo ? (
                              <Banknote className="w-4 h-4" />
                            ) : (
                              <Landmark className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-montserrat font-bold text-xs text-gray-800">
                              {pm.name}
                            </p>
                            <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">
                              {pm.currency} • {pm.type.toUpperCase()}
                            </p>
                          </div>
                        </div>

                        <div>
                          {bound.isBound ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-[#1D3557] border border-slate-200">
                              <Lock className="w-3 h-3 text-[#1D3557]" />
                              <span>Fijado a: {bound.accountName}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                              <Unlock className="w-3 h-3 text-slate-400" />
                              <span>Disponible (Sin cuenta)</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="flex items-center justify-end pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPaymentMethodModal(false)}
                className="px-6 py-2 bg-white hover:bg-slate-50 text-slate-700 font-montserrat font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs active:scale-98"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏷️ MODAL: MODIFICAR IMPUESTO */}
      {editingTax && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-gray-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#103b6e] flex items-center justify-center font-black">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 font-montserrat">
                    Modificar Impuesto
                  </h4>
                  <p className="text-[11px] text-gray-500">Actualice la tasa porcentual o el estado del impuesto.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTax(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTax} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">
                  Nombre del Impuesto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: IVA General, IVA Reducido"
                  value={editingTax.name}
                  onChange={(e) => setEditingTax({ ...editingTax, name: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#103b6e] transition outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">
                  Porcentaje Impositivo (%) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="Ej: 16"
                    value={editingTax.rate}
                    onChange={(e) => setEditingTax({ ...editingTax, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#103b6e] transition outline-none font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 font-mono">%</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={editingTax.is_active}
                    onChange={(e) => setEditingTax({ ...editingTax, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-[#103b6e] focus:ring-0"
                  />
                  <div>
                    <span className="font-montserrat">Impuesto Vigente (Activo)</span>
                    <p className="text-[10px] font-normal text-gray-500">Disponible para cálculos de facturación y notas de entrega.</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingTax(null)}
                  className="px-4 py-2 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTax}
                  className="px-5 py-2 bg-[#103b6e] hover:bg-[#0c2e56] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingTax ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚠️ MODAL CONFIRMACIÓN: ELIMINAR IMPUESTO */}
      {taxToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-rose-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900 font-montserrat">¿Eliminar Impuesto?</h4>
                <p className="text-xs text-gray-500 font-medium">Esta acción eliminará el impuesto de forma permanente.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1 text-xs">
              <p className="font-bold text-rose-900 font-montserrat">
                {taxToDelete.name} — <span className="font-mono">{taxToDelete.rate}%</span>
              </p>
              <p className="text-[11px] text-rose-700">
                Estado: {taxToDelete.is_active ? 'Vigente' : 'Inactivo'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeletingTax}
                onClick={() => setTaxToDelete(null)}
                className="px-4 py-2 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingTax}
                onClick={handleConfirmDeleteTax}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingTax ? 'Eliminando...' : 'Sí, Eliminar Impuesto'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💳 MODAL: MODIFICAR MÉTODO DE PAGO INDIVIDUAL */}
      {showEditSingleModal && editingPaymentMethod && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-gray-150 w-full max-w-xl p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#005da9] flex items-center justify-center font-black">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900">
                    Modificar Método de Pago
                  </h4>
                  <p className="text-[11px] text-gray-500">Configure los datos, moneda y condiciones de cobro.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditSingleModal(false);
                  setEditingPaymentMethod(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentMethod} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Nombre del Método *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Pago Móvil C2P, Banesco Panamá, etc."
                    value={editingPaymentMethod.name || ''}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, name: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Código Identificador</label>
                  <input
                    type="text"
                    placeholder="Ej: PAGOMOVIL_01, ZELLE_02"
                    value={editingPaymentMethod.code || ''}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Tipo de Canal</label>
                  <select
                    value={editingPaymentMethod.type || 'otro'}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, type: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                  >
                    <option value="movil">Pago Móvil (Interbancario)</option>
                    <option value="efectivo">Efectivo (Físico en Caja)</option>
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="punto">Punto de Venta / POS (Tarjeta)</option>
                    <option value="digital">Billetera Digital / Cripto / Zelle</option>
                    <option value="otro">Otro Método</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Moneda de Recepción</label>
                  <select
                    value={editingPaymentMethod.currency || 'VES'}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, currency: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                  >
                    {systemCurrencies && systemCurrencies.length > 0 ? (
                      systemCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.symbol || c.code} - {c.code})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="VES">Bolívares (Bs. / VES)</option>
                        <option value="USD">Dólares (USD $)</option>
                        <option value="EUR">Euros (€ / EUR)</option>
                        <option value="COP">Pesos Colombianos (COP)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Datos Bancarios / Cuenta / Cédula / Teléfono</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Banesco 0134-xxxx | CI: V-12345678 | Tlf: 0412-1234567 | Titular: Papelería Bella Vista"
                  value={editingPaymentMethod.account_details || ''}
                  onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, account_details: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                />
              </div>

              {/* TOGGLES */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingPaymentMethod.is_active !== false}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-[#005da9] focus:ring-0"
                  />
                  <span>Método Activo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingPaymentMethod.requires_reference === true}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, requires_reference: e.target.checked })}
                    className="w-4 h-4 rounded text-[#005da9] focus:ring-0"
                  />
                  <span>Pide Referencia</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingPaymentMethod.allow_online !== false}
                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, allow_online: e.target.checked })}
                    className="w-4 h-4 rounded text-[#005da9] focus:ring-0"
                  />
                  <span>Disponible en Web</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditSingleModal(false);
                    setEditingPaymentMethod(null);
                  }}
                  className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#005da9] hover:bg-[#004a87] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Configuración</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🪙 MODAL: CREAR / MODIFICAR MONEDA PRINCIPAL */}
      {showCurrencyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-gray-150 w-full max-w-lg p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#005da9] flex items-center justify-center font-black">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 font-montserrat">
                    {editingCurrency ? 'Modificar Moneda' : 'Crear Nueva Moneda'}
                  </h4>
                  <p className="text-[11px] text-gray-500 font-medium">Configuración de parámetros y tasa de cambio.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCurrencyModal(false);
                  setEditingCurrency(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCurrencyModal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Código ISO *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ej: VES, EUR, BRL, CLP"
                    value={currencyForm.code}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })}
                    disabled={editingCurrency?.code === 'USD'}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono uppercase disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Código País / Tag</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Ej: VE, US, EU, BR"
                    value={currencyForm.country_code}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, country_code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Nombre Descriptivo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Bolívar Digital, Euro Europeo, Real Brasileño"
                  value={currencyForm.name}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Símbolo Divisa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: $, Bs., €, R$, COP$"
                    value={currencyForm.symbol}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Tasa de Cambio (1 USD =) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 842.20"
                    value={currencyForm.rate}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, rate: e.target.value })}
                    disabled={editingCurrency?.code === 'USD'}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Posición del Símbolo</label>
                  <select
                    value={currencyForm.position}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, position: e.target.value as 'prefix' | 'suffix' })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none"
                  >
                    <option value="prefix">Prefijo (Ej: $ 100.00)</option>
                    <option value="suffix">Sufijo (Ej: 100.00 Bs.)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1 font-montserrat">Número de Decimales</label>
                  <select
                    value={currencyForm.decimals}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, decimals: Number(e.target.value) })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-[#005da9] transition outline-none font-mono"
                  >
                    <option value={0}>0 Decimales (100)</option>
                    <option value={2}>2 Decimales (100.00)</option>
                    <option value={4}>4 Decimales (100.0000)</option>
                  </select>
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={currencyForm.is_active}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-[#005da9] focus:ring-0"
                  />
                  <span>Moneda Habilitada y Activa en el Sistema</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCurrencyModal(false);
                    setEditingCurrency(null);
                  }}
                  className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCurrency}
                  className="px-5 py-2.5 bg-[#005da9] hover:bg-[#004a87] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer font-montserrat"
                >
                  {isSavingCurrency ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{isSavingCurrency ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚠️ MODAL CONFIRMACIÓN: ELIMINAR MONEDA */}
      {currencyToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left font-poppins">
          <div className="bg-white rounded-3xl border border-rose-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900 font-montserrat">¿Eliminar Moneda?</h4>
                <p className="text-xs text-gray-500 font-medium">Esta acción eliminará la moneda de la base de datos.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1 text-xs">
              <p className="font-bold text-rose-900 font-montserrat">
                {currencyToDelete.name} ({currencyToDelete.code}) — {currencyToDelete.symbol}
              </p>
              <p className="text-[11px] text-rose-700 font-mono">
                Tasa registrada: 1 USD = {currencyToDelete.rate} {currencyToDelete.symbol}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingCurrency}
                onClick={() => setCurrencyToDelete(null)}
                className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingCurrency}
                onClick={handleDeleteCurrencyConfirm}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingCurrency ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeletingCurrency ? 'Eliminando...' : 'Sí, Eliminar Moneda'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {paymentMethodToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border border-rose-150 w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">¿Eliminar Método de Pago?</h4>
                <p className="text-xs text-gray-500 font-medium">Esta acción eliminará el método de pago de la lista activa.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1 text-xs">
              <p className="font-bold text-rose-900">
                {paymentMethodToDelete.name} ({paymentMethodToDelete.currency})
              </p>
              {paymentMethodToDelete.account_details && (
                <p className="text-[11px] text-rose-700">{paymentMethodToDelete.account_details}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentMethodToDelete(null)}
                className="px-4 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeletePaymentMethod}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Método</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemConfigPanel;
