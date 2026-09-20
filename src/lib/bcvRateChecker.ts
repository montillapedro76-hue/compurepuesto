/**
 * BCV Exchange Rate Verification & Automation Engine
 * - Verifica al ingresar a la página o al realizar cualquier procedimiento si existe una tasa futura del BCV.
 * - Automatización a las 20:00 y 00:00 (Hora de Venezuela / Caracas UTC-4):
 *   Si la tasa de cambio oficial/futura es mayor a la del sistema, la actualiza automáticamente.
 *   De lo contrario, mantiene la vigente guardada en la base de datos.
 * - Intervalo de verificación: cada hora (3600000 ms).
 */

const HOURLY_CHECK_KEY = 'copias_bellavista_bcv_hourly_check_timestamp';
const HOURLY_INTERVAL_MS = 60 * 60 * 1000; // 1 hora exacta (60 minutos)
const DISMISSED_RATE_KEY = 'copias_bellavista_dismissed_bcv_rate';
const DISMISSED_TIME_KEY = 'copias_bellavista_dismissed_bcv_time';

/**
 * Obtiene la fecha, hora y minutos en el huso horario de Venezuela (Caracas UTC-4).
 */
export function getCaracasTime(): {
  dateStr: string;
  hour: number;
  minute: number;
  fullDate: Date;
  timeStr: string;
} {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const caracasDate = new Date(utcTime + (-4 * 3600000));
  const dateStr = caracasDate.toISOString().split('T')[0];
  const hour = caracasDate.getHours();
  const minute = caracasDate.getMinutes();
  const timeStr = caracasDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  return { dateStr, hour, minute, fullDate: caracasDate, timeStr };
}

/**
 * Determina el slot de horario automático activo (20:00 o 00:00) si aplica.
 * - Slot '20': Entre las 20:00 y las 23:59
 * - Slot '00': Entre las 00:00 y las 07:59
 */
export function getActiveAutoBcvSlot(): { slotId: '20' | '00' | null; slotLabel: string; slotKey: string } {
  const { dateStr, hour } = getCaracasTime();
  if (hour >= 20 && hour < 24) {
    return {
      slotId: '20',
      slotLabel: '20:00',
      slotKey: `bcv_auto_slot_${dateStr}_20`
    };
  } else if (hour >= 0 && hour < 8) {
    return {
      slotId: '00',
      slotLabel: '00:00',
      slotKey: `bcv_auto_slot_${dateStr}_00`
    };
  }
  return { slotId: null, slotLabel: '', slotKey: '' };
}

/**
 * Determina si ha transcurrido al menos 1 hora desde la última verificación automática.
 */
export function shouldCheckBcvRate(force: boolean = false): boolean {
  if (force) return true;
  try {
    const lastCheck = Number(localStorage.getItem(HOURLY_CHECK_KEY) || 0);
    if (!lastCheck || isNaN(lastCheck)) return true;
    return Date.now() - lastCheck >= HOURLY_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Registra la marca de tiempo de la última verificación realizada.
 */
export function recordBcvCheckTimestamp(): void {
  try {
    localStorage.setItem(HOURLY_CHECK_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Error guardando timestamp de chequeo BCV:', e);
  }
}

/**
 * Registra que el usuario decidió mantener la tasa actual para no insistir en la misma tasa durante la siguiente hora.
 */
export function recordBcvDismissed(rate: number): void {
  try {
    sessionStorage.setItem(DISMISSED_RATE_KEY, String(rate));
    sessionStorage.setItem(DISMISSED_TIME_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Error guardando tasa descartada en sessionStorage:', e);
  }
}

/**
 * Verifica si esta tasa específica fue descartada recientemente (menos de 1 hora).
 */
export function isRateDismissedRecently(rate: number): boolean {
  try {
    const dismissedRate = Number(sessionStorage.getItem(DISMISSED_RATE_KEY) || 0);
    const dismissedTime = Number(sessionStorage.getItem(DISMISSED_TIME_KEY) || 0);
    if (!dismissedRate || isNaN(dismissedRate)) return false;

    // Si pasaron más de 60 minutos desde que se descartó, permitir volver a preguntar
    if (Date.now() - dismissedTime >= HOURLY_INTERVAL_MS) {
      return false;
    }

    return Math.abs(dismissedRate - rate) < 0.005;
  } catch {
    return false;
  }
}

/**
 * Dispara una notificación de procedimiento realizado en el sistema para evaluar si toca chequear la tasa BCV.
 */
export function notifyProcedureExecuted(): void {
  try {
    window.dispatchEvent(new CustomEvent('bellavista_procedure_executed'));
  } catch (e) {
    console.warn('Error despachando evento de procedimiento:', e);
  }
}
