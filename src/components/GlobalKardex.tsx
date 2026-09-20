import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, Search, FileSpreadsheet, Printer, Download, Plus, RefreshCw, 
  Clock, Tag, User, ArrowUpRight, ArrowDownLeft, Sliders, CheckCircle2, AlertTriangle, Box, X, Check
} from 'lucide-react';
import { Product, Invoice, Purchase, Order, ProductMovementLog } from '../types';
import { dbService } from '../lib/supabase';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface GlobalKardexProps {
  products: Product[];
  bcvRate?: number;
  currencySymbol?: string;
  onStockUpdated?: () => void;
}

export interface UnifiedMovementItem {
  id: string;
  date: string;
  type: string;
  typeLabel: string;
  typeCategory: 'entrada' | 'salida' | 'ajuste';
  referenceId: string;
  referenceLabel: string;
  clientOrProvider: string;
  operatorName: string;
  quantityChange: number; // positive for entry, negative for exit
  previousStock?: number;
  resultingStock?: number;
  unitPrice: number;
  totalAmount: number;
  notes: string;
  productName: string;
  productSku?: string;
  productId?: string;
  rawItem?: any;
}

export const GlobalKardex: React.FC<GlobalKardexProps> = ({
  products,
  bcvRate = 1,
  currencySymbol = '$',
  onStockUpdated
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [movements, setMovements] = useState<UnifiedMovementItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'ventas' | 'notas' | 'compras' | 'pedidos' | 'ajustes'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');

  // Quick Adjustment Form State
  const [showAdjustmentForm, setShowAdjustmentForm] = useState<boolean>(false);
  const [adjustProductId, setAdjustProductId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'ingreso' | 'egreso' | 'ajuste'>('ingreso');
  const [adjustQty, setAdjustQty] = useState<number | string>(1);
  const [adjustConcept, setAdjustConcept] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState<boolean>(false);

  // Load all operational movement history for all products
  const loadGlobalHistory = async () => {
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
        dbService.getProductMovements().catch(() => [] as ProductMovementLog[])
      ]);

      const compiled: UnifiedMovementItem[] = [];

      // Map products for fast lookup
      const productMap = new Map<string, Product>();
      (products || []).forEach(p => {
        if (p.id) productMap.set(String(p.id).toLowerCase(), p);
        if (p.sku) productMap.set(String(p.sku).toLowerCase(), p);
      });

      const resolveProductDetails = (item: any) => {
        const itemId = String(item.id || item.product_id || '').toLowerCase();
        const itemSku = String(item.sku || '').toLowerCase();
        const p = productMap.get(itemId) || productMap.get(itemSku);

        return {
          id: p?.id || item.product_id || '',
          name: p?.name || item.name || item.product_name || item.description || 'Producto General',
          sku: p?.sku || item.sku || ''
        };
      };

      // 1. Invoices / Facturas (Ventas)
      (allInvoices || []).forEach((inv) => {
        if (inv.status === 'anulada') return;
        const items = Array.isArray(inv.items) ? inv.items : [];
        items.forEach((it: any, idx: number) => {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.price || it.unit_price || 0);
          const isDeliveryNote = inv.document_type === 'nota_entrega';
          const pInfo = resolveProductDetails(it);

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
            productName: pInfo.name,
            productSku: pInfo.sku,
            productId: pInfo.id,
            rawItem: inv
          });
        });
      });

      // 2. Draft Delivery Notes
      (allDrafts || []).forEach((draft, idx) => {
        const items = Array.isArray(draft.items) ? draft.items : [];
        items.forEach((it: any, itIdx: number) => {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.price || it.unit_price || 0);
          const pInfo = resolveProductDetails(it);

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
            productName: pInfo.name,
            productSku: pInfo.sku,
            productId: pInfo.id,
            rawItem: draft
          });
        });
      });

      // 3. Purchases / Compras (Entradas)
      (allPurchases || []).forEach((pur) => {
        const items = Array.isArray(pur.items) ? pur.items : [];
        items.forEach((it: any, idx: number) => {
          const qty = Number(it.quantity || it.qty || 1);
          const cost = Number(it.cost_price || it.unit_cost || it.price || 0);
          const pInfo = resolveProductDetails(it);

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
            productName: pInfo.name,
            productSku: pInfo.sku,
            productId: pInfo.id,
            rawItem: pur
          });
        });
      });

      // 4. Orders / Pedidos Online
      (allOrders || []).forEach((ord) => {
        if (ord.status === 'cancelled') return;
        const items = Array.isArray(ord.items) ? ord.items : [];
        items.forEach((it: any, idx: number) => {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.price || 0);
          const orderRefId = (ord.id || 'PED').slice(0, 8);
          const pInfo = resolveProductDetails(it);

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
            productName: pInfo.name,
            productSku: pInfo.sku,
            productId: pInfo.id,
            rawItem: ord
          });
        });
      });

      // 5. Manual Adjustments & Audit Logs
      (allManualLogs || []).forEach((log) => {
        const isEntry = log.type === 'ingreso' || log.quantity > 0;
        const isExit = log.type === 'egreso' || log.quantity < 0;

        // Try to find product name
        const pInfo = resolveProductDetails({ id: log.product_id, sku: '' });

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
          unitPrice: log.unit_price || 0,
          totalAmount: log.total_amount || 0,
          notes: log.concept || 'Ajuste de inventario físico',
          productName: pInfo.name,
          productSku: pInfo.sku,
          productId: log.product_id,
          rawItem: log
        });
      });

      // Sort descending by date
      compiled.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Deduplicate items
      const uniqueKeys = new Set<string>();
      const deduped = compiled.filter(item => {
        const key = `${item.type}-${item.referenceId}-${item.date.slice(0, 16)}-${item.quantityChange}-${item.productName}`;
        if (uniqueKeys.has(key)) return false;
        uniqueKeys.add(key);
        return true;
      });

      setMovements(deduped);
    } catch (err) {
      console.error('Error loading global Kardex history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGlobalHistory();
  }, [products]);

  // Handle Quick Manual Adjustment Submission
  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProduct = products.find(p => p.id === adjustProductId);
    if (!targetProduct) {
      alert('Por favor seleccione un producto para ajustar.');
      return;
    }

    const qtyNum = Number(adjustQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert('Por favor ingrese una cantidad mayor a cero.');
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      const prevStock = Number(targetProduct.stock) || 0;
      let finalQtyChange = 0;
      let newStockCalculated = prevStock;

      if (adjustType === 'ingreso') {
        finalQtyChange = Math.abs(qtyNum);
        newStockCalculated = prevStock + finalQtyChange;
      } else if (adjustType === 'egreso') {
        finalQtyChange = -Math.abs(qtyNum);
        newStockCalculated = Math.max(0, prevStock - Math.abs(qtyNum));
      } else {
        // Conteo directo
        newStockCalculated = Math.abs(qtyNum);
        finalQtyChange = newStockCalculated - prevStock;
      }

      // Update product stock in DB / local
      await dbService.updateProduct(targetProduct.id, { stock: newStockCalculated });

      // Record movement log
      const logRecord: ProductMovementLog = {
        id: crypto.randomUUID(),
        product_id: targetProduct.id,
        product_name: targetProduct.name,
        product_sku: targetProduct.sku || '',
        type: adjustType,
        quantity: finalQtyChange,
        previous_stock: prevStock,
        new_stock: newStockCalculated,
        concept: adjustConcept || `Ajuste manual (${adjustType.toUpperCase()}) en Kardex Global`,
        user_name: 'Administrador',
        created_at: new Date().toISOString()
      };

      await dbService.recordProductMovement(logRecord);

      // Refresh
      setShowAdjustmentForm(false);
      setAdjustConcept('');
      setAdjustQty(1);
      if (onStockUpdated) onStockUpdated();
      await loadGlobalHistory();
      alert(`✅ Stock de "${targetProduct.name}" actualizado con éxito. Nuevo Stock: ${newStockCalculated}`);
    } catch (err) {
      console.error('Error saving stock adjustment:', err);
      alert('Error al guardar el ajuste de stock.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Filter Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // 1. Product Filter
      if (selectedProductId !== 'all' && m.productId !== selectedProductId) {
        return false;
      }

      // 2. Type Filter Pills
      if (filterType === 'ventas' && m.type !== 'venta_factura') return false;
      if (filterType === 'notas' && m.type !== 'nota_entrega') return false;
      if (filterType === 'compras' && m.type !== 'compra_proveedor') return false;
      if (filterType === 'pedidos' && m.type !== 'pedido_tienda') return false;
      if (filterType === 'ajustes' && !m.type.startsWith('ajuste')) return false;

      // 3. Date Filter
      if (dateFilter !== 'all') {
        const itemDate = new Date(m.date);
        const now = new Date();
        if (dateFilter === 'today') {
          if (itemDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === '7d') {
          const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        } else if (dateFilter === '30d') {
          const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30) return false;
        } else if (dateFilter === 'month') {
          if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
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

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRef = m.referenceLabel.toLowerCase().includes(q);
        const matchClient = m.clientOrProvider.toLowerCase().includes(q);
        const matchOperator = m.operatorName.toLowerCase().includes(q);
        const matchNotes = m.notes.toLowerCase().includes(q);
        const matchProduct = m.productName.toLowerCase().includes(q);
        const matchSku = (m.productSku || '').toLowerCase().includes(q);

        if (!matchRef && !matchClient && !matchOperator && !matchNotes && !matchProduct && !matchSku) {
          return false;
        }
      }

      return true;
    });
  }, [movements, selectedProductId, filterType, dateFilter, customStartDate, customEndDate, searchQuery]);

  // Aggregated KPI Metrics
  const metrics = useMemo(() => {
    let totalStockAll = 0;
    (products || []).forEach(p => {
      totalStockAll += (Number(p.stock) || 0);
    });

    let totalSoldUnits = 0;
    let totalSoldAmount = 0;
    let totalPurchasedUnits = 0;
    let totalPurchasedAmount = 0;
    let totalAdjustments = 0;

    filteredMovements.forEach((m) => {
      if (m.type === 'venta_factura' || m.type === 'nota_entrega' || m.type === 'pedido_tienda') {
        totalSoldUnits += Math.abs(m.quantityChange);
        totalSoldAmount += (m.totalAmount || 0);
      } else if (m.type === 'compra_proveedor') {
        totalPurchasedUnits += Math.abs(m.quantityChange);
        totalPurchasedAmount += (m.totalAmount || 0);
      } else if (m.type.startsWith('ajuste')) {
        totalAdjustments++;
      }
    });

    return {
      totalStockAll,
      totalSoldUnits,
      totalSoldAmount,
      totalPurchasedUnits,
      totalPurchasedAmount,
      totalOperations: filteredMovements.length,
      totalAdjustments
    };
  }, [products, filteredMovements]);

  // Export Global Kardex to Excel with Corporate Styles
  const handleExportExcel = async () => {
    if (filteredMovements.length === 0) {
      alert('No hay movimientos registrados para exportar.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Inversiones y Copias Bella Vista';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Kardex Global', { views: [{ showGridLines: true }] });

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
      const r1 = sheet.addRow(['INVERSIONES Y COPIAS BELLA VISTA, C.A.', '', '', '', '', '', '', 'KARDEX GENERAL DE INVENTARIO']);
      r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
      r1.getCell(8).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
      r1.getCell(8).alignment = { horizontal: 'right' };

      const r2 = sheet.addRow(['REPORTE CONSOLIDADO DE MOVIMIENTOS Y AUDITORÍA', '', '', '', '', '', '', `Fecha de Generación: ${timestamp}`]);
      r2.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF2C3E50' } };
      r2.getCell(8).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
      r2.getCell(8).alignment = { horizontal: 'right' };

      const r3 = sheet.addRow([`Total Productos en Catálogo: ${products.length}  |  Tasa BCV: Bs. ${bcvRate.toFixed(2)}  |  Moneda Base: USD ($)`]);
      r3.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };

      sheet.addRow([]); // Blank line

      // 1. KPI SUMMARY TABLE (IMAGEN 2)
      const kpiSecRow = sheet.addRow(['RESUMEN DE INDICADORES GLOBALES (KARDEX KPI)']);
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

      const kpiRows = [
        ['STOCK TOTAL EN INVENTARIO', `${metrics.totalStockAll} UNIDADES`, '-', '-', `${products.length} productos registrados`],
        ['TOTAL VENDIDO', `${metrics.totalSoldUnits} UNIDADES`, `$${metrics.totalSoldAmount.toFixed(2)}`, `Bs. ${(metrics.totalSoldAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. generados por ventas'],
        ['TOTAL COMPRADO', `${metrics.totalPurchasedUnits} UNIDADES`, `$${metrics.totalPurchasedAmount.toFixed(2)}`, `Bs. ${(metrics.totalPurchasedAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. invertidos en compras'],
        ['OPERACIONES & REGISTROS', `${metrics.totalOperations} movimientos`, `${metrics.totalAdjustments} ajustes manuales`, '-', 'Total operaciones registradas']
      ];

      kpiRows.forEach((rowVals, idx) => {
        const row = sheet.addRow(rowVals);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (isZebra) cell.fill = ZEBRA_FILL;
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2C3E50' } };
          cell.border = DATA_BORDER;
          cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' };
        });
      });

      sheet.addRow([]); // Blank line

      // 2. DETAILED MOVEMENTS TABLE (IMAGEN 1)
      const movSecRow = sheet.addRow([`HISTORIAL GENERAL DE MOVIMIENTOS (${filteredMovements.length} REGISTROS)`]);
      movSecRow.height = 24;
      movSecRow.getCell(1).fill = SECTION_FILL;
      movSecRow.getCell(1).font = SECTION_FONT;

      const movHeaders = [
        'FECHA Y HORA',
        'TIPO DE OPERACIÓN',
        'COMPROBANTE / REF',
        'PRODUCTO / ARTÍCULO',
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
        const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'left', 'center', 'right', 'right', 'left'];
        cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
      });

      let totalQtyChange = 0;
      let totalSumAmount = 0;

      filteredMovements.forEach((m, idx) => {
        const isPositive = m.quantityChange > 0;
        const qtyText = `${isPositive ? '+' : ''}${m.quantityChange} Unid`;
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
          m.productName + (m.productSku ? ` [${m.productSku}]` : ''),
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

          const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'left', 'center', 'right', 'right', 'left'];
          cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
        });
      });

      // TOTAL GENERAL ROW
      const totalRowVals = [
        'TOTAL GENERAL',
        `${filteredMovements.length} reg.`,
        '-',
        '-',
        '-',
        `${totalQtyChange > 0 ? '+' : ''}${totalQtyChange} Unid`,
        '-',
        `$${totalSumAmount.toFixed(2)}`,
        'Balance de Entradas / Salidas Globale'
      ];

      const tRow = sheet.addRow(totalRowVals);
      tRow.height = 22;
      tRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = TOTAL_FONT;
        cell.border = TOTAL_BORDER;
        const alignMap: ('left' | 'center' | 'right')[] = ['center', 'center', 'center', 'left', 'left', 'center', 'right', 'right', 'left'];
        cell.alignment = { vertical: 'middle', horizontal: alignMap[colNum - 1] || 'left' };
      });

      // Auto Column Widths
      sheet.columns = [
        { width: 22 }, // FECHA Y HORA
        { width: 24 }, // TIPO DE OPERACIÓN
        { width: 22 }, // COMPROBANTE / REF
        { width: 32 }, // PRODUCTO
        { width: 28 }, // CLIENTE / PROVEEDOR
        { width: 16 }, // MOVIMIENTO
        { width: 15 }, // PRECIO/COSTO
        { width: 16 }, // MONTO TOTAL
        { width: 40 }  // DETALLE / CONCEPTO
      ];

      // Download file
      const fileName = `Kardex_Global_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating Global Kardex Excel:', err);
      alert('Error al generar el reporte Excel del Kardex Global.');
    }
  };

  // Print Global Kardex PDF Report
  const handlePrintPDF = () => {
    if (filteredMovements.length === 0) {
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

      // 1. Institutional Banner
      doc.setFillColor(27, 38, 49); // #1B2631
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('INVERSIONES Y COPIAS BELLA VISTA, C.A.', 14, 10);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('RIF: J-50143164-8  |  Barinitas, Estado Barinas, Venezuela', 14, 16);
      doc.text('KARDEX GENERAL DE INVENTARIO Y MOVIMIENTOS', pageWidth - 14, 10, { align: 'right' });
      doc.text(`Fecha: ${timestamp}`, pageWidth - 14, 16, { align: 'right' });

      let currentY = 28;

      // 2. Summary Bar
      doc.setFillColor(234, 236, 238);
      doc.rect(14, currentY, pageWidth - 28, 10, 'F');
      doc.setTextColor(27, 38, 49);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`TOTAL PRODUCTOS EN CATÁLOGO: ${products.length}  |  STOCK ACUMULADO: ${metrics.totalStockAll} UNIDADES  |  TASA BCV: Bs. ${bcvRate.toFixed(2)}`, 18, currentY + 6.5);

      currentY += 14;

      // 3. Section 1: KPI Metrics
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(27, 38, 49);
      doc.text('1. RESUMEN DE INDICADORES GLOBALES (KARDEX KPI)', 14, currentY);
      currentY += 3;

      const kpiData = [
        ['STOCK TOTAL EN INVENTARIO', `${metrics.totalStockAll} UNIDADES`, '-', '-', `${products.length} productos en catálogo`],
        ['TOTAL VENDIDO', `${metrics.totalSoldUnits} UNIDADES`, `$${metrics.totalSoldAmount.toFixed(2)}`, `Bs. ${(metrics.totalSoldAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. generados por ventas'],
        ['TOTAL COMPRADO', `${metrics.totalPurchasedUnits} UNIDADES`, `$${metrics.totalPurchasedAmount.toFixed(2)}`, `Bs. ${(metrics.totalPurchasedAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Bs. invertidos en compras'],
        ['OPERACIONES & REGISTROS', `${metrics.totalOperations} movimientos`, `${metrics.totalAdjustments} ajustes manuales`, '-', 'Total operaciones registradas']
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
          fontSize: 8,
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
          fontSize: 7.5,
          textColor: [44, 62, 80]
        },
        alternateRowStyles: {
          fillColor: [242, 244, 244]
        },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // 4. Section 2: Detailed Movements Table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(27, 38, 49);
      doc.text(`2. HISTORIAL DETALLADO DE MOVIMIENTOS (${filteredMovements.length} REGISTROS)`, 14, currentY);
      currentY += 3;

      let totalQtyChange = 0;
      let totalSumAmount = 0;

      const movData = filteredMovements.map((m) => {
        const isPositive = m.quantityChange > 0;
        const qtyText = `${isPositive ? '+' : ''}${m.quantityChange} Unid`;
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
          m.productName,
          m.clientOrProvider || 'Consumidor Final',
          qtyText,
          m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '$0.00',
          m.totalAmount ? `$${m.totalAmount.toFixed(2)}` : '$0.00',
          detailsText
        ];
      });

      // Total Row
      movData.push([
        'TOTAL GENERAL',
        `${filteredMovements.length} reg.`,
        '-',
        '-',
        '-',
        `${totalQtyChange > 0 ? '+' : ''}${totalQtyChange} Unid`,
        '-',
        `$${totalSumAmount.toFixed(2)}`,
        'Balance de Entradas / Salidas Globale'
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['FECHA Y HORA', 'TIPO OPERACIÓN', 'COMPROBANTE / REF', 'PRODUCTO', 'CLIENTE / PROVEEDOR', 'MOVIMIENTO', 'PRECIO/COSTO', 'MONTO TOTAL', 'DETALLE / CONCEPTO']],
        body: movData,
        theme: 'grid',
        headStyles: {
          fillColor: [27, 38, 49],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 26 },
          1: { halign: 'center', cellWidth: 28 },
          2: { halign: 'center', cellWidth: 26 },
          3: { halign: 'left', cellWidth: 38 },
          4: { halign: 'left', cellWidth: 34 },
          5: { halign: 'center', cellWidth: 22 },
          6: { halign: 'right', cellWidth: 20 },
          7: { halign: 'right', cellWidth: 22 },
          8: { halign: 'left' }
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [44, 62, 80]
        },
        alternateRowStyles: {
          fillColor: [242, 244, 244]
        },
        didParseCell: (data) => {
          if (data.row.index === movData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [22, 160, 133];
            data.cell.styles.fillColor = [235, 247, 245];
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(120, 140, 160);
        doc.text(`Página ${i} de ${pageCount}  •  Sistema Administrador Copias Bella Vista  •  Kardex Global de Inventario`, pageWidth / 2, pageHeight - 6, { align: 'center' });
      }

      // Download PDF and open window
      const fileName = `Kardex_Global_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      const blobUrl = doc.output('bloburl');
      if (blobUrl) {
        const printWindow = window.open(blobUrl, '_blank');
        if (printWindow) {
          printWindow.focus();
        }
      }
    } catch (err) {
      console.error('Error generating Global Kardex PDF:', err);
      alert('Error al generar el PDF del Kardex Global para imprimir.');
    }
  };

  return (
    <div className="space-y-4 text-left font-poppins">
      
      {/* 1. TOP HEADER WITH TITLE & ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
        <div>
          <h2 className="text-xl font-montserrat font-extrabold text-[#1D3557] uppercase tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-[#00BFFF]" />
            <span>Movimientos de Inventarios</span>
          </h2>
        </div>

        {/* Action Buttons: Quick Stock Adjustment & Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadGlobalHistory()}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-98 uppercase tracking-wider"
            title="Actualizar Historial"
          >
            <RefreshCw className={`w-4 h-4 text-[#005da9] ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (products.length > 0) {
                setAdjustProductId(products[0].id);
              }
              setShowAdjustmentForm(true);
            }}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-98 uppercase tracking-wider"
          >
            <Sliders className="w-4 h-4 text-[#005da9]" />
            <span>Ajustar Stock</span>
          </button>
        </div>
      </div>

      {/* 2. TOP KPI CARDS BAR (Guided by Image 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* STOCK ACTUAL */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">STOCK ACTUAL</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#1D3557]">{metrics.totalStockAll.toLocaleString()}</span>
            <span className="text-xs font-bold text-gray-500 uppercase">UNIDADES</span>
          </div>
          <div className="mt-2">
            <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md uppercase">
              DISPONIBLE
            </span>
          </div>
        </div>

        {/* TOTAL VENDIDO */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TOTAL VENDIDO</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#00BFFF]">{metrics.totalSoldUnits.toLocaleString()}</span>
            <span className="text-xs font-bold text-gray-500 uppercase">UNIDADES</span>
          </div>
          <div className="mt-2 text-xs font-bold text-[#1D3557]">
            Bs. {(metrics.totalSoldAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} generados
          </div>
        </div>

        {/* TOTAL COMPRADO */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TOTAL COMPRADO</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-600">{metrics.totalPurchasedUnits.toLocaleString()}</span>
            <span className="text-xs font-bold text-gray-500 uppercase">UNIDADES</span>
          </div>
          <div className="mt-2 text-xs font-bold text-emerald-700">
            Bs. {(metrics.totalPurchasedAmount * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} invertidos
          </div>
        </div>

        {/* PRECIO & MARGEN */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">MARGEN & BCV</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#1D3557]">${bcvRate > 0 ? (1).toFixed(2) : '1.00'}</span>
            <span className="text-xs font-medium text-gray-400">Bs. {bcvRate.toFixed(2)}</span>
          </div>
          <div className="mt-2 text-xs font-bold text-sky-600">
            Base BCV Actual
          </div>
        </div>

        {/* OPERACIONES */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">OPERACIONES</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#1D3557]">{metrics.totalOperations}</span>
            <span className="text-xs font-bold text-gray-500 lowercase">registros</span>
          </div>
          <div className="mt-2 text-xs font-medium text-gray-500">
            {metrics.totalAdjustments} ajustes manuales
          </div>
        </div>
      </div>

      {/* 3. FILTER & CONTROLS ROW (Guided by Image 1) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por N° factura, producto, cliente, detalle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Product Filter Selector */}
        <div className="min-w-[180px]">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
          >
            <option value="all">📦 Todos los Productos ({products.length})</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `[${p.sku}]` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Desplegable Simple Tipo de Operación */}
        <div className="min-w-[170px]">
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

        {/* Date Dropdown & Action Buttons */}
        <div className="flex items-center gap-2 self-end lg:self-center">
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 bg-white px-2 py-1 border border-slate-300 rounded-full shadow-2xs text-xs font-montserrat font-bold text-[#1D3557]">
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
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
          >
            <option value="all">📅 Todo el Historial</option>
            <option value="today">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="month">Este mes</option>
            <option value="custom">🔍 Fechas Específicas</option>
          </select>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
            title="Exportar a Excel"
          >
            <Download className="w-4 h-4 text-[#005da9]" />
            <FileSpreadsheet className="w-4 h-4 text-[#005da9]" />
          </button>

          {/* Print Kardex PDF Button */}
          <button
            type="button"
            onClick={handlePrintPDF}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
            title="Imprimir Kardex (PDF)"
          >
            <Printer className="w-4 h-4 text-[#005da9]" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* 4. TABLE VIEW (Guided by Image 1) */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-poppins">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-gray-200 text-[#1D3557] font-montserrat font-extrabold uppercase text-[11px] tracking-wider">
                <th className="p-3.5">FECHA Y HORA</th>
                <th className="p-3.5">COMPROBANTE / REF</th>
                <th className="p-3.5">CLIENTE / PROVEEDOR</th>
                <th className="p-3.5 text-center">MOVIMIENTO</th>
                <th className="p-3.5 text-right">PRECIO/COSTO</th>
                <th className="p-3.5 text-right">MONTO TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#2B2D42]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 text-[#00BFFF] animate-spin mx-auto mb-2" />
                    <span>Cargando historial de movimientos del inventario...</span>
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400">
                    <Box className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-bold">No se encontraron movimientos registrados.</p>
                    <p className="text-[11px] text-gray-400">Intente modificar los filtros de búsqueda o fecha.</p>
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isPositive = m.quantityChange > 0;
                  const dateObj = new Date(m.date);
                  const formattedDate = dateObj.toLocaleDateString('es-VE', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric'
                  });
                  const formattedTime = dateObj.toLocaleTimeString('es-VE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      
                      {/* FECHA Y HORA */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{formattedDate}</span>
                          <span className="text-[10px] text-gray-400">{formattedTime}</span>
                        </div>
                      </td>

                      {/* COMPROBANTE / REF */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-mono text-[11px] font-bold rounded-md border border-gray-200">
                          {m.referenceLabel}
                        </span>
                      </td>

                      {/* CLIENTE / PROVEEDOR */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{m.clientOrProvider}</span>
                        </div>
                      </td>

                      {/* MOVIMIENTO */}
                      <td className="p-3.5 whitespace-nowrap text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-black ${
                          isPositive 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {isPositive ? '+' : ''}{m.quantityChange} Unid
                        </span>
                      </td>

                      {/* PRECIO/COSTO */}
                      <td className="p-3.5 whitespace-nowrap text-right font-medium text-gray-600">
                        ${m.unitPrice ? m.unitPrice.toFixed(2) : '0.00'}
                      </td>

                      {/* MONTO TOTAL */}
                      <td className="p-3.5 whitespace-nowrap text-right font-black text-[#1D3557]">
                        ${m.totalAmount ? m.totalAmount.toFixed(2) : '0.00'}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. QUICK MANUAL ADJUSTMENT MODAL */}
      {showAdjustmentForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-montserrat font-extrabold text-base text-[#1D3557] flex items-center gap-2 uppercase">
                <Sliders className="w-5 h-5 text-[#00BFFF]" />
                <span>Ajuste Manual de Inventario</span>
              </h3>
              <button
                onClick={() => setShowAdjustmentForm(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-3">
              {/* Product Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Seleccionar Producto *
                </label>
                <select
                  value={adjustProductId}
                  onChange={(e) => setAdjustProductId(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                  required
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — Stock actual: {p.stock}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Tipo de Operación *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ingreso')}
                    className={`p-2 rounded-xl text-xs font-bold border transition ${
                      adjustType === 'ingreso'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    + Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('egreso')}
                    className={`p-2 rounded-xl text-xs font-bold border transition ${
                      adjustType === 'egreso'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    - Egreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('ajuste')}
                    className={`p-2 rounded-xl text-xs font-bold border transition ${
                      adjustType === 'ajuste'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    = Conteo Directo
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  {adjustType === 'ajuste' ? 'Nuevo Stock Físico Total' : 'Cantidad de Unidades'} *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                  required
                />
              </div>

              {/* Concept / Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Concepto / Justificación *
                </label>
                <textarea
                  value={adjustConcept}
                  onChange={(e) => setAdjustConcept(e.target.value)}
                  placeholder="Ej: Conteo de auditoría, merma, devolución de cliente..."
                  rows={2}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  className="px-5 py-2 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4 text-[#40E0D0]" />
                  <span>{isSubmittingAdjust ? 'Guardando...' : 'Aplicar Ajuste'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default GlobalKardex;
