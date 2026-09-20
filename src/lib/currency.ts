/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CurrencyCode = 'USD' | 'EUR' | 'VES' | 'COP' | 'USDT' | string;

export const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  USDT: 1,
  EUR: 0.92,
  VES: 842.2067,
  COP: 4100
};

export const CACHED_RATES_KEY = 'copias_bellavista_cached_rates';

export function getCachedCurrencyRates(): Record<string, number> {
  if (typeof window === 'undefined') return DEFAULT_RATES;
  try {
    const raw = localStorage.getItem(CACHED_RATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.VES === 'number' && parsed.VES > 50) {
        return {
          USD: Number(parsed.USD) || DEFAULT_RATES.USD,
          EUR: Number(parsed.EUR) || DEFAULT_RATES.EUR,
          VES: Number(parsed.VES) || DEFAULT_RATES.VES,
          COP: Number(parsed.COP) || DEFAULT_RATES.COP,
          ...parsed
        };
      }
    }
  } catch (e) {
    console.warn('Error reading cached currency rates:', e);
  }
  return DEFAULT_RATES;
}

export function saveCachedCurrencyRates(rates: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHED_RATES_KEY, JSON.stringify(rates));
  } catch (e) {
    console.warn('Error saving cached currency rates:', e);
  }
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  position: 'prefix' | 'suffix';
  thousandSeparator: string;
  decimalSeparator: string;
  decimals: number;
  label: string;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    position: 'prefix',
    thousandSeparator: ',',
    decimalSeparator: '.',
    decimals: 2,
    label: 'Dólar (USD)',
  },
  USDT: {
    code: 'USDT',
    symbol: 'USDT',
    position: 'suffix',
    thousandSeparator: ',',
    decimalSeparator: '.',
    decimals: 2,
    label: 'Tether / USDT (Binance)',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    position: 'suffix',
    thousandSeparator: '.',
    decimalSeparator: ',',
    decimals: 2,
    label: 'Euro (EUR)',
  },
  VES: {
    code: 'VES',
    symbol: 'Bs.',
    position: 'prefix',
    thousandSeparator: '.',
    decimalSeparator: ',',
    decimals: 2,
    label: 'Bolívar (VES)',
  },
  COP: {
    code: 'COP',
    symbol: 'COP$',
    position: 'prefix',
    thousandSeparator: '.',
    decimalSeparator: ',',
    decimals: 0,
    label: 'Peso Colombiano (COP)',
  },
};

export function registerDynamicCurrency(currency: {
  code: string;
  symbol: string;
  label?: string;
  name?: string;
  position?: 'prefix' | 'suffix';
  decimals?: number;
}): void {
  const code = currency.code.toUpperCase().trim();
  CURRENCIES[code] = {
    code,
    symbol: currency.symbol || '$',
    position: currency.position || (code === 'EUR' ? 'suffix' : 'prefix'),
    thousandSeparator: code === 'USD' ? ',' : '.',
    decimalSeparator: code === 'USD' ? '.' : ',',
    decimals: currency.decimals !== undefined ? currency.decimals : 2,
    label: currency.label || currency.name || `${code} (${currency.symbol || '$'})`,
  };
}

// Global state / helper for formatters
export function formatCurrency(amountUSD: number, currencyCode: CurrencyCode, rates: Record<CurrencyCode, number>): string {
  const rate = rates[currencyCode] || 1;
  const convertedAmount = amountUSD * rate;
  const config = CURRENCIES[currencyCode];

  if (!config) return `$ ${amountUSD.toFixed(2)}`;

  let formattedNumber = '';
  if (config.decimals === 0) {
    const rounded = Math.round(convertedAmount);
    formattedNumber = formatNumberWithSeparators(rounded, config.thousandSeparator, config.decimalSeparator, 0);
  } else {
    formattedNumber = formatNumberWithSeparators(convertedAmount, config.thousandSeparator, config.decimalSeparator, config.decimals);
  }

  if (config.position === 'prefix') {
    return `${config.symbol} ${formattedNumber}`;
  } else {
    return `${formattedNumber} ${config.symbol}`;
  }
}

function formatNumberWithSeparators(
  num: number,
  thousandSep: string,
  decimalSep: string,
  decimals: number
): string {
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] ? decimalSep + parts[1] : '';

  // Add thousand separators
  const r = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  return r + decimalPart;
}

// Local storage helpers
export function getSavedCurrency(): CurrencyCode {
  return 'VES';
}

export function saveCurrency(code: CurrencyCode): void {
  localStorage.setItem('copias_bellavista_active_currency', code);
}
