import React, { useState, useEffect } from 'react';
import { 
  DollarSign, RefreshCw, CheckCircle2, AlertCircle, 
  ExternalLink, Calendar, X, Sparkles, TrendingUp, TrendingDown, ArrowRight
} from 'lucide-react';
import { dbService, supabase } from '../lib/supabase';
import { recordBcvDismissed } from '../lib/bcvRateChecker';

interface ManualBcvRateModalProps {
  isOpen: boolean;
  currentRate: number;
  suggestedRate?: number | null;
  onClose: () => void;
  onRateUpdated: (newRate: number) => void;
  triggerToast?: (message: string) => void;
}

export const ManualBcvRateModal: React.FC<ManualBcvRateModalProps> = ({
  isOpen,
  currentRate,
  suggestedRate,
  onClose,
  onRateUpdated,
  triggerToast
}) => {
  const [manualRateInput, setManualRateInput] = useState<string>('');
  const [officialBcvRate, setOfficialBcvRate] = useState<number | null>(null);
  const [officialEurRate, setOfficialEurRate] = useState<number | null>(null);
  const [officialValueDate, setOfficialValueDate] = useState<string | null>(null);
  const [officialValueDateText, setOfficialValueDateText] = useState<string | null>(null);
  const [isFutureRate, setIsFutureRate] = useState<boolean>(false);
  const [effectiveDateLabel, setEffectiveDateLabel] = useState<string>('');
  const [fetchingBcv, setFetchingBcv] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Consultar la tasa oficial directamente al abrir el modal y transcribirla
  useEffect(() => {
    if (isOpen) {
      if (suggestedRate && suggestedRate > 0) {
        setManualRateInput(suggestedRate.toString());
      } else {
        setManualRateInput(currentRate ? currentRate.toString() : '');
      }
      fetchOfficialRate();
    }
  }, [isOpen, currentRate, suggestedRate]);

  const fetchOfficialRate = async () => {
    setFetchingBcv(true);
    setFetchError(null);
    try {
      // 1. Intentar endpoint del servidor proxy directo a https://www.bcv.org.ve/glosario/cambio-oficial
      let loaded = false;
      try {
        const res = await fetch('/api/bcv/rates');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.usdRate === 'number' && data.usdRate > 0) {
            setOfficialBcvRate(data.usdRate);
            setOfficialEurRate(data.eurRate || null);
            setOfficialValueDate(data.valueDate || null);
            setOfficialValueDateText(data.valueDateText || null);
            setIsFutureRate(!!data.isFutureRate);
            setEffectiveDateLabel(data.effectiveDateLabel || '');
            // Transcribir automáticamente la tasa futura / oficial en el campo de nueva tasa
            setManualRateInput(data.usdRate.toString());
            loaded = true;
          }
        }
      } catch (proxyErr) {
        console.warn('Error fetching /api/bcv/rates proxy:', proxyErr);
      }

      // 2. Si falló el proxy directo, usar DolarAPI oficial como fallback
      if (!loaded) {
        try {
          const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.promedio === 'number' && data.promedio > 0) {
              setOfficialBcvRate(data.promedio);
              setOfficialValueDate(data.fechaActualizacion || null);
              setOfficialValueDateText(null);
              // Transcribir automáticamente al campo
              setManualRateInput(data.promedio.toString());
              loaded = true;
            }
          }
        } catch (dolarErr) {
          console.warn('Error fetching fallback DolarAPI:', dolarErr);
        }
      }

      if (!loaded) {
        setFetchError('No se pudo conectar con el portal oficial del BCV en este instante.');
      }
    } catch (e: any) {
      setFetchError(e?.message || 'Error consultando tasa oficial');
    } finally {
      setFetchingBcv(false);
    }
  };

  if (!isOpen) return null;

  const parsedInputRate = parseFloat(manualRateInput.replace(',', '.'));
  const isValidRate = !isNaN(parsedInputRate) && parsedInputRate > 0;

  // Cálculos de variación
  const activeComparisonRate = isValidRate ? parsedInputRate : currentRate;
  const variation = officialBcvRate && currentRate
    ? ((officialBcvRate - currentRate) / currentRate) * 100
    : 0;

  const handleApplyOfficialBcv = () => {
    if (officialBcvRate) {
      setManualRateInput(officialBcvRate.toString());
    }
  };

  const handleSaveRate = async () => {
    if (!isValidRate) {
      alert('Por favor introduce un número válido para la tasa en Bs.');
      return;
    }

    setSaving(true);
    try {
      let finalRate = Number(parsedInputRate.toFixed(4));

      // Solo se permite actualizar cuando no sea menor a la tasa oficial o futura
      if (officialBcvRate && finalRate < officialBcvRate - 0.0001) {
        alert(`Aviso: Por regla oficial del BCV, la tasa no puede ser menor a la especificada en la página oficial (Bs. ${officialBcvRate.toFixed(2)})${isFutureRate ? ' o tasa futura' : ''}. Se establecerá en Bs. ${officialBcvRate.toFixed(2)}.`);
        finalRate = officialBcvRate;
      }

      // 1. Persistir en la base de datos Supabase (currency_rates y bcv_rates)
      await dbService.updateCurrencyRate('VES', finalRate, isFutureRate ? 'BCV Tasa Futura' : 'BCV Oficial');

      // 2. Registrar en histórico / auditoría si existe la tabla tasas_cambio
      try {
        if (supabase) {
          await supabase.from('tasas_cambio').insert({
            moneda: 'USD',
            tasa: finalRate,
            origen: officialBcvRate && Math.abs(finalRate - officialBcvRate) < 0.01 ? 'BCV' : 'manual',
            fecha_valor: officialValueDate || new Date().toISOString().split('T')[0],
            consultada_at: new Date().toISOString(),
            fuente_url: 'https://www.bcv.org.ve/glosario/cambio-oficial',
            registrada_por: 'Administrador (Manual Modal)'
          });
        }
      } catch (logErr) {
        console.debug('Nota auditoría tasas_cambio:', logErr);
      }

      // 3. Notificar y refrescar estado global en memoria
      onRateUpdated(finalRate);

      // 4. Despachar eventos de sincronización en tiempo real para todos los módulos
      window.dispatchEvent(new CustomEvent('bellavista_bcv_rate_updated', { detail: { rate: finalRate } }));
      window.dispatchEvent(new CustomEvent('bellavista_settings_updated'));
      recordBcvDismissed(finalRate);

      if (triggerToast) {
        triggerToast(`Tasa BCV guardada y recalculada en todo el sistema: Bs. ${finalRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
      }

      onClose();
    } catch (err: any) {
      console.error('Error guardando tasa manual:', err);
      alert('Error al guardar la tasa: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="manual-bcv-rate-modal-overlay"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div
        id="manual-bcv-rate-modal-dialog"
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-[#005da9] shadow-2xs">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-[#1D3557] tracking-tight flex items-center gap-2">
                <span>Ajuste y Chequeo de Tasa BCV</span>
                {isFutureRate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-200">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    Tasa Futura
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Sincronización en tiempo real con <a href="https://www.bcv.org.ve/glosario/cambio-oficial" target="_blank" rel="noreferrer" className="text-[#005da9] hover:underline font-bold inline-flex items-center gap-0.5">BCV Oficial <ExternalLink className="w-2.5 h-2.5" /></a>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparativa: Sistema vs Portal Oficial BCV */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Tasa Actual Sistema */}
            <div className="bg-[#F8F9FA] rounded-2xl p-4 border border-gray-200/70">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Tasa Actual en Sistema
              </span>
              <div className="text-2xl font-mono font-black text-slate-700">
                Bs. {Number(currentRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
              <span className="text-[10px] text-gray-400 font-semibold block mt-1">
                Afecta POS, Ventas, Cotizaciones y Reportes
              </span>
            </div>

            {/* Tasa Oficial BCV Web */}
            <div className={`rounded-2xl p-4 border relative ${
              officialBcvRate ? 'bg-blue-50/70 border-blue-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-black text-[#005da9] uppercase tracking-wider">
                  Oficial BCV Publicada
                </span>
                <button
                  type="button"
                  onClick={fetchOfficialRate}
                  disabled={fetchingBcv}
                  className="text-gray-500 hover:text-[#005da9] transition cursor-pointer p-0.5"
                  title="Reconsultar página oficial del BCV"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingBcv ? 'animate-spin text-[#005da9]' : ''}`} />
                </button>
              </div>

              {fetchingBcv ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 font-bold py-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#005da9]" />
                  <span>Consultando BCV...</span>
                </div>
              ) : officialBcvRate ? (
                <div>
                  <div className="text-2xl font-mono font-black text-[#1D3557]">
                    Bs. {officialBcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black ${
                      variation >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {variation >= 0 ? '+' : ''}{variation.toFixed(2)}%
                    </span>
                    {officialValueDate && (
                      <span className="text-[10px] text-gray-500 font-bold flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5 text-gray-400" />
                        {officialValueDateText || officialValueDate.split('T')[0]}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-700 font-semibold py-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fetchError || 'Sin respuesta'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Formulario de Cambio Manual con Tasa Transcrita Automáticamente */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                Nueva Tasa a Grabar en el Sistema (Bs. por 1 USD):
              </label>
              {officialBcvRate && Math.abs(parsedInputRate - officialBcvRate) < 0.001 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {isFutureRate ? 'Tasa futura transcrita' : 'Tasa oficial transcrita'}
                </span>
              ) : officialBcvRate ? (
                <button
                  type="button"
                  onClick={() => setManualRateInput(officialBcvRate.toString())}
                  className="text-[11px] font-bold text-[#005da9] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Reestablecer oficial ({officialBcvRate.toFixed(4)})</span>
                </button>
              ) : null}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <span className="text-gray-400 font-black text-sm">Bs.</span>
              </div>
              <input
                type="text"
                value={manualRateInput}
                onChange={(e) => setManualRateInput(e.target.value)}
                placeholder="Ej: 842.2067"
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-base font-black font-mono text-gray-900 focus:ring-2 focus:ring-[#005da9] focus:outline-hidden shadow-2xs"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-gray-500 font-medium mt-2">
              ⚡ Al grabar, se actualizan y recalculan <strong>en tiempo real</strong> todos los módulos: Catálogo, Punto de Venta (POS), Cotizaciones, Cuentas por Cobrar, Mercancías y Reportes.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs rounded-full border border-slate-200/90 shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5 text-[#005da9]" />
            <span>Cancelar</span>
          </button>
          <button
            type="button"
            onClick={handleSaveRate}
            disabled={saving || !isValidRate}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-2.5 bg-white hover:bg-blue-50/50 active:bg-blue-100/50 text-[#005da9] font-black text-xs rounded-full border border-blue-200/90 shadow-xs hover:shadow-md transition-all cursor-pointer min-w-[190px] disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#005da9]" />
                <span>Grabando en Supabase...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#005da9]" />
                <span>Grabar y Recalcular</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
