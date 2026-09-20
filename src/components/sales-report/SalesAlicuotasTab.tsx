import React from 'react';
import {
  TrendingUp,
  Percent,
  Receipt,
  Search,
  Eye,
  ShieldCheck,
  DollarSign,
  Coins
} from 'lucide-react';
import { UnifiedSaleTransaction } from '../SalesReportPage';

interface SalesAlicuotasTabProps {
  taxSummary: {
    baseExentaUsd: number;
    baseExentaVes: number;
    baseGravada16Usd: number;
    debitoIva16Usd: number;
    baseGravada16Ves: number;
    debitoIva16Ves: number;
    baseIgtf3Usd: number;
    debitoIgtf3Usd: number;
    baseIgtf3Ves: number;
    debitoIgtf3Ves: number;
    totalVentasUsd: number;
    totalVentasVes: number;
    opsExentasCount: number;
    opsGravadasCount: number;
    opsIgtfCount: number;
    pctExenta: number;
    pctGravada16: number;
    pctIgtf: number;
  };
  taxFilteredTransactions: UnifiedSaleTransaction[];
  taxFilter: 'all' | 'gravadas' | 'exentas' | 'con_igtf';
  setTaxFilter: (filter: 'all' | 'gravadas' | 'exentas' | 'con_igtf') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelectTransaction: (tx: UnifiedSaleTransaction) => void;
}

