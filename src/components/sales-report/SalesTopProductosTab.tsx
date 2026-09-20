import React from 'react';
import {
  Package,
  Award,
  Search,
  Sparkles,
  TrendingUp,
  ShoppingBag,
  ArrowUpDown,
  Layers,
  FileText,
  Truck,
  Globe,
  CreditCard
} from 'lucide-react';

export interface TopProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  totalUnits: number;
  totalRevenueUsd: number;
  totalRevenueVes: number;
  ticketsCount: number;
  currentStock: number | string;
  avgPriceUsd: number;
  percentage: number;
  unitsBySource: {
    facturas: number;
    notas: number;
    pedidos: number;
    credito: number;
  };
  revenueBySource: {
    facturas: number;
    notas: number;
    pedidos: number;
    credito: number;
  };
}

interface SalesTopProductosTabProps {
  topProductsList: TopProductItem[];
  filteredTopProducts: TopProductItem[];
  productCategories: string[];
  productCategoryFilter: string;
  setProductCategoryFilter: (cat: string) => void;
  productSortBy: 'units' | 'revenue';
  setProductSortBy: (sort: 'units' | 'revenue') => void;
  productSearchTerm: string;
  setProductSearchTerm: (term: string) => void;
  topProductsLimit?: 'top10' | 'top20' | 'all';
  setTopProductsLimit?: (lim: 'top10' | 'top20' | 'all') => void;
  topProductsTotals: {
    totalGrandUnits: number;
    totalGrandRevenueUsd: number;
    totalGrandRevenueVes: number;
  };
}

export default function SalesTopProductosTab({
  topProductsList,
  filteredTopProducts,
  productCategories,
  productCategoryFilter,
  setProductCategoryFilter,
  productSortBy,
  setProductSortBy,
  productSearchTerm,
  setProductSearchTerm,
  topProductsLimit = 'top10',
  setTopProductsLimit,
  topProductsTotals
}: SalesTopProductosTabProps) {
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* RANKING TABLE */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Top Products Table */}

        {/* Top Products Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-3 text-center">Posición</th>
                <th className="py-3 px-4">Producto / Artículo</th>
                <th className="py-3 px-3">Categoría</th>
                <th className="py-3 px-3 text-center">Total Unids</th>
                <th className="py-3 px-4">Desglose por Canal de Venta</th>
                <th className="py-3 px-3 text-right">P. Promedio</th>
                <th className="py-3 px-3 text-right">Total USD ($)</th>
                <th className="py-3 px-3 text-right">Total VES (Bs.)</th>
                <th className="py-3 px-3 text-right">% Part.</th>
                <th className="py-3 px-3 text-center">Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTopProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Package className="w-8 h-8 text-slate-300" />
                      <p>No se encontraron productos en el período o filtros seleccionados.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTopProducts.map((prod, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Rank Position */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${
                            rank === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs'
                              : rank === 2
                              ? 'bg-slate-200 text-slate-800 border border-slate-300'
                              : rank === 3
                              ? 'bg-amber-700/10 text-amber-900 border border-amber-700/30'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rank}
                        </span>
                      </td>

                      {/* Product Name & SKU */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">
                            {prod.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            SKU: {prod.sku}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {prod.category}
                        </span>
                      </td>

                      {/* Units Sold */}
                      <td className="py-3 px-3 text-center font-mono font-black text-slate-900 text-sm">
                        {prod.totalUnits}
                      </td>

                      {/* Multi-channel audit breakdown */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                          <span className={`px-1.5 py-0.5 rounded font-mono ${prod.unitsBySource?.facturas > 0 ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'bg-slate-50 text-slate-400'}`} title="Facturas Normales">
                            Fac: {prod.unitsBySource?.facturas || 0}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-mono ${prod.unitsBySource?.notas > 0 ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200' : 'bg-slate-50 text-slate-400'}`} title="Notas de Entrega">
                            NE: {prod.unitsBySource?.notas || 0}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-mono ${prod.unitsBySource?.pedidos > 0 ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'bg-slate-50 text-slate-400'}`} title="Pedidos Online">
                            Ped: {prod.unitsBySource?.pedidos || 0}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-mono ${prod.unitsBySource?.credito > 0 ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'bg-slate-50 text-slate-400'}`} title="Cuentas por Cobrar (Crédito)">
                            CxC: {prod.unitsBySource?.credito || 0}
                          </span>
                        </div>
                      </td>

                      {/* Avg Price */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 font-medium">
                        ${prod.avgPriceUsd.toFixed(2)}
                      </td>

                      {/* Total USD */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                        ${prod.totalRevenueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Total VES */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-[#1D3557]">
                        Bs. {prod.totalRevenueVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Percentage Share */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full bg-emerald-600"
                              style={{ width: `${Math.min(100, Math.max(0, prod.percentage))}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-700 text-xs">
                            {prod.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Ticket Count */}
                      <td className="py-3 px-3 text-center font-mono text-slate-600 font-semibold">
                        {prod.ticketsCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Dark Total Footer */}
            {filteredTopProducts.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-950">
                  <td colSpan={3} className="py-3.5 px-4 font-black tracking-wide">
                    TOTAL GENERAL PRODUCTOS EN RANKING
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-amber-300 text-sm">
                    {topProductsTotals.totalGrandUnits} unids
                  </td>
                  <td className="py-3.5 px-4 text-xs font-normal text-slate-400">
                    Auditado en 4 canales
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-400">—</td>
                  <td className="py-3.5 px-3 text-right font-mono text-emerald-400 text-sm">
                    ${topProductsTotals.totalGrandRevenueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-200">
                    Bs. {topProductsTotals.totalGrandRevenueVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-amber-400">
                    100.0%
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-white">
                    {topProductsList.length}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
