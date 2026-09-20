/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Filter, RotateCcw, Check, ShoppingBag, Grid, BookOpen } from 'lucide-react';
import { Category, Brand } from '../types.ts';
import { useI18n } from '../lib/i18n.ts';

interface SidebarProps {
  categories: Category[];
  brands: Brand[];
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
  selectedBrand: string;
  setSelectedBrand: (id: string) => void;
  minPrice: number;
  setMinPrice: (price: number) => void;
  maxPrice: number;
  setMaxPrice: (price: number) => void;
  onlyInStock: boolean;
  setOnlyInStock: (val: boolean) => void;
  onlyFeatured: boolean;
  setOnlyFeatured: (val: boolean) => void;
  onResetFilters: () => void;
}

export default function Sidebar({
  categories,
  brands,
  selectedCategory,
  setSelectedCategory,
  selectedBrand,
  setSelectedBrand,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  onlyInStock,
  setOnlyInStock,
  onlyFeatured,
  setOnlyFeatured,
  onResetFilters
}: SidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="bg-white p-5 rounded-2xl border border-[#E7E5DF] shadow-[0_2px_8px_-2px_rgba(22,32,46,0.04)] sticky top-24 max-h-[85vh] overflow-y-auto select-none">
      <div className="flex items-center justify-between border-b border-[#F0EFEB] pb-3 mb-4">
        <h2 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#D97706]" />
          <span>{t('sidebar.filters_title', 'Filtros del catálogo')}</span>
        </h2>
        <button
          type="button"
          onClick={onResetFilters}
          className="text-xs text-slate-500 hover:text-[#D97706] flex items-center gap-1 font-semibold transition cursor-pointer"
          title={t('sidebar.clear', 'Limpiar')}
          id="btn-reset-filters"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('sidebar.clear', 'Restablecer')}</span>
        </button>
      </div>

      {/* Category Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-xs text-slate-800 mb-2">
          {t('sidebar.category', 'Categorías')}
        </h3>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#293896] font-bold text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{t('sidebar.all_items', 'Todos los artículos')}</span>
            {selectedCategory === 'all' && <Check className="w-3.5 h-3.5 text-[#38BDF8]" />}
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#293896] font-bold text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{cat.name}</span>
              {selectedCategory === cat.id && <Check className="w-3.5 h-3.5 text-[#38BDF8]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-xs text-slate-800 mb-2">
          {t('sidebar.brand', 'Marcas y fabricantes')}
        </h3>
        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setSelectedBrand('all')}
            className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
              selectedBrand === 'all'
                ? 'bg-[#293896] font-bold text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{t('sidebar.all_brands', 'Todas las marcas')}</span>
            {selectedBrand === 'all' && <Check className="w-3.5 h-3.5 text-[#38BDF8]" />}
          </button>
          {brands.map((brand) => (
            <button
              type="button"
              key={brand.id}
              onClick={() => setSelectedBrand(brand.id)}
              className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
                selectedBrand === brand.id
                  ? 'bg-[#293896] font-bold text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{brand.name}</span>
              {selectedBrand === brand.id && <Check className="w-3.5 h-3.5 text-[#38BDF8]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div className="mb-6">
        <h3 className="font-bold text-xs text-slate-800 mb-2.5">
          {t('sidebar.price_range', 'Rango de precio')} ($ USD)
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2 justify-between">
            <div className="w-1/2">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">{t('sidebar.min_price', 'Mínimo')} ($)</label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#D97706]"
              />
            </div>
            <div className="w-1/2">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">{t('sidebar.max_price', 'Máximo')} ($)</label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#D97706]"
              />
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1000"
            step="10"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-full accent-[#D97706] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Inventory & Status Filters */}
      <div className="space-y-2.5 pt-3 border-t border-[#F0EFEB]">
        {/* Only In Stock checkbox */}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(e) => setOnlyInStock(e.target.checked)}
            className="rounded border-slate-300 text-[#D97706] focus:ring-[#D97706] w-4 h-4 accent-[#D97706]"
            id="chk-only-stock"
          />
          <span>{t('sidebar.in_stock_only', 'Solo productos con stock disponible')}</span>
        </label>

        {/* Only Featured checkbox */}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyFeatured}
            onChange={(e) => setOnlyFeatured(e.target.checked)}
            className="rounded border-slate-300 text-[#D97706] focus:ring-[#D97706] w-4 h-4 accent-[#D97706]"
            id="chk-only-featured"
          />
          <span>{t('sidebar.featured_only', 'Solo productos destacados')}</span>
        </label>
      </div>
    </aside>
  );
}
