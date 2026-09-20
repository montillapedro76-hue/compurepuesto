/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, Package, FileText, ClipboardList, MapPin, CreditCard, Shield, 
  X, CheckCircle2, Clock, LogOut, Lock, RefreshCw, Smartphone, Key, 
  ExternalLink, Search, Plus, Trash2, Edit3, ShieldAlert, Heart, ShoppingCart
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { StoreUser, Order, WishlistItem } from '../types';
import { CurrencyCode, CURRENCIES } from '../lib/currency';

interface CustomerDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StoreUser;
  onLogout: () => void;
  onTrackOrder?: (orderId: string) => void;
  onUpdateUser?: (updatedUser: StoreUser) => void;
  onAddToCart?: (product: any) => void;
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  products?: any[];
  onWishlistChanged?: () => void;
}

type CustomerTab = 'profile' | 'orders' | 'invoices' | 'wishlist' | 'addresses' | 'payments' | 'security';

export default function CustomerDashboardModal({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onTrackOrder,
  onUpdateUser,
  onAddToCart,
  activeCurrency,
  currencyRates,
  products = [],
  onWishlistChanged
}: CustomerDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<CustomerTab>('orders');

  // Customer data states
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderDateFilter, setOrderDateFilter] = useState<string>('');

  // Wishlist and Products
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [clientInfo, setClientInfo] = useState<any | null>(null);

  // Profile Edit States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editPhone, setEditPhone] = useState(currentUser?.phone || currentUser?.telefono || '');
  const [editDocType, setEditDocType] = useState('V');
  const [editDocNum, setEditDocNum] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  // Address Manager
  const [addresses, setAddresses] = useState<string[]>([
    'Av. Bella Vista con Calle 72, Edif. Copias, Piso 1, Maracaibo, Zulia',
    'Sector Tierra Negra, Calle 75 con Av. 10, Edif. Torre Cristal, Maracaibo'
  ]);
  const [newAddressText, setNewAddressText] = useState('');
  const [showAddAddress, setShowAddAddress] = useState(false);

  // Password Change
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  // Sessions and Security Logs
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadCustomerData();
    }
  }, [isOpen, currentUser]);

  const loadCustomerData = async () => {
    setLoadingOrders(true);
    try {
      const emailVal = currentUser?.email || '';
      
      // Load customer profile info
      try {
        const client = emailVal ? await dbService.findClientByIdentifier(emailVal) : null;
        setClientInfo(client);

        if (client) {
          setEditName(currentUser?.name || client.name || '');
          setEditPhone(currentUser?.phone || currentUser?.telefono || client.phone || client.telefono || '');
          setEditDocType(client.doc_type || client.tipo_documento || 'V');
          setEditDocNum(client.doc_number || client.documento || (client.document && client.document.includes('-') ? client.document.split('-')[1] : ''));
        } else {
          setEditName(currentUser?.name || '');
          setEditPhone(currentUser?.phone || currentUser?.telefono || '');
        }
      } catch (err) {
        console.warn("Error loading client info:", err);
      }

      // Load client's orders
      try {
        const allOrders = await dbService.getOrders();
        const myEmail = (emailVal || '').toLowerCase();
        const userOrders = myEmail ? allOrders.filter(o => {
          const oEmail = (o.customer_email || '').toLowerCase();
          const addressText = (o.address_text || '').toLowerCase();
          return oEmail === myEmail || addressText.includes(`[email: ${myEmail}]`) || addressText.includes(myEmail);
        }) : [];
        setOrders(userOrders);
      } catch (err) {
        console.warn("Error loading orders:", err);
      }

      // Load sessions
      try {
        const sessions = emailVal ? await dbService.getSessions(emailVal) : [];
        setActiveSessions(sessions);
      } catch (err) {
        console.warn("Error loading sessions:", err);
      }

      // Load security logs
      try {
        const logs = await dbService.getSecurityLogs();
        setSecurityLogs(logs.filter(l => emailVal && l.user_email === emailVal));
      } catch (err) {
        console.warn("Error loading security logs:", err);
      }

      // Load wishlist and products
      setLoadingWishlist(true);
      try {
        const list = await dbService.getWishlist(emailVal);
        setWishlist(list);
      } catch (err) {
        console.warn("Error loading wishlist:", err);
      }

      try {
        const prods = await dbService.getProducts();
        const mergedMap = new Map();
        if (products && products.length > 0) {
          products.forEach(p => { if (p && p.id) mergedMap.set(String(p.id), p); });
        }
        if (prods && prods.length > 0) {
          prods.forEach(p => { if (p && p.id) mergedMap.set(String(p.id), p); });
        }
        setAllProducts(Array.from(mergedMap.values()));
      } catch (err) {
        console.warn("Error loading products catalog:", err);
        if (products) {
          setAllProducts(products);
        }
      }
      setLoadingWishlist(false);
    } catch (e) {
      console.error("Error loading customer dashboard data:", e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    setProfileError('');

    if (!editName.trim() || !editPhone.trim()) {
      setProfileError('El nombre y el teléfono son requeridos.');
      setSavingProfile(false);
      return;
    }

    try {
      const emailVal = currentUser?.email || '';

      // 1. Update in store_users
      if (currentUser?.id) {
        await dbService.updateStoreUser(currentUser.id, {
          name: editName.trim(),
          phone: editPhone.trim(),
          telefono: editPhone.trim()
        });
      }

      // 2. Update in clients table if client exists
      if (clientInfo?.id) {
        const formattedDoc = `${editDocType}-${editDocNum.trim()}`;
        await dbService.updateClient(clientInfo.id, {
          name: editName.trim(),
          phone: editPhone.trim(),
          email: emailVal,
          doc_type: editDocType,
          doc_number: editDocNum.trim(),
          tipo_documento: editDocType,
          documento: editDocNum.trim(),
          document: formattedDoc,
          rif: formattedDoc
        });
      }

      // Update parent state
      const updatedUser: StoreUser = {
        ...currentUser,
        name: editName.trim(),
        phone: editPhone.trim(),
        telefono: editPhone.trim()
      };
      
      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }

      // Reload clientInfo
      const client = emailVal ? await dbService.findClientByIdentifier(emailVal) : null;
      setClientInfo(client);

      setProfileMsg('¡Perfil actualizado con éxito!');
      setIsEditingProfile(false);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setProfileError('Error al guardar los cambios: ' + (err.message || ''));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = () => {
    if (!newAddressText.trim()) return;
    setAddresses(prev => [...prev, newAddressText.trim()]);
    setNewAddressText('');
    setShowAddAddress(false);
  };

  const handleDeleteAddress = (index: number) => {
    setAddresses(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    setPassError('');

    if (!newPasswordInput || !confirmPasswordInput) {
      setPassError('Por favor complete la nueva contraseña y su confirmación.');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPassError('Las nuevas contraseñas no coinciden.');
      return;
    }

    if (newPasswordInput.length < 6) {
      setPassError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      const res = await dbService.resetClientPassword(currentUser.email, newPasswordInput);
      if (res.success) {
        setPassMsg('¡Contraseña actualizada con éxito!');
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
      } else {
        setPassError(res.message);
      }
    } catch (err: any) {
      setPassError('Error al actualizar contraseña.');
    }
  };

  const handleTerminateAllSessions = async () => {
    if (confirm('¿Deseas cerrar la sesión en todos los demás dispositivos activos?')) {
      await dbService.terminateAllSessions(currentUser.email);
      setActiveSessions([]);
      alert('Se han cerrado todas las sesiones externas.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-4xl shadow-2xl overflow-hidden text-left flex flex-col max-h-[92vh]">
        
        {/* MODAL HEADER */}
        <div className="p-5 bg-[#131921] text-white flex justify-between items-center relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#005da9]/20 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none"></div>

          <div className="relative z-10 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#005da9] text-white flex items-center justify-center font-black text-lg shadow-lg shrink-0 border border-blue-400/30">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold uppercase tracking-wide text-white">
                  {currentUser.name}
                </h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase rounded-full border border-emerald-400/30">
                  Cliente Verificado
                </span>
              </div>
              <p className="text-xs text-gray-300 font-medium">
                {currentUser.email} • Portal Personal de Cliente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            <button
              onClick={onLogout}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION SUBMENU TABS */}
        <div className="flex border-b border-gray-200 bg-gray-50/90 p-1.5 overflow-x-auto custom-scrollbar gap-1 shrink-0">
          {[
            { id: 'orders', label: 'Mis Pedidos', icon: Package, count: orders.length },
            { id: 'invoices', label: 'Mis Compras', icon: FileText },
            { id: 'wishlist', label: 'Lista de Deseo', icon: Heart, count: wishlist.length },
            { id: 'profile', label: 'Mi Perfil', icon: User }
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as CustomerTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#005da9] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive ? 'bg-white text-[#005da9]' : 'bg-gray-200 text-gray-800'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CONTENT DISPLAY */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">

          {/* TAB 1: MIS PEDIDOS */}
          {activeTab === 'orders' && (() => {
            const filteredCustomerOrders = orders.filter(o => !orderDateFilter || (o.created_at && o.created_at.split('T')[0] === orderDateFilter));
            return (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase">Mis Pedidos Realizados</h3>
                    <p className="text-xs text-gray-500 font-medium">Historial completo de tus compras y seguimiento en tiempo real.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Date Selector */}
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={orderDateFilter}
                        onChange={(e) => setOrderDateFilter(e.target.value)}
                        className="bg-white border border-gray-300 rounded-xl px-2.5 py-1 text-xs focus:ring-1 focus:ring-[#005da9] focus:outline-none font-semibold text-gray-700 h-[32px]"
                      />
                      {orderDateFilter && (
                        <button
                          onClick={() => setOrderDateFilter('')}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-[10px] font-bold transition h-[32px] cursor-pointer"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    <button
                      onClick={loadCustomerData}
                      className="p-1.5 text-gray-500 hover:text-[#005da9] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                      title="Actualizar lista"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {loadingOrders ? (
                  <div className="p-8 text-center text-gray-500 text-xs font-bold">Cargando tus pedidos...</div>
                ) : orders.length === 0 ? (
                  <div className="p-8 bg-white border border-gray-200 rounded-2xl text-center text-gray-500 space-y-3">
                    <Package className="w-10 h-10 text-gray-300 mx-auto" />
                    <p className="text-xs font-bold text-gray-600">Aún no has realizado pedidos con esta cuenta.</p>
                    <p className="text-[11px] text-gray-400">Tus compras realizadas en la tienda digital aparecerán organizadas aquí.</p>
                  </div>
                ) : filteredCustomerOrders.length === 0 ? (
                  <div className="p-8 bg-white border border-gray-200 rounded-2xl text-center text-gray-500 space-y-2">
                    <Package className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-xs font-bold text-gray-600">No se encontraron pedidos para la fecha seleccionada ({orderDateFilter}).</p>
                    <button
                      onClick={() => setOrderDateFilter('')}
                      className="text-xs font-bold text-[#005da9] hover:underline"
                    >
                      Ver todos los pedidos
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCustomerOrders.map((o) => (
                      <div key={o.id || o.order_number} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-[#005da9] text-xs">
                                Orden #{o.order_number || o.id?.slice(0, 8)}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                o.status === 'Entregado' ? 'bg-emerald-100 text-emerald-800' :
                                o.status === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {o.status || 'En Proceso'}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 font-medium">
                              {o.created_at ? new Date(o.created_at).toLocaleString('es-VE') : 'Reciente'}
                            </span>
                          </div>

                          <div className="text-right flex items-center gap-3">
                            <span className="text-sm font-black text-gray-900 font-mono">
                              US$ {Number(o.total_price || 0).toFixed(2)}
                            </span>
                            {onTrackOrder && (
                              <button
                                onClick={() => {
                                  onTrackOrder(o.id || String(o.order_number));
                                  onClose();
                                }}
                                className="px-3 py-1.5 bg-[#005da9] hover:bg-[#004b88] text-white text-[11px] font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
                              >
                                <span>Rastrear</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Items */}
                        <div className="space-y-1.5">
                          {o.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs font-medium text-gray-700">
                              <span>• {item.name} x{item.quantity}</span>
                              <span className="font-mono text-gray-500">US$ {(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 2: MI PERFIL */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#005da9]" />
                  <span>Información de la Cuenta</span>
                </h3>

                {isEditingProfile ? (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    {profileError && (
                      <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold">{profileError}</div>
                    )}
                    {profileMsg && (
                      <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold">{profileMsg}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">Nombre Registrado *</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">Correo Electrónico (No editable)</label>
                        <input
                          type="text"
                          disabled
                          value={currentUser.email}
                          className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-400 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">Tipo de Doc *</label>
                        <select
                          value={editDocType}
                          onChange={(e) => setEditDocType(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                        >
                          <option value="V">V (Venezolano)</option>
                          <option value="E">E (Extranjero)</option>
                          <option value="J">J (Jurídico)</option>
                          <option value="G">G (Gubernamental)</option>
                          <option value="P">P (Pasaporte)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">Número de Documento / RIF *</label>
                        <input
                          type="text"
                          required
                          value={editDocNum}
                          onChange={(e) => setEditDocNum(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">Teléfono de Contacto *</label>
                        <input
                          type="text"
                          required
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Ej: 0414-1234567"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setProfileError('');
                          setProfileMsg('');
                        }}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-black rounded-xl uppercase tracking-wider transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl uppercase tracking-wider transition cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {savingProfile ? 'Guardando...' : 'Guardar Cambios'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {profileMsg && (
                      <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold">{profileMsg}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Nombre Registrado:</span>
                        <strong className="text-gray-900 font-bold text-sm">{currentUser.name}</strong>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Correo Electrónico:</span>
                        <strong className="text-gray-900 font-bold text-sm font-mono">{currentUser.email}</strong>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Tipo de Documento / RIF:</span>
                        <strong className="text-gray-900 font-bold text-sm">
                          {clientInfo?.doc_type || clientInfo?.tipo_documento || 'V'}-{clientInfo?.doc_number || clientInfo?.documento || clientInfo?.rif || ''}
                        </strong>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Teléfono de Contacto:</span>
                        <strong className="text-gray-900 font-bold text-sm">{currentUser.phone || currentUser.telefono || clientInfo?.phone || clientInfo?.telefono || ''}</strong>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => {
                          setEditName(currentUser.name);
                          setEditPhone(currentUser.phone || currentUser.telefono || clientInfo?.phone || clientInfo?.telefono || '');
                          setEditDocType(clientInfo?.doc_type || clientInfo?.tipo_documento || 'V');
                          setEditDocNum(clientInfo?.doc_number || clientInfo?.documento || (clientInfo?.document && clientInfo.document.includes('-') ? clientInfo.document.split('-')[1] : ''));
                          setIsEditingProfile(true);
                          setProfileError('');
                          setProfileMsg('');
                        }}
                        className="px-4 py-2 bg-[#FF9900] hover:bg-[#e47911] text-[#131921] text-xs font-black rounded-xl uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar Perfil</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* DIRECCIONES GUARDADAS (INCLUIDAS EN PERFIL) */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#005da9]" />
                    <span>Direcciones de Entrega</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(!showAddAddress)}
                    className="px-3 py-1.5 bg-[#005da9] hover:bg-[#004b88] text-white text-[11px] font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nueva Dirección</span>
                  </button>
                </div>

                {showAddAddress && (
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                    <label className="block text-[10px] font-black uppercase text-gray-700">
                      Ingresa la nueva dirección de entrega:
                    </label>
                    <textarea
                      rows={2}
                      value={newAddressText}
                      onChange={(e) => setNewAddressText(e.target.value)}
                      placeholder="Ej: Av. 4 Bella Vista, Res. San José, Apto 4B, Maracaibo"
                      className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-[#005da9]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddAddress}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Guardar Dirección
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddAddress(false)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {addresses.length === 0 ? (
                    <p className="text-xs text-gray-500 font-medium">No tienes direcciones guardadas.</p>
                  ) : (
                    addresses.map((addr, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-150 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-[#005da9] shrink-0 mt-0.5" />
                          <p className="text-xs font-bold text-gray-800 leading-relaxed">{addr}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(idx)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CHANGE PASSWORD FORM */}
              <form onSubmit={handleChangePassword} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#005da9]" />
                  <span>Cambiar Mi Contraseña</span>
                </h3>

                {passError && (
                  <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold">{passError}</div>
                )}
                {passMsg && (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold">{passMsg}</div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Nueva Contraseña *
                    </label>
                    <input
                      type="password"
                      required
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Confirmar Nueva Contraseña *
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Repetir clave"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005da9] hover:bg-[#004b88] text-white text-xs font-black rounded-xl uppercase tracking-wider transition cursor-pointer shadow-xs"
                >
                  Actualizar Contraseña
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: FACTURAS */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-2">
                <h3 className="text-sm font-black text-gray-900 uppercase">Facturación Electrónica</h3>
                <p className="text-xs text-gray-500 font-medium">Facturas digitales asociadas a tus compras con tu RIF/Cédula.</p>
              </div>

              {orders.length === 0 ? (
                <div className="p-8 bg-white border border-gray-200 rounded-2xl text-center text-gray-500">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs font-bold">No hay facturas emitidas aún.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((o, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#005da9] flex items-center justify-center font-bold">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-gray-900">
                            Factura #FAC-2026-00{idx + 1}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-medium">
                            Orden #{o.order_number || o.id?.slice(0, 8)} • {o.created_at ? new Date(o.created_at).toLocaleDateString('es-VE') : 'Reciente'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-900 font-mono">
                          US$ {Number(o.total_price || 0).toFixed(2)}
                        </span>
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-lg">
                          Pagada
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LISTA DE DESEOS */}
          {activeTab === 'wishlist' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase">Mi Lista de Deseos</h3>
                  <p className="text-xs text-gray-500 font-medium">Guarda los artículos que deseas adquirir. Se eliminarán automáticamente al comprarlos.</p>
                </div>
                <button
                  onClick={async () => {
                    if (currentUser?.email) {
                      setLoadingWishlist(true);
                      const list = await dbService.getWishlist(currentUser.email);
                      setWishlist(list);
                      setLoadingWishlist(false);
                    }
                  }}
                  className="p-1.5 text-gray-500 hover:text-[#005da9] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                  title="Actualizar lista de deseos"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {loadingWishlist ? (
                <div className="p-8 text-center text-gray-500 text-xs font-bold">Cargando tu lista de deseos...</div>
              ) : wishlist.length === 0 ? (
                <div className="p-8 bg-white border border-gray-200 rounded-2xl text-center text-gray-500 space-y-3">
                  <Heart className="w-10 h-10 text-gray-300 mx-auto" />
                  <p className="text-xs font-bold text-gray-600">Tu lista de deseos está vacía.</p>
                  <p className="text-[11px] text-gray-400">Navega por nuestro catálogo y haz clic en el corazón de cualquier producto para guardarlo aquí.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {wishlist.map((item) => {
                    const prod = allProducts.find(p => p && String(p.id) === String(item.product_id));
                    if (!prod) return null;

                    const hasOffer = prod.is_on_offer && prod.offer_price !== null;
                    const finalPrice = hasOffer ? prod.offer_price : prod.price;

                    // format price in active currency
                    const rate = currencyRates[activeCurrency] || 1;
                    const converted = finalPrice * rate;
                    const config = CURRENCIES[activeCurrency];
                    const isCOP = activeCurrency === 'COP';
                    const decimals = config.decimals;
                    const formattedNum = isCOP ? Math.round(converted).toLocaleString('es-CO') : converted.toFixed(decimals);
                    const formattedPriceStr = config.position === 'prefix' 
                      ? `${config.symbol}${formattedNum}`
                      : `${formattedNum} ${config.symbol}`;

                    return (
                      <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition flex gap-3 relative">
                        <div className="w-20 h-20 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                          <img 
                            src={prod.image_url || 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&q=80&w=200'} 
                            alt={prod.name}
                            className="w-16 h-16 object-contain mix-blend-multiply"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-black text-gray-900 truncate" title={prod.name}>{prod.name}</h4>
                            <p className="text-[10px] text-gray-400 font-bold uppercase font-mono mt-0.5">SKU: {prod.sku}</p>
                          </div>

                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-black text-gray-900 font-mono">{formattedPriceStr}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  if (currentUser?.email) {
                                    await dbService.removeFromWishlist(currentUser.email, prod.id);
                                    setWishlist(prev => prev.filter(w => w.product_id !== prod.id));
                                    onWishlistChanged?.();
                                  }
                                }}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-xl transition cursor-pointer"
                                title="Eliminar de la lista"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              {onAddToCart && (
                                <button
                                  onClick={() => {
                                    onAddToCart(prod);
                                  }}
                                  className="px-2.5 py-1.5 bg-[#FF9900] hover:bg-[#e47911] text-[#131921] font-black text-[10px] uppercase rounded-xl tracking-wider transition cursor-pointer flex items-center gap-1 shrink-0"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  <span>Al Carrito</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
