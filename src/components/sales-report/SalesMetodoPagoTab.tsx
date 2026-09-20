import React from 'react';
import {
  Coins,
  CreditCard,
  Wallet,
  DollarSign,
  ArrowUpRight
} from 'lucide-react';
import { BankAccountSummary } from '../SalesReportPage';

interface SalesMetodoPagoTabProps {
  bankAccountsSummary: BankAccountSummary[];
  bankAccountsTotals: {
    totalUsd: number;
    totalVes: number;
    totalCount: number;
    totalNativeVes: number;
    totalNativeUsd: number;
  };
  bankFilter: string;
  setBankFilter: (bank: string) => void;
}

export default function SalesMetodoPagoTab({
  bankAccountsSummary,
  bankAccountsTotals,
  bankFilter,
  setBankFilter
}: SalesMetodoPagoTabProps) {
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* CLASIFICACIÓN DE INGRESOS POR CUENTAS BANCARIAS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Active Filter Clear Bar (if filter active) */}
        {bankFilter !== 'all' && (
          <div className="p-3 px-4 border-b border-slate-100 bg-amber-50/60 flex items-center justify-between text-xs font-medium text-amber-900">
            <span>Filtro activo: <strong>{bankFilter}</strong></span>
            <button
              onClick={() => setBankFilter('all')}
              className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Mostrar todas las cuentas
            </button>
          </div>
        )}

        {/* Bank Accounts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4">Cuenta Bancaria</th>
                <th className="py-3 px-3 text-center">Moneda</th>
                <th className="py-3 px-4 text-right">Recaudado (Moneda Nativa)</th>
                <th className="py-3 px-4 text-right">Equivalente USD ($)</th>
                <th className="py-3 px-4 text-right">Equivalente VES (Bs.)</th>
                <th className="py-3 px-3 text-center">N° Operaciones</th>
                <th className="py-3 px-4 text-right">% Participación</th>
                <th className="py-3 px-3 text-center">Filtro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {bankAccountsSummary.map(account => {
                const isSelected = bankFilter === account.name;
                const isVES = account.currency === 'VES';

                return (
                  <tr
                    key={account.id}
                    onClick={() => setBankFilter(isSelected ? 'all' : account.name)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-[#1D3557]'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Account Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isVES ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isVES ? 'Bs' : '$'}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block leading-tight">
                            {account.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {account.bankName || (account.isCash ? 'Caja de Efectivo' : 'Cuenta de Depósito')}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Currency Badge */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isVES ? 'bg-amber-100/80 text-amber-800 border border-amber-200/60' : 'bg-emerald-100/80 text-emerald-800 border border-emerald-200/60'
                      }`}>
                        {account.currency}
                      </span>
                    </td>

                    {/* Native Collected Total */}
                    <td className="py-3 px-4 text-right font-black text-slate-900 font-mono">
                      {isVES
                        ? `Bs. ${account.nativeTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : `$${account.nativeTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>

                    {/* USD Equivalent */}
                    <td className="py-3 px-4 text-right font-bold text-slate-800 font-mono">
                      ${account.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* VES Equivalent */}
                    <td className="py-3 px-4 text-right font-medium text-slate-600 font-mono">
                      Bs. {account.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Transaction Count */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        account.count > 0 ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                      }`}>
                        {account.count}
                      </span>
                    </td>

                    {/* Percentage Share */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${isVES ? 'bg-amber-500' : 'bg-[#1D3557]'}`}
                            style={{ width: `${Math.min(100, Math.max(0, account.percentage))}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-700 text-xs w-12 text-right">
                          {account.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    {/* Filter Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBankFilter(isSelected ? 'all' : account.name);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#1D3557] text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isSelected ? 'Activo' : 'Filtrar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* TOTALIZATION FOOTER (Dark Bar) */}
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950">
                <td className="py-3.5 px-4 font-black tracking-wide">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <span>TOTAL GENERAL RECAUDADO</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center text-slate-400 font-mono">—</td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                  {bankAccountsTotals.totalNativeUsd > 0 && bankAccountsTotals.totalNativeVes > 0 ? (
                    <div className="text-[11px] leading-tight">
                      <div>${bankAccountsTotals.totalNativeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-amber-200 font-normal">Bs. {bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  ) : bankAccountsTotals.totalNativeUsd > 0 ? (
                    `$${bankAccountsTotals.totalNativeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    `Bs. ${bankAccountsTotals.totalNativeVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-400 text-sm">
                  ${bankAccountsTotals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                  Bs. {bankAccountsTotals.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-3 text-center font-mono text-white text-xs">
                  {bankAccountsTotals.totalCount} ops
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                  100.0%
                </td>
                <td className="py-3.5 px-3 text-center">
                  {bankFilter !== 'all' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBankFilter('all');
                      }}
                      className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded cursor-pointer transition-colors"
                      title="Quitar filtro de cuenta"
                    >
                      Todos
                    </button>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
