import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Check, X, Calendar, DollarSign, Info, Send, 
  HelpCircle, PieChart, AlertCircle, RefreshCw, ArrowRight, CornerDownRight 
} from 'lucide-react';
import { dbService } from '../lib/supabase';

// Available categories defined in instructions
export const GASTO_CATEGORIES = [
  'Alquiler',
  'Electricidad / luz',
  'Agua',
  'Internet / teléfono',
  'Patente y permisos',
  'Sueldos y salarios',
  'Cotizaciones o cargas sociales',
  'Compra de mercadería / productos',
  'Materiales e insumos',
  'Limpieza',
  'Mantenimiento y reparaciones',
  'Transporte / combustible',
  'Comisiones bancarias / máquina de pago',
  'Contador',
  'Publicidad',
  'Otros gastos'
];

// Available payment methods defined in instructions
export const GASTO_PAYMENT_METHODS = [
  'Efectivo',
  'Transferencia',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'Cheque',
  'Otro',
  'No especificada'
];

interface GastoAssistantProps {
  cashOps: any[];
  bcvRate: number;
  onRefreshData: () => void;
  activeSession: any | null;
}

interface ParsedGasto {
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number | null;
  currency: 'USD' | 'VES';
  formaPago: string;
  observacion: string;
}

export default function GastoAssistant({
  cashOps,
  bcvRate,
  onRefreshData,
  activeSession
}: GastoAssistantProps) {
  const [inputText, setInputText] = useState('');
  
  // Interactive parsed state
  const [parsedGasto, setParsedGasto] = useState<ParsedGasto | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Missing info prompt state
  const [missingField, setMissingField] = useState<'monto' | 'descripcion' | null>(null);
  const [missingVal, setMissingVal] = useState('');

  // Queries response state
  const [queryResponse, setQueryResponse] = useState<{
    title: string;
    type: 'summary' | 'text' | 'chart';
    content: React.ReactNode;
  } | null>(null);

  // Helper to format date cleanly
  const getTodayLocalDateStr = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to parse numbers intelligently (handles thousands and decimals)
  const cleanNumberStr = (str: string): number => {
    let s = str.trim();
    s = s.replace(/[$\s]/g, ''); // strip spaces and dollar signs
    
    // Check if period is used as thousands separator
    if (s.includes('.') && !s.includes(',')) {
      const parts = s.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        s = s.replace(/\./g, '');
      }
    } else if (s.includes(',') && !s.includes('.')) {
      const parts = s.split(',');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        s = s.replace(/,/g, '');
      } else {
        s = s.replace(/,/g, '.'); // treat comma as decimal
      }
    } else if (s.includes('.') && s.includes(',')) {
      if (s.indexOf('.') < s.indexOf(',')) {
        s = s.replace(/\./g, '').replace(/,/g, '.');
      } else {
        s = s.replace(/,/g, '');
      }
    }
    return parseFloat(s) || 0;
  };

  // Category classifier based on instructions & keywords
  const classifyCategory = (text: string): string => {
    const lower = text.toLowerCase();
    
    if (lower.includes('arriendo') || lower.includes('alquiler') || lower.includes('renta') || lower.includes('arrendamiento')) return 'Alquiler';
    if (lower.includes('luz') || lower.includes('electricidad') || lower.includes('corpoelec') || lower.includes('eléctrica') || lower.includes('corriente')) return 'Electricidad / luz';
    if (lower.includes('agua') || lower.includes('hidro')) return 'Agua';
    if (lower.includes('internet') || lower.includes('telefono') || lower.includes('teléfono') || lower.includes('cantv') || lower.includes('inter') || lower.includes('netuno') || lower.includes('fibra') || lower.includes('saldo') || lower.includes('movistar') || lower.includes('digitel') || lower.includes('recarga')) return 'Internet / teléfono';
    if (lower.includes('patente') || lower.includes('permiso') || lower.includes('alcaldia') || lower.includes('alcaldía') || lower.includes('impuesto') || lower.includes('seniat') || lower.includes('contribución')) return 'Patente y permisos';
    if (lower.includes('sueldo') || lower.includes('salario') || lower.includes('nomina') || lower.includes('nómina') || lower.includes('quincena') || lower.includes('pago a ') || lower.includes('empleado')) return 'Sueldos y salarios';
    if (lower.includes('cotizacion') || lower.includes('cotizaciones') || lower.includes('cargas sociales') || lower.includes('ivss') || lower.includes('faov') || lower.includes('banavih') || lower.includes('seguro social')) return 'Cotizaciones o cargas sociales';
    if (lower.includes('mercaderia') || lower.includes('mercadería') || lower.includes('mercancia') || lower.includes('mercancía') || lower.includes('bebidas') || lower.includes('compras de producto') || lower.includes('compra de producto') || lower.includes('proveedor') || lower.includes('gaseosa') || lower.includes('insumo venta')) return 'Compra de mercadería / productos';
    if (lower.includes('bolsa') || lower.includes('papel') || lower.includes('insumos') || lower.includes('material') || lower.includes('resma') || lower.includes('tinta') || lower.includes('toner') || lower.includes('tóner') || lower.includes('carpeta') || lower.includes('lapiz') || lower.includes('lápiz') || lower.includes('papelería')) return 'Materiales e insumos';
    if (lower.includes('limpieza') || lower.includes('desinfectante') || lower.includes('cloro') || lower.includes('jabon') || lower.includes('jabón') || lower.includes('escoba') || lower.includes('detergente') || lower.includes('limpiador')) return 'Limpieza';
    if (lower.includes('reparacion') || lower.includes('reparación') || lower.includes('mantenimiento') || lower.includes('reparar') || lower.includes('tecnico') || lower.includes('técnico') || lower.includes('nevera') || lower.includes('refrigerador') || lower.includes('aire')) return 'Mantenimiento y reparaciones';
    if (lower.includes('transporte') || lower.includes('combustible') || lower.includes('gasolina') || lower.includes('gasoil') || lower.includes('flete') || lower.includes('pasaje') || lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('moto')) return 'Transporte / combustible';
    if (lower.includes('comision') || lower.includes('comisión') || lower.includes('banco') || lower.includes('comisiones') || lower.includes('maquina de pago') || lower.includes('máquina de pago') || lower.includes('punto') || lower.includes('punto de venta')) return 'Comisiones bancarias / máquina de pago';
    if (lower.includes('contador') || lower.includes('contadora') || lower.includes('honorarios') || lower.includes('contable')) return 'Contador';
    if (lower.includes('publicidad') || lower.includes('facebook') || lower.includes('instagram') || lower.includes('ads') || lower.includes('marketing') || lower.includes('volante') || lower.includes('folleto') || lower.includes('redes')) return 'Publicidad';

    return 'Otros gastos';
  };

  // Payment method classifier based on instructions
  const classifyPaymentMethod = (text: string): string => {
    const lower = text.toLowerCase();
    if (lower.includes('efectivo') || lower.includes('cash') || lower.includes('billete')) return 'Efectivo';
    if (lower.includes('transferencia') || lower.includes('pago movil') || lower.includes('pago móvil') || lower.includes('pago-movil') || lower.includes('transferí') || lower.includes('zelle') || lower.includes('banco')) return 'Transferencia';
    if (lower.includes('tarjeta de débito') || lower.includes('tarjeta debito') || lower.includes('débito') || lower.includes('debito')) return 'Tarjeta de débito';
    if (lower.includes('tarjeta de crédito') || lower.includes('tarjeta credito') || lower.includes('crédito') || lower.includes('credito')) return 'Tarjeta de crédito';
    if (lower.includes('cheque')) return 'Cheque';
    if (lower.includes('otro')) return 'Otro';
    return 'No especificada';
  };

  // Intelligent date parsing from instructions
  const parseGastoDate = (text: string): string => {
    const lower = text.toLowerCase();
    const today = new Date();
    
    if (lower.includes('ayer')) {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yDay = String(yesterday.getDate()).padStart(2, '0');
      return `${yYear}-${yMonth}-${yDay}`;
    }
    
    if (lower.includes('antier') || lower.includes('antes de ayer')) {
      const antier = new Date();
      antier.setDate(today.getDate() - 2);
      const aYear = antier.getFullYear();
      const aMonth = String(antier.getMonth() + 1).padStart(2, '0');
      const aDay = String(antier.getDate()).padStart(2, '0');
      return `${aYear}-${aMonth}-${aDay}`;
    }

    // Look for slash or dash dates (e.g. 12/08 or 12/08/2026)
    const dateRegex = /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/;
    const match = text.match(dateRegex);
    if (match) {
      let day = parseInt(match[1]);
      let month = parseInt(match[2]) - 1; // 0-indexed month
      let year = match[3] ? parseInt(match[3]) : today.getFullYear();
      if (year < 100) year += 2000;
      
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        const pYear = parsedDate.getFullYear();
        const pMonth = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const pDay = String(parsedDate.getDate()).padStart(2, '0');
        return `${pYear}-${pMonth}-${pDay}`;
      }
    }

    // Look for month names like "5 de mayo"
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    for (let i = 0; i < months.length; i++) {
      const monthName = months[i];
      if (lower.includes(monthName)) {
        const monthRegex = new RegExp(`(\\d{1,2})\\s+de\\s+${monthName}`, 'i');
        const monthMatch = text.match(monthRegex);
        if (monthMatch) {
          const day = parseInt(monthMatch[1]);
          const year = today.getFullYear();
          const parsedDate = new Date(year, i, day);
          if (!isNaN(parsedDate.getTime())) {
            const pYear = parsedDate.getFullYear();
            const pMonth = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const pDay = String(parsedDate.getDate()).padStart(2, '0');
            return `${pYear}-${pMonth}-${pDay}`;
          }
        }
      }
    }

    return getTodayLocalDateStr();
  };

  // Clean raw user text to extract a readable description
  const cleanDescription = (text: string): string => {
    let desc = text;
    // Remove amount patterns
    desc = desc.replace(/(?:\$|bs\.?|usd|USD|Bs\.?)\s*\d{1,3}(?:\.\d{3})*(?:,\d+)?/gi, '');
    desc = desc.replace(/(?:\$|bs\.?|usd|USD|Bs\.?)\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?/gi, '');
    desc = desc.replace(/(?:\$|bs\.?|usd|USD|Bs\.?)\s*\d+(?:\.\d+)?/gi, '');
    desc = desc.replace(/\b\d{1,3}(?:\.\d{3})*(?:,\d+)?\s*(?:\$|bs\.?|usd|USD|Bs\.?|\bbolivares\b|\bbolívares\b|\bdolares\b|\bdólares\b)/gi, '');
    
    // Remove dates/keywords
    desc = desc.replace(/\b(hoy|ayer|antier|antes de ayer)\b/gi, '');
    desc = desc.replace(/\bel\s+\d{1,2}\s+de\s+[a-z]+/gi, '');
    
    // Remove verbs
    desc = desc.replace(/\b(pagué|pagamos|compramos|compré|pago|cuenta|factura|gasto|gastamos|registra|guarda)\b/gi, '');
    
    // Clean spaces & punctuation
    desc = desc.replace(/[\s\-,.:;()]+/g, ' ').trim();
    
    if (desc) {
      desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    }
    return desc || 'Gasto registrado';
  };

  // Core processing function for natural language input
  const handleProcessInput = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    setQueryResponse(null);
    setMissingField(null);

    // Check if input is a natural language question/query
    const lowerText = text.toLowerCase();
    if (lowerText.includes('gasto') && (lowerText.includes('cuanto') || lowerText.includes('cuánto') || lowerText.includes('resumen') || lowerText.includes('en que') || lowerText.includes('en qué'))) {
      if (lowerText.includes('este mes') || lowerText.includes('del mes')) {
        handleQueryCuantoMes();
        return;
      }
      if (lowerText.includes('mas') || lowerText.includes('más')) {
        handleQueryQueGasteMas();
        return;
      }
      handleQueryResumenCompleto();
      return;
    }

    if (lowerText.includes('cuánto gasté') || lowerText.includes('cuanto gaste')) {
      handleQueryCuantoMes();
      return;
    }

    if (lowerText.includes('en qué gasté más') || lowerText.includes('en que gaste mas')) {
      handleQueryQueGasteMas();
      return;
    }

    if (lowerText.includes('resumen') || lowerText.includes('reporte de gastos')) {
      handleQueryResumenCompleto();
      return;
    }

    // Otherwise, parse as a new expense registration
    const parsed = parseGastoNaturalLanguage(text);

    // Check if currency is likely Bolívares (VES)
    // E.g. if amount is >= 500 or specifically mentions "bs" or "bolivares"
    let currency: 'USD' | 'VES' = 'USD';
    if (lowerText.includes('bs') || lowerText.includes('bolivar') || lowerText.includes('bolívares') || (parsed.monto !== null && parsed.monto >= 200)) {
      currency = 'VES';
    }
    parsed.currency = currency;

    // Check for missing mandatory fields
    if (parsed.monto === null || isNaN(parsed.monto) || parsed.monto <= 0) {
      setParsedGasto(parsed);
      setMissingField('monto');
      setMissingVal('');
      return;
    }

    if (!parsed.descripcion || parsed.descripcion.length < 2 || parsed.descripcion === 'Gasto registrado') {
      setParsedGasto(parsed);
      setMissingField('descripcion');
      setMissingVal('');
      return;
    }

    // All mandatory fields are present, show confirmation
    setParsedGasto(parsed);
    setShowConfirm(true);
  };

  // Parsing helper from standard text
  const parseGastoNaturalLanguage = (text: string): ParsedGasto => {
    const today = new Date();
    
    // Parse amount
    let monto: number | null = null;
    const amountRegex = /(?:\$|bs\.?|usd|USD|Bs\.?)\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]{1,3}(?:,[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:\.[0-9]+)?)|([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]{1,3}(?:,[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:\.[0-9]+)?)\s*(?:\$|bs\.?|usd|USD|Bs\.?|\bbolivares\b|\bbolívares\b|\bdolares\b|\bdólares\b)/gi;
    
    let match = amountRegex.exec(text);
    let parsedAmountStr = '';
    if (match) {
      parsedAmountStr = match[1] || match[2] || '';
    } else {
      const simpleNumberRegex = /\b([1-9]\d{1,2}(?:\.\d{3})+|[1-9]\d{4,9}|[1-9]\d{0,3}(?:\.\d+)?)\b/g;
      let fallbackMatches: string[] = [];
      let fallbackMatch;
      while ((fallbackMatch = simpleNumberRegex.exec(text)) !== null) {
        const numStr = fallbackMatch[1];
        const val = parseInt(numStr.replace(/\./g, ''));
        if (val !== 2024 && val !== 2025 && val !== 2026 && val !== today.getFullYear()) {
          fallbackMatches.push(numStr);
        }
      }
      if (fallbackMatches.length > 0) {
        parsedAmountStr = fallbackMatches[0];
      }
    }

    if (parsedAmountStr) {
      monto = cleanNumberStr(parsedAmountStr);
    }

    const categoria = classifyCategory(text);
    const formaPago = classifyPaymentMethod(text);
    const fecha = parseGastoDate(text);
    const descripcion = cleanDescription(text);

    let observacion = '';
    const obsMatch = text.match(/\(([^)]+)\)/);
    if (obsMatch) {
      observacion = obsMatch[1];
    }

    return {
      fecha,
      categoria,
      descripcion,
      monto,
      currency: 'USD',
      formaPago,
      observacion
    };
  };

  // Save the missing field answer
  const handleConfirmMissingField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedGasto || !missingVal.trim()) return;

    const updated = { ...parsedGasto };

    if (missingField === 'monto') {
      const parsedMonto = cleanNumberStr(missingVal);
      if (isNaN(parsedMonto) || parsedMonto <= 0) {
        alert('Por favor ingrese un monto válido mayor a cero.');
        return;
      }
      updated.monto = parsedMonto;
      
      // Auto-detect currency based on answer size or text
      const lowerVal = missingVal.toLowerCase();
      if (lowerVal.includes('bs') || lowerVal.includes('bolivar') || parsedMonto >= 200) {
        updated.currency = 'VES';
      }
    } else if (missingField === 'descripcion') {
      updated.descripcion = missingVal.trim();
    }

    setParsedGasto(updated);
    setMissingField(null);
    setMissingVal('');

    // Re-validate if other field is missing
    if (updated.monto === null || isNaN(updated.monto) || updated.monto <= 0) {
      setMissingField('monto');
    } else if (!updated.descripcion || updated.descripcion.length < 2 || updated.descripcion === 'Gasto registrado') {
      setMissingField('descripcion');
    } else {
      setShowConfirm(true);
    }
  };

  // Submit and save the confirmed gasto
  const handleSaveGasto = async () => {
    if (!parsedGasto || !parsedGasto.monto) return;
    
    setIsSaving(true);
    try {
      // Calculate USD and Bs equivalents
      let amountUsd = 0;
      let amountBs = 0;

      if (parsedGasto.currency === 'VES') {
        amountBs = parsedGasto.monto;
        amountUsd = amountBs / bcvRate;
      } else {
        amountUsd = parsedGasto.monto;
        amountBs = amountUsd * bcvRate;
      }

      const cleanConcept = `[Gasto] [${parsedGasto.categoria}] ${parsedGasto.descripcion}`;
      const observationTag = parsedGasto.observacion.trim() ? ` (${parsedGasto.observacion.trim()})` : '';

      // Prepare date parameter
      const inputDate = new Date(parsedGasto.fecha + 'T12:00:00'); // mid day to avoid zone shift
      const isoCreatedAt = inputDate.toISOString();

      await dbService.addCashOp({
        type: 'egreso',
        concept: cleanConcept + observationTag,
        amount: amountUsd,
        amount_bs: amountBs,
        payment_method: parsedGasto.formaPago === 'No especificada' ? 'Efectivo USD' : parsedGasto.formaPago,
        category: parsedGasto.categoria,
        observation: parsedGasto.observacion,
        created_at: isoCreatedAt
      });

      setInputText('');
      setParsedGasto(null);
      setShowConfirm(false);
      onRefreshData();
      alert('¡Gasto registrado y guardado exitosamente en caja!');
    } catch (err: any) {
      console.error(err);
      alert(`Error al guardar gasto: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Query: Cuánto gasté este mes
  const handleQueryCuantoMes = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthlyExpenses = cashOps.filter((op: any) => {
      if (op.type !== 'egreso') return false;
      const opDate = op.created_at ? new Date(op.created_at) : new Date();
      return opDate.getMonth() === currentMonth && opDate.getFullYear() === currentYear;
    });

    const totalUsd = monthlyExpenses.reduce((sum, op) => sum + (Number(op.amount) || 0), 0);
    const totalBs = totalUsd * bcvRate;

    setQueryResponse({
      title: '¿Cuánto gasté este mes?',
      type: 'text',
      content: (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 font-bold leading-relaxed">
            Durante el mes actual de <span className="text-slate-900 font-extrabold capitalize">{today.toLocaleDateString('es-VE', { month: 'long' })}</span>, has registrado un total de <span className="text-slate-900 font-extrabold">{monthlyExpenses.length} gastos</span>.
          </p>
          <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-black text-rose-500 tracking-wider">Total Gastado (USD)</p>
              <p className="text-xl font-black text-rose-700 font-mono">${totalUsd.toFixed(2)} USD</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-black text-rose-500 tracking-wider">Equivalente (VES)</p>
              <p className="text-sm font-black text-rose-600 font-mono">Bs. {(totalBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      )
    });
  };

  // Query: En qué gasté más
  const handleQueryQueGasteMas = () => {
    // Group egresos
    const expenses = cashOps.filter((op: any) => op.type === 'egreso');
    const categoryTotals: Record<string, number> = {};

    expenses.forEach((op) => {
      // Extract category from either field or concept string parsing
      let cat = op.category;
      if (!cat && op.concept) {
        // Try parsing "[Gasto] [Category] ..."
        const match = op.concept.match(/\[Gasto\]\s*\[(.*?)\]/);
        if (match) {
          cat = match[1];
        } else {
          cat = classifyCategory(op.concept);
        }
      }
      cat = cat || 'Otros gastos';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(op.amount) || 0);
    });

    const sorted = Object.entries(categoryTotals)
      .map(([name, usd]) => ({ name, usd, bs: usd * bcvRate }))
      .sort((a, b) => b.usd - a.usd);

    if (sorted.length === 0) {
      setQueryResponse({
        title: '¿En qué gasté más?',
        type: 'text',
        content: <p className="text-xs text-gray-500 font-bold">Aún no hay gastos registrados para analizar categorías.</p>
      });
      return;
    }

    const highest = sorted[0];

    setQueryResponse({
      title: '¿En qué gasté más?',
      type: 'chart',
      content: (
        <div className="space-y-4">
          <p className="text-xs text-gray-600 font-bold">
            La categoría con mayor gasto acumulado es <span className="text-rose-700 font-black">{highest.name}</span> con un total de <span className="font-mono text-slate-900 font-black">${highest.usd.toFixed(2)} USD</span>.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {sorted.map((item, idx) => {
              const percentage = (item.usd / highest.usd) * 100;
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-gray-700">
                    <span className="truncate max-w-[180px]">{idx + 1}. {item.name}</span>
                    <span className="font-mono text-slate-900 font-black">${item.usd.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )
    });
  };

  // Query: Resumen Completo de Gastos
  const handleQueryResumenCompleto = () => {
    const todayStr = getTodayLocalDateStr();
    const today = new Date();
    
    // Day filter
    const dailyExpenses = cashOps.filter((op: any) => {
      if (op.type !== 'egreso') return false;
      const opDateStr = op.created_at ? op.created_at.split('T')[0] : '';
      return opDateStr === todayStr;
    });

    // Week filter (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const weeklyExpenses = cashOps.filter((op: any) => {
      if (op.type !== 'egreso') return false;
      const opDate = op.created_at ? new Date(op.created_at) : new Date();
      return opDate >= sevenDaysAgo && opDate <= today;
    });

    // Month filter (current calendar month)
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const monthlyExpenses = cashOps.filter((op: any) => {
      if (op.type !== 'egreso') return false;
      const opDate = op.created_at ? new Date(op.created_at) : new Date();
      return opDate.getMonth() === currentMonth && opDate.getFullYear() === currentYear;
    });

    // Category distribution
    const categoryCounts: Record<string, number> = {};
    const categoryTotals: Record<string, number> = {};
    monthlyExpenses.forEach((op) => {
      let cat = op.category;
      if (!cat && op.concept) {
        const match = op.concept.match(/\[Gasto\]\s*\[(.*?)\]/);
        cat = match ? match[1] : classifyCategory(op.concept);
      }
      cat = cat || 'Otros gastos';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(op.amount) || 0);
    });

    const dailySum = dailyExpenses.reduce((sum, op) => sum + (Number(op.amount) || 0), 0);
    const weeklySum = weeklyExpenses.reduce((sum, op) => sum + (Number(op.amount) || 0), 0);
    const monthlySum = monthlyExpenses.reduce((sum, op) => sum + (Number(op.amount) || 0), 0);

    setQueryResponse({
      title: 'Resumen Consolidado de Gastos',
      type: 'summary',
      content: (
        <div className="space-y-4 text-left">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 border border-gray-150 p-2.5 rounded-2xl text-center">
              <p className="text-[9px] uppercase font-black text-gray-400">Hoy</p>
              <p className="text-sm font-black text-rose-700 font-mono">${dailySum.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 font-bold">{dailyExpenses.length} op</p>
            </div>
            <div className="bg-gray-50 border border-gray-150 p-2.5 rounded-2xl text-center">
              <p className="text-[9px] uppercase font-black text-gray-400">7 Días</p>
              <p className="text-sm font-black text-rose-700 font-mono">${weeklySum.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 font-bold">{weeklyExpenses.length} op</p>
            </div>
            <div className="bg-gray-50 border border-gray-150 p-2.5 rounded-2xl text-center">
              <p className="text-[9px] uppercase font-black text-gray-400">Este Mes</p>
              <p className="text-sm font-black text-rose-700 font-mono">${monthlySum.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 font-bold">{monthlyExpenses.length} op</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Gastos de este mes por Categoría</p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {Object.entries(categoryTotals).length === 0 ? (
                <p className="text-xs text-gray-400 font-bold">No hay gastos en el mes actual.</p>
              ) : (
                Object.entries(categoryTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex items-center justify-between text-[11px] font-bold border-b border-gray-50 pb-1">
                      <span className="text-gray-600 font-medium">{cat} ({categoryCounts[cat]})</span>
                      <span className="font-mono text-slate-900">${amount.toFixed(2)} USD</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )
    });
  };

  const handleExampleClick = (example: string) => {
    setInputText(example);
  };

  return (
    <div id="gasto-assistant-card" className="bg-white border border-gray-150 rounded-3xl p-5 shadow-xs relative overflow-hidden">
      
      {/* Visual background element */}
      <div className="absolute right-0 top-0 -mr-6 -mt-6 w-24 h-24 bg-[#005da9]/5 rounded-full blur-xl pointer-events-none" />

      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-[#005da9]/10 rounded-xl shrink-0">
          <Sparkles className="w-5 h-5 text-[#005da9]" />
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-900 tracking-tight">Asistente Inteligente de Gastos & Consultas</h2>
          <p className="text-[10px] text-gray-400 font-bold">
            Registra gastos en lenguaje natural o consulta tus consumos con total facilidad.
          </p>
        </div>
      </div>

      {/* INPUT FORM */}
      <form onSubmit={handleProcessInput} className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ej: Ayer pagué $80.000 de luz en efectivo o ¿Cuánto gasté este mes?"
            className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:bg-white transition"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-slate-900 text-[#ffb700] rounded-xl hover:bg-slate-800 transition shadow-2xs cursor-pointer"
            title="Enviar"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* QUICK SUGGESTIONS */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        <span className="text-[9px] font-black uppercase text-gray-400 mr-1">Consultar:</span>
        <button
          type="button"
          onClick={handleQueryCuantoMes}
          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-[10px] font-black rounded-lg transition flex items-center gap-1 cursor-pointer"
        >
          <HelpCircle className="w-3 h-3 text-[#005da9]" />
          <span>¿Cuánto gasté este mes?</span>
        </button>
        <button
          type="button"
          onClick={handleQueryQueGasteMas}
          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-[10px] font-black rounded-lg transition flex items-center gap-1 cursor-pointer"
        >
          <PieChart className="w-3 h-3 text-[#005da9]" />
          <span>¿En qué gasté más?</span>
        </button>
        <button
          type="button"
          onClick={handleQueryResumenCompleto}
          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-[10px] font-black rounded-lg transition flex items-center gap-1 cursor-pointer"
        >
          <Info className="w-3 h-3 text-[#005da9]" />
          <span>Resumen de Gastos</span>
        </button>
      </div>

      {/* CLICKABLE EXAMPLES */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap border-t border-gray-100 pt-2.5">
        <span className="text-[9px] font-black uppercase text-gray-400 mr-1">Ejemplos:</span>
        <button
          type="button"
          onClick={() => handleExampleClick("Hoy pagué $80.000 de luz")}
          className="text-[10px] font-medium text-[#005da9] hover:underline cursor-pointer"
        >
          "Hoy pagué $80.000 de luz"
        </button>
        <span className="text-gray-300 text-xs">•</span>
        <button
          type="button"
          onClick={() => handleExampleClick("Pagamos $500.000 de arriendo con transferencia")}
          className="text-[10px] font-medium text-[#005da9] hover:underline cursor-pointer"
        >
          "Pagamos $500.000 de arriendo..."
        </button>
        <span className="text-gray-300 text-xs">•</span>
        <button
          type="button"
          onClick={() => handleExampleClick("Pago sueldo Juan $600.000 el 5 de mayo")}
          className="text-[10px] font-medium text-[#005da9] hover:underline cursor-pointer"
        >
          "Pago sueldo Juan..."
        </button>
      </div>

      {/* CONSOLE / RESPONSE PANEL */}
      {queryResponse && (
        <div id="assistant-response-panel" className="mt-4 bg-gray-50 border border-gray-200/80 rounded-2xl p-4 relative text-left">
          <button
            type="button"
            onClick={() => setQueryResponse(null)}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-150 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles className="w-4 h-4 text-[#005da9]" />
            <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">{queryResponse.title}</h4>
          </div>
          {queryResponse.content}
        </div>
      )}

      {/* MISSING INFO INTERACTIVE BOX */}
      {missingField && parsedGasto && (
        <div id="missing-field-panel" className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
          <div className="flex items-center gap-2 text-amber-800 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-black">Se requiere información complementaria</p>
          </div>
          <p className="text-xs text-gray-700 font-bold mb-3">
            {missingField === 'monto' 
              ? 'No logramos identificar el monto del gasto en tu frase. Por favor, indícanos la cantidad:' 
              : 'Por favor, especifica un concepto, descripción o detalle para este gasto:'}
          </p>
          <form onSubmit={handleConfirmMissingField} className="flex gap-2">
            <input
              type={missingField === 'monto' ? 'text' : 'text'}
              required
              value={missingVal}
              onChange={(e) => setMissingVal(e.target.value)}
              placeholder={missingField === 'monto' ? 'Ej: 80000' : 'Ej: Compra de bombillos, flete de insumos...'}
              className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl transition cursor-pointer"
            >
              Confirmar
            </button>
          </form>
        </div>
      )}

      {/* CONFIRMATION RESUMEN CARD */}
      {showConfirm && parsedGasto && (
        <div id="gasto-confirmation-modal" className="mt-4 bg-slate-900 text-white rounded-2xl p-4 text-left relative shadow-lg">
          <button
            type="button"
            onClick={() => {
              setShowConfirm(false);
              setParsedGasto(null);
            }}
            className="absolute right-3 top-3 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
            <div className="p-1 bg-[#ffb700]/20 rounded-lg">
              <Sparkles className="w-4 h-4 text-[#ffb700]" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white tracking-wider uppercase">Nuevo Gasto Detectado</h4>
              <p className="text-[9px] text-gray-300 font-medium">Confirme o modifique los valores antes de guardar.</p>
            </div>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Fecha input */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Fecha:</span>
              <input
                type="date"
                value={parsedGasto.fecha}
                onChange={(e) => setParsedGasto({ ...parsedGasto, fecha: e.target.value })}
                className="col-span-2 px-2 py-1 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700]"
              />
            </div>

            {/* Categoría select */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Categoría:</span>
              <select
                value={parsedGasto.categoria}
                onChange={(e) => setParsedGasto({ ...parsedGasto, categoria: e.target.value })}
                className="col-span-2 px-2 py-1 bg-slate-800 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700] cursor-pointer"
              >
                {GASTO_CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="bg-slate-900 text-white">{cat}</option>
                ))}
              </select>
            </div>

            {/* Descripción input */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Descripción:</span>
              <input
                type="text"
                value={parsedGasto.descripcion}
                onChange={(e) => setParsedGasto({ ...parsedGasto, descripcion: e.target.value })}
                className="col-span-2 px-2 py-1 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700]"
              />
            </div>

            {/* Monto input & currency toggle */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Monto:</span>
              <div className="col-span-2 grid grid-cols-3 gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={parsedGasto.monto || ''}
                  onChange={(e) => setParsedGasto({ ...parsedGasto, monto: parseFloat(e.target.value) || 0 })}
                  className="col-span-2 px-2 py-1 bg-white/10 border border-white/20 rounded-lg text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700]"
                />
                <select
                  value={parsedGasto.currency}
                  onChange={(e) => setParsedGasto({ ...parsedGasto, currency: e.target.value as any })}
                  className="px-1 py-1 bg-slate-800 border border-white/20 rounded-lg text-[10px] font-black text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700] cursor-pointer text-center"
                >
                  <option value="USD">USD $</option>
                  <option value="VES">VES Bs</option>
                </select>
              </div>
            </div>

            {/* Forma de pago select */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Forma Pago:</span>
              <select
                value={parsedGasto.formaPago}
                onChange={(e) => setParsedGasto({ ...parsedGasto, formaPago: e.target.value })}
                className="col-span-2 px-2 py-1 bg-slate-800 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700] cursor-pointer"
              >
                {GASTO_PAYMENT_METHODS.map(method => (
                  <option key={method} value={method} className="bg-slate-900 text-white">{method}</option>
                ))}
              </select>
            </div>

            {/* Observación input */}
            <div className="grid grid-cols-3 items-center gap-2">
              <span className="text-[10px] text-gray-400 font-black uppercase">Observación:</span>
              <input
                type="text"
                value={parsedGasto.observacion}
                onChange={(e) => setParsedGasto({ ...parsedGasto, observacion: e.target.value })}
                placeholder="Opcional..."
                className="col-span-2 px-2 py-1 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#ffb700]"
              />
            </div>
          </div>

          {/* Confirm footer */}
          <div className="mt-5 border-t border-white/10 pt-3.5 flex items-center justify-between">
            <span className="text-[11px] text-[#ffb700] font-black">¿Quieres guardar este gasto?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setParsedGasto(null);
                }}
                className="px-3 py-1.5 border border-white/20 rounded-xl text-white font-black text-[10px] hover:bg-white/10 transition cursor-pointer"
              >
                No, cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveGasto}
                disabled={isSaving}
                className="px-3.5 py-1.5 bg-[#ffb700] text-slate-950 font-black text-[10px] rounded-xl hover:bg-[#ffc533] transition flex items-center gap-1 cursor-pointer shadow-md"
              >
                {isSaving ? <RefreshCw className="w-3 h-3 animate-spin text-slate-950" /> : <Check className="w-3.5 h-3.5 text-slate-950" />}
                <span>Sí, registrar</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
