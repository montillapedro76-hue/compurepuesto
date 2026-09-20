import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Search, DollarSign, CreditCard, ChevronRight, ChevronLeft, 
  Check, Zap, CheckCircle, Calendar, Building, Plus, FileText, 
  AlertCircle, ArrowLeft, Receipt, ShieldCheck, HelpCircle, 
  Coins, Landmark, MessageSquare, Ticket, RefreshCw, X, Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../lib/supabase';

interface VentasFlashModuleProps {
  bcvRate: number;
  currentUser: any;
  onRefreshData?: () => void;
  onOpenBalance?: () => void;
}

export default function VentasFlashModule({
  bcvRate = 36.5,
  currentUser,
  onRefreshData,
  onOpenBalance
}: VentasFlashModuleProps) {
  // Steps: 1 = Selección del Cliente, 2 = Modalidad de Pago, 3 = Método de Pago, 4 = Pago Final / Confirmación
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Database Data States
  const [clients, setClients] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form Input States
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  // Modality: 'contado' or 'credito'
  const [paymentModality, setPaymentModality] = useState<'contado' | 'credito'>('contado');

  // Payment Method for Contado
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo USD');
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [refNumber, setRefNumber] = useState('');
  const [paymentAmountUSD, setPaymentAmountUSD] = useState<string>('10.00'); // Default demo amount
  const [paymentNotes, setPaymentNotes] = useState('');
  const [invoiceConcept, setInvoiceConcept] = useState('Servicios Generales / Venta de Papelería');

  // Success Confirmation State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<any>(null);

  // Load clients and bank accounts
  const loadData = async () => {
    setIsLoading(true);
    try {
      const fetchedClients = await dbService.getClients();
      setClients(fetchedClients || []);
      
      const fetchedBanks = await dbService.getBankAccounts();
      setBankAccounts(fetchedBanks || []);
      if (fetchedBanks && fetchedBanks.length > 0) {
        setSelectedBank(fetchedBanks[0]);
      }
    } catch (err) {
      console.error("Error loading Ventas Flash data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered clients list
  const filteredClients = useMemo(() => {
    const term = clientSearch.toLowerCase().trim();
    if (!term) return clients.slice(0, 5); // Return first 5 clients if empty
    return clients.filter(c => 
      (c.name || '').toLowerCase().includes(term) ||
      (c.document || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  }, [clients, clientSearch]);

  // Fast-select "Consumidor Final" client helper
  const handleSelectConsumidorFinal = () => {
    const finalConsumidor = clients.find(c => 
      (c.name || '').toLowerCase().includes('consumidor final') ||
      (c.document || '').includes('99999999')
    ) || {
      id: 'consumidor-final',
      name: 'Consumidor Final',
      document: 'V-99999999',
      doc_type: 'V',
      doc_number: '99999999',
      type: 'Natural',
      phone: 'N/A',
      email: 'consumidor@final.com',
      address: 'Sin dirección registrada',
      credit_usd: 0
    };
    setSelectedClient(finalConsumidor);
    setStep(2); // Auto-advance to modality selection
  };

  // Convert USD to Bs/VES based on rate
  const paymentAmountVES = useMemo(() => {
    const usdVal = parseFloat(paymentAmountUSD) || 0;
    return usdVal * bcvRate;
  }, [paymentAmountUSD, bcvRate]);

  // Handle final invoice submission
  const handleConfirmCheckout = async () => {
    if (!selectedClient) return;

    const usdVal = parseFloat(paymentAmountUSD) || 0;
    const bsVal = usdVal * bcvRate;

    // Build unique invoice controls
    const invoicePayload = {
      customer_name: selectedClient.name,
      document_type: 'factura',
      payment_method: paymentModality === 'credito' ? 'Crédito' : paymentMethod,
      subtotal: usdVal,
      iva: 0,
      total: usdVal,
      notes: paymentNotes || `Venta Flash - ${invoiceConcept}`,
      items: [
        {
          id: 'item-flash-1',
          name: invoiceConcept,
          qty: 1,
          price_usd: usdVal,
          subtotal: usdVal
        }
      ]
    };

    try {
      // 1. Create the official invoice record
      const invoiceResult = await dbService.createInvoice(invoicePayload);
      setCreatedInvoice(invoiceResult);

      // 2. Register Cash operation if it is Contado
      if (paymentModality === 'contado') {
        await dbService.addCashOp({
          type: 'ingreso',
          concept: `Cobro Factura ${invoiceResult.control_number} - ${selectedClient.name}`,
          amount: usdVal,
          amount_bs: bsVal,
          currency_code: paymentMethod.includes('USD') || paymentMethod === 'Zelle' ? 'USD' : 'VES',
          payment_method: paymentMethod,
          observation: `Ref: ${refNumber || 'N/A'}. ${paymentNotes}`.trim()
        });
      } else {
        // If Crédito, we save the account receivable and update the client's debt balance
        const clientPhone = selectedClient.phone || selectedClient.telefono || '';
        const clientDoc = selectedClient.document || selectedClient.documento || '';
        const entityNameForCxc = clientPhone ? `${selectedClient.name} ${clientPhone}` : selectedClient.name;

        const cxcRecord = {
          id: crypto.randomUUID(),
          invoice_id: invoiceResult.id,
          invoice_number: invoiceResult.control_number || `INV-${invoiceResult.id.substring(0, 8).toUpperCase()}`,
          subject: `Crédito por Venta - Factura #${invoiceResult.control_number || ''}`,
          entity_name: entityNameForCxc || 'Consumidor final',
          client_id: selectedClient.id || null,
          client_name: entityNameForCxc || 'Consumidor final',
          client_phone: clientPhone,
          customer_name: entityNameForCxc || 'Consumidor final',
          customer_phone: clientPhone,
          customer_document: clientDoc,
          description: `Crédito registrado vía Venta Flash - ${invoiceConcept}`,
          total_amount: usdVal,
          paid_amount: 0,
          remaining_amount: usdVal,
          currency: 'USD',
          bcv_rate: bcvRate,
          status: 'pendiente' as const,
          issue_date: new Date().toISOString(),
          due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 días de plazo por defecto
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await dbService.saveAccountReceivable(cxcRecord);

        if (selectedClient.id && selectedClient.id !== 'consumidor-final') {
          const currentDebt = Number(selectedClient.credit_usd) || 0;
          const newDebt = currentDebt + usdVal;
          await dbService.updateClient(selectedClient.id, {
            credit_usd: newDebt
          });
        }
      }

      // Trigger callback if defined to refresh cash balance/statistics
      if (onRefreshData) {
        onRefreshData();
      }

      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bellavista_invoices_updated'));
          window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
          window.dispatchEvent(new CustomEvent('bellavista_accounts_receivable_updated'));
        }
      } catch (e) {}

      setShowSuccessModal(true);
    } catch (err) {
      console.error("Error processing flash sale payment:", err);
      alert("Hubo un problema al procesar el pago. Por favor intente de nuevo.");
    }
  };

  const handleSaveDraft = async () => {
    const usdVal = parseFloat(paymentAmountUSD) || 0;
    const clientNameToUse = selectedClient?.name || 'Consumidor Final';

    try {
      setIsLoading(true);
      const drafts = await dbService.getDraftInvoices();
      const ref = `ESP-${1001 + (drafts?.length || 0)}`;

      await dbService.createDraftInvoice({
        reference: ref,
        customer_name: clientNameToUse,
        payment_method: paymentModality === 'credito' ? 'Crédito' : paymentMethod,
        subtotal: usdVal,
        iva: 0,
        total: usdVal,
        items: [
          {
            product_id: 'draft-item-flash',
            name: invoiceConcept,
            sku: '99999',
            qty: 1,
            price: usdVal,
            total: usdVal,
            tax_id: 'exento',
            tax_rate: 0,
            tax_amount: 0
          }
        ],
        taxes_detail: []
      });

      handleResetFlow();
      if (onRefreshData) onRefreshData();
      alert(`¡Factura guardada en espera exitosamente (${ref})! Los formularios han sido limpiados.`);
    } catch (err) {
      console.error("Error saving draft invoice:", err);
      alert("Error al guardar la factura en espera.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetFlow = () => {
    setSelectedClient(null);
    setPaymentModality('contado');
    setPaymentMethod('Efectivo USD');
    setRefNumber('');
    setPaymentAmountUSD('10.00');
    setPaymentNotes('');
    setInvoiceConcept('Servicios Generales / Venta de Papelería');
    setShowSuccessModal(false);
    setCreatedInvoice(null);
    setStep(1);
    loadData();
  };

  return (
    <div className="w-full bg-[#F8F9FA] rounded-2xl border border-[#005da9]/20 p-4 md:p-6 font-poppins min-h-[600px] flex flex-col justify-between shadow-sm">
      
      {/* Upper Wizard Navigation Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-[#005da9]/15 mb-6 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-gradient-to-br from-[#1D3557] to-[#005da9] rounded-xl text-[#40E0D0] shadow-xs">
                <Zap className="w-5 h-5 fill-[#40E0D0]/20" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-[#1D3557] uppercase tracking-wider font-montserrat flex items-center gap-2">
                  Ventas Flash
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#40E0D0]/20 text-[#005da9] border border-[#40E0D0]/40 tracking-normal lowercase first-letter:uppercase">
                    express
                  </span>
                </h2>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 font-medium mt-1">
              Procesa cobros rápidos y emisión de facturas al contado o crédito en 4 sencillos pasos.
            </p>
          </div>

          {/* Stepper visual progress indicator */}
          <div className="flex items-center gap-2 select-none self-start md:self-center bg-white px-3.5 py-2 rounded-2xl border border-gray-200 shadow-2xs">
            {[
              { num: 1, label: "Cliente" },
              { num: 2, label: "Modalidad" },
              { num: 3, label: "Pago" },
              { num: 4, label: "Confirmar" }
            ].map((s) => (
              <React.Fragment key={s.num}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black font-montserrat transition-all ${
                    step === s.num 
                      ? 'bg-gradient-to-r from-[#005da9] to-[#1D3557] text-white ring-4 ring-[#40E0D0]/30 shadow-xs' 
                      : step > s.num 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {step > s.num ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
                  </div>
                  <span className={`text-[10px] uppercase font-montserrat font-extrabold tracking-wider ${
                    step === s.num ? 'text-[#005da9]' : step > s.num ? 'text-[#1D3557]' : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {s.num < 4 && (
                  <div className={`w-5 h-[2px] transition-colors rounded-full ${
                    step > s.num ? 'bg-emerald-400' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* STEP 1: SELECCIÓN DEL CLIENTE */}
        {step === 1 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="bg-gradient-to-r from-[#1D3557]/8 via-[#005da9]/8 to-[#40E0D0]/10 border border-[#005da9]/20 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-gradient-to-br from-[#1D3557] to-[#005da9] text-[#40E0D0] rounded-xl shrink-0 shadow-xs">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-montserrat font-extrabold text-xs text-[#1D3557] uppercase tracking-wide">Paso 1: Seleccionar Cliente</h4>
                  <p className="text-[11px] text-gray-600 font-medium">Busque un cliente registrado en el directorio o utilice el botón rápido de Consumidor Final.</p>
                </div>
              </div>
              
              <button
                onClick={handleSelectConsumidorFinal}
                className="px-4 py-2.5 bg-gradient-to-r from-[#005da9] to-[#1D3557] hover:from-[#004b88] hover:to-[#152740] text-white rounded-xl text-xs font-montserrat font-extrabold shadow-sm hover:shadow-md flex items-center gap-1.5 cursor-pointer transition active:scale-95 uppercase tracking-wider border-b-2 border-[#1D3557]/40"
              >
                <Zap className="w-3.5 h-3.5 text-[#40E0D0] fill-[#40E0D0]" />
                <span>Consumidor Rápido</span>
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#005da9] w-4 h-4" />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar cliente por Nombre, RIF, Cédula o Teléfono..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#005da9] focus:border-[#005da9] transition shadow-2xs"
              />
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-[#005da9] animate-spin" />
                <span className="text-xs text-[#1D3557] font-montserrat font-bold uppercase">Cargando directorio de clientes...</span>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {filteredClients.map((client) => {
                  const isSelected = selectedClient?.id === client.id;
                  return (
                    <div
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'border-[#005da9] bg-[#005da9]/8 shadow-sm ring-1 ring-[#005da9]' 
                          : 'border-gray-200 bg-white hover:border-[#005da9]/40 hover:bg-gray-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-montserrat font-black text-xs ${
                          isSelected 
                            ? 'bg-gradient-to-br from-[#005da9] to-[#1D3557] text-white shadow-2xs' 
                            : 'bg-gray-100 text-[#1D3557]'
                        }`}>
                          {client.name ? client.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-montserrat font-bold text-[#1D3557] truncate">{client.name}</h5>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-gray-500 font-semibold uppercase">
                            <span>Doc: {client.doc_type || 'V'}-{client.doc_number || client.document || '99999999'}</span>
                            {client.phone && <span>Tlf: {client.phone}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {client.credit_usd > 0 && (
                          <div className="text-right">
                            <span className="block text-[8px] text-red-500 font-montserrat font-extrabold uppercase">Deuda Pendiente</span>
                            <span className="text-xs font-mono font-black text-red-600">${client.credit_usd.toFixed(2)}</span>
                          </div>
                        )}
                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                          isSelected ? 'border-[#005da9] bg-[#005da9] text-white shadow-2xs' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredClients.length === 0 && (
                  <div className="py-8 bg-white border border-gray-200 rounded-2xl text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 font-montserrat font-bold uppercase">No se encontraron clientes</p>
                    <button
                      onClick={() => handleSelectConsumidorFinal()}
                      className="mt-2 text-xs text-[#005da9] font-montserrat font-extrabold underline hover:text-[#1D3557] cursor-pointer"
                    >
                      Usar Consumidor Final como predeterminado
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedClient && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between"
              >
                <div>
                  <span className="text-[9px] font-montserrat font-extrabold text-emerald-800 uppercase tracking-wider block">Cliente Seleccionado</span>
                  <span className="text-xs font-montserrat font-bold text-emerald-950 block">{selectedClient.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-montserrat font-extrabold text-emerald-900 uppercase">
                  <span>Confirmado</span>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* STEP 2: MODALIDAD DE PAGO */}
        {step === 2 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-5"
          >
            <div className="bg-gradient-to-r from-[#1D3557]/8 via-[#005da9]/8 to-[#40E0D0]/10 border border-[#005da9]/20 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2.5 bg-gradient-to-br from-[#1D3557] to-[#005da9] text-[#40E0D0] rounded-xl shrink-0 shadow-xs">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-montserrat font-extrabold text-xs text-[#1D3557] uppercase tracking-wide">Paso 2: Modalidad de Facturación</h4>
                <p className="text-[11px] text-gray-600 font-medium">Defina si el cobro se realiza de forma inmediata al contado o si se procesa como saldo a crédito.</p>
              </div>
            </div>

            {/* Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => setPaymentModality('contado')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between h-[160px] ${
                  paymentModality === 'contado'
                    ? 'border-[#005da9] bg-gradient-to-br from-white to-[#005da9]/10 shadow-sm ring-1 ring-[#005da9]'
                    : 'border-gray-200 bg-white hover:border-[#005da9]/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-xl ${paymentModality === 'contado' ? 'bg-gradient-to-br from-[#005da9] to-[#1D3557] text-[#40E0D0] shadow-xs' : 'bg-gray-100 text-gray-600'}`}>
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                    paymentModality === 'contado' ? 'border-[#005da9] bg-[#005da9] text-white shadow-2xs' : 'border-gray-300 bg-white'
                  }`}>
                    {paymentModality === 'contado' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
                <div>
                  <h5 className="font-montserrat font-extrabold text-sm text-[#1D3557] uppercase">Pago al Contado</h5>
                  <p className="text-[10px] text-gray-500 font-medium mt-1">
                    El cliente cancela el monto de la factura de forma inmediata a través de divisas o bolívares.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setPaymentModality('credito')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between h-[160px] ${
                  paymentModality === 'credito'
                    ? 'border-[#005da9] bg-gradient-to-br from-white to-[#005da9]/10 shadow-sm ring-1 ring-[#005da9]'
                    : 'border-gray-200 bg-white hover:border-[#005da9]/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-xl ${paymentModality === 'credito' ? 'bg-gradient-to-br from-[#005da9] to-[#1D3557] text-[#40E0D0] shadow-xs' : 'bg-gray-100 text-gray-600'}`}>
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                    paymentModality === 'credito' ? 'border-[#005da9] bg-[#005da9] text-white shadow-2xs' : 'border-gray-300 bg-white'
                  }`}>
                    {paymentModality === 'credito' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
                <div>
                  <h5 className="font-montserrat font-extrabold text-sm text-[#1D3557] uppercase">Venta a Crédito</h5>
                  <p className="text-[10px] text-gray-500 font-medium mt-1">
                    La factura se emite pero el cobro queda pendiente, agregando el saldo a la cuenta corriente del cliente.
                  </p>
                </div>
              </div>
            </div>

            {/* Display relevant warnings or credit status */}
            {paymentModality === 'credito' && selectedClient && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-amber-50 border border-amber-200 rounded-xl"
              >
                <div className="flex gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-montserrat font-bold text-amber-900 uppercase">Estado de Crédito - {selectedClient.name}</h5>
                    <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                      El saldo pendiente de este cliente es de <strong className="font-mono font-black">${selectedClient.credit_usd.toFixed(2)} USD</strong>. Al procesar como crédito, la nueva factura se sumará a esta deuda acumulada.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* STEP 3: MÉTODO DE PAGO */}
        {step === 3 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-5"
          >
            <div className="bg-gradient-to-r from-[#1D3557]/8 via-[#005da9]/8 to-[#40E0D0]/10 border border-[#005da9]/20 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2.5 bg-gradient-to-br from-[#1D3557] to-[#005da9] text-[#40E0D0] rounded-xl shrink-0 shadow-xs">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-montserrat font-extrabold text-xs text-[#1D3557] uppercase tracking-wide">Paso 3: Detalles Financieros del Pago</h4>
                <p className="text-[11px] text-gray-600 font-medium">Establezca el concepto de venta, el importe a facturar y el método de pago utilizado.</p>
              </div>
            </div>

            {/* Core Invoice Input Concept & Amount Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider">Concepto de Factura / Descripción</label>
                <input
                  type="text"
                  value={invoiceConcept}
                  onChange={(e) => setInvoiceConcept(e.target.value)}
                  placeholder="Ej: Impresión y encuadernación de tesis"
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-[#1D3557] focus:ring-2 focus:ring-[#005da9] focus:border-[#005da9] focus:outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider">Monto a Cobrar ($ USD)</label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#005da9] font-bold text-xs">$</div>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmountUSD}
                    onChange={(e) => setPaymentAmountUSD(e.target.value)}
                    className="w-full pl-8 pr-28 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-mono font-extrabold text-[#1D3557] focus:ring-2 focus:ring-[#005da9] focus:border-[#005da9] focus:outline-none transition"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] px-2.5 py-1 rounded-lg border border-emerald-200">
                    Bs. {paymentAmountVES.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* ONLY DISPLAY IF CONTADO: CHOOSE PAYMENT METHOD */}
            {paymentModality === 'contado' ? (
              <div className="space-y-4 pt-3 border-t border-gray-200">
                <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-2">Método de Cobro en Caja</label>
                
                {/* Modern grid of payment buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'Efectivo USD', icon: DollarSign, label: 'Efectivo USD' },
                    { id: 'Efectivo VES', icon: Coins, label: 'Efectivo VES' },
                    { id: 'Transferencia Bancaria', icon: Landmark, label: 'Transferencia' },
                    { id: 'Pago Móvil', icon: Zap, label: 'Pago Móvil' },
                    { id: 'Punto de Venta', icon: CreditCard, label: 'Punto de Venta' },
                    { id: 'Zelle', icon: Receipt, label: 'Zelle' }
                  ].map((m) => {
                    const isSelected = paymentMethod === m.id;
                    const IconComp = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                          isSelected 
                            ? 'border-[#005da9] bg-[#005da9]/10 shadow-xs text-[#005da9] ring-1 ring-[#005da9]' 
                            : 'border-gray-200 bg-white text-gray-600 hover:border-[#005da9]/40 hover:text-[#005da9]'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 ${isSelected ? 'text-[#005da9]' : 'text-gray-400'}`} />
                        <span className="text-[10px] font-montserrat font-extrabold uppercase tracking-wider">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-fields for Bank Transfer / Pago Móvil / Zelle */}
                {(paymentMethod === 'Transferencia Bancaria' || paymentMethod === 'Pago Móvil') && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white border border-[#005da9]/20 rounded-xl space-y-3 shadow-2xs"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-montserrat font-extrabold uppercase text-[#1D3557]">Seleccione Banco Destino</label>
                        <select
                          value={selectedBank?.id || ''}
                          onChange={(e) => {
                            const found = bankAccounts.find(b => b.id === e.target.value);
                            if (found) setSelectedBank(found);
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        >
                          {bankAccounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bank_name} - {b.account_number.slice(-4)}
                            </option>
                          ))}
                          {bankAccounts.length === 0 && (
                            <option value="">No hay cuentas bancarias registradas</option>
                          )}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-montserrat font-extrabold uppercase text-[#1D3557]">Número de Referencia</label>
                        <input
                          type="text"
                          value={refNumber}
                          onChange={(e) => setRefNumber(e.target.value)}
                          placeholder="Últimos 4 o 6 dígitos de la operación"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        />
                      </div>
                    </div>
                    {selectedBank && (
                      <div className="text-[10px] text-gray-500 font-bold uppercase bg-[#F8F9FA] p-2.5 rounded-lg border border-gray-200 flex items-center justify-between">
                        <span>Titular: {selectedBank.holder_name}</span>
                        <span>Doc: {selectedBank.rif_ci || 'N/A'}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-blue-50 border border-blue-200 rounded-xl"
              >
                <div className="flex gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#005da9] shrink-0" />
                  <div>
                    <h5 className="text-xs font-montserrat font-bold text-[#1D3557] uppercase">Sin Pago Inmediato</h5>
                    <p className="text-[10px] text-blue-800 font-medium mt-0.5">
                      Al estar en modalidad Crédito, no se registrará un cobro inmediato en efectivo ni cuentas bancarias. El total se registrará como saldo por cobrar en la cuenta corriente del cliente.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Optional Notes */}
            <div className="space-y-1 pt-2">
              <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider">Notas u Observaciones del Pago (Opcional)</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Indique observaciones relevantes de la venta..."
                rows={2}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-[#005da9] focus:border-[#005da9] focus:outline-none transition resize-none"
              />
            </div>
          </motion.div>
        )}

        {/* STEP 4: PAGO FINAL / CONFIRMACIÓN */}
        {step === 4 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-5"
          >
            <div className="bg-gradient-to-r from-[#1D3557]/8 via-[#005da9]/8 to-[#40E0D0]/10 border border-[#005da9]/20 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2.5 bg-gradient-to-br from-[#1D3557] to-[#005da9] text-[#40E0D0] rounded-xl shrink-0 shadow-xs">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-montserrat font-extrabold text-xs text-[#1D3557] uppercase tracking-wide">Paso 4: Resumen de Comprobante</h4>
                <p className="text-[11px] text-gray-600 font-medium">Revise los detalles del documento antes de sellar y emitir el cobro definitivo.</p>
              </div>
            </div>

            {/* Aclaratoria final banner */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex gap-3">
                <div className="p-1.5 bg-amber-500 text-white rounded-xl shrink-0 h-8 w-8 flex items-center justify-center font-bold">
                  ⚙️
                </div>
                <div>
                  <h5 className="text-xs font-montserrat font-extrabold text-amber-900 uppercase">
                    Paso de Confirmación Final
                  </h5>
                  <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                    El sistema registrará la factura en el historial, actualizará los saldos de caja o la cuenta a cobrar del cliente. Presione "Confirmar Factura" para guardar y emitir el comprobante.
                  </p>
                </div>
              </div>
            </div>

            {/* Visual Invoice Mock Receipt */}
            <div className="bg-white border border-[#005da9]/20 rounded-2xl shadow-md overflow-hidden max-w-md mx-auto font-mono">
              <div className="bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white p-4 text-center">
                <span className="text-[10px] font-montserrat font-extrabold uppercase tracking-widest block text-[#40E0D0]">Comprobante de Caja</span>
                <h4 className="font-montserrat font-black text-xs uppercase mt-0.5">COPIAS BELLA VISTA, C.A.</h4>
                <p className="text-[8px] opacity-80 mt-0.5">J-50987654-3 | Maracaibo, Venezuela</p>
              </div>

              <div className="p-4 text-[11px] space-y-3.5 text-gray-700">
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                  <span>FECHA: {new Date().toLocaleDateString('es-VE')}</span>
                  <span>TASA: Bs. {bcvRate.toFixed(2)}</span>
                </div>

                <div className="space-y-1 border-b border-dashed border-gray-200 pb-2">
                  <div className="text-[10px] text-[#005da9] font-montserrat font-bold uppercase">DATOS DEL CLIENTE:</div>
                  <div className="font-bold text-[#1D3557]">{selectedClient?.name}</div>
                  <div>Doc: {selectedClient?.doc_type}-{selectedClient?.doc_number || selectedClient?.document || '99999999'}</div>
                  <div>Tlf: {selectedClient?.phone || 'N/A'}</div>
                </div>

                <div className="space-y-1.5 border-b border-dashed border-gray-200 pb-2">
                  <div className="text-[10px] text-[#005da9] font-montserrat font-bold uppercase">CONCEPTOS:</div>
                  <div className="flex justify-between font-bold text-[#1D3557]">
                    <span>1x {invoiceConcept}</span>
                    <span>${parseFloat(paymentAmountUSD).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-1 text-right text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>MODALIDAD:</span>
                    <span className="font-bold uppercase text-[#005da9]">{paymentModality === 'contado' ? 'Contado' : 'A Crédito'}</span>
                  </div>
                  {paymentModality === 'contado' && (
                    <div className="flex justify-between text-gray-500">
                      <span>MÉTODO:</span>
                      <span className="font-bold uppercase text-[#1D3557]">{paymentMethod}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-[#1D3557] pt-1.5 border-t border-dashed border-gray-200">
                    <span>TOTAL USD:</span>
                    <span>${parseFloat(paymentAmountUSD).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-emerald-700 font-bold">
                    <span>TOTAL BS:</span>
                    <span>Bs. {paymentAmountVES.toFixed(2)}</span>
                  </div>
                </div>

                {/* Stamped Badge Mock */}
                <div className="pt-2 flex justify-center">
                  <span className={`px-4 py-1.5 rounded-full border-2 text-[11px] font-montserrat font-extrabold uppercase tracking-wider ${
                    paymentModality === 'contado' 
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50' 
                      : 'border-[#005da9] text-[#005da9] bg-blue-50'
                  }`}>
                    {paymentModality === 'contado' ? '✓ Cobrado / Procesado' : '⚡ Crédito Pendiente'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* FOOTER WIZARD NAVIGATION CONTROLS */}
      <div className="flex items-center justify-between pt-6 border-t border-[#005da9]/15 mt-8">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((prev) => (prev - 1) as any)}
          className={`px-4 py-2.5 rounded-xl text-xs font-montserrat font-bold shadow-2xs flex items-center gap-1.5 transition select-none cursor-pointer ${
            step === 1 
              ? 'bg-gray-100 text-gray-300 border border-gray-200 cursor-not-allowed' 
              : 'bg-white border border-gray-300 text-[#1D3557] hover:bg-gray-50 hover:border-[#005da9]/30'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>

        {step < 4 ? (
          <button
            type="button"
            disabled={!selectedClient}
            onClick={() => setStep((prev) => (prev + 1) as any)}
            className={`px-5 py-2.5 rounded-xl text-xs font-montserrat font-extrabold shadow-md flex items-center gap-1.5 transition select-none uppercase tracking-wider ${
              selectedClient 
                ? 'bg-gradient-to-r from-[#005da9] to-[#1D3557] hover:from-[#004b88] hover:to-[#152740] text-white cursor-pointer border-b-2 border-[#1D3557]/40 active:scale-95' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConfirmCheckout}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-montserrat font-extrabold uppercase text-xs tracking-wider rounded-xl shadow-md hover:shadow-lg flex items-center gap-1.5 cursor-pointer transition select-none active:scale-95 border-b-2 border-teal-900/30"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            Confirmar Factura
          </button>
        )}
      </div>

      {/* POPUP: SUCCESS TRANSACTION COMPLETE */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full border border-[#005da9]/20 text-center relative overflow-hidden"
            >
              {/* Confetti Style background highlights */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#40E0D0]" />
              
              <div className="w-16 h-16 bg-[#40E0D0]/20 text-[#005da9] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#40E0D0]/50 shadow-inner">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <h3 className="font-montserrat font-black text-base text-[#1D3557] uppercase tracking-wide">
                ¡Operación Procesada!
              </h3>
              
              <p className="text-xs text-gray-500 font-medium mt-2 px-4">
                El pago de la factura ha sido registrado con éxito. Los saldos de caja y créditos de clientes han sido actualizados en tiempo real.
              </p>

              {createdInvoice && (
                <div className="my-5 bg-[#F8F9FA] rounded-2xl p-4 border border-gray-200 font-mono text-left text-xs space-y-1.5">
                  <div className="flex justify-between font-bold text-gray-500">
                    <span>CONTROL:</span>
                    <span className="text-[#005da9]">{createdInvoice.control_number}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-500">
                    <span>CLIENTE:</span>
                    <span className="truncate max-w-[180px] text-right text-[#1D3557]">{createdInvoice.customer_name}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-500">
                    <span>MODALIDAD:</span>
                    <span className="uppercase text-emerald-600 font-extrabold">{paymentModality}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#1D3557] text-sm pt-2 border-t border-dashed border-gray-200">
                    <span>TOTAL USD:</span>
                    <span>${parseFloat(paymentAmountUSD).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-4 font-montserrat font-extrabold uppercase text-xs tracking-wider">
                <button
                  onClick={handleResetFlow}
                  className="w-full py-3 bg-gradient-to-r from-[#005da9] to-[#1D3557] hover:from-[#004b88] hover:to-[#152740] text-white rounded-xl shadow-md transition cursor-pointer border-b-2 border-[#1D3557]/40"
                >
                  Nueva Venta Flash
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    if (onOpenBalance) onOpenBalance();
                  }}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-[#1D3557] rounded-xl transition cursor-pointer"
                >
                  Ver Caja / Balance
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
