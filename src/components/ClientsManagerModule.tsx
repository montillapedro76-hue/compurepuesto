import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserCheck, UserX, Search, Filter, SlidersHorizontal, 
  Printer, Download, FileSpreadsheet, Plus, Edit3, Trash2, 
  RefreshCw, X, ShoppingBag, Calendar, DollarSign, 
  TrendingUp, Package, CheckCircle2, Clock, 
  FileText, Receipt, Eye, CreditCard, ChevronDown, 
  ChevronUp, ArrowUpDown, Sparkles, Mail, Phone, MapPin, Building2, User
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { Order, Invoice } from '../types';

interface ClientsManagerModuleProps {
  onOpenNewClient: () => void;
  onOpenEditClient: (client: any) => void;
  onDeleteClient: (id: string, name: string) => void;
  orders?: Order[];
}

export default function ClientsManagerModule({
  onOpenNewClient,
  onOpenEditClient,
  onDeleteClient,
  orders: propOrders = []
}: ClientsManagerModuleProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>(propOrders);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Advanced Filters State
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<'all' | 'Natural' | 'Jurídico'>('all');
  const [filterPurchases, setFilterPurchases] = useState<'all' | 'with_purchases' | 'no_purchases'>('all');
  const [filterCredit, setFilterCredit] = useState<'all' | 'with_credit' | 'no_credit'>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'spent_desc' | 'orders_desc' | 'recent' | 'code_asc'>('name_asc');

  // Client Details Modal / Screen State
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<any | null>(null);
  const [selectedPurchaseForPreview, setSelectedPurchaseForPreview] = useState<any | null>(null);

  // Load all data
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [fetchedClients, fetchedOrders, fetchedInvoices] = await Promise.all([
        dbService.getClients().catch(() => []),
        dbService.getOrders().catch(() => []),
        dbService.getInvoices().catch(() => [])
      ]);
      setClients(fetchedClients || []);
      setOrders(fetchedOrders || []);
      setInvoices(fetchedInvoices || []);
    } catch (e) {
      console.error("Error loading clients data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClientAction = async (client: any) => {
    if (!client) return;
    const clientName = client.name || 'este cliente';
    const clientCode = client.code || client.document || client.id || '';
    
    const isConfirmed = window.confirm(
      `¿Está seguro de eliminar permanentemente al cliente "${clientName}" (${clientCode})?\n\nEsta acción eliminará el registro de la base de datos y de la lista.`
    );
    if (!isConfirmed) return;

    try {
      // 1. Delete from database & local storage immediately
      await dbService.deleteClient(client.id, client.name, client.document);

      // 2. Clear from local state immediately
      setClients(prev => prev.filter(c => c.id !== client.id && (!client.document || c.document !== client.document)));

      // 3. Close details modal if open on this client
      if (selectedClientForDetails && (selectedClientForDetails.id === client.id || (client.document && selectedClientForDetails.document === client.document))) {
        setSelectedClientForDetails(null);
      }

      // 4. Notify parent orchestrator
      if (onDeleteClient) {
        onDeleteClient(client.id, client.name);
      }
    } catch (err: any) {
      console.error("Error al eliminar cliente:", err);
      alert("No se pudo eliminar el cliente: " + (err.message || 'Error desconocido'));
    }
  };

  useEffect(() => {
    loadData();

    const handleClientsUpdate = () => loadData(true);
    const handleOrdersUpdate = () => loadData(true);

    window.addEventListener('bellavista_clients_updated', handleClientsUpdate);
    window.addEventListener('bellavista_orders_updated', handleOrdersUpdate);

    return () => {
      window.removeEventListener('bellavista_clients_updated', handleClientsUpdate);
      window.removeEventListener('bellavista_orders_updated', handleOrdersUpdate);
    };
  }, []);

  // Helper to match purchases (orders + invoices) for a given client
  const getClientHistory = (client: any) => {
    if (!client) return { purchases: [], totalSpent: 0, totalOrders: 0, topProduct: 'Sin compras', lastOrderDate: null, lastOrderRelative: 'Sin órdenes', isActive: false };

    const cName = (client.name || '').trim().toLowerCase();
    const cDoc = (client.document || client.doc_number || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
    const cEmail = (client.email || client.correo || '').trim().toLowerCase();
    const cId = String(client.id || '');

    // Match orders
    const matchedOrders = (orders || []).filter(o => {
      const oName = (o.customer_name || o.client_name || o.user_name || '').trim().toLowerCase();
      const oDoc = (o.customer_document || o.client_document || o.document || o.doc_number || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
      const oEmail = (o.customer_email || o.client_email || o.email || '').trim().toLowerCase();
      const oUserId = String(o.user_id || o.customer_id || o.client_id || '');

      if (cId && oUserId && (cId === oUserId)) return true;
      if (cDoc && oDoc && (cDoc === oDoc || oDoc.includes(cDoc) || cDoc.includes(oDoc))) return true;
      if (cEmail && oEmail && cEmail === oEmail) return true;
      if (cName && oName && (cName === oName || (cName.length > 4 && oName.includes(cName)))) return true;
      return false;
    });

    // Match invoices
    const matchedInvoices = (invoices || []).filter(inv => {
      const invName = (inv.customer_name || inv.client_name || inv.client || '').trim().toLowerCase();
      const invDoc = (inv.customer_document || inv.client_document || inv.document || inv.doc_number || inv.rif || inv.cedula || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
      const invEmail = (inv.customer_email || inv.client_email || inv.email || '').trim().toLowerCase();
      const invClientId = String(inv.customer_id || inv.client_id || '');

      if (cId && invClientId && (cId === invClientId)) return true;
      if (cDoc && invDoc && (cDoc === invDoc || invDoc.includes(cDoc) || cDoc.includes(invDoc))) return true;
      if (cEmail && invEmail && cEmail === invEmail) return true;
      if (cName && invName && (cName === invName || (cName.length > 4 && invName.includes(cName)))) return true;
      return false;
    });

    // Consolidate list of transactions
    const purchasesMap = new Map<string, any>();

    matchedOrders.forEach(o => {
      const key = `ord-${o.id || o.order_number}`;
      const itemsList = Array.isArray(o.items) ? o.items : [];
      purchasesMap.set(key, {
        id: o.id,
        key,
        type: 'Pedido Web / POS',
        number: o.order_number || o.id?.substring(0, 8) || 'S/N',
        date: o.created_at || o.date || new Date().toISOString(),
        total_usd: Number(o.total || o.total_amount || o.total_usd || 0),
        total_bs: Number(o.total_bs || 0),
        status: o.status || 'Completado',
        payment_method: o.payment_method || o.metodo_pago || 'Múltiple',
        items: itemsList.map((it: any) => ({
          name: it.title || it.name || it.product_title || 'Producto',
          quantity: Number(it.quantity || it.qty || 1),
          price: Number(it.price || it.unit_price || 0),
          total: Number(it.total || ((it.quantity || 1) * (it.price || 0)))
        }))
      });
    });

    matchedInvoices.forEach(inv => {
      const invKey = `inv-${inv.id || inv.invoice_number || inv.control_number}`;
      // Avoid duplicate if same order
      if (inv.order_id && purchasesMap.has(`ord-${inv.order_id}`)) {
        return;
      }
      const itemsList = Array.isArray(inv.items) ? inv.items : [];
      purchasesMap.set(invKey, {
        id: inv.id,
        key: invKey,
        type: inv.type === 'Factura' ? 'Factura Fiscal' : 'Nota de Entrega',
        number: inv.invoice_number || inv.control_number || inv.id?.substring(0, 8) || 'S/N',
        date: inv.created_at || inv.date || inv.fecha || new Date().toISOString(),
        total_usd: Number(inv.total_amount || inv.total_usd || inv.total || 0),
        total_bs: Number(inv.total_bs || 0),
        status: inv.status || 'Pagada',
        payment_method: inv.payment_method || inv.metodo_pago || 'Transferencia / Efectivo',
        items: itemsList.map((it: any) => ({
          name: it.title || it.name || it.description || 'Artículo',
          quantity: Number(it.quantity || it.qty || 1),
          price: Number(it.price || it.unit_price || 0),
          total: Number(it.total || ((it.quantity || 1) * (it.price || 0)))
        }))
      });
    });

    const purchases = Array.from(purchasesMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate metrics
    let totalSpent = 0;
    const productCounts: Record<string, number> = {};

    purchases.forEach(p => {
      totalSpent += p.total_usd;
      p.items.forEach((item: any) => {
        const prodName = (item.name || '').trim();
        if (prodName) {
          productCounts[prodName] = (productCounts[prodName] || 0) + (item.quantity || 1);
        }
      });
    });

    // Top product
    let topProduct = 'Sin compras';
    let maxCount = 0;
    Object.entries(productCounts).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topProduct = `${name} (${count} uds)`;
      }
    });

    // Last order relative time
    const lastOrderDate = purchases.length > 0 ? purchases[0].date : null;
    let lastOrderRelative = 'Sin órdenes';
    let isActive = false;

    if (lastOrderDate) {
      const now = new Date();
      const orderTime = new Date(lastOrderDate);
      const diffDays = Math.floor((now.getTime() - orderTime.getTime()) / (1000 * 60 * 60 * 24));

      // Client is active if ordered in last 90 days
      if (diffDays <= 90) {
        isActive = true;
      }

      if (diffDays === 0) {
        lastOrderRelative = 'Hoy';
      } else if (diffDays === 1) {
        lastOrderRelative = 'Ayer';
      } else if (diffDays < 7) {
        lastOrderRelative = `Hace ${diffDays} días`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        lastOrderRelative = `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        lastOrderRelative = `Hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
      } else {
        const years = Math.floor(diffDays / 365);
        lastOrderRelative = `Hace más de ${years} año`;
      }
    }

    const totalOrders = purchases.length;
    const averageTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;

    return {
      purchases,
      totalSpent,
      totalOrders,
      topProduct,
      lastOrderDate,
      lastOrderRelative,
      isActive,
      averageTicket
    };
  };

  // Pre-calculate client enhanced items
  const enhancedClients = useMemo(() => {
    return clients.map(client => {
      const stats = getClientHistory(client);
      return {
        ...client,
        stats
      };
    });
  }, [clients, orders, invoices]);

  // Overall General Metrics for the top cards
  const generalMetrics = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;

    enhancedClients.forEach(c => {
      if (c.stats.isActive) {
        activeCount++;
      } else {
        inactiveCount++;
      }
    });

    return {
      active: activeCount,
      inactive: inactiveCount,
      total: enhancedClients.length
    };
  }, [enhancedClients]);

  // Filtered & Sorted Clients
  const filteredClients = useMemo(() => {
    return enhancedClients.filter(c => {
      // Search term
      if (searchTerm) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchDoc = (c.document || c.doc_number || '').toLowerCase().includes(q);
        const matchCode = (c.code || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchEmail = (c.email || c.correo || '').toLowerCase().includes(q);
        if (!matchName && !matchDoc && !matchCode && !matchPhone && !matchEmail) {
          return false;
        }
      }

      // Status Filter
      if (filterStatus === 'active' && !c.stats.isActive) return false;
      if (filterStatus === 'inactive' && c.stats.isActive) return false;

      // Type Filter
      if (filterType !== 'all') {
        const t = c.type || 'Natural';
        if (t !== filterType) return false;
      }

      // Purchases Filter
      if (filterPurchases === 'with_purchases' && c.stats.totalOrders === 0) return false;
      if (filterPurchases === 'no_purchases' && c.stats.totalOrders > 0) return false;

      // Credit Filter
      if (filterCredit === 'with_credit' && (c.credit_usd || 0) <= 0) return false;
      if (filterCredit === 'no_credit' && (c.credit_usd || 0) > 0) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'spent_desc') {
        return b.stats.totalSpent - a.stats.totalSpent;
      }
      if (sortBy === 'orders_desc') {
        return b.stats.totalOrders - a.stats.totalOrders;
      }
      if (sortBy === 'recent') {
        const dateA = a.stats.lastOrderDate ? new Date(a.stats.lastOrderDate).getTime() : 0;
        const dateB = b.stats.lastOrderDate ? new Date(b.stats.lastOrderDate).getTime() : 0;
        return dateB - dateA;
      }
      if (sortBy === 'code_asc') {
        return (a.code || '').localeCompare(b.code || '');
      }
      return 0;
    });
  }, [enhancedClients, searchTerm, filterStatus, filterType, filterPurchases, filterCredit, sortBy]);

  // Export to CSV Function
  const handleExportCSV = () => {
    if (filteredClients.length === 0) {
      alert("No hay clientes para exportar.");
      return;
    }

    const headers = [
      "ID/Codigo",
      "Documento/RIF",
      "Nombre/Razon Social",
      "Tipo",
      "Estado",
      "Telefono",
      "Correo",
      "Direccion",
      "Ordenes Totales",
      "Total Gastado (USD)",
      "Ticket Promedio (USD)",
      "Producto Mas Comprado",
      "Ultima Orden",
      "Credito Pendiente (USD)"
    ];

    const rows = filteredClients.map(c => [
      `"${c.code || ''}"`,
      `"${c.document || ''}"`,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.type || 'Natural'}"`,
      `"${c.stats.isActive ? 'Activo' : 'Inactivo'}"`,
      `"${c.phone || ''}"`,
      `"${c.email || c.correo || ''}"`,
      `"${(c.address || c.direccion || '').replace(/"/g, '""')}"`,
      c.stats.totalOrders,
      c.stats.totalSpent.toFixed(2),
      c.stats.averageTicket.toFixed(2),
      `"${(c.stats.topProduct || '').replace(/"/g, '""')}"`,
      `"${c.stats.lastOrderRelative}"`,
      (c.credit_usd || 0).toFixed(2)
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `directorio_clientes_bellavista_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report Function
  const handlePrintTable = () => {
    window.print();
  };

  // Reset Filters
  const handleResetFilters = () => {
    setFilterStatus('all');
    setFilterType('all');
    setFilterPurchases('all');
    setFilterCredit('all');
    setSortBy('name_asc');
    setSearchTerm('');
  };

  const activeFiltersCount = (filterStatus !== 'all' ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterPurchases !== 'all' ? 1 : 0) +
    (filterCredit !== 'all' ? 1 : 0) +
    (sortBy !== 'name_asc' ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. MÉTRICAS GENERALES (PARTE SUPERIOR) - 3 TARJETAS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tarjeta 1: Clientes Activos */}
        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-xs flex items-center justify-between relative overflow-hidden transition-all hover:shadow-md">
          <div className="space-y-1">
            <span className="text-[11px] font-montserrat font-extrabold uppercase text-emerald-700 tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Clientes activos:
            </span>
            <div className="text-3xl font-montserrat font-black text-[#1D3557]">
              {loading ? '...' : generalMetrics.active}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Con compras o interacción en los últimos 90 días
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <UserCheck className="w-7 h-7" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
        </div>

        {/* Tarjeta 2: Clientes Inactivos */}
        <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-xs flex items-center justify-between relative overflow-hidden transition-all hover:shadow-md">
          <div className="space-y-1">
            <span className="text-[11px] font-montserrat font-extrabold uppercase text-rose-600 tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Clientes inactivos:
            </span>
            <div className="text-3xl font-montserrat font-black text-[#1D3557]">
              {loading ? '...' : generalMetrics.inactive}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Sin actividad reciente o sin compras registradas
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 shrink-0">
            <UserX className="w-7 h-7" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-400 to-red-500"></div>
        </div>

        {/* Tarjeta 3: Clientes Totales */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-xs flex items-center justify-between relative overflow-hidden transition-all hover:shadow-md">
          <div className="space-y-1">
            <span className="text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#00BFFF]" />
              Clientes totales:
            </span>
            <div className="text-3xl font-montserrat font-black text-[#1D3557]">
              {loading ? '...' : generalMetrics.total}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Directorio general de clientes registrados
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#1D3557]/5 border border-[#1D3557]/15 flex items-center justify-center text-[#1D3557] shrink-0">
            <Users className="w-7 h-7 text-[#00BFFF]" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00BFFF] to-[#1D3557]"></div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. BARRA DE CONTROL, BÚSQUEDA Y BOTÓN DE FILTRAR PERSONALIZADO */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#00BFFF]">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, cédula/RIF, código, teléfono..."
              className="w-full pl-10 pr-9 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-semibold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#1D3557]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons & Filter Toggle */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Botón de Filtrar para búsqueda personalizada */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 text-xs font-montserrat font-extrabold rounded-xl transition flex items-center gap-2 cursor-pointer border ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-sm'
                  : 'bg-[#F8F9FA] hover:bg-gray-100 text-[#1D3557] border-gray-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#40E0D0]" />
              <span>Filtrar</span>
              {activeFiltersCount > 0 && (
                <span className="bg-[#40E0D0] text-[#1D3557] text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
              {showFilters ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            {/* Recargar / Sincronizar */}
            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              className="p-2.5 bg-[#F8F9FA] hover:bg-gray-100 text-[#1D3557] rounded-xl border border-gray-200 transition cursor-pointer disabled:opacity-50"
              title="Recargar directorio de clientes"
            >
              <RefreshCw className={`w-4 h-4 text-[#00BFFF] ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Icono de exportar / imprimir (esquina superior derecha de la tabla) */}
            <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
              <button
                type="button"
                onClick={handlePrintTable}
                className="px-3 py-2.5 bg-[#F8F9FA] hover:bg-[#1D3557] hover:text-white text-[#1D3557] text-xs font-montserrat font-extrabold rounded-xl border border-gray-200 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Imprimir reporte de clientes"
              >
                <Printer className="w-3.5 h-3.5 text-[#00BFFF]" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
              
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-2.5 bg-[#F8F9FA] hover:bg-emerald-600 hover:text-white text-[#1D3557] text-xs font-montserrat font-extrabold rounded-xl border border-gray-200 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Exportar listado a Excel / CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Exportar CSV</span>
              </button>
            </div>

            {/* Nuevo Cliente */}
            <button
              type="button"
              onClick={onOpenNewClient}
              className="px-4 py-2.5 bg-[#40E0D0] hover:bg-[#36cebe] text-[#1D3557] text-xs font-montserrat font-extrabold uppercase tracking-wider rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer active:scale-95 border-b-2 border-[#1D3557]/20"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Nuevo cliente</span>
            </button>
          </div>
        </div>

        {/* Panel de Filtros Personalizados Desplegable */}
        {showFilters && (
          <div className="pt-4 border-t border-gray-150 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-[#F8F9FA]/80 p-3.5 rounded-xl text-xs font-medium animate-fadeIn">
            {/* Filtro Estado */}
            <div>
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-1">
                Estado:
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-[#2B2D42] focus:ring-1 focus:ring-[#00BFFF]"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos (con compras)</option>
                <option value="inactive">Inactivos (sin actividad)</option>
              </select>
            </div>

            {/* Filtro Tipo */}
            <div>
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-1">
                Tipo de Persona:
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-[#2B2D42] focus:ring-1 focus:ring-[#00BFFF]"
              >
                <option value="all">Todos los tipos</option>
                <option value="Natural">Natural (V / E)</option>
                <option value="Jurídico">Jurídico (J / G)</option>
              </select>
            </div>

            {/* Filtro Compras */}
            <div>
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-1">
                Historial Compras:
              </label>
              <select
                value={filterPurchases}
                onChange={(e) => setFilterPurchases(e.target.value as any)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-[#2B2D42] focus:ring-1 focus:ring-[#00BFFF]"
              >
                <option value="all">Todos</option>
                <option value="with_purchases">Con compras registradas</option>
                <option value="no_purchases">Sin compras registradas</option>
              </select>
            </div>

            {/* Filtro Saldo / Crédito */}
            <div>
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-1">
                Crédito / Deuda:
              </label>
              <select
                value={filterCredit}
                onChange={(e) => setFilterCredit(e.target.value as any)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-[#2B2D42] focus:ring-1 focus:ring-[#00BFFF]"
              >
                <option value="all">Todos</option>
                <option value="with_credit">Con saldo pendiente</option>
                <option value="no_credit">Al día (sin deuda)</option>
              </select>
            </div>

            {/* Ordenamiento */}
            <div>
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-1">
                Ordenar por:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-[#2B2D42] focus:ring-1 focus:ring-[#00BFFF]"
              >
                <option value="name_asc">Nombre (A - Z)</option>
                <option value="spent_desc">Mayor total gastado ($)</option>
                <option value="orders_desc">Mayor cantidad de órdenes</option>
                <option value="recent">Última orden más reciente</option>
                <option value="code_asc">Código ascendente</option>
              </select>
            </div>

            {/* Botón limpiar */}
            {activeFiltersCount > 0 && (
              <div className="col-span-full flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-montserrat font-extrabold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpiar todos los filtros</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TABLA PRINCIPAL DE CLIENTES CON CLIC PARA VER HISTORIAL */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden print:border-none print:shadow-none">
        {/* Print Header Visible only on Print */}
        <div className="hidden print:block p-6 border-b border-gray-300">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900 uppercase">COPIAS BELLA VISTA C.A.</h1>
              <p className="text-xs text-gray-600">Reporte del Directorio de Clientes y Estado de Cuentas</p>
            </div>
            <div className="text-right text-xs text-gray-600">
              <p>Fecha de emisión: {new Date().toLocaleDateString('es-VE')}</p>
              <p>Total registros: {filteredClients.length}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#1D3557] text-white font-montserrat font-extrabold uppercase text-[11px] tracking-wider">
                <th className="p-4">Estado / ID</th>
                <th className="p-4">Documento</th>
                <th className="p-4">Nombre / Razón Social</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Teléfono</th>
                <th className="p-4">Correo</th>
                <th className="p-4 text-center">Órdenes</th>
                <th className="p-4">Total Gastado</th>
                <th className="p-4">Última Orden</th>
                <th className="p-4 text-center print:hidden">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#2B2D42] font-semibold">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-400 font-semibold">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#00BFFF]" />
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-400 font-semibold">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No se encontraron clientes con los criterios especificados
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const isActive = client.stats.isActive;
                  return (
                    <tr 
                      key={client.id} 
                      onClick={() => setSelectedClientForDetails(client)}
                      className="hover:bg-blue-50/50 transition cursor-pointer group"
                      title="Haga clic para ver el historial detallado de compras y estadísticas de este cliente"
                    >
                      {/* Estado visual & ID numérico */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span 
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isActive ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-rose-500 shadow-xs shadow-rose-500/50'
                            }`}
                            title={isActive ? 'Cliente Activo' : 'Cliente Inactivo'}
                          />
                          <span className="bg-[#1D3557]/10 text-[#1D3557] text-[10px] font-montserrat font-black uppercase px-2 py-0.5 rounded-lg border border-[#1D3557]/20 font-mono">
                            {client.code || `#${String(client.id || '').substring(0, 6)}`}
                          </span>
                        </div>
                      </td>

                      {/* Documento */}
                      <td className="p-4 font-mono font-bold text-[#2B2D42]">
                        {client.document || client.doc_number || <span className="text-gray-400 text-[10px]">S/D</span>}
                      </td>

                      {/* Nombre */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-montserrat font-extrabold shrink-0 uppercase border ${
                            isActive 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {(client.name || 'C').substring(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <span className="font-extrabold text-[#1D3557] group-hover:text-[#00BFFF] transition flex items-center gap-1.5">
                              {client.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-normal block sm:hidden">
                              {client.phone || client.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-montserrat font-extrabold uppercase ${
                          client.type === 'Jurídico' 
                            ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                            : 'bg-[#40E0D0]/20 text-[#1D3557] border border-[#40E0D0]/40'
                        }`}>
                          {client.type || 'Natural'}
                        </span>
                      </td>

                      {/* Teléfono */}
                      <td className="p-4 font-mono text-[#2B2D42]/80">
                        {client.phone || <span className="text-gray-350 italic text-[11px]">Sin teléfono</span>}
                      </td>

                      {/* Correo */}
                      <td className="p-4 font-mono text-[#2B2D42]/80 max-w-[140px] truncate" title={client.email || client.correo}>
                        {client.email || client.correo || <span className="text-gray-350 italic text-[11px]">Sin correo</span>}
                      </td>

                      {/* Órdenes Totales */}
                      <td className="p-4 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg font-mono font-bold text-[11px] border border-blue-100">
                          {client.stats.totalOrders}
                        </span>
                      </td>

                      {/* Total Gastado */}
                      <td className="p-4 font-black text-[#1D3557]">
                        ${client.stats.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Última Orden */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{client.stats.lastOrderRelative}</span>
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="p-4 print:hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedClientForDetails(client)}
                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                            title="Ver Historial de Compras"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenEditClient(client)}
                            className="p-1.5 bg-[#00BFFF]/10 text-[#00BFFF] hover:bg-[#00BFFF]/20 rounded-lg transition cursor-pointer"
                            title="Editar Cliente"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClientAction(client)}
                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition cursor-pointer"
                            title="Eliminar Cliente permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Footer info */}
        <div className="p-4 bg-gray-50/80 border-t border-gray-150 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 font-medium gap-2">
          <span>Mostrando <b>{filteredClients.length}</b> de <b>{enhancedClients.length}</b> clientes en total</span>
          <span className="text-[11px] text-gray-400 italic">💡 Haga clic en cualquier fila para abrir el panel de historial y métricas del cliente</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. PANTALLA / MODAL DETALLADO: TABLA DE DATOS DE CLIENTES */}
      {/* ------------------------------------------------------------- */}
      {selectedClientForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn select-none font-poppins">
          <div className="bg-white rounded-3xl border border-gray-200 w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-left">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-[#1D3557] text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#40E0D0]/20 border border-[#40E0D0]/40 flex items-center justify-center text-[#40E0D0]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-montserrat font-extrabold uppercase tracking-wide flex items-center gap-2 text-white">
                    <span>Tabla de datos de clientes</span>
                  </h3>
                  <p className="text-[11px] text-[#40E0D0] font-medium">
                    Muestra un listado detallado con el historial de compra de los usuarios
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClientForDetails(null)}
                className="p-2 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-[#F8F9FA]">
              {/* Resumen Superior del Cliente: Métricas requeridas por el usuario */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 pb-4">
                  {/* Cliente: Estado visual (Activo verde, Inactivo rojo) + ID numérico */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-montserrat font-black uppercase border ${
                        selectedClientForDetails.stats.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {(selectedClientForDetails.name || 'C').substring(0, 2).toUpperCase()}
                      </div>
                      <span 
                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                          selectedClientForDetails.stats.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        title={selectedClientForDetails.stats.isActive ? 'Activo' : 'Inactivo'}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        {/* Estado Visual */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-montserrat font-extrabold uppercase flex items-center gap-1 border ${
                          selectedClientForDetails.stats.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${selectedClientForDetails.stats.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {selectedClientForDetails.stats.isActive ? 'Activo' : 'Inactivo'}
                        </span>

                        {/* ID Numérico */}
                        <span className="bg-[#1D3557]/10 text-[#1D3557] text-[11px] font-mono font-black uppercase px-2.5 py-0.5 rounded-full border border-[#1D3557]/20">
                          ID: {selectedClientForDetails.code || `#${String(selectedClientForDetails.id || '').substring(0, 6)}`}
                        </span>
                      </div>

                      {/* Nombre: Nombre del cliente o empresa */}
                      <h4 className="text-base sm:text-lg font-montserrat font-extrabold text-[#1D3557] mt-1">
                        {selectedClientForDetails.name}
                      </h4>
                    </div>
                  </div>

                  {/* Acciones de cliente */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedClientForDetails;
                        setSelectedClientForDetails(null);
                        onOpenEditClient(target);
                      }}
                      className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-[#1D3557] text-xs font-montserrat font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#00BFFF]" />
                      <span>Editar Perfil</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClientAction(selectedClientForDetails)}
                      className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-montserrat font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-red-200"
                      title="Eliminar este cliente permanentemente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>

                {/* Contact Data row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-medium text-[#2B2D42]">
                  <div className="flex items-center gap-2 bg-[#F8F9FA] p-2.5 rounded-xl border border-gray-150">
                    <Building2 className="w-4 h-4 text-[#00BFFF] shrink-0" />
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Documento / RIF</span>
                      <span className="font-mono font-bold">{selectedClientForDetails.document || selectedClientForDetails.doc_number || 'S/D'} ({selectedClientForDetails.type || 'Natural'})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-[#F8F9FA] p-2.5 rounded-xl border border-gray-150">
                    <Phone className="w-4 h-4 text-[#40E0D0] shrink-0" />
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Teléfono</span>
                      <span className="font-mono font-bold">{selectedClientForDetails.phone || 'Sin teléfono'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-[#F8F9FA] p-2.5 rounded-xl border border-gray-150">
                    <Mail className="w-4 h-4 text-purple-500 shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Correo Electrónico</span>
                      <span className="font-mono font-bold truncate block">{selectedClientForDetails.email || selectedClientForDetails.correo || 'Sin correo'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* TARJETAS DE INDICADORES CLAVE DEL CLIENTE (MÉTRICAS ESPECIFICADAS) */}
              {/* ------------------------------------------------------------- */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {/* 1. Producto más comprado */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1 col-span-2 sm:col-span-1 md:col-span-2">
                  <div className="flex items-center gap-1.5 text-amber-600 text-[10px] font-montserrat font-extrabold uppercase">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Producto más comprado</span>
                  </div>
                  <div className="text-xs sm:text-sm font-montserrat font-extrabold text-[#1D3557] truncate" title={selectedClientForDetails.stats.topProduct}>
                    {selectedClientForDetails.stats.topProduct}
                  </div>
                  <p className="text-[10px] text-gray-400">Artículo preferido por el cliente</p>
                </div>

                {/* 2. Última orden */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-indigo-600 text-[10px] font-montserrat font-extrabold uppercase">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Última orden</span>
                  </div>
                  <div className="text-xs sm:text-sm font-montserrat font-extrabold text-[#1D3557]">
                    {selectedClientForDetails.stats.lastOrderRelative}
                  </div>
                  <p className="text-[10px] text-gray-400">Antigüedad de última transacción</p>
                </div>

                {/* 3. Órdenes Totales */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-600 text-[10px] font-montserrat font-extrabold uppercase">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Órdenes Totales</span>
                  </div>
                  <div className="text-base sm:text-lg font-montserrat font-black text-[#1D3557]">
                    {selectedClientForDetails.stats.totalOrders}
                  </div>
                  <p className="text-[10px] text-gray-400">Pedidos registrados</p>
                </div>

                {/* 4. Total gastado */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-montserrat font-extrabold uppercase">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Total gastado</span>
                  </div>
                  <div className="text-base sm:text-lg font-montserrat font-black text-emerald-700">
                    ${selectedClientForDetails.stats.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-gray-400">Consumo a la fecha</p>
                </div>

                {/* 5. Ticket promedio */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1.5 text-[#00BFFF] text-[10px] font-montserrat font-extrabold uppercase">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Ticket promedio</span>
                  </div>
                  <div className="text-base sm:text-lg font-montserrat font-black text-[#1D3557]">
                    ${selectedClientForDetails.stats.averageTicket.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-gray-400">Promedio por compra</p>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* TABLA DE DETALLE CON EL HISTORIAL DE COMPRAS */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 bg-[#1D3557] text-white flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#40E0D0]" />
                    <span className="font-montserrat font-extrabold uppercase text-xs tracking-wider text-white">
                      Historial detallado de transacciones y compras ({selectedClientForDetails.stats.purchases.length})
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-[#1D3557] font-montserrat font-extrabold uppercase text-[10px] tracking-wider border-b border-gray-200">
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Comprobante / Tipo</th>
                        <th className="p-3">Artículos Comprados</th>
                        <th className="p-3">Método Pago</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3 text-right">Total ($ USD)</th>
                        <th className="p-3 text-center">Ver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-semibold text-[#2B2D42]">
                      {selectedClientForDetails.stats.purchases.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">
                            <ShoppingBag className="w-7 h-7 mx-auto mb-1 text-gray-300" />
                            Este cliente aún no tiene pedidos o facturas registradas en el sistema.
                          </td>
                        </tr>
                      ) : (
                        selectedClientForDetails.stats.purchases.map((purchase: any) => (
                          <tr key={purchase.key} className="hover:bg-blue-50/40 transition">
                            <td className="p-3 font-mono text-[11px]">
                              {new Date(purchase.date).toLocaleDateString('es-VE')} {new Date(purchase.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-3">
                              <span className="font-mono font-bold text-[#1D3557] block">
                                {purchase.number}
                              </span>
                              <span className="text-[10px] text-gray-400 font-normal">
                                {purchase.type}
                              </span>
                            </td>
                            <td className="p-3 max-w-[280px]">
                              <div className="space-y-1">
                                {purchase.items && purchase.items.length > 0 ? (
                                  purchase.items.map((it: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-[11px] gap-2">
                                      <span className="truncate text-[#1D3557]">
                                        <b className="text-[#00BFFF]">{it.quantity}x</b> {it.name}
                                      </span>
                                      <span className="font-mono text-gray-500 shrink-0">
                                        ${(it.total || 0).toFixed(2)}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-gray-400 italic text-[11px]">Detalle en proceso</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-mono text-[10px]">
                                {purchase.payment_method}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-montserrat font-extrabold uppercase ${
                                purchase.status === 'Completado' || purchase.status === 'Pagada' || purchase.status === 'Entregado'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {purchase.status}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-black text-[#1D3557] text-xs">
                              ${purchase.total_usd.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedPurchaseForPreview(purchase)}
                                className="p-1 bg-gray-100 hover:bg-[#1D3557] hover:text-white rounded-lg transition text-gray-600 cursor-pointer"
                                title="Ver detalles de la compra"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center shrink-0">
              <span className="text-[11px] text-gray-400 font-medium">
                Cliente ID: {selectedClientForDetails.code || selectedClientForDetails.id}
              </span>
              <button
                type="button"
                onClick={() => setSelectedClientForDetails(null)}
                className="px-5 py-2 bg-[#1D3557] hover:bg-[#15263f] text-white text-xs font-montserrat font-extrabold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. SUB-MODAL DE VISTA PREVIA DE COMPRA INDIVIDUAL */}
      {/* ------------------------------------------------------------- */}
      {selectedPurchaseForPreview && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl overflow-hidden text-left flex flex-col">
            <div className="p-4 bg-[#1D3557] text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#40E0D0]" />
                <span className="text-xs font-montserrat font-extrabold uppercase text-white">
                  Detalle de Comprobante: {selectedPurchaseForPreview.number}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseForPreview(null)}
                className="p-1 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-medium">
              <div className="bg-[#F8F9FA] p-3 rounded-xl border border-gray-150 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha:</span>
                  <span className="font-bold text-[#1D3557]">{new Date(selectedPurchaseForPreview.date).toLocaleString('es-VE')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tipo:</span>
                  <span className="font-bold text-[#1D3557]">{selectedPurchaseForPreview.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Método de Pago:</span>
                  <span className="font-bold text-[#1D3557]">{selectedPurchaseForPreview.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estado:</span>
                  <span className="font-bold text-emerald-600">{selectedPurchaseForPreview.status}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block mb-2">
                  Artículos incluidos:
                </span>
                <div className="divide-y divide-gray-100 border border-gray-150 rounded-xl overflow-hidden">
                  {selectedPurchaseForPreview.items && selectedPurchaseForPreview.items.map((it: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-white flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-[#1D3557]">{it.name}</span>
                        <span className="text-[10px] text-gray-400 block font-mono">
                          {it.quantity} x ${it.price.toFixed(2)}
                        </span>
                      </div>
                      <span className="font-mono font-black text-[#1D3557]">
                        ${it.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="text-sm font-montserrat font-black text-[#1D3557] uppercase">Total Comprobante:</span>
                <span className="text-lg font-mono font-black text-emerald-700">
                  ${selectedPurchaseForPreview.total_usd.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-150 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPurchaseForPreview(null)}
                className="px-4 py-1.5 bg-[#1D3557] hover:bg-[#15263f] text-white text-xs font-montserrat font-extrabold uppercase rounded-lg transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
