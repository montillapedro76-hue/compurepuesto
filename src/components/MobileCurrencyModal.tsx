import React from 'react';
import { X, DollarSign, Check, Ban, TrendingUp } from 'lucide-react';
import { CurrencyCode } from '../lib/currency';

interface MobileCurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCurrency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  currencyRates: Record<CurrencyCode, number>;
  disabledSettings?: {
    curr_usd?: boolean;
    curr_eur?: boolean;
    curr_ves?: boolean;
    curr_cop?: boolean;
  };
}

export default function MobileCurrencyModal({
  isOpen,
  onClose,
  activeCurrency,
  onCurrencyChange,
  currencyRates,
  disabledSettings = {}
}: MobileCurrencyModalProps) {
  if (!isOpen) return null;

  const currencies: { code: CurrencyCode; name: string; symbol: string; flag: string; desc: string; rateDisplay: string }[] = [
    {
      code: 'USD',
      name: 'Dólar Estadounidense',
      symbol: '$',
      flag: '🇺🇸',
      desc: 'Moneda base principal',
      rateDisplay: '$ 1.00 USD'
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      flag: '🇪🇺',
      desc: 'Moneda europea',
      rateDisplay: `${Number(currencyRates.EUR || 0.92).toFixed(2)} € por USD`
    },
    {
      code: 'VES',
      name: 'Bolívar Digital',
      symbol: 'Bs.',
      flag: '🇻🇪',
      desc: 'Tasa oficial BCV Venezuela',
      rateDisplay: `Bs. ${Number(currencyRates.VES || 36.5).toFixed(2)} por USD`
    },
    {
      code: 'COP',
      name: 'Peso Colombiano',
      symbol: 'COP$',
      flag: '🇨🇴',
      desc: 'Moneda colombiana',
      rateDisplay: `COP$ ${Number(currencyRates.COP || 3900).toFixed(0)} por USD`
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn">
      <div 
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#131921] text-white p-4 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF9900] text-[#131921] flex items-center justify-center font-black shadow-md">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                Configuración de Moneda
              </h3>
              <p className="text-[10px] text-gray-400 font-medium">
                Selecciona la divisa para ver precios en el catálogo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Currency List */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
            <span>Monedas Disponibles</span>
            <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
              <TrendingUp className="w-3 h-3" /> Tasas actualizadas
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {currencies.map((c) => {
              const codeClean = (c?.code || '').toLowerCase();
              const isSelected = activeCurrency === c.code;
              const isDisabled = disabledSettings[`curr_${codeClean}` as keyof typeof disabledSettings] === true;

              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) {
                      onCurrencyChange(c.code);
                      onClose();
                    }
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 ${
                    isDisabled
                      ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-amber-50/80 border-[#FF9900] shadow-sm ring-1 ring-[#FF9900]'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.flag}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900">
                          {c.name} ({c.symbol})
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 bg-[#FF9900] text-[#131921] font-black text-[9px] uppercase tracking-wider rounded-full">
                            Activa
                          </span>
                        )}
                        {isDisabled && (
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 font-bold text-[9px] uppercase tracking-wider rounded-full flex items-center gap-1">
                            <Ban className="w-2.5 h-2.5" /> Deshabilitada
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium">{c.desc}</p>
                      <p className="text-[10px] font-bold text-gray-700 mt-0.5">
                        {c.rateDisplay}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-[#FF9900] text-[#131921] flex items-center justify-center shadow-xs">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className={`w-6 h-6 rounded-full border-2 ${isDisabled ? 'border-gray-300 bg-gray-200' : 'border-gray-300'}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-500 font-medium">
            💡 Las monedas deshabilitadas por la gerencia no pueden seleccionarse.
          </p>
        </div>
      </div>
    </div>
  );
}