export default function SalesAlicuotasTab({
  taxSummary,
  taxFilteredTransactions,
  taxFilter,
  setTaxFilter,
  searchTerm,
  setSearchTerm,
  onSelectTransaction
}: SalesAlicuotasTabProps) {
  // Filter detailed tax transactions by search term as well
  const displayedTx = taxFilteredTransactions.filter(tx => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      tx.controlNumber.toLowerCase().includes(term) ||
      tx.customerName.toLowerCase().includes(term) ||
      (tx.customerRif && tx.customerRif.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP TAX METRICS (SENIAT FISCAL SUMMARY) */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ventas Exentas (0%) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ventas Exentas / Exoneradas (0%)</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">
              E-0%
            </span>
          </div>
          <h3 className="text-2xl font-black text-slate-900 mt-2 font-mono">
            ${taxSummary.baseExentaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-[#1D3557] font-semibold font-mono mt-0.5">
            Bs. {taxSummary.baseExentaVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{taxSummary.opsExentasCount} operaciones</span>
            <span className="font-bold text-slate-700">{taxSummary.pctExenta.toFixed(1)}% del total</span>
          </div>
        </div>

        {/* Card 2: Base Imponible Gravada (16%) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Base Imponible Gravada (16%)</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-200">
              G-16%
            </span>
          </div>
          <h3 className="text-2xl font-black text-slate-900 mt-2 font-mono">
            ${taxSummary.baseGravada16Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-[#1D3557] font-semibold font-mono mt-0.5">
            Bs. {taxSummary.baseGravada16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{taxSummary.opsGravadasCount} operaciones gravadas</span>
            <span className="font-bold text-blue-700">Base Fiscal</span>
          </div>
        </div>

        {/* Card 3: Débito Fiscal IVA 16% */}
        <div className="bg-white rounded-2xl p-5 border border-amber-200/80 bg-gradient-to-br from-amber-50/40 to-white shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Débito Fiscal IVA (16%)</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300">
              IVA
            </span>
          </div>
          <h3 className="text-2xl font-black text-amber-900 mt-2 font-mono">
            ${taxSummary.debitoIva16Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-amber-800 font-semibold font-mono mt-0.5">
            Bs. {taxSummary.debitoIva16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 pt-2.5 border-t border-amber-100/80 flex items-center justify-between text-xs text-amber-700">
            <span>Impuesto recaudado</span>
            <span className="font-bold">Débito a declarar</span>
          </div>
        </div>

        {/* Card 4: IGTF Percibido (3%) */}
        <div className="bg-white rounded-2xl p-5 border border-purple-200/80 bg-gradient-to-br from-purple-50/40 to-white shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">IGTF Percibido (3%)</span>
            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 text-[10px] font-black border border-purple-300">
              IGTF-3%
            </span>
          </div>
          <h3 className="text-2xl font-black text-purple-900 mt-2 font-mono">
            ${taxSummary.debitoIgtf3Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-purple-800 font-semibold font-mono mt-0.5">
            Bs. {taxSummary.debitoIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 pt-2.5 border-t border-purple-100/80 flex items-center justify-between text-xs text-purple-700">
            <span>Base: ${taxSummary.baseIgtf3Usd.toFixed(2)}</span>
            <span className="font-bold">{taxSummary.opsIgtfCount} cobros</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. CONSOLIDATED FISCAL TAX TABLE */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 md:px-6 md:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black text-[#1D3557]">
                Resumen Consolidado de Alícuotas de Ventas (Forma Fiscal)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Desglose oficial de bases imponibles y débitos fiscales según normativa tributaria
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              SENIAT Compatible
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4">Alícuota / Concepto</th>
                <th className="py-3 px-3 text-center">Tipo / %</th>
                <th className="py-3 px-4 text-right">Base Imponible ($ USD)</th>
                <th className="py-3 px-4 text-right">Base Imponible (Bs. VES)</th>
                <th className="py-3 px-4 text-right">Débito Fiscal ($ USD)</th>
                <th className="py-3 px-4 text-right">Débito Fiscal (Bs. VES)</th>
                <th className="py-3 px-4 text-right">Total Facturado ($ USD)</th>
                <th className="py-3 px-3 text-center">N° Ops</th>
                <th className="py-3 px-4 text-right">% Participación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {/* Row 1: Alícuota General 16% */}
              <tr className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <span>Ventas Internas Gravadas por Alícuota General</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-black text-[10px]">
                    16.00%
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                  ${taxSummary.baseGravada16Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                  Bs. {taxSummary.baseGravada16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-700">
                  ${taxSummary.debitoIva16Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-700 font-semibold">
                  Bs. {taxSummary.debitoIva16Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                  ${(taxSummary.baseGravada16Usd + taxSummary.debitoIva16Usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                  {taxSummary.opsGravadasCount}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                  {taxSummary.pctGravada16.toFixed(1)}%
                </td>
              </tr>

              {/* Row 2: Ventas Exentas / Exoneradas (0%) */}
              <tr className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                    <span>Ventas Internas No Sujetas / Exentas / Exoneradas</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-black text-[10px]">
                    0.00%
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                  ${taxSummary.baseExentaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                  Bs. {taxSummary.baseExentaVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                  $0.00
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                  Bs. 0,00
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                  ${taxSummary.baseExentaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                  {taxSummary.opsExentasCount}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                  {taxSummary.pctExenta.toFixed(1)}%
                </td>
              </tr>

              {/* Row 3: IGTF Percibido 3% */}
              <tr className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    <span>Impuesto a las Grandes Transacciones Financieras (IGTF)</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-black text-[10px]">
                    3.00%
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                  ${taxSummary.baseIgtf3Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                  Bs. {taxSummary.baseIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-purple-700">
                  ${taxSummary.debitoIgtf3Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-purple-700 font-semibold">
                  Bs. {taxSummary.debitoIgtf3Ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                  ${taxSummary.debitoIgtf3Usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                  {taxSummary.opsIgtfCount}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                  {taxSummary.pctIgtf.toFixed(1)}%
                </td>
              </tr>
            </tbody>

            {/* Dark Total Footer */}
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>TOTAL GENERAL BASES E IMPUESTOS</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center text-slate-400 font-mono">—</td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                  ${(taxSummary.baseGravada16Usd + taxSummary.baseExentaUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                  Bs. {(taxSummary.baseGravada16Ves + taxSummary.baseExentaVes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                  ${(taxSummary.debitoIva16Usd + taxSummary.debitoIgtf3Usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                  Bs. {(taxSummary.debitoIva16Ves + taxSummary.debitoIgtf3Ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-white text-sm">
                  ${taxSummary.totalVentasUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-3 text-center font-mono text-white">
                  {taxSummary.opsGravadasCount + taxSummary.opsExentasCount}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                  100.0%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. DETAILED FISCAL TAX LEDGER (VOUCHER BY VOUCHER) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[240px] flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por N° comprobante, cliente o RIF..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1D3557]"
              />
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => setTaxFilter('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  taxFilter === 'all' ? 'bg-[#1D3557] text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todas ({taxFilteredTransactions.length})
              </button>
              <button
                onClick={() => setTaxFilter('gravadas')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  taxFilter === 'gravadas' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Con IVA (16%)
              </button>
              <button
                onClick={() => setTaxFilter('exentas')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  taxFilter === 'exentas' ? 'bg-slate-700 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Solo Exentas
              </button>
              <button
                onClick={() => setTaxFilter('con_igtf')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  taxFilter === 'con_igtf' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Con IGTF (3%)
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Mostrando <strong>{displayedTx.length}</strong> comprobantes fiscales
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">N° Comprobante</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Cliente / RIF</th>
                <th className="py-3 px-4 text-right">Venta Exenta ($)</th>
                <th className="py-3 px-4 text-right">Base Gravada 16% ($)</th>
                <th className="py-3 px-4 text-right">IVA 16% ($)</th>
                <th className="py-3 px-4 text-right">IGTF 3% ($)</th>
                <th className="py-3 px-4 text-right">Total ($ USD)</th>
                <th className="py-3 px-4 text-right">Total (Bs. VES)</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedTx.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400 font-medium">
                    No se encontraron registros fiscales para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                displayedTx.map(tx => {
                  const txIva = Number(tx.iva) || 0;
                  const txIgtf = Number(tx.igtf) || 0;
                  const txSubtotal = Number(tx.subtotal) || (tx.totalUsd - txIva - txIgtf);
                  const gravada = txIva > 0 ? Math.min(txSubtotal, txIva / 0.16) : 0;
                  const exenta = txIva > 0 ? Math.max(0, txSubtotal - gravada) : txSubtotal;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {new Date(tx.date).toLocaleDateString('es-VE')}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {tx.controlNumber}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          tx.sourceType === 'factura'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {tx.sourceType === 'factura' ? 'Factura' : 'Nota'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col max-w-[160px]">
                          <span className="font-bold text-slate-900 truncate">{tx.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{tx.customerRif || 'S/R'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 font-medium">
                        ${exenta.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                        ${gravada.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                        ${txIva.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-purple-700">
                        ${txIgtf.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        ${tx.totalUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#1D3557]">
                        Bs. {tx.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onSelectTransaction(tx)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-[#1D3557] text-slate-700 hover:text-white transition-colors text-[11px] font-bold cursor-pointer"
                        >
                          <Eye className="w-3 h-3 inline mr-1" />
                          Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
