/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, MapPin, ShieldAlert, Laptop, UserCheck, Settings, RefreshCw, ShoppingCart, Globe, Lock, LogOut, User, Menu, X, ChevronRight, DollarSign, Edit3 } from 'lucide-react';
import { dbService, currentSettings } from '../lib/supabase.ts';
import { CurrencyCode } from '../lib/currency';
import { StoreUser, Category, BusinessProfile } from '../types.ts';
import { useI18n } from '../lib/i18n.ts';

interface NavbarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  activeRole: 'admin' | 'vendedor' | 'cliente';
  onOpenSettings: () => void;
  onNavigateToAdmin: () => void;
  isAdminView: boolean;
  onExitAdminView: () => void;
  selectedCategory: string;
  setSelectedCategory: (val: string) => void;
  categories?: Category[];
  onlyOffers: boolean;
  setOnlyOffers: (val: boolean) => void;
  onResetFilters: () => void;
  onSelectCategoryByName: (keyword: string) => void;
  cartItemsCount: number;
  onOpenCart: () => void;
  onClearFiltersOnly?: () => void;
  activeCurrency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  currencyRates: Record<CurrencyCode, number>;
  onOpenTresLechesLanding?: () => void;
  onOpenScanner?: () => void;
  currentUser?: StoreUser | null;
  onOpenLoginModal?: () => void;
  onLogout?: () => void;
  onOpenCustomerDashboard?: () => void;
  onOpenMobileCurrencyModal?: () => void;
}

