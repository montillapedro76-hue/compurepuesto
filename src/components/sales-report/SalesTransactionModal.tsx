import React from 'react';
import { Receipt, Building2 } from 'lucide-react';
import { UnifiedSaleTransaction } from '../SalesReportPage';

interface SalesTransactionModalProps {
  transaction: UnifiedSaleTransaction | null;
  onClose: () => void;
}

export default function SalesTransactionModal({ transaction, onClose }: SalesTransactionModalProps) {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1D3557] text-white flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Detalle de Venta #{transaction.controlNumber}
              </h3>
              <p className="text-xs text-slate-500">
                {new Date(transaction.date).toLocaleString('es-VE')} &bull; Registrado por {transaction.createdBy || 'Sistema'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5">
          {/* Client & Metadata Info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl text-xs">
            <div>
              <span className="text-slate-400 font-semibold block">Cliente</span>
              <span className="font-bold text-slate-900">{transaction.customerName}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Identificación / RIF</span>
              <span className="font-mono text-slate-800">{transaction.customerRif || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Teléfono / Contacto</span>
              <span className="font-mono text-slate-800">{transaction.customerPhone || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Tipo de Operación</span>
              <span className="font-bold uppercase text-[#1D3557]">{transaction.sourceType.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Tasa BCV Aplicada</span>
              <span className="font-mono text-slate-800">{transaction.bcvRate.toFixed(2)} Bs/$</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block">Estado</span>
              <span className="font-bold text-emerald-700">{transaction.status}</span>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Artículos Vendidos</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5 text-center">Cant.</th>
                    <th className="p-2.5 text-right">P. Unit ($)</th>
                    <th className="p-2.5 text-right">Subtotal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transaction.itemsDetail && transaction.itemsDetail.length > 0 ? (
                    transaction.itemsDetail.map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium text-slate-800">{it.name || it.product_name || 'Producto'}</td>
                        <td className="p-2.5 text-center font-bold text-slate-700">{it.quantity || it.qty || 1}</td>
                        <td className="p-2.5 text-right font-mono">${(Number(it.price || it.unit_price || 0)).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          ${((Number(it.quantity || it.qty || 1)) * Number(it.price || it.unit_price || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-slate-400">
                        {transaction.itemsSummary}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bank Allocations Breakdown */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Destino y Cuentas Bancarias Acreditadas
            </h4>
            <div className="space-y-2">
              {transaction.bankAccountAllocations.map((b, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-200/60 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    <div>
                      <span className="font-bold text-slate-900 block">{b.bankAccountName}</span>
                      <span className="text-[10px] text-slate-500">Abonado a cuenta bancaria ({b.currency})</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold font-mono text-emerald-800 block text-sm">
                      {b.currency === 'VES' ? `Bs. ${b.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : `$${b.amount.toFixed(2)}`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {b.currency === 'VES' ? `≈ $${b.amountUsd.toFixed(2)} USD` : `≈ Bs. ${b.amountVes.toLocaleString('es-VE')}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Totals */}
          <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span className="font-mono">${transaction.subtotal.toFixed(2)}</span>
            </div>
            {transaction.iva > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>IVA (16%):</span>
                <span className="font-mono">${transaction.iva.toFixed(2)}</span>
              </div>
            )}
            {transaction.igtf > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>IGTF (3%):</span>
                <span className="font-mono">${transaction.igtf.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>Total a Pagar:</span>
              <div className="text-right">
                <span className="block text-[#1D3557]">${transaction.totalUsd.toFixed(2)} USD</span>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  Bs. {transaction.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
