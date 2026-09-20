import React, { useState, useEffect } from 'react';
import { X, Printer, CheckCircle, AlertTriangle, User, Clock, Wallet, FileText, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { formatCurrency } from '../lib/currency';
import { dbService } from '../lib/supabase';
import { BusinessProfile } from '../types';

interface ClosureTicketModalProps {
  session: any;
  sessionOps: any[];
  bcvRate: number;
  onClose: () => void;
}

export default function ClosureTicketModal({
  session,
  sessionOps,
  bcvRate,
  onClose
}: ClosureTicketModalProps) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);

  useEffect(() => {
    dbService.getBusinessProfile().then(p => {
      if (p) setProfile(p);
    }).catch(() => {});
  }, []);

  if (!session) return null;

  // Filter ops for this session
  const ops = sessionOps.filter((op: any) => op.session_id === session.id);

  // Initial base
  const baseBs = Number(session.apertura_bs || 0);
  const baseUsd = Number(session.apertura_usd || (baseBs / (bcvRate || 1)));

  // Separate ingress / egress
  const ingressOps = ops.filter((op: any) => op.type === 'ingreso' && op.concept !== 'Apertura de Caja - Fondo Inicial');
  const egressOps = ops.filter((op: any) => op.type === 'egreso' && op.concept !== 'Cierre de Caja - Entrega de Efectivo (Arqueo)');

  // Methods breakdown
  const methodTotals: Record<string, { bs: number; usd: number; count: number }> = {
    'Efectivo VES': { bs: 0, usd: 0, count: 0 },
    'Efectivo USD': { bs: 0, usd: 0, count: 0 },
    'Pago Móvil': { bs: 0, usd: 0, count: 0 },
    'Transferencia': { bs: 0, usd: 0, count: 0 },
    'Zelle / Digital': { bs: 0, usd: 0, count: 0 },
    'Punto de Venta / Tarjeta': { bs: 0, usd: 0, count: 0 },
    'Otros': { bs: 0, usd: 0, count: 0 }
  };

  ingressOps.forEach((op: any) => {
    const rawMethod = (op.payment_method || 'Efectivo VES').toLowerCase();
    let key = 'Otros';
    if (rawMethod.includes('ves') || rawMethod.includes('bs') || (rawMethod.includes('efectivo') && !rawMethod.includes('usd'))) {
      key = 'Efectivo VES';
    } else if (rawMethod.includes('usd') || rawMethod.includes('dolar') || rawMethod.includes('dólar')) {
      key = 'Efectivo USD';
    } else if (rawMethod.includes('movil') || rawMethod.includes('móvil') || rawMethod.includes('pago movil')) {
      key = 'Pago Móvil';
    } else if (rawMethod.includes('transfer')) {
      key = 'Transferencia';
    } else if (rawMethod.includes('zelle') || rawMethod.includes('paypal') || rawMethod.includes('binance')) {
      key = 'Zelle / Digital';
    } else if (rawMethod.includes('punto') || rawMethod.includes('tarjeta') || rawMethod.includes('debito')) {
      key = 'Punto de Venta / Tarjeta';
    }

    const bs = Number(op.amount_bs || (op.amount * bcvRate) || 0);
    const usd = Number(op.amount || (bs / bcvRate) || 0);

    methodTotals[key].bs += bs;
    methodTotals[key].usd += usd;
    methodTotals[key].count += 1;
  });

  const totalIngressBs = ingressOps.reduce((acc: number, op: any) => acc + Number(op.amount_bs || op.amount * bcvRate || 0), 0);
  const totalIngressUsd = ingressOps.reduce((acc: number, op: any) => acc + Number(op.amount || op.amount_bs / bcvRate || 0), 0);

  const totalEgressBs = egressOps.reduce((acc: number, op: any) => acc + Number(op.amount_bs || op.amount * bcvRate || 0), 0);
  const totalEgressUsd = egressOps.reduce((acc: number, op: any) => acc + Number(op.amount || op.amount_bs / bcvRate || 0), 0);

  // Cash theoretical (Efectivo VES + Base Bs - Egresos Efectivo Bs)
  const cashEgressBs = egressOps.reduce((acc: number, op: any) => {
    const m = (op.payment_method || '').toLowerCase();
    if (m.includes('ves') || m.includes('bs') || m.includes('efectivo') || !m) {
      return acc + Number(op.amount_bs || op.amount * bcvRate || 0);
    }
    return acc;
  }, 0);

  const cashEgressUsd = egressOps.reduce((acc: number, op: any) => {
    const m = (op.payment_method || '').toLowerCase();
    if (m.includes('usd') || m.includes('dolar') || m.includes('dólar')) {
      return acc + Number(op.amount || op.amount_bs / bcvRate || 0);
    }
    return acc;
  }, 0);

  const cashIngressBs = methodTotals['Efectivo VES'].bs;
  const cashIngressUsd = methodTotals['Efectivo USD'].usd;

  const esperadoBs = session.esperado_bs !== undefined && session.esperado_bs !== null
    ? Number(session.esperado_bs)
    : (baseBs + cashIngressBs - cashEgressBs);

  const esperadoUsd = session.esperado_usd !== undefined && session.esperado_usd !== null
    ? Number(session.esperado_usd)
    : (baseUsd + cashIngressUsd - cashEgressUsd);

  const realBs = session.cierre_bs !== null && session.cierre_bs !== undefined ? Number(session.cierre_bs) : null;
  const realUsd = session.cierre_usd !== null && session.cierre_usd !== undefined ? Number(session.cierre_usd) : null;

  const difBs = realBs !== null ? (realBs - esperadoBs) : null;

  let estadoTexto = 'Caja Abierta';
  let estadoBg = 'bg-blue-50 text-blue-700 border-blue-200';
  if (session.estado === 'cerrada') {
    if (difBs === null || Math.abs(difBs) < 0.01) {
      estadoTexto = '🟢 CAJA COMPLETA / CUADRADA';
      estadoBg = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    } else if (difBs > 0) {
      estadoTexto = `🔵 DESCUADRE: SOBRANTE DE +${difBs.toFixed(2)} Bs`;
      estadoBg = 'bg-blue-50 text-blue-800 border-blue-300';
    } else {
      estadoTexto = `🔴 DESCUADRE: FALTANTE DE ${difBs.toFixed(2)} Bs`;
      estadoBg = 'bg-rose-50 text-rose-800 border-rose-300';
    }
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto print:bg-white print:p-0">
      <div id="print-ticket-area" className="printable-area bg-white rounded-3xl border border-gray-100 w-full max-w-md shadow-2xl overflow-hidden relative text-left my-8 print:shadow-none print:border-none print:w-full print:max-w-none print:my-0">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileText className="w-5 h-5 text-[#ffb700]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">
                Comprobante de Arqueo y Cierre
              </h3>
              <p className="text-[10px] text-gray-300 font-medium">
                Turno #{session.id.slice(0, 8)} - {session.empleado_nombre || 'Cajero'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PRINTABLE TICKET CONTENT */}
        <div className="p-6 space-y-5 text-gray-800 print:p-0">
          
          {/* Header Comercio */}
          <div className="text-center pb-4 border-b border-dashed border-gray-300">
            <h2 className="text-lg font-black uppercase tracking-tight text-[#005da9]">
              {profile?.name || 'Copias Bellavista'}
            </h2>
            {profile?.rif && (
              <p className="text-[10px] font-mono text-gray-500">RIF: {profile.rif}</p>
            )}
            <p className="text-[11px] font-bold text-gray-500 uppercase">
              Control de Turno, Caja y Arqueo
            </p>
            {profile?.address && (
              <p className="text-[9px] text-gray-400 max-w-xs mx-auto leading-tight mt-0.5">{profile.address}</p>
            )}
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">
              Ref Sesión: {session.id}
            </p>
          </div>

          {/* Empleado e Info Turno */}
          <div className="bg-gray-50 rounded-2xl p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-bold flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[#005da9]" /> Empleado Responsable:
              </span>
              <span className="font-extrabold text-gray-900">
                {session.empleado_nombre || 'Cajero de Turno'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-600" /> Hora Apertura:
              </span>
              <span className="font-mono font-bold text-gray-800">
                {session.apertura || '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-rose-600" /> Hora Cierre:
              </span>
              <span className="font-mono font-bold text-gray-800">
                {session.cierre || 'En Curso'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-gray-200/80">
              <span className="text-gray-500 font-bold">Fondo Base Inicial:</span>
              <span className="font-mono font-black text-gray-900">
                {baseBs.toFixed(2)} Bs (${baseUsd.toFixed(2)} USD)
              </span>
            </div>
          </div>

          {/* Desglose por Métodos de Pago */}
          <div>
            <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-600 mb-2 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-[#005da9]" /> Desglose por Métodos de Pago (Ingresos)
            </h4>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 text-xs">
              {Object.entries(methodTotals).map(([method, val]) => {
                if (val.bs === 0 && val.usd === 0) return null;
                return (
                  <div key={method} className="flex justify-between items-center p-2.5 hover:bg-gray-50/50">
                    <span className="font-bold text-gray-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#005da9]" />
                      {method} <span className="text-[10px] text-gray-400 font-normal">({val.count} ops)</span>
                    </span>
                    <span className="font-mono font-extrabold text-gray-900">
                      {val.bs.toFixed(2)} Bs <span className="text-gray-400 font-normal">(${val.usd.toFixed(2)})</span>
                    </span>
                  </div>
                );
              })}
              {ingressOps.length === 0 && (
                <div className="p-3 text-center text-gray-400 font-medium text-xs">
                  Sin ventas registradas en este turno
                </div>
              )}
            </div>
          </div>

          {/* Resumen Totales del Arqueo */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center text-gray-300">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <ArrowUpRight className="w-3.5 h-3.5" /> Total Ingresos:
              </span>
              <span className="font-bold text-emerald-300">
                +{totalIngressBs.toFixed(2)} Bs (+${totalIngressUsd.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between items-center text-gray-300">
              <span className="flex items-center gap-1 text-rose-400 font-bold">
                <ArrowDownLeft className="w-3.5 h-3.5" /> Total Egresos / Gastos:
              </span>
              <span className="font-bold text-rose-300">
                -{totalEgressBs.toFixed(2)} Bs (-${totalEgressUsd.toFixed(2)})
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-black">
              <span className="text-[#ffb700]">Saldo Esperado en Caja:</span>
              <span className="text-[#ffb700]">
                {esperadoBs.toFixed(2)} Bs (${esperadoUsd.toFixed(2)})
              </span>
            </div>
            {realBs !== null && (
              <div className="flex justify-between items-center text-sm font-black text-white pt-1">
                <span>Efectivo Real Contado:</span>
                <span className="text-white">
                  {realBs.toFixed(2)} Bs (${realUsd?.toFixed(2) || '0.00'})
                </span>
              </div>
            )}
          </div>

          {/* Estado de Cuadre / Discrepancia */}
          {session.estado === 'cerrada' && (
            <div className={`p-3.5 rounded-2xl border text-xs font-black uppercase text-center ${estadoBg}`}>
              {estadoTexto}
            </div>
          )}

          {/* Observaciones / Nota de Aclaración */}
          {session.observaciones && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-xs">
              <span className="font-black text-amber-900 block mb-0.5 uppercase text-[10px]">
                Aclaración / Observaciones de Cierre:
              </span>
              <p className="text-amber-800 font-medium italic">
                "{session.observaciones}"
              </p>
            </div>
          )}

          {/* Firma / Validación */}
          <div className="pt-6 pb-2 grid grid-cols-2 gap-4 text-center text-[10px] text-gray-500 uppercase font-bold border-t border-dashed border-gray-300 mt-4">
            <div className="space-y-8">
              <div className="border-b border-gray-400 w-3/4 mx-auto" />
              <span>Firma Cajero Responsable</span>
            </div>
            <div className="space-y-8">
              <div className="border-b border-gray-400 w-3/4 mx-auto" />
              <span>Firma Supervisión / Administración</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 print:hidden">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-50 transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-[#005da9] hover:bg-[#004a87] text-white font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#ffb700]" />
              <span>Imprimir Ticket</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