export default function Navbar({
  searchTerm,
  setSearchTerm,
  activeRole,
  onOpenSettings,
  onNavigateToAdmin,
  isAdminView,
  onExitAdminView,
  selectedCategory,
  setSelectedCategory,
  categories = [],
  onlyOffers,
  setOnlyOffers,
  onResetFilters,
  onSelectCategoryByName,
  cartItemsCount,
  onOpenCart,
  onClearFiltersOnly,
  activeCurrency,
  onCurrencyChange,
  currencyRates,
  onOpenTresLechesLanding,
  onOpenScanner,
  currentUser,
  onOpenLoginModal,
  onLogout,
  onOpenCustomerDashboard,
  onOpenMobileCurrencyModal
}: NavbarProps) {
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [disabledSettings, setDisabledSettings] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('copias_bellavista_disabled_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    name: 'Copias Bella Vista, C.A.',
    business_type: 'Papelería y libros',
    address: 'Sector bella vista, a una cuadra subiendo de la Cruz roja, calle 20 entre carrera 3 y 4',
    city: 'Barinitas',
    phone: '+58 412-5043857',
    email: 'Fotocopiasfyp@gmail.com',
    rif: 'J-50987654-3',
    website: 'https://copiasbellavista.vercel.app/',
    logo_url: '',
    slogan: 'Equipando Tus Proyectos'
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const p = await dbService.getBusinessProfile();
        if (p && p.name) {
          setBusinessProfile(p);
        }
      } catch (e) {
        console.warn("Could not load business profile in Navbar:", e);
      }
    };
    loadProfile();

    const handleProfileUpdate = (e: any) => {
      if (e.detail) {
        setBusinessProfile(e.detail);
      } else {
        loadProfile();
      }
    };

    window.addEventListener('bellavista_business_profile_updated', handleProfileUpdate);
    window.addEventListener('bellavista_settings_updated', loadProfile);
    window.addEventListener('storage', loadProfile);

    return () => {
      window.removeEventListener('bellavista_business_profile_updated', handleProfileUpdate);
      window.removeEventListener('bellavista_settings_updated', loadProfile);
      window.removeEventListener('storage', loadProfile);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 40) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        const saved = localStorage.getItem('copias_bellavista_disabled_settings');
        if (saved) setDisabledSettings(JSON.parse(saved));
      } catch (e) {}
    };
    window.addEventListener('storage', load);
    window.addEventListener('bellavista_settings_updated', load);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener('bellavista_settings_updated', load);
    };
  }, []);

  const scrollToProducts = () => {
    setTimeout(() => {
      const element = document.getElementById('products-display-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };

  const escolarCategory = categories.find(c => {
    const cName = (c.name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return cName.includes('escolar') || cName.includes('utiles');
  });
  const isEscolarActive = (selectedCategory === 'cat-2' || (escolarCategory && selectedCategory === escolarCategory.id)) && !onlyOffers;

  // Split business name into high-contrast 2 parts (first word white, rest in orange/gold)
  const businessName = (businessProfile.name || 'Copias Bella Vista').trim();
  const nameParts = businessName.split(' ');
  const firstWord = nameParts[0] || 'Copias';
  const restWords = nameParts.slice(1).join(' ') || (nameParts.length === 1 ? '' : 'Bella Vista');

  return (
    <header className={`sticky top-0 z-50 bg-[#16202E] text-white select-none transition-all duration-300 border-b border-[#24334A] ${isScrolled ? 'shadow-xl' : ''}`}>
      {/* Main Navbar */}
      {!isAdminView && (
        <div className="max-w-[1480px] mx-auto px-3 sm:px-4 md:px-6 py-2.5 min-h-[56px] flex flex-nowrap items-center gap-2.5 sm:gap-3 md:gap-5">
          {/* Logo & Mobile Menu Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Hamburger Button (Mobile Only) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-[#223046] active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center border border-[#2B3D58] shadow-xs shrink-0"
              aria-label="Abrir Menú"
              id="btn-hamburger-menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5 text-[#F59E0B]" /> : <Menu className="w-5 h-5" />}
            </button>

            <div 
              onClick={() => {
                onExitAdminView();
                scrollToProducts();
              }} 
              className="cursor-pointer group flex flex-row items-center gap-2.5 shrink-0 max-w-[210px] sm:max-w-[280px] md:max-w-none"
              id="nav-logo"
            >
              {/* Business Logo from Database or Clean Initial */}
              {businessProfile.logo_url ? (
                <div className="h-9 md:h-10 w-9 md:w-10 rounded-xl overflow-hidden bg-white/10 p-1 border border-white/15 shrink-0 flex items-center justify-center shadow-xs">
                  <img 
                    src={businessProfile.logo_url} 
                    alt={businessProfile.name} 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="h-9 md:h-10 w-9 md:w-10 rounded-xl bg-gradient-to-br from-[#D97706] to-[#B45309] text-white font-extrabold flex items-center justify-center text-sm md:text-base shadow-sm shrink-0 border border-amber-400/20">
                  CBV
                </div>
              )}

              {/* Mobile 2-line clean logo */}
              <div className="flex flex-col md:hidden text-left leading-tight tracking-tight">
                <span className="text-xs font-bold text-white tracking-tight truncate">{firstWord}</span>
                <span className="text-xs font-extrabold text-[#F59E0B] tracking-tight truncate">{restWords || firstWord}</span>
              </div>

              {/* Desktop single line logo with distinctive identity */}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xl font-bold tracking-tight text-white flex items-center font-display leading-none">
                  {firstWord} {restWords && <span className="text-[#F59E0B] ml-1.5 font-extrabold">{restWords}</span>}
                </span>
                <span className="text-[11px] text-slate-300 font-medium tracking-wide mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block"></span>
                  <span>Barinitas</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-300 font-semibold">{businessProfile.slogan || 'Equipando tus proyectos'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Location Delivery Info (Desktop Only) */}
          <div className="hidden xl:flex items-center gap-2 text-left text-sm max-w-[200px] shrink-0 border-l border-[#24334A] pl-4">
            <MapPin className="text-[#F59E0B] w-4.5 h-4.5 shrink-0" />
            <div className="leading-tight flex flex-col">
              <span className="text-[11px] text-slate-400">Despachos en</span>
              <span className="font-semibold text-white text-xs">
                Barinitas, Barinas
              </span>
            </div>
          </div>

          {/* Search Bar with Refined Framing */}
          <div className="flex-1 relative h-[38px] md:h-[42px] min-w-0 m-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (onClearFiltersOnly) onClearFiltersOnly();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (onClearFiltersOnly) onClearFiltersOnly();
                  scrollToProducts();
                }
              }}
              placeholder={t('nav.search_placeholder', 'Buscar útiles, impresiones, papel, postres...')}
              className="w-full pl-3.5 pr-11 h-full bg-[#FFFFFF] text-[#0F172A] placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-transparent text-xs sm:text-sm font-medium border border-transparent shadow-xs transition"
              id="input-global-search"
            />
            <button 
              type="button"
              onClick={() => {
                if (onClearFiltersOnly) onClearFiltersOnly();
                scrollToProducts();
              }}
              className="absolute right-1 top-1 bottom-1 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1722] px-3 rounded-lg flex items-center justify-center cursor-pointer transition-colors active:scale-95 shadow-xs"
              title="Buscar en el catálogo"
            >
              <Search className="w-4 h-4 font-bold" />
            </button>
          </div>

          {/* Action Controls */}
          <div className="hidden md:flex items-center gap-3 justify-end shrink-0">
            {/* Shopping Cart Button */}
            {!isAdminView && (
              <button
                onClick={onOpenCart}
                className="relative px-3.5 py-2 text-slate-100 hover:text-white bg-[#1D2A3D] hover:bg-[#25354D] border border-[#2B3D58] rounded-xl transition cursor-pointer flex items-center gap-2 hover:scale-[1.02] active:scale-95 duration-150 shadow-xs"
                id="btn-navbar-cart"
                title={t('nav.cart', 'Carrito de compras')}
              >
                <div className="relative">
                  <ShoppingCart className="w-4.5 h-4.5 text-[#F59E0B]" />
                  {cartItemsCount > 0 && (
                    <span className="absolute -top-2 -right-2.5 bg-[#EF4444] text-white text-[10px] font-extrabold rounded-full h-4.5 min-w-[18px] px-1 flex items-center justify-center border border-[#16202E] shadow-xs">
                      {cartItemsCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold">{t('nav.cart', 'Carrito')}</span>
              </button>
            )}

            {/* User Session / Login Button */}
            {currentUser ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenCustomerDashboard) onOpenCustomerDashboard();
                  }}
                  className="flex items-center gap-2.5 bg-[#1D2A3D] hover:bg-[#25354D] border border-[#2B3D58] px-3 py-1.5 rounded-xl transition cursor-pointer shadow-xs"
                  title={t('nav.my_account', 'Mi Cuenta')}
                >
                  <div className="w-6 h-6 rounded-lg bg-[#D97706] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden lg:flex flex-col text-left">
                    <span className="text-xs font-bold text-white leading-tight max-w-[120px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-300 font-medium capitalize">
                      {currentUser.role}
                    </span>
                  </div>
                </button>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition cursor-pointer border border-transparent hover:border-rose-500/30"
                    title={t('nav.logout', 'Cerrar sesión')}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenLoginModal}
                className="px-3.5 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1722] text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 duration-150"
                id="btn-navbar-login"
                title={t('nav.login', 'Acceso / Iniciar sesión')}
              >
                <User className="w-4 h-4 text-[#0F1722] shrink-0" />
                <span>{t('nav.login', 'Acceso')}</span>
              </button>
            )}

            {/* Admin Navigation Button */}
            {isAdminView && (
              <button
                onClick={onExitAdminView}
                className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition text-xs shadow-xs cursor-pointer flex items-center gap-1.5 border border-slate-600"
                id="btn-exit-admin"
              >
                <Laptop className="w-4 h-4 text-[#F59E0B]" />
                {t('nav.client_dashboard', 'Ver Tienda')}
              </button>
            )}

            {!isAdminView && (
              <>
                {(activeRole === 'admin' || activeRole === 'vendedor') && (
                  <button
                    onClick={onNavigateToAdmin}
                    className="px-3.5 py-2 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold rounded-xl transition text-xs shadow-xs cursor-pointer flex items-center gap-1.5 border border-red-500/30"
                    id="btn-go-admin"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {t('nav.admin_panel', 'Panel Admin')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Hamburger Drawer Overlay */}
      {isMobileMenuOpen && !isAdminView && (
        <div className="md:hidden bg-[#16202E] border-t border-[#24334A] animate-fadeIn text-left select-none shadow-2xl">
          <div className="p-4 space-y-4">
            {/* Header / User summary in drawer */}
            <div className="flex items-center justify-between pb-3 border-b border-[#24334A]">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Menu className="w-4 h-4 text-[#F59E0B]" /> Menú principal
              </span>
              <div className="flex items-center gap-1.5 bg-[#1D2A3D] px-2.5 py-1 rounded-xl border border-[#2B3D58] text-xs shrink-0 shadow-xs">
                <Globe className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="text-[10px] text-slate-400 font-medium">Moneda:</span>
                <select
                  value={activeCurrency}
                  onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                  className="bg-transparent text-white text-xs font-bold cursor-pointer focus:outline-none"
                >
                  {!disabledSettings.curr_usd && <option value="USD" className="bg-[#16202E]">USD ($)</option>}
                  {!disabledSettings.curr_eur && <option value="EUR" className="bg-[#16202E]">EUR (€)</option>}
                  {!disabledSettings.curr_ves && <option value="VES" className="bg-[#16202E]">VES (Bs.)</option>}
                  {!disabledSettings.curr_cop && <option value="COP" className="bg-[#16202E]">COP ($)</option>}
                </select>
              </div>
            </div>

            {/* Categories list in drawer */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2">Categorías del catálogo</p>
              
              <button
                onClick={() => {
                  onResetFilters();
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  selectedCategory === 'all' && !onlyOffers
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>Todos los artículos</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setOnlyOffers(true);
                  setSelectedCategory('all');
                  setSearchTerm('');
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  onlyOffers
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>🔥 Ofertas especiales</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  onSelectCategoryByName('Papelería y Oficina');
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  selectedCategory === 'cat-3' && !onlyOffers
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>✏️ Papelería y oficina</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  onSelectCategoryByName('Impresiones y Copiado');
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  selectedCategory === 'cat-1' && !onlyOffers
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>🖨️ Impresión y copiado</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  onSelectCategoryByName('Escolares y utiles');
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  isEscolarActive
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>🎒 Útiles escolares</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  onSelectCategoryByName('Postres');
                  scrollToProducts();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  selectedCategory === 'c5fd6476-9639-4cd6-af3e-8515f366fd07' && !onlyOffers
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'bg-[#1D2A3D] text-slate-300 hover:text-white hover:bg-[#223046] border border-[#2B3D58]'
                }`}
              >
                <span>🍰 Obrador y dulces</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {onOpenTresLechesLanding && (
                <button
                  onClick={() => {
                    onOpenTresLechesLanding();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-900/30 text-amber-200 border border-amber-500/30 hover:bg-amber-900/50 transition"
                >
                  <span>✨ Especial: Tres Leches Arequipe</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Actions & User Controls in drawer */}
            <div className="pt-3 border-t border-[#24334A] space-y-2">
              {(activeRole === 'admin' || activeRole === 'vendedor') && (
                <button
                  onClick={() => {
                    onNavigateToAdmin();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition cursor-pointer border border-red-500/30"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Panel de administración</span>
                </button>
              )}

              {currentUser ? (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      if (onOpenCustomerDashboard) onOpenCustomerDashboard();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 py-2 bg-[#1D2A3D] hover:bg-[#25354D] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-[#2B3D58] transition"
                  >
                    <User className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>Mi cuenta</span>
                  </button>
                  {onLogout && (
                    <button
                      onClick={() => {
                        onLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center border border-rose-500/20 transition"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (onOpenLoginModal) onOpenLoginModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F1722] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <User className="w-4 h-4" />
                  <span>Iniciar sesión / Registrarse</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-navigation bar (Refined Slate / Taller Navegación - Desktop Only) */}
      {!isAdminView && (
        <nav className="hidden md:block bg-[#111A26] text-slate-200 border-t border-[#1E2B3E]">
          <div className="max-w-[1480px] mx-auto px-4 md:px-6 h-[42px] text-xs font-medium flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            {/* Todos */}
            <button 
              type="button"
              onClick={() => {
                onResetFilters();
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedCategory === 'all' && !onlyOffers
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-todo"
            >
              <span>Todos los artículos</span>
            </button>

            {/* Ofertas */}
            <button 
              type="button"
              onClick={() => {
                setOnlyOffers(true);
                setSelectedCategory('all');
                setSearchTerm('');
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                onlyOffers
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-offers"
            >
              <span>Ofertas especiales</span>
            </button>

            {/* Papelería */}
            <button 
              type="button"
              onClick={() => {
                onSelectCategoryByName('Papelería y Oficina');
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedCategory === 'cat-3' && !onlyOffers
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-stationery"
            >
              <span>Papelería y oficina</span>
            </button>

            {/* Copias */}
            <button 
              type="button"
              onClick={() => {
                onSelectCategoryByName('Impresiones y Copiado');
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedCategory === 'cat-1' && !onlyOffers
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-copias"
            >
              <span>Impresión y copiado</span>
            </button>

            {/* Escolares */}
            <button 
              type="button"
              onClick={() => {
                onSelectCategoryByName('Escolares y utiles');
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isEscolarActive
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-supplies"
            >
              <span>Útiles escolares</span>
            </button>

            {/* Postres */}
            <button 
              type="button"
              onClick={() => {
                onSelectCategoryByName('Postres');
                scrollToProducts();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedCategory === 'c5fd6476-9639-4cd6-af3e-8515f366fd07' && !onlyOffers
                  ? 'bg-[#1D2A3D] text-[#F59E0B] border border-[#F59E0B]/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#1A2638]'
              }`}
              id="nav-sub-postres"
            >
              <span>Obrador y dulces</span>
            </button>

            {onOpenTresLechesLanding && (
              <button 
                type="button"
                onClick={onOpenTresLechesLanding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-200 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-500/30 transition cursor-pointer ml-1"
                id="nav-sub-tres-leches"
                title="Ver especial de Tres Leches"
              >
                <span>🍰 Tres Leches Arequipe</span>
              </button>
            )}

            <div className="flex-1"></div>

            {/* Live Exchange Rate & Currency Controls */}
            <div className="flex items-center gap-3">
              {/* Tasa BCV Oficial en Tiempo Real */}
              <div className="flex items-center gap-2 bg-[#182333] border border-[#2B3D58] px-3 py-1 rounded-xl shadow-xs">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] text-slate-300 font-medium">Tasa BCV:</span>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('bellavista_check_bcv_rate'))}
                  className="text-xs font-bold text-white hover:text-[#F59E0B] transition cursor-pointer flex items-center gap-1.5"
                  title="Verificar cotización oficial del Banco Central de Venezuela"
                >
                  <span>Bs. {Number(currencyRates.VES).toFixed(2)}</span>
                  <RefreshCw className="w-3 h-3 text-slate-400 hover:text-[#F59E0B]" />
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('bellavista_open_manual_bcv_modal'))}
                  className="text-slate-400 hover:text-amber-400 transition cursor-pointer pl-1 border-l border-slate-700"
                  title="Ajustar tasa BCV manualmente"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>

              {/* Currency Selector */}
              <div className="flex items-center gap-1.5 bg-[#182333] border border-[#2B3D58] px-2.5 py-1 rounded-xl shadow-xs">
                <Globe className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="text-[11px] text-slate-300 font-medium">Moneda:</span>
                <select
                  value={activeCurrency}
                  onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                  className="bg-transparent text-white text-xs font-bold cursor-pointer focus:outline-none"
                >
                  <option value="USD" className="bg-[#16202E]">USD ($)</option>
                  <option value="VES" className="bg-[#16202E]">VES (Bs.)</option>
                  <option value="EUR" className="bg-[#16202E]">EUR (€)</option>
                  <option value="COP" className="bg-[#16202E]">COP ($)</option>
                </select>
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
