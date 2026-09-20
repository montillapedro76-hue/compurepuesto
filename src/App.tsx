/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { 
  Package, CheckCircle2, AlertTriangle, 
  Settings, Phone, ArrowUp, ArrowRight, Info, ShieldAlert, Lock, Bell, ClipboardList, ShoppingCart, Clock, Globe, Home, Search, User, DollarSign, LayoutDashboard, RefreshCw
} from 'lucide-react';
import { Category, Brand, Product, ProductImage, CartItem, Order, StoreUser, AdminMenuType } from './types';
import { dbService } from './lib/supabase.ts';
import Navbar from './components/Navbar.tsx';
import Sidebar from './components/Sidebar.tsx';
import ProductCard from './components/ProductCard.tsx';
import AmazonCarousel from './components/AmazonCarousel.tsx';
import { CurrencyCode, DEFAULT_RATES, getCachedCurrencyRates, saveCachedCurrencyRates, getSavedCurrency, saveCurrency } from './lib/currency';
import { useI18n } from './lib/i18n.ts';
import { BcvRatePromptModal, checkBcvExchangeRate, BcvQuote } from './components/BcvRatePromptModal.tsx';
import { ManualBcvRateModal } from './components/ManualBcvRateModal.tsx';
import { shouldCheckBcvRate, recordBcvCheckTimestamp, isRateDismissedRecently, getActiveAutoBcvSlot } from './lib/bcvRateChecker';
import { lazyWithRetry } from './lib/lazyWithRetry.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// 🚀 Lazy-Loaded Heavy Components & Modals with Auto-Retry
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel.tsx'));
const ProductDetailModal = lazyWithRetry(() => import('./components/ProductDetailModal.tsx'));
const SettingsModal = lazyWithRetry(() => import('./components/SettingsModal.tsx'));
const CartDrawer = lazyWithRetry(() => import('./components/CartDrawer.tsx'));
const InfoModal = lazyWithRetry(() => import('./components/InfoModal.tsx'));
const OrderTrackingModal = lazyWithRetry(() => import('./components/OrderTrackingModal.tsx'));
const TortaTresLechesLanding = lazyWithRetry(() => import('./components/TortaTresLechesLanding.tsx'));
const BarcodeScannerModal = lazyWithRetry(() => import('./components/BarcodeScannerModal.tsx'));
const LoginModal = lazyWithRetry(() => import('./components/LoginModal.tsx'));
const CustomerDashboardModal = lazyWithRetry(() => import('./components/CustomerDashboardModal.tsx'));
const MobileCurrencyModal = lazyWithRetry(() => import('./components/MobileCurrencyModal.tsx'));

const ModalSuspenseFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none pointer-events-none">
    <div className="bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-2xl flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-[#FF9900] border-t-transparent rounded-full animate-spin"></div>
      <span className="text-xs font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider">Cargando...</span>
    </div>
  </div>
);

const AdminSuspenseFallback = () => (
  <div className="min-h-[450px] flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm text-center select-none animate-fadeIn my-4">
    <div className="w-10 h-10 border-3 border-[#FF9900]/30 border-t-[#FF9900] rounded-full animate-spin mb-4"></div>
    <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-gray-100">Iniciando Panel de Administración</h3>
    <p className="text-xs text-gray-500 mt-1 font-semibold">Cargando módulos de gestión en tiempo real...</p>
  </div>
);

