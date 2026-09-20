/**
 * Centralized Date Utilities for Copias Bella Vista
 * Handles resilient parsing of Spanish/Latin date formats (DD/MM/YYYY, 12-hour AM/PM with a.m./p.m.),
 * ISO strings, SQL timestamps, and weekly/monthly/daily period grouping.
 */

export const parseUniversalDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val !== 'string') return null;
  const str = val.trim();
  if (!str) return null;

  // Numeric string timestamp
  if (/^\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }

  // 1. Spanish/Latin format: DD/MM/YYYY or DD-MM-YYYY (e.g., "20/7/2026, 12:26:48 a. m." or "23/8/2026" or "20/07/2026")
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm))?)?/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 12;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const meridiem = dmyMatch[7] ? dmyMatch[7].toLowerCase().replace(/\./g, '').trim() : null;

    if (meridiem) {
      if ((meridiem === 'pm' || meridiem === 'p m') && hours < 12) {
        hours += 12;
      } else if ((meridiem === 'am' || meridiem === 'a m') && hours === 12) {
        hours = 0;
      }
    }

    if (year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. YYYY-MM-DD or SQL/ISO with space or T (e.g., "2026-08-23", "2026-08-23 14:30:00", "2026-08-23T14:30:00.123Z")
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d+)?)?(?:([+-]\d{2}(?::?\d{2})?)|Z)?)?/i);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    
    // If it's a pure date (no time component)
    if (!ymdMatch[4]) {
      return new Date(year, month - 1, day, 12, 0, 0);
    }
    
    // Try standard ISO parsing with 'T'
    const normalizedIso = str.replace(' ', 'T');
    const isoDate = new Date(normalizedIso);
    if (!isNaN(isoDate.getTime())) return isoDate;

    // Fallback explicit time construction
    const hours = parseInt(ymdMatch[4], 10) || 0;
    const minutes = parseInt(ymdMatch[5], 10) || 0;
    const seconds = parseInt(ymdMatch[6] || '0', 10) || 0;
    const d = new Date(year, month - 1, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. General native Date parse with space-to-T normalization
  const normalized = str.replace(' ', 'T');
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
};

export const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getStartOfWeek = (d: Date): Date => {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay()); // Sunday
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getEndOfWeek = (d: Date): Date => {
  const start = getStartOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  return end;
};

export const getPeriodKeyForDate = (d: Date, freq: 'diario' | 'semanal' | 'mensual' | 'anual'): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  if (freq === 'diario') return `${y}-${m}-${day}`;
  if (freq === 'semanal') {
    const startOfWeek = getStartOfWeek(d);
    const sy = startOfWeek.getFullYear();
    const sm = String(startOfWeek.getMonth() + 1).padStart(2, '0');
    const sd = String(startOfWeek.getDate()).padStart(2, '0');
    return `${sy}-${sm}-${sd}_W`;
  }
  if (freq === 'mensual') return `${y}-${m}`;
  return `${y}`;
};

export const formatDateSpanish = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      return `${day} ${months[monthIndex]} ${year}`;
    }
  } catch (e) {}
  return dateStr;
};

export const formatWeekRangeSpanish = (startOrPeriod: Date | string): string => {
  let startDate: Date | null = null;
  if (startOrPeriod instanceof Date) {
    startDate = getStartOfWeek(startOrPeriod);
  } else if (typeof startOrPeriod === 'string') {
    if (startOrPeriod.endsWith('_W')) {
      const clean = startOrPeriod.replace('_W', '');
      startDate = parseUniversalDate(clean);
    } else {
      const parsed = parseUniversalDate(startOrPeriod);
      if (parsed) startDate = getStartOfWeek(parsed);
    }
  }

  if (!startDate) return String(startOrPeriod);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  const sy = startDate.getFullYear();
  const sm = months[startDate.getMonth()];
  const sd = startDate.getDate();

  const ey = endDate.getFullYear();
  const em = months[endDate.getMonth()];
  const ed = endDate.getDate();

  if (sm === em && sy === ey) {
    return `Semana: ${sd} al ${ed} de ${sm} (${sy})`;
  }
  return `Semana: ${sd} ${sm} al ${ed} ${em} (${ey})`;
};
