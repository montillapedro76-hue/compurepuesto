/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Phone, MapPin, Clock, Truck, Store, MessageCircle, ExternalLink } from 'lucide-react';

interface InfoModalProps {
  onClose: () => void;
}

export default function InfoModal({ onClose }: InfoModalProps) {
  const [isOpenNow, setIsOpenNow] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTimeText, setCurrentTimeText] = useState('');

  // Schedule matrix logic
  // Monday to Saturday (1 to 6):
  // 08:00 AM – 12:00 PM (480 to 720 minutes)
  // 02:30 PM – 06:00 PM (870 to 1080 minutes)
  // Sunday (0): Closed
  useEffect(() => {
    const updateStatus = () => {
      const now = new Date();
      const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
      
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const currentMinutes = hours * 60 + minutes;

      const morningStart = 8 * 60;         // 08:00 AM = 480 mins
      const morningEnd = 12 * 60;          // 12:00 PM = 720 mins
      const afternoonStart = 14 * 60 + 30; // 02:30 PM = 870 mins
      const afternoonEnd = 18 * 60;        // 06:00 PM = 1080 mins

      // Format current time text for display
      const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      setCurrentTimeText(`${dayNames[day]}, ${formattedTime}`);

      if (day === 0) {
        setIsOpenNow(false);
        setStatusText('Cerrado - Abre el Lunes a las 08:00 AM');
        return;
      }

      const inMorning = currentMinutes >= morningStart && currentMinutes <= morningEnd;
      const inAfternoon = currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd;

      if (inMorning) {
        setIsOpenNow(true);
        setStatusText('Abierto - Turno Mañana (Cierra a las 12:00 PM)');
      } else if (inAfternoon) {
        setIsOpenNow(true);
        setStatusText('Abierto - Turno Tarde (Cierra a las 06:00 PM)');
      } else {
        setIsOpenNow(false);
        if (currentMinutes < morningStart) {
          setStatusText('Cerrado - Abre hoy a las 08:00 AM');
        } else if (currentMinutes < afternoonStart) {
          setStatusText('Cerrado - Abre hoy a las 02:30 PM');
        } else {
          const nextDay = day === 6 ? 'el Lunes' : 'mañana';
          setStatusText(`Cerrado - Abre ${nextDay} a las 08:00 AM`);
        }
      }
    };

    updateStatus();
    // Update every 30 seconds
    const interval = setInterval(updateStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const whatsappUrl = `https://wa.me/584125043857?text=Hola%20Copias%20Bella%20Vista,%20me%20gustar%C3%ADa%20hacer%20una%20consulta.`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=Carrera+6+entre+Calle+19+y+20+local+1-3+Barinitas+Barinas+Venezuela`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs select-none overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 animate-fadeIn my-auto"
        onClick={(e) => e.stopPropagation()}
        id="info-modal-container"
      >
        {/* Banner principal */}
        <div className="bg-[#131921] px-5 py-4 text-white flex justify-between items-center border-b-4 border-[#FF9900]">
          <div className="flex items-center gap-3">
            <div className="bg-[#FF9900] text-[#131921] p-2 rounded-xl font-black text-base shadow-xs">
              CBV
            </div>
            <div className="text-left">
              <h2 className="text-base sm:text-lg font-black uppercase tracking-wide leading-none">Copias Bella Vista</h2>
              <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-1">Tu centro de impresión y copiado</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1.5 hover:bg-gray-800 rounded-full cursor-pointer"
            id="info-modal-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Badge dinámico de estado */}
          <div className="bg-gray-50/80 border border-gray-200/80 rounded-xl p-3 flex flex-col sm:flex-row items-center sm:justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-gray-500 shrink-0" />
              <div className="text-left">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Estado de Atención</p>
                <p className="text-xs text-gray-700 font-extrabold">{currentTimeText}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-center sm:items-end">
              <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-2xs transition-all ${
                isOpenNow 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isOpenNow ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {isOpenNow ? 'Abierto' : 'Cerrado'}
              </span>
              <p className="text-[10px] text-gray-500 font-medium mt-1 text-center sm:text-right">
                {statusText}
              </p>
            </div>
          </div>

          {/* Detalles del Establecimiento */}
          <div className="space-y-2.5">
            <h3 className="text-xs text-gray-400 font-extrabold uppercase tracking-widest text-left border-b border-gray-100 pb-1">
              Detalles del Establecimiento
            </h3>
            
            {/* Dirección interactiva a Google Maps */}
            <a 
              href={mapsUrl} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 hover:bg-amber-100/60 border border-amber-200/60 transition group cursor-pointer text-left shadow-2xs"
              title="Toca para abrir en Google Maps"
            >
              <div className="bg-[#FF9900] text-[#131921] p-2 rounded-lg mt-0.5 shrink-0 shadow-xs">
                <MapPin className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] text-amber-900 font-black uppercase tracking-wider">Dirección de la Tienda</p>
                  <span className="text-[10px] text-amber-700 font-extrabold flex items-center gap-0.5 group-hover:underline">
                    Abrir GPS <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
                <p className="text-xs text-gray-900 font-black leading-snug mt-0.5">
                  Carrera 6 entre Calle 19 y 20, local 1-3
                </p>
                <p className="text-[11px] text-gray-600 font-medium">Barinitas, Estado Barinas, Venezuela</p>
              </div>
            </a>

            {/* CTA Primario WhatsApp */}
            <a 
              href={whatsappUrl} 
              target="_blank" 
              rel="noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white py-2.5 px-4 rounded-xl shadow-md font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer border border-emerald-400/30"
              id="btn-whatsapp-cta"
            >
              <MessageCircle className="w-4 h-4 fill-current shrink-0" />
              <span>Chatear por WhatsApp</span>
            </a>
          </div>

          {/* Tipos de servicio soportados (Badges informativas) */}
          <div className="space-y-2">
            <h3 className="text-xs text-gray-400 font-extrabold uppercase tracking-widest text-left border-b border-gray-100 pb-1">
              Tipos de Servicio Soportados
            </h3>
            
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              {/* Servicio A domicilio */}
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-2.5 flex items-center gap-2.5 text-left shadow-2xs">
                <div className="bg-emerald-500 text-white p-2 rounded-lg shrink-0 shadow-xs">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-emerald-950 font-black truncate">A Domicilio</p>
                  <p className="text-[10px] text-emerald-700 font-medium truncate">Recibe en casa</p>
                </div>
              </div>

              {/* Servicio Retiro en tienda */}
              <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-2.5 flex items-center gap-2.5 text-left shadow-2xs">
                <div className="bg-blue-600 text-white p-2 rounded-lg shrink-0 shadow-xs">
                  <Store className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-blue-950 font-black truncate">Retiro en Tienda</p>
                  <p className="text-[10px] text-blue-700 font-medium truncate">Recoge en local</p>
                </div>
              </div>
            </div>
          </div>

          {/* Matriz de Horarios de Atención Agrupada */}
          <div className="space-y-2 bg-[#F7F9FA] rounded-xl p-3.5 border border-gray-200/80 text-left">
            <div className="flex items-center justify-between">
              <h4 className="text-xs text-gray-800 font-black flex items-center gap-1.5 uppercase tracking-wide">
                <Clock className="w-4 h-4 text-[#FF9900]" />
                Horarios de Atención
              </h4>
              <span className="text-[10px] text-gray-400 font-bold uppercase">Venezuela (GMT-4)</span>
            </div>

            <div className="space-y-2 pt-0.5">
              {/* Lunes a Sábado */}
              <div className="bg-white p-2.5 rounded-lg border border-gray-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shadow-2xs">
                <span className="text-xs font-black text-gray-900 shrink-0">Lunes a Sábado</span>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-700">
                  <span className="bg-amber-50 text-amber-950 px-2 py-0.5 rounded border border-amber-200/80 whitespace-nowrap">
                    08:00 AM - 12:00 PM
                  </span>
                  <span className="text-gray-400 font-normal">/</span>
                  <span className="bg-amber-50 text-amber-950 px-2 py-0.5 rounded border border-amber-200/80 whitespace-nowrap">
                    02:30 PM - 06:00 PM
                  </span>
                </div>
              </div>

              {/* Domingo */}
              <div className="bg-white p-2.5 rounded-lg border border-gray-200/60 flex items-center justify-between gap-1 shadow-2xs">
                <span className="text-xs font-black text-gray-900">Domingo</span>
                <span className="bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded border border-rose-200/80 text-[11px] font-black uppercase">
                  Cerrado (No laborable)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con Botón ENTENDIDO Ancho Completo */}
        <div className="bg-gray-50 px-4 sm:px-5 py-3.5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#131921] hover:bg-[#232F3E] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md active:scale-[0.98] flex items-center justify-center"
            id="info-modal-entendido-btn"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