export default function App() {
  const { t } = useI18n();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Display toast utility (Short duration: default 1800ms)
  const triggerToast = useCallback((message: string, duration = 1800) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  // Multi-Currency State
  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>('VES');
  const [currencyRates, setCurrencyRates] = useState<Record<CurrencyCode, number>>(getCachedCurrencyRates);

  const handleCurrencyChange = useCallback((newCurrency: CurrencyCode) => {
    setActiveCurrency(newCurrency);
    // Deliberately not saving to localStorage so it always resets to VES on reload
  }, []);

  // Listen for currency change events and real-time BCV updates from any part of the app
  useEffect(() => {
    const handleCustomCurrencyEvent = (e: any) => {
      if (e.detail && ['USD', 'VES', 'EUR', 'COP'].includes(e.detail)) {
        setActiveCurrency(e.detail as CurrencyCode);
      }
    };

    const handleBcvRateUpdated = (e: any) => {
      const newRate = Number(e?.detail?.rate);
      if (newRate && newRate > 0) {
        setCurrencyRates(prev => {
          if (Math.abs(prev.VES - newRate) < 0.0001) return prev;
          const updated = { ...prev, VES: newRate };
          saveCachedCurrencyRates(updated);
          return updated;
        });
      }
    };

    window.addEventListener('bellavista_currency_changed', handleCustomCurrencyEvent);
    window.addEventListener('bellavista_bcv_rate_updated', handleBcvRateUpdated);
    return () => {
      window.removeEventListener('bellavista_currency_changed', handleCustomCurrencyEvent);
      window.removeEventListener('bellavista_bcv_rate_updated', handleBcvRateUpdated);
    };
  }, []);

  // Load currency rates from database on mount and check live official BCV rate
  useEffect(() => {
    const loadRates = async () => {
      try {
        const newRates = { ...getCachedCurrencyRates() };
        
        // 1. Load general currency rates from Supabase
        const rates = await dbService.getAllCurrencyRates();
        if (rates && rates.length > 0) {
          rates.forEach((r: any) => {
            if (r.code in newRates && Number(r.rate) > 0) {
              newRates[r.code as CurrencyCode] = Number(r.rate);
            }
          });
        }

        // 2. Query and overlay the latest specific BCV rate from the bcv_rates table
        const latestBcv = await dbService.getLatestBcvRate();
        if (latestBcv && Number(latestBcv.rate) > 0) {
          newRates.VES = Number(latestBcv.rate);
        }

        saveCachedCurrencyRates(newRates);
        setCurrencyRates({ ...newRates });

        // 3. Verificación inmediata en tiempo real con la página oficial del BCV / Tasa Futura:
        // "solo se debe actualizar cuando la tasa sea menor a la especificada en la pagina oficial o sea menor a la tasa futura."
        try {
          const res = await fetch('/api/bcv/rates');
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.usdRate === 'number' && data.usdRate > 0) {
              const officialBcvRate = data.usdRate;
              const isFuture = !!data.isFutureRate;

              if (newRates.VES < officialBcvRate - 0.005) {
                const updatedFinalRate = Number(officialBcvRate.toFixed(4));
                const reason = isFuture ? 'BCV Tasa Futura (Inicio)' : 'BCV Oficial (Inicio)';

                // Grabar en tiempo real en Supabase en las tablas correspondientes
                await dbService.updateCurrencyRate('VES', updatedFinalRate, reason);

                newRates.VES = updatedFinalRate;
                saveCachedCurrencyRates(newRates);
                setCurrencyRates({ ...newRates });

                window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: updatedFinalRate, auto: true } }));
                window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
              }
            }
          }
        } catch (bcvFetchErr) {
          console.warn("Verificación de tasa oficial al iniciar:", bcvFetchErr);
        }
      } catch (err) {
        console.error("Error loading currency rates:", err);
      }
    };
    loadRates();
  }, []);

  // Keep ratesRef up to date for background interval checking
  const ratesRef = useRef<Record<CurrencyCode, number>>(currencyRates);
  useEffect(() => {
    ratesRef.current = currencyRates;
  }, [currencyRates]);

  const [bcvQuote, setBcvQuote] = useState<BcvQuote | null>(null);
  const [showManualBcvModal, setShowManualBcvModal] = useState<boolean>(false);
  const [manualBcvSuggestedRate, setManualBcvSuggestedRate] = useState<number | null>(null);

  /**
   * Ejecución automática de cambio de tasa a las 20:00 y a las 00:00 (Hora de Venezuela / Caracas UTC-4):
   * Si la tasa oficial del BCV es mayor a la que tiene el sistema, la actualiza automáticamente.
   * De lo contrario, mantiene la vigente guardada en la base de datos.
   */
  const checkAndApplyAutoBcvAtScheduledHours = useCallback(async () => {
    try {
      const activeSlot = getActiveAutoBcvSlot();
      if (!activeSlot.slotId) return; // Fuera de ventana de 20:00 o 00:00

      const slotProcessed = localStorage.getItem(activeSlot.slotKey);
      if (slotProcessed) {
        // Ya fue evaluado para este slot y fecha
        return;
      }

      // Obtener tasa oficial del BCV
      let bcvRate: number | null = null;
      try {
        const res = await fetch('/api/bcv/rates');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.usdRate === 'number' && data.usdRate > 0) {
            bcvRate = data.usdRate;
          }
        }
      } catch (e) {
        console.warn('Error fetching auto BCV rate:', e);
      }

      if (!bcvRate) {
        try {
          const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.promedio === 'number' && data.promedio > 0) {
              bcvRate = data.promedio;
            }
          }
        } catch (e) {
          console.warn('Error fetching fallback auto BCV rate:', e);
        }
      }

      if (!bcvRate || bcvRate <= 0) return;

      const currentVES = ratesRef.current.VES;

      // REGLA: Si la tasa BCV es mayor a la del sistema, se actualiza automáticamente.
      // De lo contrario, se mantiene la vigente guardada en la base de datos.
      if (bcvRate > currentVES + 0.005) {
        const finalRate = Number(bcvRate.toFixed(4));
        await dbService.updateCurrencyRate('VES', finalRate, `BCV Auto (${activeSlot.slotLabel})`);
        await dbService.updateBcvRate(finalRate, `Sistema Automático (${activeSlot.slotLabel})`);

        setCurrencyRates(prev => ({ ...prev, VES: finalRate }));
        window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: finalRate, auto: true } }));
        window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));

        localStorage.setItem(activeSlot.slotKey, `updated_${finalRate}`);
        triggerToast(`⚡ Tasa BCV actualizada en automático (${activeSlot.slotLabel}): Bs. ${finalRate.toFixed(2)} (Mayor a la anterior Bs. ${currentVES.toFixed(2)})`);
      } else {
        // Si no es mayor, mantener la vigente guardada en la base de datos
        localStorage.setItem(activeSlot.slotKey, `maintained_${currentVES}`);
      }
    } catch (e) {
      console.warn('Error executing scheduled BCV auto update:', e);
    }
  }, [triggerToast]);

  const checkAndPromptBcvRate = useCallback(async (force = false) => {
    try {
      // 1. Ejecutar verificación automática de horario programado (20:00 / 00:00)
      await checkAndApplyAutoBcvAtScheduledHours();

      // 2. Si no es forzado manualmente, verificar si ya se cumplió el intervalo de 1 hora
      if (!shouldCheckBcvRate(force)) {
        return;
      }

      // Registrar timestamp de la verificación de esta hora
      recordBcvCheckTimestamp();

      // 3. Consultar tasa real del BCV oficial
      let bcvData: any = null;
      try {
        const res = await fetch('/api/bcv/rates');
        if (res.ok) {
          bcvData = await res.json();
        }
      } catch (e) {
        console.warn('Error fetching /api/bcv/rates:', e);
      }

      if (!bcvData || typeof bcvData.usdRate !== 'number' || bcvData.usdRate <= 0) {
        try {
          const resFallback = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (resFallback.ok) {
            const fb = await resFallback.json();
            if (fb && typeof fb.promedio === 'number' && fb.promedio > 0) {
              bcvData = {
                usdRate: fb.promedio,
                isFutureRate: false,
                valueDate: fb.fechaActualizacion
              };
            }
          }
        } catch (fbErr) {
          console.warn('Error fallback BCV:', fbErr);
        }
      }

      if (!bcvData || !bcvData.usdRate || bcvData.usdRate <= 0) {
        if (force) {
          triggerToast('No se pudo conectar con el portal oficial del BCV en este instante');
        }
        return;
      }

      const currentVES = ratesRef.current.VES;
      const officialRate = bcvData.usdRate;
      const isFuture = !!bcvData.isFutureRate;

      // REGLA FUNDAMENTAL:
      // "solo se debe actualizar cuando la tasa sea menor a la especificada en la pagina oficial o sea menor a la tasa futura.
      // repara esto en tiempo real, no simules datos."
      if (currentVES < officialRate - 0.005) {
        const finalRate = Number(officialRate.toFixed(4));
        const origin = isFuture ? 'BCV Tasa Futura' : 'BCV Oficial';

        // Grabar en tiempo real en Supabase en las tablas correspondientes
        await dbService.updateCurrencyRate('VES', finalRate, origin);

        setCurrencyRates(prev => {
          const updated = { ...prev, VES: finalRate };
          saveCachedCurrencyRates(updated);
          return updated;
        });

        window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: finalRate, auto: true } }));
        window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));

        triggerToast(`⚡ Tasa BCV actualizada en tiempo real en Supabase: Bs. ${finalRate.toFixed(2)}${isFuture ? ' (Tasa Futura Oficial)' : ''}`);
      } else {
        // La tasa del sistema es mayor o igual a la oficial o futura: se mantiene la vigente
        if (force) {
          triggerToast(`La tasa del sistema (Bs. ${Number(currentVES).toFixed(2)}) está al día y vigente frente al BCV oficial (Bs. ${Number(officialRate).toFixed(2)})`);
        }
      }
    } catch (e) {
      console.warn('Error al consultar tasa BCV:', e);
      if (force) {
        triggerToast('No se pudo consultar el BCV en este momento');
      }
    }
  }, [checkAndApplyAutoBcvAtScheduledHours, triggerToast]);

  // Auto-Consultar Tasa BCV al ingresar a la página, cada hora o al realizar procedimientos
  useEffect(() => {
    dbService.normalizeAllUserEmailsToLowerCase();

    // 1. Consulta inicial al ingresar a la página (1.2s tras montar componentes)
    const initialTimer = setTimeout(() => {
      checkAndPromptBcvRate(false);
    }, 1200);

    // 2. Verificación periódica cada hora (revisa cada 5 minutos si ya transcurrió la hora)
    const intervalTimer = setInterval(() => {
      checkAndPromptBcvRate(false);
    }, 5 * 60 * 1000);

    // 3. Verificación al realizar cualquier procedimiento en el sistema
    const handleProcedure = () => {
      checkAndPromptBcvRate(false);
    };
    window.addEventListener('bellavista_procedure_executed', handleProcedure);

    // 4. Verificación en interacciones de usuario (ventas, cobros, navegación, botones)
    let lastInteractionTime = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      // Throttling ligero para no evaluar en cada milisegundo: una vez cada 20 segundos
      if (now - lastInteractionTime > 20000) {
        lastInteractionTime = now;
        checkAndPromptBcvRate(false);
      }
    };
    window.addEventListener('click', handleUserInteraction, { passive: true });

    // 5. Verificación al reenfocar o volver a la pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndPromptBcvRate(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 6. Consulta manual desde el botón en el Navbar
    const handleTriggerBcvCheck = () => {
      checkAndPromptBcvRate(true);
    };
    window.addEventListener('bellavista_check_bcv_rate', handleTriggerBcvCheck);

    // 7. Apertura de pantalla para solicitud de cambio manual de tasa BCV
    const handleOpenManualBcv = (e: any) => {
      if (e?.detail?.rate) {
        setManualBcvSuggestedRate(e.detail.rate);
      }
      setShowManualBcvModal(true);
    };
    window.addEventListener('bellavista_open_manual_bcv_modal', handleOpenManualBcv);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('bellavista_procedure_executed', handleProcedure);
      window.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('bellavista_check_bcv_rate', handleTriggerBcvCheck);
      window.removeEventListener('bellavista_open_manual_bcv_modal', handleOpenManualBcv);
    };
  }, [checkAndPromptBcvRate]);

  // Update a currency rate and persist to database
  const updateCurrencyRate = async (code: string, rate: number) => {
    try {
      let finalRate = rate;
      if (code === 'VES') {
        try {
          const res = await fetch('/api/bcv/rates');
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.usdRate === 'number' && data.usdRate > 0) {
              const officialRate = data.usdRate;
              const isFuture = !!data.isFutureRate;
              if (rate < officialRate - 0.0001) {
                finalRate = officialRate;
                alert(`Aviso: Por regla oficial, la tasa no puede ser menor a la especificada en el portal del BCV (Bs. ${officialRate.toFixed(2)})${isFuture ? ' o tasa futura' : ''}. Se establecerá en Bs. ${finalRate.toFixed(2)}.`);
              }
            }
          }
        } catch (apiErr) {
          console.warn("No se pudo consultar portal BCV para comparación de tasa, guardando la ingresada:", apiErr);
        }
      }

      await dbService.updateCurrencyRate(code, finalRate, 'Pedro (Admin)');
      setCurrencyRates(prev => {
        const updated = {
          ...prev,
          [code as CurrencyCode]: finalRate
        };
        saveCachedCurrencyRates(updated);
        return updated;
      });
      window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: finalRate, code } }));
      window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
    } catch (err) {
      console.error("Error updating currency rate:", err);
      alert("Error al actualizar la tasa de cambio.");
    }
  };

  // Database states
  const [products, setProducts] = useState<Product[]>([]);
  const [allProductsForCarousel, setAllProductsForCarousel] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);

  // Tracking Order States
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [hasSavedOrder, setHasSavedOrder] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminTab, setAdminTab] = useState<'products' | 'categories' | 'brands' | 'orders'>('orders');
  const [adminMenu, setAdminMenu] = useState<AdminMenuType>('orders');

  const checkAdminOrders = async () => {
    try {
      const data = await dbService.getOrders();
      setAdminOrders(data || []);
    } catch (err) {
      console.error("Error fetching admin orders in App.tsx:", err);
    }
  };

  const checkActiveOrders = async () => {
    const savedIdsStr = localStorage.getItem('copias_bellavista_order_ids');
    const lastId = localStorage.getItem('copias_bellavista_last_order_id');
    
    let ids: string[] = [];
    if (savedIdsStr) {
      try {
        ids = JSON.parse(savedIdsStr);
      } catch (_) {}
    }
    if (lastId && !ids.includes(lastId)) {
      ids.push(lastId);
    }

    if (ids.length === 0) {
      setActiveOrders([]);
      setHasSavedOrder(false);
      return;
    }

    try {
      const ordersData = await Promise.all(
        ids.map(async (id) => {
          try {
            return await dbService.getOrder(id);
          } catch (err) {
            console.error(`Error fetching order ${id}:`, err);
            return null;
          }
        })
      );

      const active = ordersData.filter((o): o is Order => {
        if (!o) return false;
        const status = (o.status || '').toLowerCase();
        return status !== 'entregado' && status !== 'cancelado';
      });

      setActiveOrders(active);
      setHasSavedOrder(active.length > 0);
    } catch (err) {
      console.error("Error checking active orders:", err);
    }
  };

  useEffect(() => {
    checkActiveOrders();
    checkAdminOrders();

    const savedId = localStorage.getItem('copias_bellavista_last_order_id');
    if (savedId) {
      const savedIdsStr = localStorage.getItem('copias_bellavista_order_ids') || '[]';
      let ids: string[] = [];
      try {
        ids = JSON.parse(savedIdsStr);
      } catch (_) {}
      if (!ids.includes(savedId)) {
        ids.push(savedId);
        localStorage.setItem('copias_bellavista_order_ids', JSON.stringify(ids));
      }
    }

    const interval = setInterval(() => {
      checkActiveOrders();
      checkAdminOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Layout and view states
  const [activeRole, setActiveRole] = useState<'admin' | 'vendedor' | 'cliente'>('cliente');

  useEffect(() => {
    if (activeRole === 'admin') {
      checkAdminOrders();
    }
  }, [activeRole]);
  const [isAdminView, setIsAdminView] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // User Authentication State
  const [currentUser, setCurrentUser] = useState<StoreUser | null>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_logged_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCustomerDashboardModal, setShowCustomerDashboardModal] = useState(false);

  // Wishlist state
  const [wishlistedProductIds, setWishlistedProductIds] = useState<string[]>([]);

  const loadUserWishlist = async () => {
    if (currentUser?.email) {
      try {
        const list = await dbService.getWishlist(currentUser.email);
        setWishlistedProductIds(list.map(w => w.product_id));
      } catch (err) {
        console.error("Error loading wishlist in App.tsx:", err);
      }
    } else {
      setWishlistedProductIds([]);
    }
  };

  useEffect(() => {
    loadUserWishlist();
  }, [currentUser]);

  const handleToggleWishlist = async (productId: string) => {
    if (!currentUser) {
      setShowLoginModal(true);
      triggerToast("Por favor, inicia sesión para guardar artículos en tu lista de deseos.");
      return;
    }

    const email = currentUser.email;
    const isCurrentlyWishlisted = wishlistedProductIds.includes(productId);

    try {
      if (isCurrentlyWishlisted) {
         await dbService.removeFromWishlist(email, productId);
         setWishlistedProductIds(prev => prev.filter(id => id !== productId));
         triggerToast("Artículo eliminado de tu lista de deseos.");
      } else {
         await dbService.addToWishlist(email, productId);
         setWishlistedProductIds(prev => [...prev, productId]);
         triggerToast("Artículo agregado a tu lista de deseos.");
      }
    } catch (err) {
      console.error("Error toggling wishlist:", err);
      triggerToast("Ocurrió un error al actualizar tu lista de deseos.");
    }
  };

  const handleLoginSuccess = (user: StoreUser) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('copias_bellavista_logged_user', JSON.stringify(user));
    } catch (e) {}

    // Set active role and view based on role
    const r = (user.role || '').toLowerCase();
    if (r === 'admin' || r === 'gerente') {
      setActiveRole('admin');
      setIsAdminView(true);
      setAdminMenu('orders');
      setAdminTab('orders');
    } else if (r === 'cajero' || r === 'despachador' || r === 'repartidor') {
      setActiveRole('vendedor');
      setIsAdminView(true);
      setAdminMenu('orders');
      setAdminTab('orders');
    } else {
      setActiveRole('cliente');
    }

    triggerToast(`¡Bienvenido(a) ${user.name}! Sesión iniciada como ${user.role}.`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('copias_bellavista_logged_user');
    } catch (e) {}
    setActiveRole('cliente');
    setIsAdminView(false);
    triggerToast('Sesión cerrada correctamente.');
  };

  const [showAdminShortcutButton, setShowAdminShortcutButton] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [showTresLechesLanding, setShowTresLechesLanding] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [isMobileCurrencyModalOpen, setIsMobileCurrencyModalOpen] = useState(false);

  const [disabledSettings, setDisabledSettings] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_disabled_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    const loadSettings = () => {
      try {
        const saved = localStorage.getItem('copias_bellavista_disabled_settings');
        if (saved) setDisabledSettings(JSON.parse(saved));
      } catch (e) {}
    };
    loadSettings();
    window.addEventListener('storage', loadSettings);
    window.addEventListener('bellavista_settings_updated', loadSettings);
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('bellavista_settings_updated', loadSettings);
    };
  }, []);

  const [isLandingActive, setIsLandingActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_landing_active');
      const disabledSaved = localStorage.getItem('copias_bellavista_disabled_settings');
      if (disabledSaved) {
        const parsed = JSON.parse(disabledSaved);
        if (parsed.disable_landing === true) return false;
      }
      return saved === 'true'; // Default FALSE so landing doesn't appear
    } catch (e) {
      return false;
    }
  });

  // Shopping Cart States
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('copias_bella_vista_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error reading cart from localStorage:", e);
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('copias_bella_vista_cart', JSON.stringify(cart));
    } catch (e) {
      console.error("Error saving cart to localStorage:", e);
    }
  }, [cart]);

  // Cart helper functions
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        triggerToast(`Actualizado: ${product.name} en el carrito (${newQty} uds).`);
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: newQty } : item);
      }
      triggerToast(`¡Añadido al carrito: ${product.name}!`);
      return [...prev, { product, quantity }];
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (item) {
        triggerToast(`Eliminado del carrito: ${item.product.name}`);
      }
      return prev.filter(i => i.product.id !== productId);
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const qty = Math.min(item.product.stock, quantity);
        return { ...item, quantity: qty };
      }
      return item;
    }));
  };

  const handleClearCart = () => {
    setCart([]);
    triggerToast("Carrito vaciado.");
  };

  const handleOrderSuccess = (orderId: string) => {
    // Add the new order ID to our list in localStorage
    const savedIdsStr = localStorage.getItem('copias_bellavista_order_ids') || '[]';
    let ids: string[] = [];
    try {
      ids = JSON.parse(savedIdsStr);
    } catch (_) {}
    if (!ids.includes(orderId)) {
      ids.push(orderId);
      localStorage.setItem('copias_bellavista_order_ids', JSON.stringify(ids));
    }
    localStorage.setItem('copias_bellavista_last_order_id', orderId);

    setTrackingOrderId(orderId);
    checkActiveOrders(); // Immediately fetch to update active orders state!
    
    setIsCartOpen(false);
    setCart([]); // Silent clear of the cart state
    try {
      localStorage.removeItem('copias_bella_vista_cart');
    } catch (e) {
      console.error("Error clearing cart storage", e);
    }
    triggerToast("¡Pedido registrado! Rastreando pedido en tiempo real...");
  };

  // Global search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [onlyOffers, setOnlyOffers] = useState(false);

  // Fetch all initial data
  // Pagination states
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const observerTarget = useRef<HTMLDivElement>(null);

  const loadGlobalData = async () => {
    try {
      const [cats, brs, imgs, prods] = await Promise.all([
        dbService.getCategories().catch(e => { console.error("Error loading categories:", e); return []; }),
        dbService.getBrands().catch(e => { console.error("Error loading brands:", e); return []; }),
        dbService.getProductImages().catch(e => { console.error("Error loading product images:", e); return []; }),
        dbService.getProducts().catch(e => { console.error("Error loading products:", e); return []; })
      ]);
      setCategories(cats || []);
      setBrands(brs || []);
      setProductImages(imgs || []);
      setAllProductsForCarousel(prods || []);
      setProducts(prods || []);
    } catch (e) {
      console.error("Error loading application data:", e);
    }
  };

  useEffect(() => {
    loadGlobalData();

    // Scroll listener for back-to-top button
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Public View: Fetch paginated products based on filters
  useEffect(() => {
    if (isAdminView) return;

    let isMounted = true;
    const fetchInitialProducts = async () => {
      setLoading(true);
      setPage(0);
      try {
        const { data, count } = await dbService.getProductsPaginated({
          page: 0,
          pageSize: 20,
          searchTerm,
          categoryId: selectedCategory,
          brandId: selectedBrand,
          onlyAvailable: onlyInStock,
          onlyFeatured,
          onlyOffers,
          minPrice,
          maxPrice
        });
        if (isMounted) {
          setProducts(data);
          setTotalCount(count);
          setHasMore(data.length < count);
        }
      } catch (e) {
        console.error("Error loading products:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchInitialProducts();
    
    return () => { isMounted = false; };
  }, [isAdminView, searchTerm, selectedCategory, selectedBrand, minPrice, maxPrice, onlyInStock, onlyFeatured, onlyOffers]);

  // Load more function
  const loadMoreProducts = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { data, count } = await dbService.getProductsPaginated({
        page: nextPage,
        pageSize: 20,
        searchTerm,
        categoryId: selectedCategory,
        brandId: selectedBrand,
        onlyAvailable: onlyInStock,
        onlyFeatured,
        onlyOffers,
        minPrice,
        maxPrice
      });
      setProducts(prev => {
        const newTotal = prev.length + data.length;
        setHasMore(newTotal < count);
        return [...prev, ...data];
      });
      setPage(nextPage);
    } catch (e) {
      console.error("Error loading more products:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore, loading, searchTerm, selectedCategory, selectedBrand, minPrice, maxPrice, onlyInStock, onlyFeatured, onlyOffers]);

  // IntersectionObserver for infinite scrolling
  useEffect(() => {
    if (isAdminView || loading || loadingMore || !hasMore) return;
    
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMoreProducts();
        }
      },
      { threshold: 0.1 }
    );
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    
    return () => observer.disconnect();
  }, [isAdminView, loading, loadingMore, hasMore, loadMoreProducts]);

  // Admin View: Load full inventory
  useEffect(() => {
    if (isAdminView) {
      setLoading(true);
      dbService.getProducts().then(prods => {
        setProducts(prods);
        setLoading(false);
      });
    }
  }, [isAdminView]);

  // Keyboard combination shortcut (Ctrl + A + S) to toggle the admin login button visibility
  useEffect(() => {
    const pressedKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e || !e.key) return;
      const key = e.key.toLowerCase();
      pressedKeys.add(key);

      const hasCtrl = e.ctrlKey || e.metaKey || pressedKeys.has('control');
      const hasA = pressedKeys.has('a');
      const hasS = pressedKeys.has('s');

      // Prevent default action for Ctrl+S (Save) and Ctrl+A (Select All) to make experience smooth
      if (hasCtrl && (key === 'a' || key === 's')) {
        e.preventDefault();
      }

      if (hasCtrl && hasA && hasS) {
        e.preventDefault();
        setShowAdminShortcutButton(prev => !prev);
        pressedKeys.clear();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e || !e.key) return;
      pressedKeys.delete(e.key.toLowerCase());
    };

    const handleBlur = () => {
      pressedKeys.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Deep linking: check URL for a shared product or order tracking
  useEffect(() => {
    let active = true;
    const checkDeepLink = async () => {
      const params = new URLSearchParams(window.location.search);
      const productSlug = params.get('producto') || params.get('p');
      const orderIdParam = params.get('pedido') || params.get('orderId');
      const hash = window.location.hash;
      
      if (orderIdParam) {
        setTrackingOrderId(orderIdParam);
        // Clear param from URL cleanly so it doesn't reopen repeatedly on refresh
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        return;
      }

      let slug = productSlug;
      if (!slug && hash.includes('#/producto/')) {
        slug = hash.split('#/producto/')[1];
      } else if (!slug && window.location.pathname.startsWith('/producto/')) {
        slug = window.location.pathname.split('/producto/')[1];
      }

      if (slug) {
        try {
          const allProds = await dbService.getProducts();
          const matchedProduct = allProds.find(p => p.slug === slug || p.id === slug || p.sku === slug);
          if (matchedProduct && active) {
            setSelectedProduct(matchedProduct);
          }
        } catch (err) {
          console.error("Error checking deep link product:", err);
        }
      }
    };

    // Run on initial load
    checkDeepLink();

    // Also listen to popstate changes (e.g. going back/forward)
    window.addEventListener('popstate', checkDeepLink);
    return () => {
      active = false;
      window.removeEventListener('popstate', checkDeepLink);
    };
  }, []);

  // WhatsApp click redirection
  const handleWhatsAppQuery = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const phoneNumber = '584125043857'; // Default Venezuela Barinitas contact phone
    const formattedPrice = product.offer_price ? `$${product.offer_price.toFixed(2)} USD (Precio Oferta)` : `$${product.price.toFixed(2)} USD`;
    const message = `Hola Copias Bella Vista, estoy interesado en el siguiente artículo de su catálogo online:
      
*Producto:* ${product.name}
*SKU:* ${product.sku}
*Precio:* ${formattedPrice}
      
¿Tienen disponibilidad y método de entrega en Barinitas? ¡Muchas gracias!`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  // Share link trigger
  const handleShareProduct = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = `https://b2c-roan-five.vercel.app/?producto=${product.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      triggerToast(`¡Enlace del producto ${product.sku} copiado al portapapeles!`);
    });
  };

  // Reset filter inputs
  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedBrand('all');
    setMinPrice(0);
    setMaxPrice(1000);
    setOnlyInStock(false);
    setOnlyFeatured(false);
    setOnlyOffers(false);
    setSearchTerm('');
    triggerToast("Filtros de catálogo restablecidos.");
  };

  // Clear search filters only (keeping search term)
  const handleClearFiltersOnly = () => {
    setSelectedCategory('all');
    setSelectedBrand('all');
    setMinPrice(0);
    setMaxPrice(1000);
    setOnlyInStock(false);
    setOnlyFeatured(false);
    setOnlyOffers(false);
  };

  // Helper to filter by category name keyword from menus/buttons
  const handleSelectCategoryByName = (keyword: string) => {
    const cleanKw = (keyword || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // 1. Try to find matching category by name or slug (accent and case-insensitive)
    let found = categories.find(c => {
      const cName = (c.name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cSlug = (c.slug || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return cName === cleanKw || cSlug === cleanKw || cName.includes(cleanKw) || cleanKw.includes(cName);
    });

    // 2. Fallback: check partial word matching (e.g. "escolar", "utiles", "escolares")
    if (!found) {
      const kwWords = cleanKw.split(/\s+/).filter(w => w.length > 2);
      found = categories.find(c => {
        const cName = (c.name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return kwWords.some(w => cName.includes(w));
      });
    }

    if (found) {
      setSelectedCategory(found.id);
      setSelectedBrand('all');
      setOnlyOffers(false);
      setOnlyFeatured(false);
      setSearchTerm('');
      triggerToast(`Filtrando por categoría: ${found.name}`);
    } else {
      // Fallback: search for it using global search
      setSearchTerm(keyword);
      setSelectedCategory('all');
      setSelectedBrand('all');
      setOnlyOffers(false);
      setOnlyFeatured(false);
      triggerToast(`Buscando artículos de "${keyword}"`);
    }

    // Smooth scroll down to the products section so user sees them immediately
    setTimeout(() => {
      const el = document.getElementById('products-display-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  };

  const handleRefreshAdminData = () => {
    loadGlobalData();
    checkAdminOrders();
    if (isAdminView) {
      setLoading(true);
      dbService.getProducts().then(prods => {
        setProducts(prods);
        setAllProductsForCarousel(prods || []);
        setLoading(false);
      });
    }
  };

  const newOrdersList = adminOrders.filter(o => {
    const s = (o.status || '').toLowerCase();
    return s === 'recibido' || s === 'pendiente';
  });

  const pendingOrdersList = adminOrders.filter(o => {
    const s = (o.status || '').toLowerCase();
    return s !== 'entregado' && s !== 'cancelado';
  });

  return (
    <div className="min-h-screen bg-[#FBFBF9] flex flex-col font-sans text-slate-800 antialiased">
      {/* Dynamic Toast Alerts - Fixed at top of screen, short duration */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw] md:max-w-md bg-[#16202E]/95 backdrop-blur-md text-white font-bold px-4 py-2.5 rounded-full shadow-2xl border border-slate-700/80 text-xs flex items-center justify-center gap-2 animate-fadeIn transition-all duration-200 pointer-events-none">
          <CheckCircle2 className="w-4.5 h-4.5 text-[#F59E0B] shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeRole={activeRole}
        onOpenSettings={() => setShowSettingsModal(true)}
        onNavigateToAdmin={() => {
          setIsAdminView(true);
          setAdminMenu('orders');
          setAdminTab('orders');
        }}
        isAdminView={isAdminView}
        onExitAdminView={() => setIsAdminView(false)}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        categories={categories}
        onlyOffers={onlyOffers}
        setOnlyOffers={setOnlyOffers}
        onResetFilters={handleResetFilters}
        onSelectCategoryByName={handleSelectCategoryByName}
        cartItemsCount={cart.reduce((acc, item) => acc + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onClearFiltersOnly={handleClearFiltersOnly}
        activeCurrency={activeCurrency}
        onCurrencyChange={handleCurrencyChange}
        currencyRates={currencyRates}
        onOpenTresLechesLanding={isLandingActive && !disabledSettings.disable_landing ? () => setShowTresLechesLanding(true) : undefined}
        onOpenScanner={() => setShowBarcodeScanner(true)}
        currentUser={currentUser}
        onOpenLoginModal={() => setShowLoginModal(true)}
        onLogout={handleLogout}
        onOpenCustomerDashboard={() => setShowCustomerDashboardModal(true)}
        onOpenMobileCurrencyModal={() => setIsMobileCurrencyModalOpen(true)}
      />

      {/* Main Application Body */}
      <main className={`flex-1 py-3 sm:py-6 pb-20 md:pb-8 w-full relative z-10 ${isAdminView ? 'w-full px-2 sm:px-4 md:px-6' : 'max-w-[1480px] mx-auto px-3 sm:px-4 md:px-6'}`}>
        {/* Administrator & Manager Real-time Alert Banner */}
        {activeRole === 'admin' && (newOrdersList.length > 0 || pendingOrdersList.length > 0) && (
          <div className="mb-6 bg-[#16202E] text-white rounded-2xl border-l-4 border-rose-500 shadow-xl p-4 md:p-5 select-none animate-fadeIn flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Left section: Info & Messages */}
            <div className="flex items-start gap-3 md:gap-4">
              <div className="p-2.5 bg-[#223046] text-[#F59E0B] rounded-xl border border-slate-700 shrink-0">
                <Bell className="w-5 h-5 animate-swing" />
              </div>
              <div className="space-y-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Aviso de administración
                  </span>
                  {/* Blinking Live indicator */}
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    En tiempo real
                  </span>
                </div>
                
                <h3 className="text-sm md:text-base font-bold text-white leading-snug">
                  {newOrdersList.length > 0 && (
                    <span>
                      Hay <strong className="text-[#F59E0B]">{newOrdersList.length} nuevo(s) pedido(s)</strong> por atender.{' '}
                    </span>
                  )}
                  {pendingOrdersList.length > 0 && (
                    <span className={newOrdersList.length > 0 ? 'border-l border-slate-700 pl-2 ml-1' : ''}>
                      <strong className="text-sky-300">{pendingOrdersList.length} pedido(s) en curso</strong>.
                    </span>
                  )}
                </h3>
                
                <p className="text-xs text-slate-400 leading-normal font-medium">
                  Revisa y actualiza el estado de las solicitudes para garantizar rapidez a los clientes en Barinitas.
                </p>
              </div>
            </div>

            {/* Right section: Action Buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto self-stretch md:self-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsAdminView(true);
                  setAdminMenu('orders');
                  setAdminTab('orders');
                  setTimeout(() => {
                    const el = document.getElementById('btn-tab-orders') || document.getElementById('products-display-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold rounded-xl transition duration-200 flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95"
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Gestionar pedidos</span>
              </button>
            </div>
          </div>
        )}

        {isAdminView ? (
          /* ADMINISTRATIVE MODULE VIEW */
          <ErrorBoundary
            componentName="Panel de Administración"
            fallback={(error, reset) => (
              <div className="min-h-[450px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm text-center select-none animate-fadeIn my-4 max-w-xl mx-auto">
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center text-[#FF9900] mb-4 border border-amber-200 dark:border-amber-800/60">
                  <RefreshCw className="w-7 h-7 animate-pulse" />
                </div>
                <h3 className="text-base font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">
                  Carga del Panel Administrativo
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-md">
                  Se produjo una pausa temporal de red al descargar los módulos administrativos. Haz clic para reintentar o regresar a la tienda.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-5 py-2.5 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reintentar Conexión
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdminView(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Volver a la Tienda
                  </button>
                </div>
              </div>
            )}
          >
            <Suspense fallback={<AdminSuspenseFallback />}>
              <AdminPanel
                products={products}
                categories={categories}
                brands={brands}
                productImages={productImages}
                onRefreshData={handleRefreshAdminData}
                activeRole={activeRole}
                currentUser={currentUser}
                initialTab={adminTab}
                initialMenu={adminMenu}
                onTabChange={(tab) => setAdminTab(tab as any)}
                onMenuChange={(menu) => setAdminMenu(menu)}
                activeCurrency={activeCurrency}
                onCurrencyChange={handleCurrencyChange}
                currencyRates={currencyRates}
                onUpdateCurrencyRate={updateCurrencyRate}
                isLandingActive={isLandingActive}
                onToggleLandingActive={(val) => {
                  setIsLandingActive(val);
                  localStorage.setItem('copias_bellavista_landing_active', String(val));
                }}
                onLogout={handleLogout}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          /* PUBLIC MARKETPLACE VIEW */
          <>
            {/* Amazon-style Categories & Featured Carousel */}
            <div className="relative z-20 mb-6">
              <AmazonCarousel
                products={allProductsForCarousel.length > 0 ? allProductsForCarousel : products}
                categories={categories}
                productImages={productImages}
                onViewDetails={(p) => setSelectedProduct(p)}
                onAddToCart={(p, e) => handleAddToCart(p, 1)}
                activeCurrency={activeCurrency}
                currencyRates={currencyRates}
                onSelectCategoryByName={handleSelectCategoryByName}
              />
            </div>

            {/* Gourmet Promotion Banner */}
            {isLandingActive && (
              <div className="mb-6 bg-gradient-to-r from-[#2B180F] via-[#3D2314] to-[#25150C] text-white rounded-3xl p-5 md:p-6 shadow-xl border border-amber-900/30 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative select-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 border-amber-500/40 shadow-lg shrink-0">
                    <img 
                      src="https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=160&h=160" 
                      alt="Tres Leches Choco Arequipe" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-3 py-0.5 rounded-full border border-amber-500/30">
                        Especial del obrador artesanal 🍰
                      </span>
                      <span className="text-amber-200/70 text-xs font-medium">
                        Hecho en Barinitas
                      </span>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold font-display text-white leading-tight">
                      Torta Tres Leches Choco Arequipe
                    </h3>
                    <p className="text-xs text-amber-100/80 font-medium leading-relaxed max-w-xl">
                      Bizcocho de cacao premium sumergido en infusión de tres leches, bañado en arequipe y chocolate artesanal. Lista para disfrutar o enviar como detalle.
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowTresLechesLanding(true)}
                  className="w-full md:w-auto px-5 py-3 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg shrink-0 cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <span>Conocer receta y ordenar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Left Column: Filter Sidebar */}
              <div className="hidden lg:block lg:col-span-1">
                <Sidebar
                  categories={categories.filter(c => c.active !== false)}
                  brands={brands.filter(b => b.active !== false)}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  selectedBrand={selectedBrand}
                  setSelectedBrand={setSelectedBrand}
                  minPrice={minPrice}
                  setMinPrice={setMinPrice}
                  maxPrice={maxPrice}
                  setMaxPrice={setMaxPrice}
                  onlyInStock={onlyInStock}
                  setOnlyInStock={setOnlyInStock}
                  onlyFeatured={onlyFeatured}
                  setOnlyFeatured={setOnlyFeatured}
                  onResetFilters={handleResetFilters}
                />
              </div>

              {/* Right Column: Products Display Grid */}
              <div id="products-display-section" className="lg:col-span-3 text-left scroll-mt-20">
                {/* Result header count */}
                <div className="bg-white px-4 py-3 rounded-2xl border border-[#E7E5DF] shadow-[0_1px_3px_rgba(22,32,46,0.03)] flex flex-wrap justify-between items-center gap-3 mb-4">
                  <span className="text-xs font-semibold text-slate-500">
                    {t('catalog.found_results', 'Artículos encontrados:')}{' '}
                    <strong className="text-slate-900 font-bold">{totalCount} {t('catalog.articles', 'productos')}</strong>
                  </span>
                  
                  {/* Active filters count summary badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedCategory !== 'all' && (
                      <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                        Categoría activa
                      </span>
                    )}
                    {selectedBrand !== 'all' && (
                      <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                        Marca activa
                      </span>
                    )}
                    {(minPrice > 0 || maxPrice < 1000) && (
                      <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                        Filtro de precio
                      </span>
                    )}
                  </div>
                </div>

                {/* Loading indicator */}
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {/* Skeletons para carga inicial */}
                    {[...Array(8)].map((_, i) => (
                      <div key={`skeleton-${i}`} className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden flex flex-col h-[340px] animate-pulse">
                        <div className="h-44 bg-slate-100"></div>
                        <div className="p-3.5 flex-1 flex flex-col gap-2">
                          <div className="h-3 bg-slate-100 w-1/3 rounded-full"></div>
                          <div className="h-4 bg-slate-100 w-3/4 rounded-full"></div>
                          <div className="h-4 bg-slate-100 w-1/2 rounded-full mb-auto"></div>
                          <div className="h-8 bg-slate-100 w-full rounded-xl mt-4"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  /* Empty state */
                  <div className="bg-white p-12 md:p-16 rounded-3xl border border-[#E7E5DF] text-center shadow-xs flex flex-col items-center justify-center max-w-xl mx-auto my-6">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center mb-4">
                      <Package className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 font-display mb-1">{t('catalog.no_results_title', 'Sin coincidencias en este momento')}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6 max-w-md">
                      {t('catalog.no_results_desc', 'No encontramos artículos con los filtros aplicados. Puedes restablecer los criterios para explorar todo el inventario de Copias Bella Vista.')}
                    </p>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-5 py-2.5 bg-[#16202E] hover:bg-[#D97706] text-white font-bold rounded-xl text-xs transition duration-200 shadow-xs cursor-pointer active:scale-95"
                    >
                      {t('catalog.clear_filters', 'Restablecer todos los filtros')}
                    </button>
                  </div>
                ) : (
                  /* Standard Grid */
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
                      {products.map((product) => {
                        const category = categories.find(c => c.id === product.category_id);
                        const brand = brands.find(b => b.id === product.brand_id);
                        const associatedImages = [
                          ...productImages.filter(img => img.product_id === product.id).map(img => img.image_url),
                          product.technical_sheet_url,
                          (product as any).image_url
                        ].filter(Boolean) as string[];

                        return (
                          <ProductCard
                            key={product.id}
                            product={product}
                            categoryName={category?.name || 'General'}
                            brandName={brand?.name || 'S/M'}
                            images={associatedImages}
                            onViewDetails={(p) => setSelectedProduct(p)}
                            onShare={(p, e) => handleShareProduct(p, e)}
                            onWhatsAppQuery={(p, e) => handleWhatsAppQuery(p, e)}
                            onAddToCart={(p, e) => handleAddToCart(p, 1)}
                            activeCurrency={activeCurrency}
                            currencyRates={currencyRates}
                            isWishlisted={wishlistedProductIds.some(id => String(id) === String(product.id))}
                            onToggleWishlist={(p) => handleToggleWishlist(p.id)}
                          />
                        );
                      })}
                      
                      {/* Skeletons para carga al hacer scroll */}
                      {loadingMore && [...Array(4)].map((_, i) => (
                        <div key={`more-skeleton-${i}`} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden flex flex-col h-[320px] animate-pulse">
                          <div className="h-40 bg-gray-200"></div>
                          <div className="p-3 flex-1 flex flex-col gap-2">
                            <div className="h-3 bg-gray-200 w-1/3 rounded"></div>
                            <div className="h-4 bg-gray-200 w-3/4 rounded"></div>
                            <div className="h-4 bg-gray-200 w-1/2 rounded mb-auto"></div>
                            <div className="h-6 bg-gray-200 w-1/4 rounded mt-4"></div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sentinel para Intersection Observer */}
                    <div id="scroll-sentinel" ref={observerTarget} className="h-10 mt-4 w-full"></div>
                  </>
                )}
              </div>

            </div>
          </>
        )}
      </main>

      {/* Floating Call to Action on the left (WhatsApp & Shopping Cart) */}
      <div className="fixed bottom-16 md:bottom-6 left-3 sm:left-6 z-40 flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => {
            const encoded = encodeURIComponent("Hola Copias Bella Vista, me gustaría realizar una consulta sobre sus servicios.");
            window.open(`https://api.whatsapp.com/send?phone=584125043857&text=${encoded}`, '_blank');
          }}
          className="w-12 h-12 rounded-2xl bg-[#25D366] hover:bg-[#20ba56] text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          title="Atención directa por WhatsApp"
          id="btn-floating-whatsapp"
        >
          <Phone className="w-5 h-5 fill-current" />
        </button>

        {/* Floating Shopping Cart Button next to WhatsApp (Desktop Only) */}
        {!isAdminView && (
          <button
            onClick={() => setIsCartOpen(true)}
            className="hidden md:flex relative w-12 h-12 rounded-2xl bg-[#16202E] hover:bg-[#223046] text-white items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-[#2B3D58]"
            title="Abrir Carrito de Compras"
            id="btn-floating-cart-left"
          >
            <ShoppingCart className="w-5 h-5 text-[#F59E0B]" />
            {cart.reduce((sum, item) => sum + item.quantity, 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#EF4444] text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center border-2 border-[#16202E] shadow-sm">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Floating Controls on the right (Information & Back to Top) */}
      <div className="fixed bottom-16 md:bottom-6 right-3 sm:right-6 z-40 flex flex-col gap-2.5 items-end">
        {showBackToTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#16202E] text-white hover:bg-[#223046] border border-[#2B3D58] flex items-center justify-center shadow-lg hover:scale-105 transition cursor-pointer"
            title="Subir al inicio"
          >
            <ArrowUp className="w-4 h-4 text-slate-300" />
          </button>
        )}

        {/* Floating Tracking Shortcut */}
        {hasSavedOrder && (
          <button
            onClick={() => {
              if (activeOrders.length > 0 && activeOrders[0].id) {
                setTrackingOrderId(activeOrders[0].id);
              } else {
                const savedId = localStorage.getItem('copias_bellavista_last_order_id');
                if (savedId) {
                  setTrackingOrderId(savedId);
                }
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#16202E] hover:bg-[#223046] text-white font-bold shadow-xl hover:scale-105 transition duration-200 cursor-pointer text-xs border border-[#2B3D58]"
            title="Ver estado de mi último pedido"
            id="btn-floating-tracking"
          >
            <Clock className="w-4 h-4 text-[#F59E0B] animate-pulse" />
            <span className="hidden sm:inline">Rastrear pedido</span>
          </button>
        )}

        {/* Botón de Información */}
        <button
          onClick={() => setIsInfoModalOpen(true)}
          className="w-11 h-11 rounded-2xl bg-[#16202E] hover:bg-[#223046] text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition duration-200 cursor-pointer flex items-center justify-center border border-[#2B3D58]"
          title="Ver Información del Negocio"
          id="btn-floating-info"
        >
          <Info className="w-5 h-5 text-[#F59E0B]" />
        </button>
      </div>

      {/* Bottom Navigation Dock (Mobile Only) */}
      {!isAdminView && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#16202E]/95 backdrop-blur-md border-t border-[#24334A] text-slate-300 h-15 md:hidden flex items-center justify-around shadow-2xl px-2 select-none">
          {/* Inicio */}
          <button
            type="button"
            onClick={() => {
              handleResetFilters();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition cursor-pointer"
            id="mobile-bottom-nav-home"
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-semibold">Inicio</span>
          </button>

          {/* Buscar */}
          <button
            type="button"
            onClick={() => {
              const searchInput = document.getElementById('input-global-search');
              if (searchInput) {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                searchInput.focus();
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition cursor-pointer"
            id="mobile-bottom-nav-search"
          >
            <Search className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-semibold">Buscar</span>
          </button>

          {/* Carrito */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition cursor-pointer relative"
            id="mobile-bottom-nav-cart"
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5 mb-0.5 text-white" />
              {cart.reduce((sum, item) => sum + item.quantity, 0) > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-[#EF4444] text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center border border-[#16202E]">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">Carrito</span>
          </button>

          {/* Moneda ($ USD / Bs. VES) */}
          <button
            type="button"
            onClick={() => setIsMobileCurrencyModalOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition cursor-pointer"
            id="mobile-bottom-nav-currency"
            title="Configurar Moneda"
          >
            <DollarSign className="w-5 h-5 mb-0.5 text-[#F59E0B]" />
            <span className="text-[10px] font-semibold">{activeCurrency}</span>
          </button>

          {/* Cuenta / Acceso */}
          {(() => {
            const userRoleClean = (currentUser?.role || activeRole || '').trim().toLowerCase();
            const isStaffUser = ['administrador', 'admin', 'gerente', 'cajero', 'repartidor', 'despachador', 'vendedor'].some(
              r => userRoleClean.includes(r)
            );

            if (isStaffUser) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminView(true);
                    if (userRoleClean.includes('cajero') || userRoleClean.includes('vendedor')) {
                      setAdminMenu('sales');
                    } else if (userRoleClean.includes('despachador')) {
                      setAdminMenu('products');
                    } else if (userRoleClean.includes('repartidor')) {
                      setAdminMenu('orders');
                    } else {
                      setAdminMenu('orders');
                    }
                  }}
                  className={`flex flex-col items-center justify-center w-full h-full transition cursor-pointer ${
                    isAdminView ? 'text-[#F59E0B]' : 'text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B]'
                  }`}
                  id="mobile-bottom-nav-admin"
                  title="Panel Administrativo"
                >
                  <LayoutDashboard className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-semibold">Admin</span>
                </button>
              );
            }

            return (
              <button
                type="button"
                onClick={() => {
                  if (currentUser) {
                    setShowCustomerDashboardModal(true);
                  } else {
                    setShowLoginModal(true);
                  }
                }}
                className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition cursor-pointer"
                id="mobile-bottom-nav-account"
              >
                <User className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-semibold">{currentUser ? 'Mi Cuenta' : 'Acceso'}</span>
              </button>
            );
          })()}
        </nav>
      )}

      {/* ====================================
          MODAL VIEWS OVERLAYS (LAZY LOADED)
          ==================================== */}

      {/* 1. PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <ProductDetailModal
            product={selectedProduct}
            categories={categories}
            brands={brands}
            allProducts={products}
            onClose={() => setSelectedProduct(null)}
            onViewProduct={(p) => setSelectedProduct(p)}
            onShare={handleShareProduct}
            onWhatsAppQuery={handleWhatsAppQuery}
            onAddToCart={handleAddToCart}
            activeCurrency={activeCurrency}
            currencyRates={currencyRates}
            isWishlisted={selectedProduct ? wishlistedProductIds.some(id => String(id) === String(selectedProduct.id)) : false}
            onToggleWishlist={(productId) => handleToggleWishlist(productId)}
          />
        </Suspense>
      )}

      {/* 2. SETTINGS / SUPABASE INTEGRATION MODAL */}
      {showSettingsModal && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <SettingsModal
            onClose={() => setShowSettingsModal(false)}
          />
        </Suspense>
      )}

      {/* 3. SHOPPING CART DRAWER */}
      <Suspense fallback={<ModalSuspenseFallback />}>
        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cartItems={cart}
          onAddToCart={handleAddToCart}
          onUpdateQuantity={handleUpdateCartQuantity}
          onRemoveItem={handleRemoveFromCart}
          onClearCart={handleClearCart}
          productImages={productImages}
          onOrderSuccess={handleOrderSuccess}
          activeCurrency={activeCurrency}
          currencyRates={currencyRates}
          currentUser={currentUser}
          onOpenLoginModal={() => setShowLoginModal(true)}
        />
      </Suspense>

      {/* 4. BUSINESS INFORMATION MODAL */}
      {isInfoModalOpen && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <InfoModal
            onClose={() => setIsInfoModalOpen(false)}
          />
        </Suspense>
      )}

      {/* 5. ORDER TRACKING MODAL */}
      {trackingOrderId && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <OrderTrackingModal
            orderId={trackingOrderId}
            onClose={() => {
              setTrackingOrderId(null);
              checkActiveOrders();
            }}
            activeOrders={activeOrders}
            onRefreshActiveOrders={checkActiveOrders}
          />
        </Suspense>
      )}

      {/* 6. TORTA TRES LECHES CHOCO AREQUIPE LANDING PAGE OVERLAY */}
      {showTresLechesLanding && isLandingActive && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <TortaTresLechesLanding
            products={products}
            categories={categories}
            activeCurrency={activeCurrency}
            currencyRates={currencyRates}
            onAddToCart={handleAddToCart}
            onClose={() => setShowTresLechesLanding(false)}
            onRefreshProducts={loadGlobalData}
            onOpenCart={() => setIsCartOpen(true)}
          />
        </Suspense>
      )}

      {/* 7. CAMERA BARCODE & QR SCANNER PRICE QUERY MODAL */}
      {showBarcodeScanner && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <BarcodeScannerModal
            products={products}
            onClose={() => setShowBarcodeScanner(false)}
            onProductFound={(product) => {
              setSelectedProduct(product);
            }}
          />
        </Suspense>
      )}

      {/* Footer Area */}
      <footer className="bg-[#16202E] text-white py-12 border-t-2 border-[#D97706] select-none text-xs">
        <div className="max-w-[1480px] mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          
          {/* Col 1 */}
          <div>
            <h4 className="font-bold font-display text-sm tracking-wide text-white mb-2">Copias Bella Vista</h4>
            <p className="text-slate-300 leading-relaxed mb-4 text-xs font-normal">
              Tu taller y papelería de confianza en Barinitas. Servicios de fotocopiado de alta fidelidad, encuadernación, útiles escolares, material de oficina y repostería artesanal.
            </p>
            <div className="inline-flex items-center gap-1.5 bg-[#1F2E43] text-[#F59E0B] px-3 py-1 rounded-xl text-[11px] font-semibold border border-[#2B3D58]">
              <Info className="w-3.5 h-3.5" />
              <span>Precios referenciales en USD con tasa oficial BCV</span>
            </div>
          </div>

          {/* Col 2 */}
          <div>
            <h4 className="font-bold font-display text-sm tracking-wide text-white mb-2">Horarios y Atención</h4>
            <ul className="space-y-2 text-slate-300 font-normal">
              <li>• Lunes a Sábado: 8:30 a 12:00 m. / 2:30 a 6:00 p.m.</li>
              <li>• Despachos y retiros directos en Barinitas</li>
              <li>• Facturación formal y cotizaciones para colegios y empresas</li>
              <li>• Pedidos personalizados y encuadernados bajo encargo</li>
            </ul>
          </div>

          {/* Col 3: Acceso Controlado */}
          <div>
            {showAdminShortcutButton && (
              <div className="space-y-3 animate-fadeIn" id="admin-shortcut-container">
                <h4 className="font-bold font-display text-sm tracking-wide text-white mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
                  <span>Acceso por rol</span>
                </h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole('cliente');
                      setIsAdminView(false);
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      !isAdminView && activeRole === 'cliente'
                        ? 'bg-[#D97706] text-white shadow-xs'
                        : 'bg-[#1F2E43] hover:bg-[#283B55] text-slate-300 hover:text-white border border-[#2B3D58]'
                    }`}
                    id="btn-shortcut-clientes"
                  >
                    Clientes
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole('admin');
                      setIsAdminView(true);
                      setAdminMenu('orders');
                      setAdminTab('orders');
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isAdminView || activeRole === 'admin'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-[#1F2E43] hover:bg-[#283B55] text-slate-300 hover:text-white border border-[#2B3D58]'
                    }`}
                    id="btn-shortcut-administrador"
                  >
                    Administrador
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="max-w-[1480px] mx-auto px-4 md:px-6 mt-10 pt-6 border-t border-slate-800 text-center text-slate-400 font-medium flex flex-col sm:flex-row justify-between items-center gap-4 pb-14 md:pb-0 text-[11px]">
          <p>© 2026 Copias Bella Vista, C.A. Barinitas, Estado Barinas, Venezuela.</p>
          <p>Equipando tus proyectos · Todos los derechos reservados</p>
        </div>
      </footer>

      {/* Login Modal */}
      {showLoginModal && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <LoginModal
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}

      {/* Mobile Currency Configuration Modal */}
      {isMobileCurrencyModalOpen && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <MobileCurrencyModal
            isOpen={isMobileCurrencyModalOpen}
            onClose={() => setIsMobileCurrencyModalOpen(false)}
            activeCurrency={activeCurrency}
            onCurrencyChange={handleCurrencyChange}
            currencyRates={currencyRates}
            disabledSettings={disabledSettings}
          />
        </Suspense>
      )}

      {/* Customer Dashboard Modal */}
      {currentUser && showCustomerDashboardModal && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <CustomerDashboardModal
            isOpen={showCustomerDashboardModal}
            onClose={() => setShowCustomerDashboardModal(false)}
            currentUser={currentUser}
            onLogout={() => {
              handleLogout();
              setShowCustomerDashboardModal(false);
            }}
            onTrackOrder={(orderId) => {
              setTrackingOrderId(orderId);
            }}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              try {
                localStorage.setItem('copias_bellavista_logged_user', JSON.stringify(updated));
              } catch (e) {}
            }}
            onAddToCart={(p) => handleAddToCart(p, 1)}
            activeCurrency={activeCurrency}
            currencyRates={currencyRates}
            products={allProductsForCarousel}
            onWishlistChanged={loadUserWishlist}
          />
        </Suspense>
      )}
      {/* 🇻🇪 Modal de Aviso y Confirmación de Tasa Oficial BCV */}
      {bcvQuote && (
        <BcvRatePromptModal
          quote={bcvQuote}
          onClose={() => setBcvQuote(null)}
          onOpenManualModal={() => {
            setManualBcvSuggestedRate(bcvQuote.rate);
            setShowManualBcvModal(true);
          }}
          onRateUpdated={(newRate) => {
            setCurrencyRates(prev => ({
              ...prev,
              VES: newRate
            }));
          }}
          triggerToast={triggerToast}
        />
      )}

      {/* 🇻🇪 Pantalla / Modal para Solicitar el Cambio Manual de la Tasa BCV */}
      <ManualBcvRateModal
        isOpen={showManualBcvModal}
        currentRate={currencyRates.VES}
        suggestedRate={manualBcvSuggestedRate || bcvQuote?.rate}
        onClose={() => {
          setShowManualBcvModal(false);
          setManualBcvSuggestedRate(null);
        }}
        onRateUpdated={(newRate) => {
          setCurrencyRates(prev => ({
            ...prev,
            VES: newRate
          }));
        }}
        triggerToast={triggerToast}
      />
    </div>
  );
}
