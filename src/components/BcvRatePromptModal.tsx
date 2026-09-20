import React, { useState } from 'react';
import { RefreshCw, Calendar, Sparkles, ExternalLink, Edit3 } from 'lucide-react';
import { dbService, supabase } from '../lib/supabase';
import { recordBcvDismissed } from '../lib/bcvRateChecker';

export interface BcvQuote {
  rate: number;
  currentRate: number;
  origin: 'BCV' | 'manual';
  valueDate: string | null;
  valueDateText?: string | null;
  checkedAt: string;
  timestampStr: string;
  variation: number;
  rising: boolean;
  isFutureRate: boolean;
  effectiveDateLabel: string;
  sourceLabel?: string;
}

export async function checkBcvExchangeRate(currentRate: number): Promise<BcvQuote | null> {
  try {
    let rawRate: number | null = null;
    let fechaActualizacion: string | null = null;
    let fechaTexto: string | null = null;
    let sourceLabel = 'https://www.bcv.org.ve/glosario/cambio-oficial';
    let isFutureRateFromApi = false;
    let effectiveDateFromApi = '';

    // 1. Primaria: Consulta directa a la página oficial del BCV mediante el proxy del servidor
    try {
      const resBcv = await fetch('/api/bcv/rates');
      if (resBcv.ok) {
        const dataBcv = await resBcv.json();
        if (dataBcv && typeof dataBcv.usdRate === 'number' && dataBcv.usdRate > 0) {
          rawRate = dataBcv.usdRate;
          fechaActualizacion = dataBcv.valueDate || null;
          fechaTexto = dataBcv.valueDateText || null;
          isFutureRateFromApi = !!dataBcv.isFutureRate;
          effectiveDateFromApi = dataBcv.effectiveDateLabel || '';
        }
      }
    } catch (e) {
      console.warn('Error fetching /api/bcv/rates endpoint:', e);
    }

    // 2. Fallback secundario: DolarAPI oficial si el portal del BCV no respondió
    if (!rawRate) {
      try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.promedio === 'number' && data.promedio > 0) {
            rawRate = data.promedio;
            fechaActualizacion = data.fechaActualizacion || null;
            sourceLabel = 'DolarAPI (BCV Referencia)';
          }
        }
      } catch (e) {
        console.warn('Error fetching official DolarAPI fallback:', e);
      }
    }

    // 3. Fallback terciario: DolarAPI lista
    if (!rawRate) {
      try {
        const resList = await fetch('https://ve.dolarapi.com/v1/dolares');
        if (resList.ok) {
          const list = await resList.json();
          if (Array.isArray(list)) {
            const oficial = list.find((item: any) => item && (item.fuente === 'oficial' || item.nombre?.toLowerCase().includes('dólar')));
            if (oficial && typeof oficial.promedio === 'number' && oficial.promedio > 0) {
              rawRate = oficial.promedio;
              fechaActualizacion = oficial.fechaActualizacion || null;
              sourceLabel = 'DolarAPI (BCV Lista)';
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching fallback DolarAPI list:', e);
      }
    }

    if (!rawRate || rawRate <= 0) return null;

    // Solo se debe proponer/ejecutar el formulario de cambio si la tasa obtenida es MAYOR que la actual en el sistema
    // De lo contrario se mantiene la tasa vigente guardada en la base de datos
    if (rawRate <= currentRate + 0.005) {
      return null;
    }

    const variation = ((rawRate - currentRate) / (currentRate || 1)) * 100;
    const rising = variation >= 0;

    // Detect if this is a future rate (fecha valor posterior a hoy o publicada a partir de las 4pm para el próximo día hábil)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const caracasDate = new Date(utcTime + (-4 * 3600000));
    const todayCaracasStr = caracasDate.toISOString().split('T')[0];

    let isFutureRate = isFutureRateFromApi;
    let effectiveDateLabel = effectiveDateFromApi;

    if (!effectiveDateLabel && fechaActualizacion) {
      const valDateOnly = fechaActualizacion.split('T')[0];
      effectiveDateLabel = valDateOnly;
    }

    // Regla estricta de tasa futura:
    // 1. Si la fecha de valor es posterior a hoy (fecha futura real)
    if (effectiveDateLabel && effectiveDateLabel > todayCaracasStr) {
      isFutureRate = true;
    } 
    // 2. Si es a partir de las 4:00 PM (16:00) y la fecha de valor NO es de días anteriores
    else if (caracasDate.getHours() >= 16 && (!effectiveDateLabel || effectiveDateLabel >= todayCaracasStr)) {
      isFutureRate = true;
      if (!effectiveDateLabel) {
        const tomorrow = new Date(caracasDate.getTime() + 24 * 60 * 60 * 1000);
        effectiveDateLabel = tomorrow.toISOString().split('T')[0];
      }
    } else {
      isFutureRate = false;
    }

    let timeStr = '';
    try {
      const d = fechaActualizacion ? new Date(fechaActualizacion) : new Date();
      timeStr = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    } catch {
      timeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }

    return {
      rate: Number(rawRate.toFixed(4)),
      currentRate: Number(currentRate.toFixed(4)),
      origin: 'BCV',
      valueDate: fechaActualizacion ? fechaActualizacion.split('T')[0] : (effectiveDateLabel || todayCaracasStr),
      valueDateText: fechaTexto,
      checkedAt: new Date().toISOString(),
      timestampStr: timeStr,
      variation,
      rising,
      isFutureRate,
      effectiveDateLabel,
      sourceLabel
    };
  } catch (err) {
    console.error('Error in checkBcvExchangeRate:', err);
    return null;
  }
}

interface BcvRatePromptModalProps {
  quote: BcvQuote;
  onClose: () => void;
  onRateUpdated: (newRate: number) => void;
  onOpenManualModal?: () => void;
  triggerToast?: (message: string) => void;
}

export const BcvRatePromptModal: React.FC<BcvRatePromptModalProps> = ({
  quote,
  onClose,
  onRateUpdated,
  onOpenManualModal,
  triggerToast
}) => {
  const [saving, setSaving] = useState(false);

  // Mantiene la tasa actual y registra para no insistir en esta misma hora
  const handleKeepCurrent = () => {
    recordBcvDismissed(quote.rate);
    onClose();
  };

  // Guarda la nueva tasa oficial del BCV en Supabase y actualiza todo el sistema
  const handleUpdateRate = async () => {
    setSaving(true);
    try {
      // 1. Guardar en Supabase (tabla currency_rates y bcv_rates legacy)
      await dbService.updateCurrencyRate('VES', quote.rate, 'BCV Oficial');

      // 2. Intentar registrar en tabla 'tasas_cambio' si existe en Supabase (referencia del usuario)
      try {
        if (supabase) {
          await supabase.from('tasas_cambio').insert({
            moneda: 'USD',
            tasa: quote.rate,
            origen: quote.origin,
            fecha_valor: quote.valueDate,
            consultada_at: quote.checkedAt,
            fuente_url: quote.origin === 'BCV' ? 'https://www.bcv.org.ve/glosario/cambio-oficial' : null,
            registrada_por: 'Sistema (BCV Auto)'
          });
        }
      } catch (tcErr) {
        console.debug('Nota sobre tabla tasas_cambio:', tcErr);
      }

      // 3. Notificar a componentes y actualizar estado global
      onRateUpdated(quote.rate);

      // 4. Despachar eventos de sincronización para todas las pestañas y módulos abiertos
      window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: quote.rate } }));
      window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));

      // 5. Notificación de éxito
      if (triggerToast) {
        triggerToast(`Tasa BCV actualizada a Bs. ${quote.rate.toFixed(2)}`);
      }

      // 6. Cerrar modal
      onClose();
    } catch (error: any) {
      console.error('Error al actualizar la tasa:', error);
      if (triggerToast) {
        triggerToast(error instanceof Error ? error.message : 'No se pudo actualizar la tasa');
      } else {
        alert(error instanceof Error ? error.message : 'No se pudo actualizar la tasa');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="bcv-rate-prompt-overlay"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          handleKeepCurrent();
        }
      }}
    >
      <div
        id="bcv-rate-prompt-dialog"
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200"
      >
        {/* Modal Title */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Tasa de Cambio Actualizada
            </h3>
            <a
              href="https://www.bcv.org.ve/glosario/cambio-oficial"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mt-0.5"
            >
              <span>Fuente: Banco Central de Venezuela</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          {quote.isFutureRate && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-200 tracking-wider shrink-0">
              <Sparkles className="w-3 h-3 text-amber-600" />
              Tasa Futura
            </span>
          )}
        </div>

        {/* Gray Container with Rates Comparison */}
        <div className="mt-5 rounded-3xl bg-[#ECEEF0] p-5 sm:p-6 space-y-4">
          <p className="text-base sm:text-[17px] font-normal text-slate-900 leading-snug">
            {quote.isFutureRate
              ? 'El BCV ha publicado una tasa para el próximo día hábil:'
              : 'La tasa del BCV ha cambiado:'}
          </p>

          <div className="grid grid-cols-2 gap-4 items-baseline">
            {/* Tasa Actual */}
            <div>
              <span className="block text-xs sm:text-sm font-normal text-slate-400 mb-1">
                Tasa actual
              </span>
              <span className="block text-2xl sm:text-3xl font-extrabold text-slate-400 font-mono tracking-tight">
                Bs {quote.currentRate.toFixed(2)}
              </span>
            </div>

            {/* Nueva Tasa BCV */}
            <div>
              <span className="block text-xs sm:text-sm font-normal text-slate-800 mb-1">
                {quote.isFutureRate ? 'Nueva tasa futura' : 'Nueva tasa BCV'}
              </span>
              <span className="block text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                Bs {quote.rate.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Divider line */}
          <hr className="border-t border-slate-300/80 my-3" />

          {/* Percentage variation badge & Timestamp / Fecha valor */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                  quote.rising
                    ? 'bg-[#d1fae5] text-[#065f46]'
                    : 'bg-[#fee2e2] text-[#991b1b]'
                }`}
              >
                {quote.rising ? '+' : ''}
                {quote.variation.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Act.: {quote.timestampStr}
              </span>
            </div>

            {quote.valueDate && (
              <div className="flex items-center gap-1 text-xs text-slate-600 font-bold bg-white/70 px-2.5 py-1 rounded-lg border border-slate-200/80">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>Valor: {quote.valueDate}</span>
              </div>
            )}
          </div>
        </div>

        {/* Question Prompt */}
        <p className="text-base sm:text-[17px] font-bold text-slate-900 mt-6 mb-7 leading-snug">
          {quote.isFutureRate
            ? '¿Deseas actualizar la tasa con el valor futuro del BCV?'
            : '¿Deseas actualizar la tasa con el valor del BCV?'}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {onOpenManualModal ? (
            <button
              type="button"
              id="btn-bcv-cambio-manual"
              onClick={() => {
                onClose();
                onOpenManualModal();
              }}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2.5 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 border border-blue-200/80 disabled:opacity-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Ajustar Manualmente</span>
            </button>
          ) : <div />}

          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            {/* Mantener Actual */}
            <button
              type="button"
              id="btn-bcv-mantener-actual"
              onClick={handleKeepCurrent}
              disabled={saving}
              className="w-full sm:w-auto px-5 py-3 text-slate-800 hover:text-black font-bold text-base transition cursor-pointer text-center disabled:opacity-50"
            >
              Mantener Actual
            </button>

            {/* Actualizar Tasa */}
            <button
              type="button"
              id="btn-bcv-actualizar-tasa"
              onClick={handleUpdateRate}
              disabled={saving}
              className="w-full sm:w-auto px-8 py-3.5 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-base rounded-2xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 min-w-[175px] disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Actualizando…</span>
                </>
              ) : (
                <span>Actualizar Tasa</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
