import React from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
  Eye,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';
import { UnifiedSaleTransaction } from '../SalesReportPage';

interface SalesLibroVentasTabProps {
  filteredTransactions: UnifiedSaleTransaction[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  typeFilter: 'all' | 'factura' | 'nota_entrega' | 'pedido_online' | 'credito';
  setTypeFilter: (type: any) => void;
  bankFilter: string;
  setBankFilter: (bank: string) => void;
  bankAccountsList: { id: string; name: string }[];
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  sortOrder: 'desc' | 'asc';
  setSortOrder: React.Dispatch<React.SetStateAction<'desc' | 'asc'>>;
  copiedCode: string | null;
  copyToClipboard: (text: string) => void;
  onSelectTransaction: (tx: UnifiedSaleTransaction) => void;
  metrics: {
    totalUsd: number;
    totalVes: number;
  };
}

export default function SalesLibroVentasTab({
  filteredTransactions,
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  bankFilter,
  setBankFilter,
  bankAccountsList,
  statusFilter,
  setStatusFilter,
  sortOrder,
  setSortOrder,
  copiedCode,
  copyToClipboard,
  onSelectTransaction,
  metrics
}: SalesLibroVentasTabProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Table Filter Controls */}
      <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por N° control, cliente, RIF, producto o cuenta..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1D3557] focus:ring-1 focus:ring-[#1D3557]"
            />
          </div>

          {/* Document Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1D3557] cursor-pointer"
          >
            <option value="all">Todos los documentos</option>
            <option value="factura">Solo Facturas</option>
            <option value="nota_entrega">Solo Notas de Entrega</option>
            <option value="pedido_online">Solo Pedidos Online</option>
          </select>

          {/* Bank Account Filter */}
          <select
            value={bankFilter}
            onChange={e => setBankFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1D3557] cursor-pointer max-w-[200px]"
          >
            <option value="all">Todas las cuentas bancarias</option>
            {bankAccountsList.map(b => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1D3557] cursor-pointer"
          >
            <option value="all">Todos los estados</option>
            <option value="completed">Completados / Facturados</option>
            <option value="pending">Pendientes</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto text-xs text-slate-500 font-medium">
          <span>Mostrando <strong>{filteredTransactions.length}</strong> operaciones</span>
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
            title="Cambiar orden de fecha"
          >
            {sortOrder === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            {sortOrder === 'desc' ? 'Recientes primero' : 'Antiguos primero'}
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
              <th className="py-3 px-4">Fecha / Hora</th>
              <th className="py-3 px-4">N° Comprobante</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Cliente</th>
              <th className="py-3 px-4">Cuenta(s) Destino / Método</th>
              <th className="py-3 px-4 text-right">Tasa BCV</th>
              <th className="py-3 px-4 text-right">Total ($ USD)</th>
              <th className="py-3 px-4 text-right">Total (Bs. VES)</th>
              <th className="py-3 px-4 text-center">Estado</th>
              <th className="py-3 px-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Receipt className="w-8 h-8 text-slate-300" />
                    <p>No se encontraron operaciones de venta en el rango o filtros seleccionados.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTransactions.map(tx => {
                const isNota = tx.sourceType === 'nota_entrega';

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* 1. Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">
                          {new Date(tx.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(tx.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>

                    {/* 2. Control Number */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">{tx.controlNumber}</span>
                        <button
                          onClick={() => copyToClipboard(tx.controlNumber)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity p-0.5 cursor-pointer"
                          title="Copiar número"
                        >
                          {copiedCode === tx.controlNumber ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>

                    {/* 3. Type Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        tx.sourceType === 'factura'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : isNota
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {tx.sourceType === 'factura' ? (
                          <>🧾 Factura</>
                        ) : isNota ? (
                          <>🚚 Nota Entrega</>
                        ) : (
                          <>🌐 Pedido Web</>
                        )}
                      </span>
                    </td>

                    {/* 4. Customer */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col max-w-[180px]">
                        <span className="font-bold text-slate-900 truncate" title={tx.customerName}>
                          {tx.customerName}
                        </span>
                        {tx.customerRif ? (
                          <span className="text-[10px] text-slate-400 font-mono">{tx.customerRif}</span>
                        ) : tx.customerPhone ? (
                          <span className="text-[10px] text-slate-400">{tx.customerPhone}</span>
                        ) : null}
                      </div>
                    </td>

                    {/* 5. Bank Account Allocations */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 max-w-[220px]">
                        {tx.bankAccountAllocations.map((alloc, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700 truncate mr-1.5" title={alloc.bankAccountName}>
                              {alloc.bankAccountName}
                            </span>
                            <span className="font-mono text-slate-900 whitespace-nowrap font-bold">
                              {alloc.currency === 'VES' ? `Bs. ${alloc.amount.toLocaleString('es-VE')}` : `$${alloc.amount.toFixed(2)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* 6. BCV Rate */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono text-slate-500 font-medium">
                      {tx.bcvRate.toFixed(2)}
                    </td>

                    {/* 7. Total USD */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold text-slate-900 text-sm">
                      ${tx.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* 8. Total VES */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold text-[#1D3557] font-mono text-xs">
                      Bs. {tx.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* 9. Status */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ['completado', 'facturado', 'entregado', 'pagado', 'aprobado'].includes((tx.status || '').toLowerCase())
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {tx.status}
                      </span>
                    </td>

                    {/* 10. Actions */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => onSelectTransaction(tx)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#1D3557] text-slate-700 hover:text-white transition-all text-xs font-bold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer Summary Row */}
          {filteredTransactions.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 border-t-2 border-slate-300 text-xs font-black text-slate-900">
                <td colSpan={6} className="py-3.5 px-4 text-right uppercase tracking-wider">
                  Totales del período ({filteredTransactions.length} operaciones):
                </td>
                <td className="py-3.5 px-4 text-right text-sm text-slate-900">
                  ${metrics.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right text-xs font-mono text-[#1D3557]">
                  Bs. {metrics.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
