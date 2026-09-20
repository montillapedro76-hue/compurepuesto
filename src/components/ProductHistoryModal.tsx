/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, X, Search, Filter, Calendar, Download, Printer, 
  ArrowUpRight, ArrowDownLeft, RefreshCw, Package, ArrowLeftRight, 
  DollarSign, ShoppingCart, ShoppingBag, Truck, FileText, CheckCircle2, 
  AlertTriangle, User, Plus, FileSpreadsheet, Eye, ChevronRight, Hash,
  Tag, MapPin, Barcode, TrendingUp, TrendingDown, Clock, Layers, Sliders
} from 'lucide-react';
import { Product, Invoice, Purchase, Order, ProductMovementLog } from '../types';
import { dbService, supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ProductHistoryModalProps {
  product: Product | null;
  onClose: () => void;
  onStockUpdated?: (newStock: number) => void;
  currencySymbol?: string;
  bcvRate?: number;
}

export interface UnifiedMovementItem {
  id: string;
  date: string;
  type: 'venta_factura' | 'nota_entrega' | 'compra_proveedor' | 'pedido_tienda' | 'ajuste_ingreso' | 'ajuste_egreso' | 'ajuste_conteo';
  typeLabel: string;
  typeCategory: 'salida' | 'entrada' | 'ajuste';
  referenceId?: string;
  referenceLabel?: string;
  clientOrProvider?: string;
  operatorName?: string;
  quantityChange: number; // positive or negative
  unitPrice?: number;
  totalAmount?: number;
  previousStock?: number;
  resultingStock?: number;
  notes?: string;
  rawItem?: any;
}

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({
  product,
  onClose,
  onStockUpdated,
  currencySymbol = '$',
  bcvRate = 1
}) => {
  if (!product) return null;

  const [loading, setLoading] = useState<boolean>(true);
  const [movements, setMovements] = useState<UnifiedMovementItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'ventas' | 'notas' | 'compras' | 'pedidos' | 'ajustes'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  // Quick manual adjustment form within the modal
  const [showAdjustmentForm, setShowAdjustmentForm] = useState<boolean>(false);
  const [adjustType, setAdjustType] = useState<'ingreso' | 'egreso' | 'ajuste'>('ingreso');
  const [adjustQty, setAdjustQty] = useState<number | string>(1);
  const [adjustConcept, setAdjustConcept] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState<boolean>(false);
  const [currentLiveStock, setCurrentLiveStock] = useState<number>(product.stock);

  useEffect(() => {
    setCurrentLiveStock(product.stock);
  }, [product]);

  // Load all operational history matching this product
  const loadProductHistory = async () => {
    setLoading(true);
    try {
      const [
        allInvoices,
        allDrafts,
        allPurchases,
        allOrders,
        allManualLogs
      ] = await Promise.all([
        dbService.getInvoices().catch(() => [] as Invoice[]),
        dbService.getDraftInvoices().catch(() => [] as any[]),
        dbService.getPurchases().catch(() => [] as Purchase[]),
        dbService.getOrders().catch(() => [] as Order[]),
        dbService.getProductMovements(product.id).catch(() => [] as ProductMovementLog[])
      ]);

      const compiled: UnifiedMovementItem[] = [];

      const matchesProduct = (item: any) => {
        if (!item) return false;
        const itemId = String(item.id || item.product_id || '').toLowerCase();
        const itemSku = String(item.sku || '').toLowerCase();
        const itemName = String(item.name || item.product_name || item.description || '').toLowerCase();
        
        const targetId = String(product.id || '').toLowerCase();
        const targetSku = String(product.sku || '').toLowerCase();
        const targetName = String(product.name || '').toLowerCase();

        return (
          (targetId && itemId === targetId) ||
          (targetSku && itemSku === targetSku) ||
          (targetName && itemName === targetName) ||
          (targetName && targetName.length > 4 && itemName.includes(targetName))
        );
      };

      // 1. Invoices / Facturas (Ventas)
      (allInvoices || []).forEach((inv) => {
        if (inv.status === 'anulada') return;
        const items = Array.isArray(inv.items) ? inv.items : [];
        items.forEach((it: any, idx: number) => {
          if (matchesProduct(it)) {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.price || it.unit_price || 0);
            const isDeliveryNote = inv.document_type === 'nota_entrega';

            compiled.push({
              id: `inv-${inv.id || inv.invoice_number || '0'}-${idx}`,
              date: inv.created_at || new Date().toISOString(),
              type: isDeliveryNote ? 'nota_entrega' : 'venta_factura',
              typeLabel: isDeliveryNote ? 'Nota de Entrega' : 'Venta / Factura',
              typeCategory: 'salida',
              referenceId: inv.invoice_number || inv.control_number || inv.id,
              referenceLabel: isDeliveryNote ? `Nota #${inv.invoice_number || inv.control_number || 'N/A'}` : `Factura #${inv.invoice_number || inv.control_number || 'N/A'}`,
              clientOrProvider: inv.customer_name || 'Consumidor Final',
              operatorName: inv.created_by || 'Caja POS',
              quantityChange: -Math.abs(qty),
              unitPrice: price,
              totalAmount: qty * price,
              notes: inv.notes || (isDeliveryNote ? 'Despacho con Nota de Entrega' : 'Venta POS / Facturación Comercial'),
              rawItem: inv
            });
          }
        });
      });

      // 2. Draft Delivery Notes
      (allDrafts || []).forEach((draft, idx) => {
        const items = Array.isArray(draft.items) ? draft.items : [];
        items.forEach((it: any, itIdx: number) => {
          if (matchesProduct(it)) {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.price || it.unit_price || 0);
            compiled.push({
              id: `draft-${draft.id || idx}-${itIdx}`,
              date: draft.created_at || new Date().toISOString(),
              type: 'nota_entrega',
              typeLabel: 'Nota de Entrega (Borrador)',
              typeCategory: 'salida',
              referenceId: draft.control_number || draft.id,
              referenceLabel: `Nota #${draft.control_number || draft.invoice_number || 'Borrador'}`,
              clientOrProvider: draft.customer_name || 'Cliente',
              operatorName: draft.created_by || 'Despacho',
              quantityChange: -Math.abs(qty),
              unitPrice: price,
              totalAmount: qty * price,
              notes: draft.notes || 'Comprobante de entrega registrado',
              rawItem: draft
            });
          }
        });
      });

      // 3. Purchases / Compras (Entradas de mercancía de proveedores)
      (allPurchases || []).forEach((pur) => {
        const items = Array.isArray(pur.items) ? pur.items : [];
        items.forEach((it: any, idx: number) => {
          if (matchesProduct(it)) {
            const qty = Number(it.quantity || it.qty || 1);
            const cost = Number(it.cost_price || it.unit_cost || it.price || 0);
            compiled.push({
              id: `pur-${pur.id || pur.invoice_number || '0'}-${idx}`,
              date: pur.date || pur.created_at || new Date().toISOString(),
              type: 'compra_proveedor',
              typeLabel: 'Compra a Proveedor',
              typeCategory: 'entrada',
              referenceId: pur.invoice_number || pur.id,
              referenceLabel: `Doc Compra #${pur.invoice_number || 'S/N'}`,
              clientOrProvider: pur.provider_name || 'Proveedor Registrado',
              operatorName: pur.created_by || 'Administración',
              quantityChange: Math.abs(qty),
              unitPrice: cost,
              totalAmount: qty * cost,
              notes: pur.notes || `Ingreso de mercancía por compra - Proveedor: ${pur.provider_name || 'General'}`,
              rawItem: pur
            });
          }
        });
      });

      // 4. Orders / Pedidos Online o Tienda
      (allOrders || []).forEach((ord) => {
        if (ord.status === 'cancelled') return;
        const items = Array.isArray(ord.items) ? ord.items : [];
        items.forEach((it: any, idx: number) => {
          if (matchesProduct(it)) {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.price || 0);
            const orderRefId = (ord.id || 'PED').slice(0, 8);
            compiled.push({
              id: `ord-${ord.id || idx}-${idx}`,
              date: ord.created_at || new Date().toISOString(),
              type: 'pedido_tienda',
              typeLabel: 'Pedido Online / Tienda',
              typeCategory: 'salida',
              referenceId: orderRefId,
              referenceLabel: `Pedido #${orderRefId}`,
              clientOrProvider: (ord as any).client_name || ord.customer_name || 'Cliente Web',
              operatorName: 'Catálogo Virtual',
              quantityChange: -Math.abs(qty),
              unitPrice: price,
              totalAmount: qty * price,
              notes: `Estado del pedido: ${ord.status || 'Completado'}`,
              rawItem: ord
            });
          }
        });
      });

      // 5. Manual Adjustments & Audit Logs
      (allManualLogs || []).forEach((log) => {
        const isEntry = log.type === 'ingreso' || log.quantity > 0;
        const isExit = log.type === 'egreso' || log.quantity < 0;
        const isCount = log.type === 'ajuste';

        compiled.push({
          id: `log-${log.id}`,
          date: log.created_at || new Date().toISOString(),
          type: isEntry ? 'ajuste_ingreso' : isExit ? 'ajuste_egreso' : 'ajuste_conteo',
          typeLabel: isEntry ? 'Ajuste: Entrada (+)' : isExit ? 'Ajuste: Salida (-)' : 'Ajuste: Conteo Físico',
          typeCategory: 'ajuste',
          referenceId: log.reference_id || log.id.slice(0, 8),
          referenceLabel: log.reference_id ? `Ref #${log.reference_id}` : 'Ajuste Manual',
          clientOrProvider: 'Inventario Interno',
          operatorName: log.user_name || 'Administrador',
          quantityChange: log.quantity,
          previousStock: log.previous_stock,
          resultingStock: log.new_stock,
          unitPrice: log.unit_price || (product.offer_price || product.price),
          totalAmount: log.total_amount || Math.abs(log.quantity) * (product.offer_price || product.price),
          notes: log.concept || 'Ajuste de inventario físico',
          rawItem: log
        });
      });

      // Sort descending by date
      compiled.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Deduplicate items that might share identical invoice & order refs
      const uniqueKeys = new Set<string>();
      const deduped = compiled.filter(item => {
        const key = `${item.type}-${item.referenceId}-${item.date.slice(0, 16)}-${item.quantityChange}`;
        if (uniqueKeys.has(key)) return false;
        uniqueKeys.add(key);
        return true;
      });

      setMovements(deduped);
    } catch (err) {
      console.error("Error loading product history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProductHistory();
  }, [product.id, product.sku]);

  // Handle Quick Manual Adjustment Registration
  const handleRegisterAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(adjustQty) || 0;
    if (qtyNum <= 0 && adjustType !== 'ajuste') {
      alert('Por favor ingrese una cantidad mayor a cero.');
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      const prevStock = currentLiveStock;
      let newStock = prevStock;
      let qtyDelta = 0;

      if (adjustType === 'ingreso') {
        newStock = prevStock + qtyNum;
        qtyDelta = qtyNum;
      } else if (adjustType === 'egreso') {
        newStock = Math.max(0, prevStock - qtyNum);
        qtyDelta = -Math.min(prevStock, qtyNum);
      } else if (adjustType === 'ajuste') {
        newStock = Math.max(0, qtyNum);
        qtyDelta = newStock - prevStock;
      }

      // Update product stock in database
      await supabase.from('products').update({ stock: newStock }).eq('id', product.id);

      // Record movement audit log
      const logRecord: ProductMovementLog = {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        type: adjustType,
        quantity: qtyDelta,
        previous_stock: prevStock,
        new_stock: newStock,
        concept: adjustConcept.trim() || `Ajuste manual (${adjustType.toUpperCase()})`,
        unit_price: product.offer_price || product.price,
        total_amount: Math.abs(qtyDelta) * (product.offer_price || product.price),
        user_name: 'Administración',
        created_at: new Date().toISOString()
      };

      await dbService.recordProductMovement(logRecord);

      setCurrentLiveStock(newStock);
      if (onStockUpdated) {
        onStockUpdated(newStock);
      }

      setShowAdjustmentForm(false);
      setAdjustQty(1);
      setAdjustConcept('');
      
      // Reload history list
      await loadProductHistory();
    } catch (err: any) {
      alert(`Error al registrar el ajuste: ${err.message || err}`);
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Filtered movements based on search query, type, and date
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // Type filter
      if (filterType === 'ventas' && m.type !== 'venta_factura') return false;
      if (filterType === 'notas' && m.type !== 'nota_entrega') return false;
      if (filterType === 'compras' && m.type !== 'compra_proveedor') return false;
      if (filterType === 'pedidos' && m.type !== 'pedido_tienda') return false;
      if (filterType === 'ajustes' && !m.type.startsWith('ajuste')) return false;

      // Date filter
      if (dateFilter !== 'all') {
        const itemDate = new Date(m.date);
        const now = new Date();
        if (dateFilter === 'today') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (itemDate < startOfToday) return false;
        } else if (dateFilter === '7d') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (itemDate < sevenDaysAgo) return false;
        } else if (dateFilter === '30d') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (itemDate < thirtyDaysAgo) return false;
        } else if (dateFilter === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (itemDate < startOfMonth) return false;
        } else if (dateFilter === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate + 'T00:00:00');
            if (itemDate < start) return false;
          }
          if (customEndDate) {
            const end = new Date(customEndDate + 'T23:59:59.999');
            if (itemDate > end) return false;
          }
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRef = (m.referenceLabel || '').toLowerCase().includes(q);
        const matchClient = (m.clientOrProvider || '').toLowerCase().includes(q);
        const matchNotes = (m.notes || '').toLowerCase().includes(q);
        const matchOperator = (m.operatorName || '').toLowerCase().includes(q);
        const matchType = (m.typeLabel || '').toLowerCase().includes(q);
        if (!matchRef && !matchClient && !matchNotes && !matchOperator && !matchType) {
          return false;
        }
      }

      return true;
    });
  }, [movements, filterType, dateFilter, customStartDate, customEndDate, searchQuery]);

  // Aggregate Metrics for Product
  const metrics = useMemo(() => {
    let totalSoldUnits = 0;
    let totalSoldAmount = 0;
    let totalPurchasedUnits = 0;
    let totalPurchasedAmount = 0;
    let totalAdjustments = 0;

    movements.forEach(m => {
      if (m.type === 'venta_factura' || m.type === 'nota_entrega' || m.type === 'pedido_tienda') {
        totalSoldUnits += Math.abs(m.quantityChange);
        totalSoldAmount += m.totalAmount || 0;
      } else if (m.type === 'compra_proveedor') {
        totalPurchasedUnits += Math.abs(m.quantityChange);
        totalPurchasedAmount += m.totalAmount || 0;
      } else if (m.type.startsWith('ajuste')) {
        totalAdjustments += 1;
      }
    });

    return {
      totalSoldUnits,
      totalSoldAmount,
      totalPurchasedUnits,
      totalPurchasedAmount,
      totalAdjustments,
      totalOperations: movements.length
    };
  }, [movements]);

  // Export to Excel with ExcelJS & Corporate Visual Styles
  const handleExportExcel = async () => {
    if (movements.length === 0) {
      alert('No hay movimientos registrados para exportar.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Inversiones y Copias Bella Vista';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Kardex y Movimientos', { views: [{ showGridLines: true }] });

      // Corporate Visual Styles
      const NAVY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2631' } };
      const HEADER_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

      const SECTION_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAECEE' } };
      const SECTION_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };

      const ZEBRA_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F4' } };

      const TOTAL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF16A085' } };
      const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FF1B2631' } },
        bottom: { style: 'double', color: { argb: 'FF1B2631' } }
      };

      const DATA_BORDER: Partial<ExcelJS.Borders> = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };

      const timestamp = new Date().toLocaleString('es-VE');

      // Header Block
      const r1 = sheet.addRow(['INVERSIONES Y COPIAS BELLA VISTA, C.A.', '', '', '', '', '', '', 'KARDEX E HISTORIAL DE MOVIMIENTOS']);
      r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
      r1.getCell(8).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
      r1.getCell(8).alignment = { horizontal: 'right' };

      const r2 = sheet.addRow([`PRODUCTO: ${product.name.toUpperCase()}`, '', '', '', '', '', '', `Fecha de Generación: ${timestamp}`]);
      r2.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF2C3E50' } };
      r2.getCell(8).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
      r2.getCell(8).alignment = { horizontal: 'right' };

      const r3 = sheet.addRow([`SKU: ${product.sku || 'S/N'}  |  Código/QR: ${product.barcode_qr || 'N/A'}  |  Categoría: ${product.category || 'General'}  |  Tasa BCV: Bs. ${bcvRate.toFixed(2)}`]);
      r3.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };

      sheet.addRow([]); // Blank line

      // 1. PRODUCT KPI METRICS TABLE (IMAGEN 2)
      const kpiSecRow = sheet.addRow(['RESUMEN DE INDICADORES DEL PRODUCTO (KARDEX KPI)']);
      kpiSecRow.height = 24;
      kpiSecRow.getCell(1).fill = SECTION_FILL;
      kpiSecRow.getCell(1).font = SECTION_FONT;

      const kpiHeaders = ['Métrica / Indicador', 'Stock / Unidades', 'Monto Monetario ($)', 'Equivalente VES (Bs.)', 'Detalle / Estado'];
      const kpiHeaderRow = sheet.addRow(kpiHeaders);
      kpiHeaderRow.height = 22;
      kpiHeaderRow.eachCell((cell, colNum) => {
        cell.fill = NAVY_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' };
      });

      const stockStatus = currentLiveStock === 0 ? 'Agotado' : currentLiveStock <= 5 ? 'Stock Crítico' : 'Disponible';
      const salePrice = product.offer_price || product.price || 0;
      const costPrice = product.cost_price || 0;
      const marginPercent = costPrice > 0 ? (((salePrice - costPrice) / costPrice) * 100).toFixed(1) : '0.0';

      const kpiRows = [
        ['STOCK ACTUAL', `${currentLiveStock} ${product.unit || 'UNIDAD'}`, '-', '-', stockStatus],
        ['TOTAL VENDIDO', `${metrics.totalSoldUnits} ${product.unit || 'UNIDAD'}`, `$${metrics.totalSoldAmount.toFixed(2)}`, `Bs. ${(metrics.totalSoldAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. generados por ventas'],
        ['TOTAL COMPRADO', `${metrics.totalPurchasedUnits} ${product.unit || 'UNIDAD'}`, `$${metrics.totalPurchasedAmount.toFixed(2)}`, `Bs. ${(metrics.totalPurchasedAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. invertidos en compras'],
        ['PRECIO & MARGEN', `P. Venta: $${salePrice.toFixed(2)}`, `P. Costo: $${costPrice.toFixed(2)}`, '-', `Margen: +${marginPercent}%`],
        ['OPERACIONES', `${metrics.totalOperations} registros`, `${metrics.totalAdjustments} ajustes manuales`, '-', 'Total operaciones en historial']
      ];

      kpiRows.forEach((rowVals, idx) => {
        const row = sheet.addRow(rowVals);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (isZebra) cell.fill = ZEBRA_FILL;
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2C3E50' } };
          cell.border = DATA_BORDER;
          cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : colNum === 2 || colNum === 3 ? 'center' : 'center' };
        });
      });

      sheet.addRow([]); // Blank line

      // 2. DETAILED MOVEMENTS TABLE (IMAGEN 1)
      const movSecRow = sheet.addRow([`HISTORIAL DE MOVIMIENTOS Y KARDEX (${filteredMovements.length} REGISTROS)`]);
      movSecRow.height = 24;
      movSecRow.getCell(1).fill = SECTION_FILL;
      movSecRow.getCell(1).font = SECTION_FONT;

      const movHeaders = [
        'FECHA Y HORA',
        'TIPO DE OPERACIÓN',
        'COMPROBANTE / REF',
        'CLIENTE / PROVEEDOR',
        'MOVIMIENTO',
        'PRECIO/COSTO',
        'MONTO TOTAL',
        'DETALLE / CONCEPTO'
      ];

      const movHeaderRow = sheet.addRow(movHeaders);
      movHeaderRow.height = 24;
      movHeaderRow.eachCell((cell, colNum) => {
        cell.fill = NAVY_FILL;
        cell.font = HEADER_FONT;
        const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'center', 'right', 'right', 'left'];
        cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
      });

      let totalQtyChange = 0;
      let totalSumAmount = 0;

      filteredMovements.forEach((m, idx) => {
        const isPositive = m.quantityChange > 0;
        const qtyText = `${isPositive ? '+' : ''}${m.quantityChange} ${product.unit || 'Unidad'}`;
        totalQtyChange += m.quantityChange;
        totalSumAmount += m.totalAmount || 0;

        const dateFormatted = new Date(m.date).toLocaleDateString('es-VE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) + ' ' + new Date(m.date).toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const detailsText = m.notes ? `${m.notes}${m.operatorName ? ' - Por: ' + m.operatorName : ''}` : m.operatorName ? `Por: ${m.operatorName}` : '-';

        const rowVals = [
          dateFormatted,
          m.typeLabel.toUpperCase(),
          m.referenceLabel || 'S/N',
          m.clientOrProvider || 'Consumidor Final',
          qtyText,
          m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '$0.00',
          m.totalAmount ? `$${m.totalAmount.toFixed(2)}` : '$0.00',
          detailsText
        ];

        const row = sheet.addRow(rowVals);
        row.height = 20;
        const isZebra = idx % 2 === 1;

        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (isZebra) cell.fill = ZEBRA_FILL;
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2C3E50' } };
          cell.border = DATA_BORDER;

          const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'center', 'right', 'right', 'left'];
          cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
        });
      });

      // TOTAL GENERAL ROW
      const totalRowVals = [
        'TOTAL GENERAL',
        `${filteredMovements.length} reg.`,
        '-',
        '-',
        `${totalQtyChange > 0 ? '+' : ''}${totalQtyChange} ${product.unit || 'Unidad'}`,
        '-',
        `$${totalSumAmount.toFixed(2)}`,
        'Balance de Entradas / Salidas'
      ];

      const tRow = sheet.addRow(totalRowVals);
      tRow.height = 22;
      tRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = TOTAL_FONT;
        cell.border = TOTAL_BORDER;
        const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'center', 'right', 'right', 'left'];
        cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
      });

      // Auto Column Widths
      sheet.columns = [
        { width: 22 }, // FECHA Y HORA
        { width: 25 }, // TIPO DE OPERACIÓN
        { width: 22 }, // COMPROBANTE / REF
        { width: 32 }, // CLIENTE / PROVEEDOR
        { width: 18 }, // MOVIMIENTO
        { width: 15 }, // PRECIO/COSTO
        { width: 16 }, // MONTO TOTAL
        { width: 45 }  // DETALLE / CONCEPTO
      ];

      // Download file
      const fileName = `Kardex_${product.sku || 'Producto'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating Kardex Excel:", err);
      alert("Error al generar el reporte en Excel del Kardex.");
    }
  };

  // Print Kardex PDF Report (Exact match of Excel structure for printing)
  const handlePrintPDF = () => {
    if (movements.length === 0) {
      alert('No hay movimientos registrados para imprimir.');
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const timestamp = new Date().toLocaleString('es-VE');

      // 1. Institutional Header Banner
      doc.setFillColor(27, 38, 49); // #1B2631 Corporate Navy
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('INVERSIONES Y COPIAS BELLA VISTA, C.A.', 14, 10);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('RIF: J-50143164-8  |  Barinitas, Estado Barinas, Venezuela', 14, 16);
      doc.text('KARDEX E HISTORIAL DE MOVIMIENTOS', pageWidth - 14, 10, { align: 'right' });
      doc.text(`Fecha: ${timestamp}`, pageWidth - 14, 16, { align: 'right' });

      // 2. Product Information Block
      let currentY = 28;
      doc.setFillColor(234, 236, 238); // #EAECEE
      doc.rect(14, currentY, pageWidth - 28, 14, 'F');

      doc.setTextColor(27, 38, 49);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`PRODUCTO: ${product.name.toUpperCase()}`, 18, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(86, 101, 115);
      doc.text(`SKU: ${product.sku || 'S/N'}  |  Código/QR: ${product.barcode_qr || 'N/A'}  |  Categoría: ${product.category || 'General'}  |  Tasa BCV: Bs. ${bcvRate.toFixed(2)}`, 18, currentY + 11);

      currentY += 18;

      // 3. Section 1: KPI Metrics Table (Imagen 2 structure)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(27, 38, 49);
      doc.text('1. RESUMEN DE INDICADORES DEL PRODUCTO (KARDEX KPI)', 14, currentY);
      currentY += 3;

      const stockStatus = currentLiveStock === 0 ? 'Agotado' : currentLiveStock <= 5 ? 'Stock Crítico' : 'Disponible';
      const salePrice = product.offer_price || product.price || 0;
      const costPrice = product.cost_price || 0;
      const marginPercent = costPrice > 0 ? (((salePrice - costPrice) / costPrice) * 100).toFixed(1) : '0.0';

      const kpiData = [
        ['STOCK ACTUAL', `${currentLiveStock} ${product.unit || 'UNIDAD'}`, '-', '-', stockStatus],
        ['TOTAL VENDIDO', `${metrics.totalSoldUnits} ${product.unit || 'UNIDAD'}`, `$${metrics.totalSoldAmount.toFixed(2)}`, `Bs. ${(metrics.totalSoldAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. generados por ventas'],
        ['TOTAL COMPRADO', `${metrics.totalPurchasedUnits} ${product.unit || 'UNIDAD'}`, `$${metrics.totalPurchasedAmount.toFixed(2)}`, `Bs. ${(metrics.totalPurchasedAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. invertidos en compras'],
        ['PRECIO & MARGEN', `P. Venta: $${salePrice.toFixed(2)}`, `P. Costo: $${costPrice.toFixed(2)}`, '-', `Margen: +${marginPercent}%`],
        ['OPERACIONES', `${metrics.totalOperations} registros`, `${metrics.totalAdjustments} ajustes manuales`, '-', 'Total operaciones en historial']
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['Métrica / Indicador', 'Stock / Unidades', 'Monto Monetario ($)', 'Equivalente VES (Bs.)', 'Detalle / Estado']],
        body: kpiData,
        theme: 'grid',
        headStyles: {
          fillColor: [27, 38, 49],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center'
        },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' }
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [44, 62, 80]
        },
        alternateRowStyles: {
          fillColor: [242, 244, 244]
        },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // 4. Section 2: Detailed Movements Table (Imagen 1 structure)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(27, 38, 49);
      doc.text(`2. HISTORIAL DE MOVIMIENTOS Y KARDEX (${filteredMovements.length} REGISTROS)`, 14, currentY);
      currentY += 3;

      let totalQtyChange = 0;
      let totalSumAmount = 0;

      const movData = filteredMovements.map((m) => {
        const isPositive = m.quantityChange > 0;
        const qtyText = `${isPositive ? '+' : ''}${m.quantityChange} ${product.unit || 'Unidad'}`;
        totalQtyChange += m.quantityChange;
        totalSumAmount += m.totalAmount || 0;

        const dateFormatted = new Date(m.date).toLocaleDateString('es-VE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) + ' ' + new Date(m.date).toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const detailsText = m.notes ? `${m.notes}${m.operatorName ? ' - Por: ' + m.operatorName : ''}` : m.operatorName ? `Por: ${m.operatorName}` : '-';

        return [
          dateFormatted,
          m.typeLabel.toUpperCase(),
          m.referenceLabel || 'S/N',
          m.clientOrProvider || 'Consumidor Final',
          qtyText,
          m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '$0.00',
          m.totalAmount ? `$${m.totalAmount.toFixed(2)}` : '$0.00',
          detailsText
        ];
      });

      // Total row
      movData.push([
        'TOTAL GENERAL',
        `${filteredMovements.length} reg.`,
        '-',
        '-',
        `${totalQtyChange > 0 ? '+' : ''}${totalQtyChange} ${product.unit || 'Unidad'}`,
        '-',
        `$${totalSumAmount.toFixed(2)}`,
        'Balance de Entradas / Salidas'
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['FECHA Y HORA', 'TIPO OPERACIÓN', 'COMPROBANTE / REF', 'CLIENTE / PROVEEDOR', 'MOVIMIENTO', 'PRECIO/COSTO', 'MONTO TOTAL', 'DETALLE / CONCEPTO']],
        body: movData,
        theme: 'grid',
        headStyles: {
          fillColor: [27, 38, 49],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'center', cellWidth: 28 },
          3: { halign: 'left', cellWidth: 42 },
          4: { halign: 'center', cellWidth: 24 },
          5: { halign: 'right', cellWidth: 22 },
          6: { halign: 'right', cellWidth: 24 },
          7: { halign: 'left' }
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [44, 62, 80]
        },
        alternateRowStyles: {
          fillColor: [242, 244, 244]
        },
        didParseCell: (data) => {
          // Highlight total row
          if (data.row.index === movData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [22, 160, 133]; // #16A085 Green Bold
            data.cell.styles.fillColor = [235, 247, 245];
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Footer / Page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(120, 140, 160);
        doc.text(`Página ${i} de ${pageCount}  •  Sistema Administrador Copias Bella Vista  •  Reporte de Kardex e Inventario`, pageWidth / 2, pageHeight - 6, { align: 'center' });
      }

      // Download PDF and open print blob window
      const fileName = `Kardex_${product.sku || 'Producto'}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      const blobUrl = doc.output('bloburl');
      if (blobUrl) {
        const printWindow = window.open(blobUrl, '_blank');
        if (printWindow) {
          printWindow.focus();
        }
      }
    } catch (err) {
      console.error('Error generating Kardex PDF:', err);
      alert('Error al generar el archivo PDF del Kardex para imprimir.');
    }
  };

  const costPrice = product.cost_price || 0;
  const salePrice = product.offer_price || product.price || 0;
  const marginPercent = costPrice > 0 ? (((salePrice - costPrice) / costPrice) * 100).toFixed(1) : '0.0';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 text-left font-poppins animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-gray-200 w-full max-w-[96vw] xl:max-w-[94vw] max-h-[95vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-[#1D3557] text-white flex items-center justify-between gap-4 shrink-0 border-b-2 border-[#40E0D0]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 text-[#40E0D0] flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-montserrat font-extrabold text-sm sm:text-base text-white uppercase tracking-tight">
                  Movimientos de Inventarios
                </h3>
                <span className="px-2 py-0.5 bg-[#40E0D0] text-[#1D3557] text-[10px] font-black rounded-md uppercase tracking-wider">
                  SKU: {product.sku || 'S/N'}
                </span>
                {product.barcode_qr && (
                  <span className="px-2 py-0.5 bg-white/10 text-white text-[10px] font-mono rounded-md flex items-center gap-1">
                    <Barcode className="w-3 h-3 text-[#40E0D0]" />
                    <span>{product.barcode_qr}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 font-semibold truncate max-w-xl mt-0.5">
                {product.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdjustmentForm(!showAdjustmentForm)}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-98 uppercase tracking-wider"
              id="btn-quick-movement-history"
            >
              <Sliders className="w-4 h-4 text-[#005da9]" />
              <span className="hidden sm:inline">Ajustar Stock</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* QUICK ADJUSTMENT COLLAPSIBLE FORM */}
        {showAdjustmentForm && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="font-montserrat font-black uppercase text-[11px] text-amber-900 flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4 text-amber-700" />
                Registrar Movimiento Directo de Stock
              </span>
              <span className="text-[11px] font-bold text-amber-800">
                Stock actual en sistema: <strong>{currentLiveStock} unidades</strong>
              </span>
            </div>

            <form onSubmit={handleRegisterAdjustment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-black uppercase text-amber-800 mb-1">
                  Tipo de Operación
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="ingreso">📥 Entrada (+) Aumentar Stock</option>
                  <option value="egreso">📤 Salida (-) Disminuir Stock / Merma</option>
                  <option value="ajuste">🔄 Ajuste Físico (Establecer Total Exacto)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-amber-800 mb-1">
                  {adjustType === 'ajuste' ? 'Nuevo Stock Total' : 'Cantidad a Mover'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  required
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-amber-800 mb-1">
                  Concepto / Motivo
                </label>
                <input
                  type="text"
                  value={adjustConcept}
                  onChange={(e) => setAdjustConcept(e.target.value)}
                  placeholder="Ej: Conteo físico, Merma, Devolución..."
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentForm(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-xs font-montserrat font-bold transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-98 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Cancelar</span>
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="flex-1 px-5 py-2 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAdjust ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#40E0D0]" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#40E0D0]" />
                  )}
                  <span>{isSubmittingAdjust ? 'Guardando...' : 'Aplicar Ajuste'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* SUMMARY KPI CARDS */}
        <div className="p-4 bg-gray-50/80 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
          <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Stock Actual</span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-lg font-black ${
                currentLiveStock === 0 ? 'text-rose-600' : currentLiveStock <= 5 ? 'text-amber-600' : 'text-[#1D3557]'
              }`}>
                {currentLiveStock}
              </span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{product.unit || product.units || 'Unid.'}</span>
            </div>
            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
              currentLiveStock === 0 ? 'bg-rose-100 text-rose-700' : currentLiveStock <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {currentLiveStock === 0 ? 'Agotado' : currentLiveStock <= 5 ? 'Stock Crítico' : 'Disponible'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Total Vendido</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-sky-700">{metrics.totalSoldUnits}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{product.unit || 'Unid.'}</span>
            </div>
            <p className="text-[10px] font-bold text-sky-800">
              {currencySymbol}{metrics.totalSoldAmount.toFixed(2)} generados
            </p>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Total Comprado</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-emerald-700">{metrics.totalPurchasedUnits}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{product.unit || 'Unid.'}</span>
            </div>
            <p className="text-[10px] font-bold text-emerald-800">
              {currencySymbol}{metrics.totalPurchasedAmount.toFixed(2)} invertidos
            </p>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Precio & Margen</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black text-gray-900">${salePrice.toFixed(2)}</span>
              <span className="text-[10px] text-gray-400 line-through">${costPrice.toFixed(2)}</span>
            </div>
            <span className="inline-block text-[10px] font-black text-[#00BFFF]">
              Margen: +{marginPercent}%
            </span>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Operaciones</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-slate-800">{metrics.totalOperations}</span>
              <span className="text-[10px] font-bold text-gray-400">registros</span>
            </div>
            <p className="text-[10px] text-gray-500 font-semibold">
              {metrics.totalAdjustments} ajustes manuales
            </p>
          </div>
        </div>

        {/* TOOLBAR & FILTERS */}
        <div className="p-3 bg-white border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por N° factura, cliente, detalle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Desplegable Simple Tipo de Operación */}
          <div className="min-w-[160px] shrink-0">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-xs font-montserrat font-bold text-[#1D3557] shadow-2xs hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-[#00BFFF] cursor-pointer"
            >
              <option value="all">📁 Todos</option>
              <option value="ventas">🛍️ Ventas</option>
              <option value="notas">📋 Notas Entrega</option>
              <option value="compras">📦 Compras</option>
              <option value="pedidos">🛒 Pedidos</option>
              <option value="ajustes">⚙️ Ajustes</option>
            </select>
          </div>

          {/* Date filter & Action buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-montserrat font-extrabold scrollbar-none">
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 bg-white px-2 py-1 border border-slate-300 rounded-full shadow-2xs text-xs font-montserrat font-bold text-[#1D3557] shrink-0">
                <div className="flex items-center gap-1">
                  <span>Desde:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 outline-none p-0 cursor-pointer text-[#005da9]"
                  />
                </div>
                <span className="text-gray-300">|</span>
                <div className="flex items-center gap-1">
                  <span>Hasta:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 outline-none p-0 cursor-pointer text-[#005da9]"
                  />
                </div>
              </div>
            )}
            {/* Date filter dropdown */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#00BFFF] cursor-pointer shrink-0"
            >
              <option value="all">📅 Todo el Historial</option>
              <option value="today">📅 Hoy</option>
              <option value="7d">📅 Últimos 7 días</option>
              <option value="30d">📅 Últimos 30 días</option>
              <option value="month">📅 Este Mes</option>
              <option value="custom">🔍 Fechas Específicas</option>
            </select>

            {/* Action buttons */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs hover:shadow-xs active:scale-98"
              title="Exportar a Excel"
            >
              <Download className="w-4 h-4 text-[#005da9]" />
              <FileSpreadsheet className="w-4 h-4 text-[#005da9]" />
            </button>
            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs hover:shadow-xs active:scale-98"
              title="Imprimir Kardex (PDF)"
            >
              <Printer className="w-4 h-4 text-[#005da9]" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* HISTORY LEDGER TABLE */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-400 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00BFFF]" />
              <p className="text-xs font-bold font-montserrat uppercase tracking-wider">
                Cargando historial y trazabilidad del artículo...
              </p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-gray-400 space-y-2">
              <History className="w-8 h-8 mx-auto text-gray-300 stroke-[1.5]" />
              <p className="text-xs font-bold text-gray-600">
                No se encontraron movimientos registrados para este artículo con los filtros aplicados.
              </p>
              <p className="text-[11px] text-gray-400">
                Las ventas facturadas, notas de entrega, compras o ajustes de stock se registrarán automáticamente aquí.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs font-poppins">
              <thead className="sticky top-0 bg-gray-100 text-gray-700 font-montserrat font-extrabold uppercase text-[10px] tracking-wider z-10 border-b border-gray-200">
                <tr>
                  <th className="p-3">Fecha y Hora</th>
                  <th className="p-3">Comprobante / Ref</th>
                  <th className="p-3">Cliente / Proveedor</th>
                  <th className="p-3 text-center">Movimiento</th>
                  <th className="p-3 text-right">Precio/Costo</th>
                  <th className="p-3 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                {filteredMovements.map((mov) => {
                  const isPositive = mov.quantityChange > 0;
                  const isNegative = mov.quantityChange < 0;

                  return (
                    <tr key={mov.id} className="hover:bg-gray-50/80 transition">
                      {/* Date */}
                      <td className="p-3 font-medium text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{new Date(mov.date).toLocaleDateString()}</span>
                          <span className="text-gray-400">{new Date(mov.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>

                      {/* Reference / Invoice # */}
                      <td className="p-3 font-mono font-bold text-gray-900 whitespace-nowrap">
                        <span className="text-[11px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                          {mov.referenceLabel || 'S/N'}
                        </span>
                      </td>

                      {/* Client / Provider */}
                      <td className="p-3 font-semibold text-gray-700 truncate max-w-xs">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{mov.clientOrProvider || 'Consumidor Final'}</span>
                        </div>
                      </td>

                      {/* Quantity change */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className={`font-mono font-black text-xs px-2 py-0.5 rounded ${
                          isPositive
                            ? 'bg-emerald-100 text-emerald-800'
                            : isNegative
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isPositive ? `+${mov.quantityChange}` : mov.quantityChange} {product.unit || 'un.'}
                        </span>
                      </td>

                      {/* Unit price */}
                      <td className="p-3 text-right font-semibold text-gray-600 whitespace-nowrap">
                        {mov.unitPrice ? `$${mov.unitPrice.toFixed(2)}` : '-'}
                      </td>

                      {/* Total Amount */}
                      <td className="p-3 text-right font-black text-gray-900 whitespace-nowrap">
                        {mov.totalAmount ? `$${mov.totalAmount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
          <div className="text-gray-500 font-medium text-center sm:text-left">
            Mostrando <strong>{filteredMovements.length}</strong> de <strong>{movements.length}</strong> movimientos registrados para <strong>{product.name}</strong>.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs transition shadow-2xs hover:shadow-xs active:scale-98 cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-4 h-4 text-[#005da9]" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProductHistoryModal;
