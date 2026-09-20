import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ClipboardList, CheckCircle2, Clock, Truck, Store, 
  RefreshCw, MessageCircle, Sparkles, Trophy, ShieldCheck, Eye, EyeOff
} from 'lucide-react';
import { Order } from '../types.ts';
import { dbService } from '../lib/supabase.ts';
import { isPushSupported, getSubscriptionStatus, subscribeUser } from '../lib/pushNotifications.ts';

interface OrderTrackingModalProps {
  orderId: string;
  onClose: () => void;
  activeOrders?: Order[];
  onRefreshActiveOrders?: () => void;
}

export default function OrderTrackingModal({ orderId, onClose, activeOrders = [], onRefreshActiveOrders }: OrderTrackingModalProps) {
  const [currentOrderId, setCurrentOrderId] = useState<string>(orderId);
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    getSubscriptionStatus().then(status => {
      setIsSubscribed(status === 'granted');
    });
  }, [order]);

  const handleSubscribePush = async () => {
    if (!order) return;
    setSubscribing(true);
    try {
      const ok = await subscribeUser(order.id);
      if (ok) {
        setIsSubscribed(true);
      } else {
        alert("No se pudo habilitar las notificaciones. Asegúrate de otorgar los permisos en tu navegador.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubscribing(false);
    }
  };

  useEffect(() => {
    setCurrentOrderId(orderId);
  }, [orderId]);

  const fetchOrder = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      if (currentOrderId === 'temp-last-order') {
        // Fallback mockup if Supabase is offline or order wasn't saved
        const localItemsStr = localStorage.getItem('copias_bellavista_last_order_items') || '[]';
        setOrder({
          id: 'temp-last-order',
          customer_name: 'Cliente Catálogo',
          phone_number: '+58 412-5043857',
          delivery_method: 'retiro',
          address_text: null,
          items: [],
          total_price: 15.00,
          status: 'pendiente',
          payment_method: 'pagomovil',
          payment_status: 'pendiente',
          points: 15,
          order_number: 7
        });
      } else {
        const data = await dbService.getOrder(currentOrderId);
        if (data) {
          setOrder(data);
          setError(null);
          if (onRefreshActiveOrders) {
            onRefreshActiveOrders();
          }
        } else {
          setError('No pudimos encontrar los detalles del pedido en la base de datos.');
        }
      }
    } catch (e) {
      console.error("Error fetching tracking order:", e);
      setError('Error al conectar con el servidor.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchOrder();

    // Set up polling interval to check order status in real-time every 8 seconds
    const interval = setInterval(() => {
      fetchOrder();
    }, 8000);

    return () => clearInterval(interval);
  }, [currentOrderId]);

  // Determine current active index of the step
  // States: 'pendiente' / 'recibido' -> 'preparacion' -> 'en_camino' / 'listo' -> 'entregado'
  const getStepIndex = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'entregado') return 3;
    if (s === 'en_camino' || s === 'listo' || s === 'en camino' || s === 'listo para retirar') return 2;
    if (s === 'preparacion' || s === 'en preparacion' || s === 'preparando') return 1;
    return 0; // recibido / pendiente
  };

  // Human friendly status labels
  const getStatusText = (status: string, method: 'b2c' | 'retiro') => {
    const s = (status || '').toLowerCase();
    if (s === 'entregado') return 'Entregado';
    if (s === 'en_camino' || s === 'en camino') return 'En camino a tu dirección';
    if (s === 'listo' || s === 'listo para retirar') return 'Listo para retirar en tienda';
    if (s === 'preparacion' || s === 'en preparacion' || s === 'preparando') return 'En preparación';
    if (s === 'cancelado') return 'Cancelado (Pedido anulado)';
    
    // Default or fallback based on delivery method
    if (s === 'pendiente' || s === 'recibido') {
      return 'Recibido (Pendiente por confirmar)';
    }
    return status || 'Recibido';
  };

  const steps = [
    { label: 'Recibido', icon: ClipboardList, desc: 'Pedido ingresado en tienda' },
    { label: 'En preparación', icon: Clock, desc: 'Imprimiendo y encuadernando' },
    { 
      label: order?.delivery_method === 'b2c' ? 'En camino' : 'Listo para retirar', 
      icon: order?.delivery_method === 'b2c' ? Truck : Store, 
      desc: order?.delivery_method === 'b2c' ? 'Repartidor en ruta' : 'Pasa a buscar tu pedido' 
    },
    { label: 'Entregado', icon: CheckCircle2, desc: '¡Gracias por tu compra!' }
  ];

  const activeIndex = order ? getStepIndex(order.status) : 0;

  // Format payment method name nicely
  const getPaymentMethodLabel = (method: string) => {
    if (!method) return 'No especificado';
    const m = (method || '').toLowerCase();
    if (m === 'pagomovil') return 'Pagomóvil';
    if (m === 'efectivo') return 'Efectivo';
    if (m === 'transferencia') return 'Transferencia Bancaria';
    return method;
  };

  const formatOrderNumber = (num: number | string | undefined | null) => {
    if (num === undefined || num === null) return '0000001';
    const parsed = parseInt(String(num), 10);
    if (isNaN(parsed)) return String(num);
    return String(parsed).padStart(7, '0');
  };

  const isPaid = (order?.payment_status || '').toLowerCase() === 'pagado';

  const sendWhatsAppHelp = () => {
    if (!order) return;
    const orderNumText = formatOrderNumber(order.order_number);
    const msg = `Hola Copias Bella Vista, estoy consultando el estado de mi pedido #${orderNumText} (ID: ${order.id}). ¿Tienen alguna actualización?`;
    window.open(`https://api.whatsapp.com/send?phone=584125043857&text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="bg-[#131921] text-white px-4 py-4 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF9900] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF9900]"></span>
            </span>
            <h3 className="font-extrabold text-sm uppercase tracking-wider">Seguimiento de Pedido</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOrder(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
              title="Actualizar estado"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#FF9900]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-center">
          {/* Active Orders Switcher Selector */}
          {activeOrders && activeOrders.length > 1 && (
            <div className="bg-[#008296]/5 p-2.5 rounded-lg border border-[#008296]/15 text-left mb-2 select-none animate-fadeIn">
              <p className="text-[10px] text-[#008296] font-black uppercase tracking-wider mb-2">Pedidos activos en proceso ({activeOrders.length}):</p>
              <div className="flex flex-wrap gap-1.5">
                {activeOrders.map((actOrder) => {
                  if (!actOrder || !actOrder.id) return null;
                  const isSelected = actOrder.id === currentOrderId;
                  return (
                    <button
                      key={actOrder.id}
                      onClick={() => {
                        setCurrentOrderId(actOrder.id!);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-black transition cursor-pointer border ${
                        isSelected
                          ? 'bg-[#008296] text-white border-[#008296] shadow-sm'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      #{formatOrderNumber(actOrder.order_number)} ({getStatusText(actOrder.status, actOrder.delivery_method)})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[#FF9900]" />
              <p className="text-xs text-gray-500 font-extrabold uppercase tracking-widest">Cargando detalles de tu pedido...</p>
            </div>
          ) : error || !order ? (
            <div className="py-8 text-center space-y-4">
              <p className="text-sm text-rose-600 font-bold">{error || 'Ha ocurrido un error al cargar el pedido.'}</p>
              <button
                onClick={() => fetchOrder(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-black text-xs uppercase cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Order Metadata and Highlight */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex justify-between items-center text-left">
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Número de Pedido</p>
                  <p className="text-2xl font-black text-[#131921]">#{formatOrderNumber(order.order_number)}</p>
                  <p className="text-[11px] text-[#008296] font-bold mt-0.5">
                    Cliente: <span className="text-gray-800">{order.customer_name}</span>
                  </p>
                </div>
                
                {/* Payment Status Badge */}
                <div className="text-right space-y-1">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Estado de Pago</p>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                    isPaid 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                    {isPaid ? 'Pagado' : 'No pagado'}
                  </span>
                </div>
              </div>

              {/* Status Header text */}
              <div className={`space-y-1 p-3 rounded-lg text-left border ${
                (order?.status || '').toLowerCase() === 'cancelado' 
                  ? 'bg-rose-50 border-rose-200 text-rose-950' 
                  : (order?.status || '').toLowerCase() === 'entregado'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-[#008296]/5 border-[#008296]/20 text-gray-950'
              }`}>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  (order?.status || '').toLowerCase() === 'cancelado' 
                    ? 'text-rose-600' 
                    : (order?.status || '').toLowerCase() === 'entregado'
                    ? 'text-emerald-600'
                    : 'text-[#008296]'
                }`}>
                  Estatus Actual
                </span>
                <p className="text-base font-black leading-tight">
                  {getStatusText(order?.status || '', order?.delivery_method)}
                </p>
              </div>

              {/* Push Notifications Opt-In Panel */}
              {pushSupported && (
                <div className="bg-amber-50/50 border border-amber-200/60 rounded-lg p-3 text-left flex items-start gap-3 animate-fadeIn">
                  <div className="bg-amber-100/80 p-1.5 rounded-lg text-amber-700 shrink-0 mt-0.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-amber-950 font-black uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                      🔔 Notificaciones Push en esta pantalla
                    </p>
                    <p className="text-[11px] text-amber-800 leading-normal font-medium mb-2">
                      {isSubscribed 
                        ? '¡Excelente! Este dispositivo recibirá alertas en tiempo real al cambiar el estado de tu pedido (incluso si la web está cerrada).'
                        : 'Recibe alertas instantáneas en tu dispositivo al cambiar el estado de tu pedido en tiempo real, totalmente gratis.'}
                    </p>
                    {!isSubscribed ? (
                      <button
                        onClick={handleSubscribePush}
                        disabled={subscribing}
                        className="px-3 py-1 bg-[#008296] hover:bg-[#005da9] text-white text-[11px] font-black uppercase tracking-wide rounded-md transition duration-150 shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {subscribing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Activando...</span>
                          </>
                        ) : (
                          <span>Activar alertas en mi celular</span>
                        )}
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Alertas Activas en este dispositivo
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Steps and tracking phases */}
              {(order?.status || '').toLowerCase() === 'cancelado' ? (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-left flex items-start gap-3 animate-fadeIn">
                  <div className="bg-rose-100 p-2 rounded-lg text-rose-600 shrink-0">
                    <X className="w-5 h-5 font-black" />
                  </div>
                  <div>
                    <p className="text-xs text-rose-950 font-black uppercase tracking-wider mb-0.5">Pedido Cancelado</p>
                    <p className="text-[11px] text-rose-700 leading-normal font-semibold">
                      Este pedido ha sido cancelado o anulado. Si tienes alguna duda o deseas reprogramar, por favor haz clic en "Preguntar por WhatsApp" para comunicarte directamente con nosotros.
                    </p>
                  </div>
                </div>
              ) : (
                /* Visual Stepper Horizontal */
                <div className="py-4 px-2 relative">
                  {/* Connecting Line background */}
                  <div className="absolute top-8 left-8 right-8 h-1 bg-gray-200 -z-10 rounded" />
                  {/* Connecting Active Line progress */}
                  <div 
                    className="absolute top-8 left-8 h-1 bg-[#FF9900] -z-10 rounded transition-all duration-500" 
                    style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
                  />

                  {/* Steps markers */}
                  <div className="grid grid-cols-4 relative z-10">
                    {steps.map((step, idx) => {
                      const Icon = step.icon;
                      const isCompleted = idx < activeIndex;
                      const isActive = idx === activeIndex;
                      const isFuture = idx > activeIndex;

                      return (
                        <div key={idx} className="flex flex-col items-center text-center space-y-2">
                          {/* Step Circle */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition duration-300 shadow-sm ${
                            isCompleted 
                              ? 'bg-[#FF9900] border-[#FF9900] text-[#131921]' 
                              : isActive 
                              ? 'bg-white border-[#FF9900] text-[#FF9900] scale-110 ring-4 ring-[#FF9900]/10' 
                              : 'bg-white border-gray-300 text-gray-400'
                          }`}>
                            <Icon className="w-4 h-4 font-black" />
                          </div>
                          {/* Label */}
                          <div className="space-y-0.5">
                            <p className={`text-[9px] leading-tight font-extrabold uppercase tracking-wider ${
                              isActive ? 'text-[#131921] font-black' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                            }`}>
                              {step.label}
                            </p>
                            <p className="hidden md:block text-[8px] leading-none text-gray-400 font-medium">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Loyalty Gamification points */}
              {Boolean(order.points && order.points > 0) && (
                <div className="bg-amber-50/75 border border-amber-200 rounded-lg p-3 text-left flex items-start gap-3">
                  <div className="bg-[#FF9900]/15 p-2 rounded-lg text-[#FF9900] shrink-0 mt-0.5">
                    <Trophy className="w-4 h-4 text-[#FF9900]" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-amber-800 font-black uppercase tracking-wider flex items-center gap-1">
                      Fidelidad Bella Vista <Sparkles className="w-3 h-3 text-[#FF9900] animate-spin" />
                    </p>
                    <p className="text-xs text-amber-950 font-bold leading-normal">
                      Al completar este pedido, ganarás <span className="text-[#FF9900] font-black underline">{order.points}</span> puntos.
                    </p>
                    <p className="text-[9px] text-amber-700/80 font-medium">
                      ¡Acumula puntos para canjearlos por copias gratis, carpetas, libretas y más artículos de oficina!
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Summary Details */}
              <div className="text-left bg-gray-50 rounded-lg p-3.5 border border-gray-100 text-xs space-y-2">
                <div className="flex justify-between font-bold border-b border-gray-200 pb-1.5 mb-1 text-gray-700">
                  <span>Resumen de entrega y pago</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-gray-600 font-medium text-[11px]">
                  <div>📍 Método de Entrega:</div>
                  <div className="text-right font-bold text-gray-900">
                    {order.delivery_method === 'retiro' ? 'Retiro en Tienda' : 'Envío a Domicilio'}
                  </div>
                  
                  {order.delivery_method === 'b2c' && order.address_text && (
                    <>
                      <div className="col-span-2 text-gray-400 mt-0.5">Dirección cargada:</div>
                      <div className="col-span-2 bg-white/70 p-1.5 rounded border border-gray-100 italic text-[10px] text-gray-700 truncate">
                        {order.address_text.split('\n')[0]}
                      </div>
                    </>
                  )}

                  <div>💳 Método de Pago:</div>
                  <div className="text-right font-bold text-gray-900">
                    {getPaymentMethodLabel(order.payment_method || '')}
                  </div>

                  {order.payment_amount_with && (
                    <>
                      <div>💵 Paga con:</div>
                      <div className="text-right font-black text-[#008296]">
                        US$ {order.payment_amount_with.toFixed(2)}
                      </div>
                      <div>🪙 Cambio Estimado:</div>
                      <div className="text-right font-black text-emerald-600">
                        US$ {(order.payment_amount_with - order.total_price).toFixed(2)}
                      </div>
                    </>
                  )}

                  <div className="col-span-2 border-t border-dashed border-gray-200 pt-1.5 mt-1 flex justify-between font-bold text-xs text-gray-900">
                    <span>Monto Total:</span>
                    <span>US$ {order.total_price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 border-t border-gray-100 p-4 flex gap-2 shrink-0">
          <button
            onClick={sendWhatsAppHelp}
            disabled={!order}
            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition"
          >
            <MessageCircle className="w-4 h-4" />
            Preguntar por WhatsApp
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-black text-xs uppercase tracking-wider cursor-pointer transition"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
