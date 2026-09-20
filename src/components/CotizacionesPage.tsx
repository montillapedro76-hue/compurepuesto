import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, SlidersHorizontal, Plus, Trash2, Eye, X, 
  FileText, FilePlus, User, Smartphone, Mail, Sparkles, 
  Settings, Loader2, CheckCircle2, FileCheck, Share2, Printer, 
  Calendar, Tag, DollarSign, Clock, AlertTriangle, ShieldCheck,
  Check, Edit3, PackageCheck, RotateCcw, Building2, CreditCard, ShoppingCart
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { Product, Quote, QuoteItem, BusinessProfile, BankAccount, AccountReceivable, PurchaseInstallment } from '../types';

const DEFAULT_QUOTE_NOTES = `1. Precios expresados en USD. Pago en Bolívares a la tasa oficial BCV del día.
2. Presupuesto válido según el tiempo de expiración seleccionado.
3. Se requiere un anticipo del 50% para iniciar la producción/trabajo y el 50% restante al momento de la entrega.
4. Los tiempos de entrega comienzan a contarse a partir de la confirmación del diseño y del pago del anticipo.`;

const unifyClients = (dbClientsList: any[], invoicesList: any[], quotesList: any[]) => {
  const result: any[] = [];

  const normDoc = (d?: string) => (d || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const normName = (n?: string) => (n || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const findExisting = (doc?: string, name?: string, id?: string) => {
    const dKey = normDoc(doc);
    const nKey = normName(name);
    return result.find(c => {
      if (id && c.id && String(c.id).trim() === String(id).trim()) return true;
      if (dKey && normDoc(c.document) && dKey === normDoc(c.document)) return true;
      if (nKey && normName(c.name) && nKey === normName(c.name)) return true;
      return false;
    });
  };

  // 1. DB / Local clients (Highest priority)
  (dbClientsList || []).forEach(c => {
    const name = (c.name || c.nombre || c.customer_name || '').trim();
    if (!name || name.toLowerCase() === 'consumidor final') return;
    const doc = (c.document || c.rif || c.doc_number || c.customer_document || '').trim();
    const phone = (c.phone || c.telefono || c.phone_number || '').trim();
    const email = (c.email || c.correo || c.customer_email || '').trim();

    const existing = findExisting(doc, name, c.id);
    if (existing) {
      if (c.id) existing.id = c.id;
      if (!existing.document && doc) existing.document = doc;
      if (!existing.phone && phone) existing.phone = phone;
      if (!existing.email && email) existing.email = email;
    } else {
      result.push({
        id: c.id || `cli-${result.length + 1}`,
        name,
        phone,
        email,
        document: doc
      });
    }
  });

  return result.sort((a, b) => a.name.localeCompare(b.name));
};

interface CotizacionesPageProps {
  products: Product[];
  bcvRate: number;
  onRefreshData: () => void;
}

export default function CotizacionesPage({
  products,
  bcvRate,
  onRefreshData
}: CotizacionesPageProps) {
  // Business Profile
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  // Quotes and clients list states
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('todos');
  const [selectedStatus, setSelectedStatus] = useState('todos');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState('Natural (V / E)');
  const [newClientDocument, setNewClientDocument] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientCredit, setNewClientCredit] = useState('0');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);
  
  // Bank Accounts State
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Billing/Conversion to Sale Modal State
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [convertDocType, setConvertDocType] = useState<'factura' | 'nota_entrega'>('factura');
  const [billingPaymentStatus, setBillingPaymentStatus] = useState<'pagado' | 'credito'>('pagado');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [billingPaymentReference, setBillingPaymentReference] = useState('');
  
  // Credit details (CxC)
  const [creditIssueDate, setCreditIssueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [creditInstallmentsCount, setCreditInstallmentsCount] = useState<number>(1);
  const [creditFrequency, setCreditFrequency] = useState<'semanal' | 'quincenal' | 'mensual'>('quincenal');
  const [isBilling, setIsBilling] = useState(false);

  // Create Form State
  const [formClientType, setFormClientType] = useState<'existing' | 'new'>('existing');
  const [formClientId, setFormClientId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formClientEmail, setFormClientEmail] = useState('');
  const [formSellerName, setFormSellerName] = useState('Vendedor Principal');
  const [formConcept, setFormConcept] = useState('');
  const [formNotes, setFormNotes] = useState(DEFAULT_QUOTE_NOTES);
  
  // Expiration Options: '7', '15', '30', 'none', 'custom'
  const [formExpirationDays, setFormExpirationDays] = useState<string>('15');
  const [formCustomExpirationDate, setFormCustomExpirationDate] = useState<string>('');

  // Items Picker State
  const [formItems, setFormItems] = useState<QuoteItem[]>([]);
  const [itemPickerTab, setItemPickerTab] = useState<'catalog' | 'libre'>('catalog');

  // Catalog Item State
  const [selectedProdId, setSelectedProdId] = useState('');
  const [catalogQty, setCatalogQty] = useState<number>(1);
  const [catalogCustomPrice, setCatalogCustomPrice] = useState('');

  // Free/Libre Item State
  const [freeConceptName, setFreeConceptName] = useState('');
  const [freeQty, setFreeQty] = useState<number>(1);
  const [freePrice, setFreePrice] = useState('');

  // Search filter query for products in catalog tab
  const [searchProdQuery, setSearchProdQuery] = useState('');

  const normalizeText = (text: string) =>
    text ? text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

  const filteredProductsForSelect = useMemo(() => {
    if (!searchProdQuery.trim()) return products;
    const q = normalizeText(searchProdQuery);
    const words = q.split(/\s+/).filter(Boolean);

    return products.filter(p => {
      const name = normalizeText(p.name);
      const sku = normalizeText(p.sku || '');
      const category = normalizeText((p as any).category_name || (p as any).category || '');
      const brand = normalizeText((p as any).brand_name || (p as any).brand || '');
      const desc = normalizeText((p as any).description || '');

      const combined = `${name} ${sku} ${category} ${brand} ${desc}`;
      return words.every(word => combined.includes(word));
    });
  }, [products, searchProdQuery]);

  // Auto-select first matching product when typing search query if current selected is invalid or empty
  useEffect(() => {
    if (searchProdQuery.trim()) {
      if (filteredProductsForSelect.length > 0) {
        const isCurrentValid = filteredProductsForSelect.some(p => p.id === selectedProdId);
        if (!isCurrentValid) {
          const firstMatch = filteredProductsForSelect[0];
          setSelectedProdId(firstMatch.id);
          setCatalogCustomPrice(firstMatch.price.toString());
        }
      } else {
        setSelectedProdId('');
        setCatalogCustomPrice('');
      }
    }
  }, [searchProdQuery, filteredProductsForSelect]);

  // Correlative previews for Factura and Nota de Entrega
  const nextControlNumberFactura = useMemo(() => {
    try {
      return dbService.getNextInvoiceControlNumber('factura');
    } catch {
      return 'FAC-1001';
    }
  }, [showBillingModal, quotes]);

  const nextControlNumberNota = useMemo(() => {
    try {
      return dbService.getNextInvoiceControlNumber('nota_entrega');
    } catch {
      return 'NE-1001';
    }
  }, [showBillingModal, quotes]);

  // Real-time installments preview generator for credit sales
  const generatedInstallments = useMemo(() => {
    if (!selectedQuote || billingPaymentStatus !== 'credito') return [];
    const total = Number(selectedQuote.total_price) || 0;
    const count = Math.max(1, creditInstallmentsCount);
    const baseAmount = Number((total / count).toFixed(2));
    let accumulated = 0;
    const installments: Array<{ number: number; due_date: string; amount: number; amount_bs: number }> = [];

    const baseDate = creditIssueDate ? new Date(creditIssueDate + 'T12:00:00') : new Date();

    for (let i = 1; i <= count; i++) {
      const isLast = i === count;
      const amount = isLast ? Number((total - accumulated).toFixed(2)) : baseAmount;
      accumulated += amount;

      const instDate = new Date(baseDate);
      if (creditFrequency === 'semanal') {
        instDate.setDate(instDate.getDate() + 7 * i);
      } else if (creditFrequency === 'quincenal') {
        instDate.setDate(instDate.getDate() + 15 * i);
      } else if (creditFrequency === 'mensual') {
        instDate.setMonth(instDate.getMonth() + i);
      }

      installments.push({
        number: i,
        due_date: instDate.toISOString().split('T')[0],
        amount,
        amount_bs: Number((amount * (bcvRate || 1)).toFixed(2))
      });
    }

    return installments;
  }, [selectedQuote, billingPaymentStatus, creditInstallmentsCount, creditFrequency, creditIssueDate, bcvRate]);

  // Optional Financial Breakdown
  const [formDiscountAmount, setFormDiscountAmount] = useState<string>('0');
  const [formTaxPercent, setFormTaxPercent] = useState<string>('0');

  // Premium Banner State
  const [showPremiumBanner, setShowPremiumBanner] = useState(true);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotesData, dbClientsList, invoicesList, profileData, bankAccountsData] = await Promise.all([
        dbService.getQuotes(),
        dbService.getClients(),
        dbService.getInvoices(),
        dbService.getBusinessProfile(),
        dbService.getBankAccounts().catch(() => [])
      ]);
      setQuotes(quotesData);

      const combinedClients = unifyClients(dbClientsList, invoicesList, quotesData);
      setClients(combinedClients);

      if (profileData) setBusinessProfile(profileData);

      const activeBankAccounts = (bankAccountsData || []).filter((a: any) => a.is_active !== false);
      setBankAccounts(activeBankAccounts);
      if (activeBankAccounts.length > 0 && !selectedBankAccountId) {
        setSelectedBankAccountId(activeBankAccounts[0].id);
      }
    } catch (error) {
      console.error('Error fetching quotes/clients/profile/accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('bellavista_business_profile_updated', fetchData);
    window.addEventListener('bellavista_settings_updated', fetchData);
    window.addEventListener('bellavista_bank_accounts_updated', fetchData);
    window.addEventListener('bellavista_invoices_updated', fetchData);
    window.addEventListener('bellavista_cxc_updated', fetchData);
    return () => {
      window.removeEventListener('bellavista_business_profile_updated', fetchData);
      window.removeEventListener('bellavista_settings_updated', fetchData);
      window.removeEventListener('bellavista_bank_accounts_updated', fetchData);
      window.removeEventListener('bellavista_invoices_updated', fetchData);
      window.removeEventListener('bellavista_cxc_updated', fetchData);
    };
  }, []);

  const handleSaveNewClient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newClientName.trim()) {
      alert('Por favor, ingresa el nombre completo o razón social.');
      return;
    }
    if (!newClientDocument.trim()) {
      alert('Por favor, ingresa la cédula o RIF.');
      return;
    }

    setIsSavingClient(true);
    try {
      const docTypeMap: Record<string, string> = {
        'Natural (V / E)': 'V',
        'Jurídico (J)': 'J',
        'Gubernamental (G)': 'G',
        'Pasaporte (P)': 'P'
      };
      const dbTypeMap: Record<string, string> = {
        'Natural (V / E)': 'Natural',
        'Jurídico (J)': 'Jurídico',
        'Gubernamental (G)': 'Jurídico',
        'Pasaporte (P)': 'Natural'
      };

      const docType = docTypeMap[newClientType] || 'V';
      const cleanDoc = newClientDocument.trim();
      let documentStr = cleanDoc;
      if (cleanDoc && !/^[A-Z]-/i.test(cleanDoc)) {
        documentStr = `${docType}-${cleanDoc}`;
      }

      const clientPayload = {
        name: newClientName.trim(),
        document: documentStr,
        doc_type: docType,
        type: dbTypeMap[newClientType] || 'Natural',
        phone: newClientPhone.trim(),
        email: newClientEmail.trim(),
        address: newClientAddress.trim(),
        direccion: newClientAddress.trim(),
        credit_usd: parseFloat(newClientCredit) || 0
      };

      const created = await dbService.createClient(clientPayload);
      if (created) {
        // Refresh client data
        const [quotesData, dbClientsList, invoicesList] = await Promise.all([
          dbService.getQuotes(),
          dbService.getClients(),
          dbService.getInvoices()
        ]);
        const combinedClients = unifyClients(dbClientsList, invoicesList, quotesData);
        setClients(combinedClients);

        // Select the newly created client
        setFormClientId(String(created.id));
        setFormClientName(created.name);
        setFormClientPhone(created.phone || '');
        setFormClientEmail(created.email || '');
        setFormClientType('existing');

        // Reset fields
        setNewClientName('');
        setNewClientDocument('');
        setNewClientType('Natural (V / E)');
        setNewClientPhone('');
        setNewClientCredit('0');
        setNewClientEmail('');
        setNewClientAddress('');
        
        setShowNewClientModal(false);
        alert('¡Cliente registrado y seleccionado exitosamente!');
      } else {
        alert('No se pudo registrar el cliente en la base de datos.');
      }
    } catch (err: any) {
      console.error('Error saving new client:', err);
      alert(`Error al registrar cliente: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSavingClient(false);
    }
  };

  // Open Create Modal Handler
  const handleOpenCreateModal = async () => {
    try {
      const [dbClientsList, invoicesList, quotesList] = await Promise.all([
        dbService.getClients(),
        dbService.getInvoices(),
        dbService.getQuotes()
      ]);
      const combinedClients = unifyClients(dbClientsList, invoicesList, quotesList);
      setClients(combinedClients);
    } catch (e) {
      console.warn('Error refreshing clients list:', e);
    }

    setFormClientType('existing');
    setFormClientId('');
    setFormClientName('');
    setFormClientPhone('');
    setFormClientEmail('');
    setFormSellerName('Vendedor Principal');
    setFormConcept('');
    setFormNotes(DEFAULT_QUOTE_NOTES);
    setFormExpirationDays('15');
    setFormCustomExpirationDate('');
    setFormItems([]);
    setFormDiscountAmount('0');
    setFormTaxPercent('0');

    setItemPickerTab('catalog');
    setSelectedProdId('');
    setCatalogQty(1);
    setCatalogCustomPrice('');

    setFreeConceptName('');
    setFreeQty(1);
    setFreePrice('');

    setShowCreateModal(true);
  };

  // Calculate Expiration Date based on selection
  const calculatedExpirationDate = useMemo(() => {
    if (formExpirationDays === 'none') return null;
    if (formExpirationDays === 'custom') return formCustomExpirationDate || null;
    
    const days = parseInt(formExpirationDays, 10);
    if (isNaN(days)) return null;

    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }, [formExpirationDays, formCustomExpirationDate]);

  // Filtered quotes list
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      // Search by concept, client name, phone or quote number
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const conceptMatch = (q.concept || '').toLowerCase().includes(query);
        const nameMatch = (q.client_name || '').toLowerCase().includes(query);
        const phoneMatch = (q.client_phone || '').toLowerCase().includes(query);
        const codeMatch = (q.quote_number || '').toLowerCase().includes(query);
        if (!conceptMatch && !nameMatch && !phoneMatch && !codeMatch) return false;
      }

      // Filter by Client Name
      if (selectedClient !== 'todos') {
        if (q.client_name !== selectedClient) return false;
      }

      // Filter by Status
      if (selectedStatus !== 'todos') {
        const isQuoteExpired = q.status === 'expirada' || Boolean(q.expiration_date && new Date(q.expiration_date).getTime() < Date.now());
        const isQuoteSold = q.status === 'vendida' || q.status === 'facturada' || q.status === 'aprobada';

        if (selectedStatus === 'creada' && (isQuoteSold || isQuoteExpired || q.status === 'rechazada')) return false;
        if (selectedStatus === 'expirada' && (!isQuoteExpired || isQuoteSold)) return false;
        if (selectedStatus === 'vendida' && !isQuoteSold) return false;
        if (selectedStatus === 'rechazada' && q.status !== 'rechazada') return false;
      }

      return true;
    });
  }, [quotes, searchQuery, selectedClient, selectedStatus]);

  // Unique client names for dropdown
  const uniqueClientNames = useMemo(() => {
    const names = quotes.map(q => q.client_name).filter(Boolean);
    return Array.from(new Set(names));
  }, [quotes]);

  // Selected catalog product object
  const selectedProductObj = useMemo(() => {
    return products.find(p => p.id === selectedProdId) || null;
  }, [products, selectedProdId]);

  // Handle adding catalog product item
  const handleAddCatalogItem = () => {
    if (!selectedProductObj) return;
    const price = parseFloat(catalogCustomPrice);
    const finalPrice = isNaN(price) || price < 0 ? selectedProductObj.price : price;
    const qty = Math.max(1, Number(catalogQty) || 1);

    const existingIndex = formItems.findIndex(item => item.product_id === selectedProductObj.id);

    if (existingIndex !== -1) {
      const updated = [...formItems];
      updated[existingIndex].quantity += qty;
      updated[existingIndex].price = finalPrice;
      setFormItems(updated);
    } else {
      const newItem: QuoteItem = {
        product_id: selectedProductObj.id,
        name: selectedProductObj.name,
        sku: selectedProductObj.sku || '',
        quantity: qty,
        price: finalPrice,
        is_custom: false
      };
      setFormItems([...formItems, newItem]);
    }

    // Reset picker
    setSelectedProdId('');
    setCatalogQty(1);
    setCatalogCustomPrice('');
  };

  // Handle adding free/custom item
  const handleAddFreeItem = () => {
    if (!freeConceptName.trim()) {
      alert('Ingresa la descripción del concepto o trabajo.');
      return;
    }
    const price = parseFloat(freePrice);
    if (isNaN(price) || price < 0) {
      alert('Ingresa un precio unitario válido.');
      return;
    }
    const qty = Math.max(1, Number(freeQty) || 1);

    const newItem: QuoteItem = {
      product_id: null,
      name: freeConceptName.trim(),
      quantity: qty,
      price: price,
      is_custom: true
    };

    setFormItems([...formItems, newItem]);

    // Reset free item fields
    setFreeConceptName('');
    setFreeQty(1);
    setFreePrice('');
  };

  // Handlers for modifying items in formItems list
  const handleUpdateItemQty = (index: number, delta: number) => {
    const updated = [...formItems];
    const current = Number(updated[index].quantity) || 1;
    const next = Math.max(1, current + delta);
    updated[index].quantity = next;
    setFormItems(updated);
  };

  const handleSetItemQty = (index: number, val: string) => {
    const updated = [...formItems];
    const parsed = parseInt(val, 10);
    updated[index].quantity = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setFormItems(updated);
  };

  const handleUpdateItemPrice = (index: number, val: string) => {
    const updated = [...formItems];
    const parsed = parseFloat(val);
    updated[index].price = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setFormItems(updated);
  };

  // Remove item from form
  const handleRemoveItem = (index: number) => {
    setFormItems(formItems.filter((_, idx) => idx !== index));
  };

  // Financial calculations
  const formSubtotal = useMemo(() => {
    return formItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
  }, [formItems]);

  const formDiscount = useMemo(() => {
    const val = parseFloat(formDiscountAmount) || 0;
    return Math.min(val, formSubtotal);
  }, [formDiscountAmount, formSubtotal]);

  const formTax = useMemo(() => {
    const pct = parseFloat(formTaxPercent) || 0;
    const taxable = Math.max(0, formSubtotal - formDiscount);
    return taxable * (pct / 100);
  }, [formTaxPercent, formSubtotal, formDiscount]);

  const formTotalPrice = useMemo(() => {
    return Math.max(0, formSubtotal - formDiscount + formTax);
  }, [formSubtotal, formDiscount, formTax]);

  // Determine creation_type
  const formCreationType = useMemo(() => {
    const hasCatalog = formItems.some(i => !i.is_custom && i.product_id);
    const hasCustom = formItems.some(i => i.is_custom || !i.product_id);

    if (hasCatalog && hasCustom) return 'mixto';
    if (hasCustom) return 'libre';
    return 'catalogo';
  }, [formItems]);

  // Handle submit new quote
  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();

    let clientName = '';
    let clientPhone = '';
    let clientEmail = '';

    if (formClientType === 'existing') {
      const selectedClientObj = clients.find(c => c.id === formClientId);
      if (!selectedClientObj) {
        alert('Por favor, selecciona un cliente existente.');
        return;
      }
      clientName = selectedClientObj.name;
      clientPhone = selectedClientObj.phone || '';
      clientEmail = selectedClientObj.email || selectedClientObj.correo || '';
    } else {
      if (!formClientName.trim()) {
        alert('Por favor, ingresa el nombre del cliente.');
        return;
      }
      clientName = formClientName.trim();
      clientPhone = formClientPhone.trim();
      clientEmail = formClientEmail.trim();
    }

    if (!formConcept.trim()) {
      alert('Por favor, especifica un concepto o referencia general.');
      return;
    }

    if (formItems.length === 0) {
      alert('Debes agregar al menos un ítem o producto a la cotización.');
      return;
    }

    try {
      const newQuote: Omit<Quote, 'created_at' | 'quote_number'> = {
        id: crypto.randomUUID(),
        client_name: clientName,
        client_phone: clientPhone,
        client_email: clientEmail || null,
        seller_name: formSellerName.trim() || 'Vendedor Principal',
        concept: formConcept.trim(),
        creation_type: formCreationType,
        items: formItems,
        subtotal_price: formSubtotal,
        discount_amount: formDiscount,
        tax_amount: formTax,
        total_price: formTotalPrice,
        status: 'creada',
        expiration_date: calculatedExpirationDate,
        expiration_days: formExpirationDays,
        notes: formNotes.trim() || null,
        order_id: null
      };

      await dbService.saveQuote(newQuote);
      
      // Reset form & close
      setFormClientId('');
      setFormClientName('');
      setFormClientPhone('');
      setFormClientEmail('');
      setFormSellerName('Vendedor Principal');
      setFormConcept('');
      setFormNotes('');
      setFormItems([]);
      setFormDiscountAmount('0');
      setFormTaxPercent('0');
      setShowCreateModal(false);
      fetchData();
      alert('¡Cotización guardada exitosamente!');
    } catch (err: any) {
      console.error(err);
      alert(`Error al guardar la cotización: ${err.message || 'Error'}`);
    }
  };

  // Open Convert to Sale Modal with clean defaults
  const handleOpenBillingModal = (quote: Quote) => {
    setSelectedQuote(quote);
    setConvertDocType('factura');
    setBillingPaymentStatus('pagado');
    if (bankAccounts.length > 0) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
    setBillingPaymentReference('');
    const today = new Date().toISOString().split('T')[0];
    setCreditIssueDate(today);
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setCreditDueDate(d.toISOString().split('T')[0]);
    setCreditInstallmentsCount(1);
    setCreditFrequency('quincenal');
    setShowBillingModal(true);
  };

  // Convert Quote into Sale ("Factura" o "Nota de Entrega" - Tiempo Real, sin pedido online)
  const handleConvertToSale = async () => {
    if (!selectedQuote) return;
    setIsBilling(true);

    try {
      const isCredit = billingPaymentStatus === 'credito';
      const targetControlNumber = dbService.getNextInvoiceControlNumber(convertDocType);

      // Find client details
      const matchedClient = clients.find(c =>
        (selectedQuote.client_name && (c.name || '').trim().toLowerCase() === selectedQuote.client_name.trim().toLowerCase()) ||
        (selectedQuote.client_phone && (c.phone || '').trim() === selectedQuote.client_phone.trim())
      );
      const clientDoc = matchedClient?.document || '';

      // Determine Payment Method label and Bank Account
      const selectedBank = bankAccounts.find(a => a.id === selectedBankAccountId);
      const paymentMethodLabel = isCredit
        ? 'Crédito (Cuentas por Cobrar)'
        : (selectedBank ? `${selectedBank.name} (${selectedBank.bank_name || selectedBank.currency})` : 'Efectivo');

      // 1. Create official Sale Document (Factura o Nota de Entrega) in real time
      // 🛑 STRICT REQUIREMENT: DO NOT register as online order (NO createOrder)
      const invoicePayload = {
        document_type: convertDocType,
        control_number: targetControlNumber,
        customer_name: selectedQuote.client_name,
        customer_phone: selectedQuote.client_phone || '',
        customer_email: selectedQuote.client_email || '',
        customer_document: clientDoc,
        payment_method: paymentMethodLabel,
        bank_account_id: isCredit ? undefined : (selectedBank?.id || undefined),
        subtotal: Number(selectedQuote.total_price),
        total: Number(selectedQuote.total_price),
        bcv_rate: bcvRate,
        currency_code: 'USD',
        notes: `Convertido desde Cotización N° ${selectedQuote.quote_number}${billingPaymentReference ? ` - Ref: ${billingPaymentReference}` : ''}`,
        items: selectedQuote.items.map(it => ({
          product_id: it.product_id || '',
          name: it.name,
          sku: it.sku || '',
          quantity: Number(it.quantity || 1),
          price: Number(it.price || 0),
          total: Number((it.quantity || 1) * (it.price || 0))
        })),
        created_at: new Date().toISOString()
      };

      const createdInvoice = await dbService.createInvoice(invoicePayload);

      // 2. If CREDIT: Register in Accounts Receivable (Cuentas por Cobrar) with dates & installments
      if (isCredit) {
        const installmentsList: PurchaseInstallment[] = generatedInstallments.map(inst => ({
          id: `inst-${inst.number}-${Date.now()}`,
          number: inst.number,
          due_date: inst.due_date,
          amount: inst.amount,
          status: 'pendiente',
          paid_amount: 0,
          notes: `Cuota ${inst.number} de ${creditInstallmentsCount} (${creditFrequency})`
        }));

        const cxcRecord: AccountReceivable = {
          id: `cxc-${createdInvoice.id || Date.now()}`,
          invoice_id: createdInvoice.id,
          invoice_number: createdInvoice.control_number || targetControlNumber,
          quote_id: selectedQuote.id,
          subject: `Crédito Cotización N° ${selectedQuote.quote_number} - ${convertDocType === 'nota_entrega' ? 'Nota' : 'Factura'} #${createdInvoice.control_number || targetControlNumber}`,
          entity_name: selectedQuote.client_name,
          client_name: selectedQuote.client_name,
          customer_name: selectedQuote.client_name,
          customer_phone: selectedQuote.client_phone || '',
          customer_document: clientDoc,
          description: `Venta a crédito desde Cotización N° ${selectedQuote.quote_number} (${creditInstallmentsCount} cuotas, vencimiento ${creditDueDate})`,
          total_amount: Number(selectedQuote.total_price),
          paid_amount: 0,
          remaining_amount: Number(selectedQuote.total_price),
          currency: 'USD',
          bcv_rate: bcvRate,
          status: 'pendiente',
          issue_date: creditIssueDate ? new Date(creditIssueDate).toISOString() : new Date().toISOString(),
          due_date: creditDueDate ? new Date(creditDueDate).toISOString() : new Date(Date.now() + 15 * 86400000).toISOString(),
          installments_count: creditInstallmentsCount,
          installments: installmentsList,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await dbService.saveAccountReceivable(cxcRecord);

        // Update Client's debt in real time
        try {
          const matchedCl = clients.find(c =>
            (c.id && c.id === selectedQuote.client_id) ||
            (selectedQuote.client_name && (c.name || '').trim().toLowerCase() === selectedQuote.client_name.trim().toLowerCase())
          );
          if (matchedCl && matchedCl.id) {
            const currentDebt = Number(matchedCl.credit_usd || 0);
            await dbService.updateClient(matchedCl.id, {
              credit_usd: Number((currentDebt + selectedQuote.total_price).toFixed(2))
            });
          }
        } catch (cErr) {
          console.warn("Could not update client credit debt:", cErr);
        }
      } else {
        // 3. If PAID: Register income into registered Bank Account and Cash Movement
        if (selectedBank) {
          await dbService.recordSaleIncomeToBankAccounts({
            invoice: createdInvoice,
            singlePaymentMethod: selectedBank.name,
            bankAccountId: selectedBank.id,
            totalUsd: selectedQuote.total_price,
            totalVes: selectedQuote.total_price * bcvRate,
            bcvRate: bcvRate,
            createdBy: selectedQuote.seller_name || 'Vendedor'
          });
        }
        await dbService.addCashOp({
          type: 'ingreso',
          concept: `Cobro Venta Cotización N° ${selectedQuote.quote_number} - ${convertDocType === 'nota_entrega' ? 'Nota' : 'Factura'} #${createdInvoice.control_number || targetControlNumber} (${paymentMethodLabel})`,
          amount: selectedQuote.total_price,
          amount_bs: selectedQuote.total_price * bcvRate,
          payment_method: paymentMethodLabel
        });
      }

      // 4. Deduct inventory stock for catalog items
      for (const item of selectedQuote.items) {
        if (item.product_id && !item.is_custom) {
          const catalogProd = products.find(p => p.id === item.product_id);
          if (catalogProd) {
            const newStock = Math.max(0, catalogProd.stock - item.quantity);
            try {
              await dbService.updateProduct(catalogProd.id, { stock: newStock });
            } catch (stockErr) {
              console.warn(`Could not update stock for product ${catalogProd.id}:`, stockErr);
            }
          }
        }
      }

      // 5. Update Quote status to 'vendida'
      const updatedQuote: Quote = {
        ...selectedQuote,
        status: 'vendida',
        updated_at: new Date().toISOString()
      };
      await dbService.saveQuote(updatedQuote);

      // 6. Dispatch real-time events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bellavista_invoices_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_cxc_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_cash_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_inventory_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_quotes_updated'));
        window.dispatchEvent(new CustomEvent('bellavista_clients_updated'));
      }

      setShowBillingModal(false);
      setShowDetailModal(false);
      setSelectedQuote(null);
      fetchData();
      onRefreshData();

      const docName = convertDocType === 'nota_entrega' ? 'Nota de Entrega' : 'Factura';
      alert(`¡Cotización convertida en Venta exitosamente en tiempo real!\nSe emitió la ${docName} #${createdInvoice.control_number || targetControlNumber}${isCredit ? ` y se registró en Cuentas por Cobrar (${creditInstallmentsCount} cuotas)` : ' y se acreditó en la cuenta bancaria seleccionada'}. El inventario se actualizó de inmediato.`);
    } catch (err: any) {
      console.error(err);
      alert(`Error al procesar la venta: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsBilling(false);
    }
  };

  // Reject Quote
  const handleRejectQuote = async (quote: Quote) => {
    if (!window.confirm('¿Está seguro de marcar esta cotización como RECHAZADA?')) return;
    try {
      const updated: Quote = {
        ...quote,
        status: 'rechazada',
        updated_at: new Date().toISOString()
      };
      await dbService.saveQuote(updated);
      fetchData();
      if (selectedQuote && selectedQuote.id === quote.id) {
        setSelectedQuote(updated);
      }
      alert('Cotización marcada como rechazada.');
    } catch (err) {
      console.error(err);
      alert('Error al actualizar cotización.');
    }
  };

  // Delete Quote
  const handleDeleteQuote = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar esta cotización de forma permanente?')) return;
    try {
      await dbService.deleteQuote(id);
      fetchData();
      setShowDetailModal(false);
      setSelectedQuote(null);
      alert('Cotización eliminada.');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar cotización.');
    }
  };

  // Share Quote via WhatsApp
  const handleShareWhatsApp = (quote: Quote) => {
    const rawPhone = (quote.client_phone || '').replace(/\D/g, '');
    const cleanPhone = rawPhone.length >= 10 
      ? (rawPhone.startsWith('58') ? rawPhone : `58${rawPhone.replace(/^0/, '')}`) 
      : '';

    const itemsText = quote.items.map(item => 
      `• *${item.quantity}x* ${item.name} a $${item.price.toFixed(2)} = *$${(item.price * item.quantity).toFixed(2)}*`
    ).join('\n');

    const formattedDate = new Date(quote.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const expDateText = quote.expiration_date 
      ? new Date(quote.expiration_date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Sin Expiración';

    const storeTitle = (businessProfile?.name || 'Copias Bella Vista').toUpperCase();
    const text = `📄 *COTIZACIÓN DE VENTA - ${storeTitle}*
*N° Cotización:* ${quote.quote_number}
*Fecha de Emisión:* ${formattedDate}
*Válida Hasta:* ${expDateText}
*Vendedor Responsable:* ${quote.seller_name || 'Atención al Cliente'}

👤 *CLIENTE:* ${quote.client_name}
${quote.client_phone ? `📱 *Teléfono:* ${quote.client_phone}\n` : ''}${quote.client_email ? `✉️ *Email:* ${quote.client_email}\n` : ''}${quote.concept ? `📝 *Concepto:* ${quote.concept}\n` : ''}
----------------------------------
📋 *DETALLE DE ÍTEMS:*
${itemsText}
----------------------------------
${quote.subtotal_price ? `*Subtotal:* $${quote.subtotal_price.toFixed(2)}\n` : ''}${quote.discount_amount ? `*Descuento:* -$${quote.discount_amount.toFixed(2)}\n` : ''}${quote.tax_amount ? `*IVA:* +$${quote.tax_amount.toFixed(2)}\n` : ''}💰 *TOTAL FINAL USD:* *$${quote.total_price.toFixed(2)} USD*
🇻🇪 *TOTAL FINAL VES:* *Bs. {((Number(quote.total_price) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}* (Tasa: ${bcvRate} Bs/USD)

${quote.notes ? `📌 *Notas/Condiciones:* ${quote.notes}\n\n` : ''}Quedamos atentos a sus comentarios. ¡Gracias por preferirnos!`;

    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank');
  };

  // Generate and Print PDF / Voucher
  const handlePrintPDF = (quote: Quote) => {
    setSelectedQuote(quote);
    setShowDetailModal(true);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div id="cotizaciones-panel" className="bg-[#fcfdfd] min-h-screen p-6 text-gray-900">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-montserrat font-extrabold text-[#1D3557] uppercase tracking-tight flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[#00BFFF] fill-[#00BFFF]/10" />
            <span>Presupuestos</span>
          </h1>
        </div>

        <div>
          <button 
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition flex items-center gap-2 cursor-pointer shadow-2xs font-montserrat font-bold text-xs active:scale-98"
          >
            <FileText className="w-4 h-4 text-[#005da9] shrink-0" />
            <span>+ Crear Cotización</span>
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-[#F8F9FA] border border-gray-200 p-4 rounded-2xl shadow-xs space-y-3 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2 flex-wrap text-left">
            {/* Advanced Trigger */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-xs font-montserrat font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#005da9]" />
              <span>Filtros</span>
            </button>

            {/* Client Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] bg-[#1D3557]/10 px-2.5 py-1 rounded-lg border border-[#1D3557]/20">
                <User className="w-3 h-3 text-[#00BFFF]" />
                Cliente
              </span>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] cursor-pointer"
              >
                <option value="todos">Todos los clientes</option>
                {uniqueClientNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] cursor-pointer"
            >
              <option value="todos">Todos los estados</option>
              <option value="creada">Creadas / Pendientes</option>
              <option value="expirada">Expiradas</option>
              <option value="vendida">Vendidas / Facturadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full lg:max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="w-4 h-4 text-[#00BFFF]" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente, N° o concepto..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BFFF] transition"
              />
            </div>
          </div>

        </div>

        {showAdvanced && (
          <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[10px] font-montserrat font-bold text-gray-500 uppercase">
              Registros encontrados: {filteredQuotes.length}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedClient('todos');
                setSelectedStatus('todos');
              }}
              className="text-[10px] font-montserrat font-extrabold text-[#00BFFF] hover:underline cursor-pointer uppercase"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* TABLE LIST */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00BFFF] mx-auto mb-2" />
            <p className="text-xs font-bold text-[#2B2D42]">Cargando cotizaciones...</p>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-[#00BFFF]/50" />
            <p className="text-sm font-montserrat font-extrabold text-[#2B2D42]">No se encontraron cotizaciones</p>
            <p className="text-xs font-medium text-gray-500 mt-1">
              Modifica los filtros o presiona "Crear Cotización" para emitir un nuevo presupuesto.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1D3557] text-white text-[10px] uppercase font-montserrat font-extrabold tracking-wider">
                  <th className="px-6 py-4">N° / Cliente</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4">Concepto / Vendedor</th>
                  <th className="px-6 py-4">Monto Total</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
                {filteredQuotes.map((q) => {
                  const isExpired = q.status === 'expirada' || Boolean(q.expiration_date && new Date(q.expiration_date).getTime() < Date.now());
                  const isSold = q.status === 'vendida' || q.status === 'facturada' || q.status === 'aprobada';

                  return (
                    <tr key={q.id} className="hover:bg-gray-50/50 transition">
                      
                      {/* Name / Code */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-montserrat font-extrabold text-[#1D3557] leading-tight">{q.client_name}</p>
                          <span className="inline-block text-[10px] bg-[#1D3557]/10 text-[#1D3557] font-mono font-bold px-2 py-0.5 rounded-md mt-1 border border-[#1D3557]/20">
                            #{q.quote_number}
                          </span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-6 py-4 font-bold text-[#2B2D42]">
                        {q.client_phone ? (
                          <span className="flex items-center gap-1 text-[#2B2D42]">
                            <Smartphone className="w-3.5 h-3.5 text-[#00BFFF] shrink-0" />
                            {q.client_phone}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Sin teléfono</span>
                        )}
                      </td>

                      {/* Concept & Seller */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#2B2D42] line-clamp-1 max-w-xs">{q.concept}</p>
                        <span className="text-[10px] font-medium text-gray-500 block mt-0.5">
                          Vendedor: {q.seller_name || 'Vendedor Principal'}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-mono font-black text-[#1D3557] text-sm">
                          ${q.total_price.toFixed(2)} USD
                        </p>
                        <p className="text-[10px] text-gray-500 font-bold font-mono leading-none">
                          Bs. {((Number(q.total_price) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* View Detail */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedQuote(q);
                              setShowDetailModal(true);
                            }}
                            className="p-2 bg-white hover:bg-slate-50 text-[#1D3557] rounded-full border border-slate-300 transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 text-[#005da9]" />
                          </button>

                          {/* Print PDF */}
                          <button
                            type="button"
                            onClick={() => handlePrintPDF(q)}
                            className="p-2 bg-white hover:bg-slate-50 text-[#1D3557] rounded-full border border-slate-300 transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                            title="Imprimir / PDF"
                          >
                            <Printer className="w-4 h-4 text-[#005da9]" />
                          </button>

                          {/* Share WhatsApp */}
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(q)}
                            className="p-2 bg-white hover:bg-slate-50 text-[#1D3557] rounded-full border border-slate-300 transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                            title="Enviar por WhatsApp"
                          >
                            <Share2 className="w-4 h-4 text-[#005da9]" />
                          </button>

                          {/* Botón Convertir a Ventas con icono de carro de compras y sin texto */}
                          {!isSold ? (
                            <button
                              type="button"
                              onClick={() => handleOpenBillingModal(q)}
                              className="p-2 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:brightness-110 active:scale-95 text-white rounded-full border border-[#005da9]/50 shadow-xs hover:shadow-md transition-all duration-300 flex items-center justify-center cursor-pointer select-none"
                              title={isExpired ? "Convertir a Ventas (Cotización Vencida)" : "Convertir a Ventas"}
                            >
                              <ShoppingCart className="w-4 h-4 text-[#40E0D0] stroke-[2.5]" />
                            </button>
                          ) : (
                            <span
                              className="p-2 text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200 inline-flex items-center justify-center select-none"
                              title="Cotización Vendida"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </span>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 📝 CREATE QUOTE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-3xl shadow-2xl overflow-hidden relative text-left flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="bg-[#1D3557] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#40E0D0]/20 rounded-xl">
                  <FileCheck className="w-5 h-5 text-[#40E0D0]" />
                </div>
                <div>
                  <h3 className="font-montserrat font-extrabold text-sm tracking-tight text-white uppercase">
                    Crear Nueva Cotización
                  </h3>
                  <p className="text-[10px] text-gray-200 font-medium">
                    Emisión de cotización con productos de catálogo o ítems libres.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-300 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuote} className="p-6 space-y-5 overflow-y-auto flex-1">
              
              {/* HEADER / VENDEDOR SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                    Vendedor Responsable *
                  </label>
                  <input
                    type="text"
                    required
                    value={formSellerName}
                    onChange={(e) => setFormSellerName(e.target.value)}
                    placeholder="Nombre del vendedor"
                    className="w-full px-3 py-2 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                    Tiempo de Validez / Expiración
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormExpirationDays('7')}
                      className={`py-1 text-[10px] font-montserrat font-bold rounded-full border transition cursor-pointer ${
                        formExpirationDays === '7' ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white hover:bg-slate-50 border-slate-300 text-[#1D3557]'
                      }`}
                    >
                      7 Días
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormExpirationDays('15')}
                      className={`py-1 text-[10px] font-montserrat font-bold rounded-full border transition cursor-pointer ${
                        formExpirationDays === '15' ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white hover:bg-slate-50 border-slate-300 text-[#1D3557]'
                      }`}
                    >
                      15 Días
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormExpirationDays('30')}
                      className={`py-1 text-[10px] font-montserrat font-bold rounded-full border transition cursor-pointer ${
                        formExpirationDays === '30' ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white hover:bg-slate-50 border-slate-300 text-[#1D3557]'
                      }`}
                    >
                      30 Días
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormExpirationDays('none')}
                      className={`py-1 text-[10px] font-montserrat font-bold rounded-full border transition cursor-pointer ${
                        formExpirationDays === 'none' ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white hover:bg-slate-50 border-slate-300 text-[#1D3557]'
                      }`}
                    >
                      Sin Exp.
                    </button>
                  </div>
                </div>
              </div>

              {/* CLIENT SECTION */}
              <div className="bg-[#F8F9FA] border border-gray-200 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider">Información del Cliente</span>
                </div>

                <div className="space-y-2">
                  <div className="w-full">
                    <select
                      value={formClientId}
                      onChange={(e) => {
                        const selectedVal = e.target.value;
                        setFormClientId(selectedVal);
                        const selectedObj = clients.find(c => String(c.id) === selectedVal || c.name === selectedVal);
                        if (selectedObj) {
                          setFormClientName(selectedObj.name);
                          setFormClientPhone(selectedObj.phone || '');
                          setFormClientEmail(selectedObj.email || '');
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                    >
                      <option value="">-- Selecciona Cliente ({clients.length} disponibles) --</option>
                      {clients.map(c => (
                        <option key={c.id || c.name} value={c.id || c.name}>
                          {c.name} {c.phone ? `(Tel: ${c.phone})` : ''} {c.document ? `- ${c.document}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formClientId && (
                    <div className="p-3 bg-[#1D3557]/10 border border-[#1D3557]/20 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-montserrat font-extrabold text-[#1D3557] block">Cliente: {formClientName || formClientId}</span>
                        <div className="text-[11px] text-[#2B2D42] flex items-center gap-3">
                          {formClientPhone && <span>📱 {formClientPhone}</span>}
                          {formClientEmail && <span>✉️ {formClientEmail}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormClientId('');
                          setFormClientName('');
                          setFormClientPhone('');
                          setFormClientEmail('');
                        }}
                        className="px-3 py-1 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-[10px] font-bold shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1"
                      >
                        <X className="w-3 h-3 text-[#005da9]" />
                        <span>Cambiar / Limpiar</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* CONCEPT FIELD */}
              <div>
                <label className="block text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider mb-1">
                  Concepto / Referencia General *
                </label>
                <input
                  type="text"
                  required
                  value={formConcept}
                  onChange={(e) => setFormConcept(e.target.value)}
                  placeholder="Ej: Presupuesto de impresiones de tesis y planos digitales"
                  className="w-full px-3.5 py-2 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                />
              </div>

              {/* ITEM PICKER TABS: CATALOG VS LIBRE */}
              <div className="border border-gray-200 rounded-2xl p-4 space-y-4 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <span className="text-xs font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider">
                    Agregar Ítems a la Cotización
                  </span>
                  <div className="flex bg-gray-100 p-1 rounded-full text-xs font-montserrat font-bold">
                    <button
                      type="button"
                      onClick={() => setItemPickerTab('catalog')}
                      className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 cursor-pointer ${
                        itemPickerTab === 'catalog' ? 'bg-white text-[#1D3557] border border-slate-300 shadow-2xs font-bold' : 'text-[#2B2D42] hover:text-[#1D3557]'
                      }`}
                    >
                      <PackageCheck className="w-3.5 h-3.5 text-[#005da9]" />
                      <span>Desde Catálogo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemPickerTab('libre')}
                      className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 cursor-pointer ${
                        itemPickerTab === 'libre' ? 'bg-white text-[#1D3557] border border-slate-300 shadow-2xs font-bold' : 'text-[#2B2D42] hover:text-[#1D3557]'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#005da9]" />
                      <span>Ítem / Concepto Libre</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: CATALOG PICKER */}
                {itemPickerTab === 'catalog' ? (
                  <div className="space-y-3">
                    {/* Buscador de Productos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                          Buscar en Inventario
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="🔍 Buscar producto por nombre o SKU..."
                            value={searchProdQuery}
                            onChange={(e) => setSearchProdQuery(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                          />
                          {searchProdQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchProdQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-extrabold text-xs"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                          Seleccionar Producto
                        </label>
                        <select
                          value={selectedProdId}
                          onChange={(e) => {
                            setSelectedProdId(e.target.value);
                            const prod = products.find(p => p.id === e.target.value);
                            if (prod) setCatalogCustomPrice(prod.price.toString());
                          }}
                          className="w-full px-3 py-2 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                        >
                          <option value="">
                            {searchProdQuery.trim()
                              ? `-- ${filteredProductsForSelect.length} producto(s) relacionado(s) --`
                              : '-- Seleccionar Producto --'
                            }
                          </option>
                          {filteredProductsForSelect.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${p.price.toFixed(2)}) - Stock: {p.stock}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {searchProdQuery.trim() && filteredProductsForSelect.length === 0 && (
                      <div className="p-3 bg-rose-50 border border-rose-200/70 rounded-xl text-center">
                        <p className="text-xs font-bold text-rose-700">
                          No se encontraron productos en inventario que coincidan con &quot;{searchProdQuery}&quot;.
                        </p>
                      </div>
                    )}

                    {/* CARD / ROW CON LA FORMA DE LA IMAGEN 1 */}
                    {selectedProductObj && (
                      <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs mt-2">
                        {/* HEADER DE LA TABLA (IMAGEN 1) */}
                        <div className="bg-[#1D3557] text-white px-4 py-2 grid grid-cols-12 gap-2 text-[10px] font-montserrat font-extrabold uppercase tracking-wider items-center">
                          <div className="col-span-5 sm:col-span-6">PRODUCTO</div>
                          <div className="col-span-3 sm:col-span-2 text-center">CANT</div>
                          <div className="col-span-3 sm:col-span-2 text-center">PRECIO ($)</div>
                          <div className="col-span-1 text-center">ACCIÓN</div>
                        </div>

                        {/* FILA DEL PRODUCTO SELECCIONADO */}
                        <div className="p-3.5 grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5 sm:col-span-6">
                            <span className="text-xs font-bold text-[#2B2D42] block leading-tight">
                              {selectedProductObj.name}
                            </span>
                            <span className="inline-block mt-1 bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                              Exento (0%)
                            </span>
                          </div>

                          <div className="col-span-3 sm:col-span-2 flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCatalogQty(Math.max(1, catalogQty - 1))}
                              className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={catalogQty}
                              onChange={(e) => setCatalogQty(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-11 py-1 text-center bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-black text-[#2B2D42] focus:outline-none focus:ring-1 focus:ring-[#00BFFF]"
                            />
                            <button
                              type="button"
                              onClick={() => setCatalogQty(catalogQty + 1)}
                              className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                            >
                              +
                            </button>
                          </div>

                          <div className="col-span-3 sm:col-span-2 flex items-center justify-center">
                            <div className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-full text-xs font-black text-[#2B2D42] focus-within:ring-1 focus-within:ring-[#00BFFF]">
                              <span className="text-gray-400 font-bold">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={catalogCustomPrice}
                                onChange={(e) => setCatalogCustomPrice(e.target.value)}
                                className="w-16 text-center font-black focus:outline-none bg-transparent"
                              />
                            </div>
                          </div>

                          <div className="col-span-1 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={handleAddCatalogItem}
                              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full transition flex items-center gap-1 shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                              title="Agregar a la cotización"
                            >
                              <Plus className="w-4 h-4 text-[#005da9]" />
                              <span className="hidden sm:inline">Agregar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* TAB 2: LIBRE / CUSTOM CONCEPT PICKER */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                        Descripción del Concepto / Trabajo
                      </label>
                      <input
                        type="text"
                        value={freeConceptName}
                        onChange={(e) => setFreeConceptName(e.target.value)}
                        placeholder="Ej: Carnet en Lamina PVC Sublimado Colores"
                        className="w-full px-3 py-2 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                      />
                    </div>

                    {/* CARD CON LA FORMA DE LA IMAGEN 1 PARA CONCEPTO LIBRE */}
                    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs mt-2">
                      <div className="bg-[#1D3557] text-white px-4 py-2 grid grid-cols-12 gap-2 text-[10px] font-montserrat font-extrabold uppercase tracking-wider items-center">
                        <div className="col-span-5 sm:col-span-6">CONCEPTO</div>
                        <div className="col-span-3 sm:col-span-2 text-center">CANT</div>
                        <div className="col-span-3 sm:col-span-2 text-center">PRECIO ($)</div>
                        <div className="col-span-1 text-center">ACCIÓN</div>
                      </div>

                      <div className="p-3.5 grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5 sm:col-span-6">
                          <span className="text-xs font-bold text-[#2B2D42] block leading-tight">
                            {freeConceptName || 'Concepto Libre'}
                          </span>
                          <span className="inline-block mt-1 bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                            Exento (0%)
                          </span>
                        </div>

                        <div className="col-span-3 sm:col-span-2 flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setFreeQty(Math.max(1, freeQty - 1))}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={freeQty}
                            onChange={(e) => setFreeQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-11 py-1 text-center bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-black text-[#2B2D42] focus:outline-none focus:ring-1 focus:ring-[#00BFFF]"
                          />
                          <button
                            type="button"
                            onClick={() => setFreeQty(freeQty + 1)}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                          >
                            +
                          </button>
                        </div>

                        <div className="col-span-3 sm:col-span-2 flex items-center justify-center">
                          <div className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-full text-xs font-black text-[#2B2D42] focus-within:ring-1 focus-within:ring-[#00BFFF]">
                            <span className="text-gray-400 font-bold">$</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={freePrice}
                              onChange={(e) => setFreePrice(e.target.value)}
                              className="w-16 text-center font-black focus:outline-none bg-transparent"
                            />
                          </div>
                        </div>

                        <div className="col-span-1 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={handleAddFreeItem}
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full transition flex items-center gap-1 shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                            title="Agregar a la cotización"
                          >
                            <Plus className="w-4 h-4 text-[#005da9]" />
                            <span className="hidden sm:inline">Agregar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TABLA DE ÍTEMS AGREGADOS CON LA FORMA DE LA IMAGEN 1 */}
                <div className="pt-2">
                  <span className="block text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] mb-2 tracking-wider">
                    Ítems en la Cotización ({formItems.length})
                  </span>

                  {formItems.length > 0 ? (
                    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                      {/* HEADER DE LA TABLA (IMAGEN 1) */}
                      <div className="bg-[#1D3557] text-white px-4 py-2 grid grid-cols-12 gap-2 text-[10px] font-montserrat font-extrabold uppercase tracking-wider items-center">
                        <div className="col-span-5 sm:col-span-6">PRODUCTO</div>
                        <div className="col-span-3 sm:col-span-2 text-center">CANT</div>
                        <div className="col-span-3 sm:col-span-2 text-center">PRECIO ($)</div>
                        <div className="col-span-1 text-center">ACCIÓN</div>
                      </div>

                      {/* FILAS DE ÍTEMS AGREGADOS (ESTILO EXACTO IMAGEN 1) */}
                      <div className="divide-y divide-gray-100">
                        {formItems.map((item, index) => (
                          <div key={index} className="p-3.5 grid grid-cols-12 gap-2 items-center hover:bg-[#F8F9FA] transition">
                            <div className="col-span-5 sm:col-span-6">
                              <span className="text-xs font-bold text-[#2B2D42] block leading-tight">
                                {item.name}
                              </span>
                              <span className="inline-block mt-1 bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                                Exento (0%)
                              </span>
                            </div>

                            <div className="col-span-3 sm:col-span-2 flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(index, -1)}
                                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleSetItemQty(index, e.target.value)}
                                className="w-11 py-1 text-center bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-black text-[#2B2D42] focus:outline-none focus:ring-1 focus:ring-[#00BFFF]"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(index, 1)}
                                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-[#2B2D42] text-xs font-bold transition flex items-center justify-center cursor-pointer select-none"
                              >
                                +
                              </button>
                            </div>

                            <div className="col-span-3 sm:col-span-2 flex items-center justify-center">
                              <div className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-full text-xs font-black text-[#2B2D42] focus-within:ring-1 focus-within:ring-[#00BFFF]">
                                <span className="text-gray-400 font-bold">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.price}
                                  onChange={(e) => handleUpdateItemPrice(index, e.target.value)}
                                  className="w-16 text-center font-black focus:outline-none bg-transparent"
                                />
                              </div>
                            </div>

                            <div className="col-span-1 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="p-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                                title="Eliminar ítem"
                              >
                                <Trash2 className="w-4 h-4 text-[#005da9]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 font-bold italic text-center py-4 bg-[#F8F9FA] rounded-2xl border border-dashed border-gray-200">
                      No se han agregado ítems a la cotización.
                    </p>
                  )}
                </div>
              </div>

              {/* OPTIONAL DISCOUNTS & TAXES BREAKDOWN */}
              <div className="bg-[#F8F9FA] border border-gray-200 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                    Descuento Aplicado ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formDiscountAmount}
                    onChange={(e) => setFormDiscountAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                    Impuestos / IVA (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formTaxPercent}
                    onChange={(e) => setFormTaxPercent(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none"
                  />
                </div>
              </div>

              {/* OBSERVATIONS NOTES */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider">
                    Notas / Condiciones del Presupuesto
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormNotes(DEFAULT_QUOTE_NOTES)}
                    className="px-3 py-1 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-[10px] font-bold shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1"
                    title="Restablecer texto predeterminado"
                  >
                    <RotateCcw className="w-3 h-3 text-[#005da9]" />
                    <span>Restablecer Nota Predeterminada</span>
                  </button>
                </div>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ej: Requiere el 50% de anticipo. Tiempo de entrega: 48 horas hábiles..."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition leading-relaxed"
                />
              </div>

              {/* FOOTER TOTAL CALCULATOR */}
              <div className="bg-[#1D3557]/5 border border-[#1D3557]/20 p-4 rounded-2xl space-y-2">
                <div className="flex justify-between text-xs text-[#2B2D42] font-bold">
                  <span>Subtotal:</span>
                  <span className="font-mono">${formSubtotal.toFixed(2)}</span>
                </div>
                {formDiscount > 0 && (
                  <div className="flex justify-between text-xs text-amber-700 font-bold">
                    <span>Descuento:</span>
                    <span className="font-mono">-${formDiscount.toFixed(2)}</span>
                  </div>
                )}
                {formTax > 0 && (
                  <div className="flex justify-between text-xs text-[#2B2D42] font-bold">
                    <span>IVA ({formTaxPercent}%):</span>
                    <span className="font-mono">+${formTax.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-[#1D3557]/20 pt-2 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-montserrat font-extrabold uppercase text-[#1D3557] block">TOTAL ESTIMADO FINAL</span>
                    <span className="text-xs text-[#2B2D42]/70 font-bold">
                      Bs. {((Number(formTotalPrice) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Tasa {bcvRate})
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-montserrat font-extrabold text-[#1D3557]">${formTotalPrice.toFixed(2)}</span>
                    <span className="text-xs font-montserrat font-extrabold text-[#1D3557] ml-1">USD</span>
                  </div>
                </div>
              </div>

              {/* FORM ACTIONS */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-bold text-xs shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Cancelar</span>
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider active:scale-98"
                >
                  <Check className="w-4 h-4 text-[#005da9] stroke-[2.5]" />
                  <span>Guardar Cotización</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 🔍 VIEW DETAIL MODAL */}
      {showDetailModal && selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="printable-area bg-white rounded-3xl border border-gray-100 w-full max-w-xl shadow-2xl overflow-hidden relative text-left">
            
            <div className="bg-[#1D3557] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#40E0D0]" />
                <div>
                  <h3 className="font-montserrat font-extrabold text-sm tracking-tight text-white uppercase">
                    Detalle de Cotización #{selectedQuote.quote_number}
                  </h3>
                  <p className="text-[10px] text-gray-200">
                    Vendedor: {selectedQuote.seller_name || 'Vendedor Principal'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="text-gray-300 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              
              {/* PRINT & PREVIEW BUSINESS HEADER */}
              <div className="text-center pb-3 border-b border-gray-200 space-y-0.5">
                <h2 className="text-base font-montserrat font-extrabold uppercase text-[#1D3557] tracking-tight">
                  {businessProfile?.name || 'Copias Bella Vista'}
                </h2>
                {businessProfile?.slogan && (
                  <p className="text-[10px] text-[#2B2D42]/70 font-bold italic">{businessProfile.slogan}</p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-[#2B2D42] font-mono pt-0.5">
                  {businessProfile?.rif && <span>RIF: {businessProfile.rif}</span>}
                  {businessProfile?.phone && <span>Telf: {businessProfile.phone}</span>}
                  {businessProfile?.address && <span>{businessProfile.address}</span>}
                </div>
              </div>

              {/* STATUS HEADER BANNER */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block leading-none">Fecha Emisión</span>
                  <span className="text-xs font-bold text-[#2B2D42] block mt-1">
                    {new Date(selectedQuote.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block leading-none">Validez Hasta</span>
                  <span className="text-xs font-bold text-[#2B2D42] block mt-1">
                    {selectedQuote.expiration_date 
                      ? new Date(selectedQuote.expiration_date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Sin Expiración'}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-gray-400 block leading-none">Estado</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-montserrat font-extrabold uppercase border mt-1 ${
                    selectedQuote.status === 'vendida' || selectedQuote.status === 'facturada'
                      ? 'bg-[#40E0D0]/15 border-[#40E0D0]/30 text-[#1D3557]'
                      : selectedQuote.status === 'expirada'
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    <span>{
                      selectedQuote.status === 'vendida' || selectedQuote.status === 'facturada' ? 'Vendida' :
                      selectedQuote.status === 'expirada' ? 'Expirada' : 'Creada'
                    }</span>
                  </span>
                </div>
              </div>

              {/* CLIENT DETAILS */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block tracking-wider">Información del Cliente</span>
                <div className="bg-[#F8F9FA] border border-gray-200 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#00BFFF]" />
                    <span className="text-xs font-montserrat font-extrabold text-[#1D3557]">{selectedQuote.client_name}</span>
                  </div>
                  {selectedQuote.client_phone && (
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-[#00BFFF]" />
                      <span className="text-xs font-bold text-[#2B2D42]">{selectedQuote.client_phone}</span>
                    </div>
                  )}
                  {selectedQuote.client_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-bold text-[#2B2D42]">{selectedQuote.client_email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CONCEPT */}
              <div className="space-y-1">
                <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block tracking-wider">Concepto de Operación</span>
                <p className="text-xs font-extrabold text-[#1D3557] bg-[#1D3557]/5 border border-[#1D3557]/15 p-3 rounded-xl">
                  {selectedQuote.concept}
                </p>
              </div>

              {/* PRODUCT ITEMS LIST */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block tracking-wider">Detalle de Ítems</span>
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#1D3557] text-white font-montserrat font-extrabold text-[10px] uppercase">
                        <th className="px-4 py-2">Detalle</th>
                        <th className="px-4 py-2 text-center">Tipo</th>
                        <th className="px-4 py-2 text-center">Cant</th>
                        <th className="px-4 py-2 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[#2B2D42]">
                      {selectedQuote.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#F8F9FA]">
                          <td className="px-4 py-2.5 font-bold">{item.name}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-[#2B2D42]">
                              {item.is_custom ? 'Libre' : 'Catálogo'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-[#1D3557]">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-extrabold">${item.price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* NOTES */}
              {selectedQuote.notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block tracking-wider">Notas del Presupuesto</span>
                  <p className="text-xs text-[#2B2D42] font-medium bg-[#F8F9FA] border border-gray-200 p-3 rounded-xl italic">
                    "{selectedQuote.notes}"
                  </p>
                </div>
              )}

              {/* CALCULATED PRICING BLOCK */}
              <div className="bg-[#1D3557]/5 border border-[#1D3557]/15 p-4 rounded-2xl space-y-1.5">
                {selectedQuote.subtotal_price !== undefined && (
                  <div className="flex justify-between text-xs font-bold text-[#2B2D42]">
                    <span>Subtotal:</span>
                    <span className="font-mono">${selectedQuote.subtotal_price.toFixed(2)}</span>
                  </div>
                )}
                {selectedQuote.discount_amount !== undefined && selectedQuote.discount_amount > 0 && (
                  <div className="flex justify-between text-xs font-bold text-amber-700">
                    <span>Descuento:</span>
                    <span className="font-mono">-${selectedQuote.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                {selectedQuote.tax_amount !== undefined && selectedQuote.tax_amount > 0 && (
                  <div className="flex justify-between text-xs font-bold text-[#2B2D42]">
                    <span>IVA:</span>
                    <span className="font-mono">+${selectedQuote.tax_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-[#1D3557]/15 pt-2 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#1D3557] block">Total Cotización</span>
                    <span className="text-[11px] font-bold text-[#2B2D42]/70 block">
                      Bs. {((Number(selectedQuote?.total_price) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-montserrat font-extrabold text-[#1D3557]">${selectedQuote.total_price.toFixed(2)}</span>
                    <span className="text-xs font-montserrat font-extrabold text-[#1D3557] ml-1">USD</span>
                  </div>
                </div>
              </div>

            </div>

            {/* BUTTON BAR ACTIONS */}
            <div className="bg-[#F8F9FA] border-t border-gray-200 p-4 flex flex-col md:flex-row gap-2 justify-between print:hidden">
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteQuote(selectedQuote.id)}
                  className="p-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs cursor-pointer active:scale-98"
                  title="Eliminar permanentemente"
                >
                  <Trash2 className="w-4 h-4 text-[#005da9]" />
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintPDF(selectedQuote)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-[#1D3557] font-bold text-xs rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
                >
                  <Printer className="w-3.5 h-3.5 text-[#005da9]" />
                  <span>Imprimir PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedQuote)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-[#1D3557] font-bold text-xs rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#005da9]" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-[#1D3557] font-bold text-xs rounded-full transition cursor-pointer shadow-2xs active:scale-98 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Cerrar</span>
                </button>

                {/* CONVERT TO SALE OPTION (Habilitado incluso si venció) */}
                {selectedQuote.status !== 'vendida' && selectedQuote.status !== 'facturada' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetailModal(false);
                      handleOpenBillingModal(selectedQuote);
                    }}
                    className="p-2.5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:brightness-110 active:scale-98 text-white border border-[#005da9]/50 rounded-full shadow-2xs hover:shadow-xs transition-all duration-300 flex items-center justify-center cursor-pointer select-none"
                    title={
                      (selectedQuote.status === 'expirada' || Boolean(selectedQuote.expiration_date && new Date(selectedQuote.expiration_date).getTime() < Date.now()))
                        ? "Convertir a Ventas (Cotización Vencida)"
                        : "Convertir a Ventas"
                    }
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0 text-[#40E0D0] stroke-[2.5]" />
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* 💵 CONVERTIR COTIZACIÓN EN VENTA MODAL (FACTURA / NOTA, CUENTAS BANCARIAS, CRÉDITO Y CUOTAS EN TIEMPO REAL) */}
      {showBillingModal && selectedQuote && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-xl shadow-2xl overflow-hidden text-left flex flex-col my-auto max-h-[92vh] animate-scale-up">
            
            {/* Modal Header */}
            <div className="bg-[#1D3557] px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#40E0D0]/20 flex items-center justify-center border border-[#40E0D0]/30">
                  <CheckCircle2 className="w-5 h-5 text-[#40E0D0]" />
                </div>
                <div>
                  <h3 className="font-montserrat font-black text-sm tracking-tight text-white uppercase">
                    Convertir Cotización en Venta
                  </h3>
                  <p className="text-[11px] text-[#40E0D0] font-semibold">
                    Cotización N° {selectedQuote.quote_number} · Cliente: {selectedQuote.client_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBillingModal(false)}
                disabled={isBilling}
                className="text-white/70 hover:text-white transition p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">

              {/* Notificación si la cotización está vencida */}
              {(selectedQuote.status === 'expirada' || Boolean(selectedQuote.expiration_date && new Date(selectedQuote.expiration_date).getTime() < Date.now())) && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-900 shadow-2xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-xs font-montserrat font-black uppercase tracking-wider block text-amber-900">
                      Cotización Vencida / Expirada
                    </span>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Esta cotización superó su fecha límite de validez, pero está habilitada para ser convertida a venta directamente. Al confirmar, se emitirá el documento oficial y se actualizará el inventario.
                    </p>
                  </div>
                </div>
              )}

              {/* Total Card */}
              <div className="bg-linear-to-r from-[#1D3557]/10 via-[#00BFFF]/10 to-[#40E0D0]/15 border border-[#40E0D0]/30 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-montserrat font-black uppercase text-[#1D3557] tracking-wider block">
                    Monto Total de la Venta
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-montserrat font-black text-[#1D3557]">
                      ${selectedQuote.total_price.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-gray-500">USD</span>
                  </div>
                  <p className="text-xs font-bold text-emerald-700 mt-0.5">
                    Bs. {((Number(selectedQuote.total_price) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    <span className="text-[10px] text-gray-500 font-normal ml-1">(Tasa BCV: Bs. {bcvRate.toFixed(2)})</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-montserrat font-extrabold text-[#1D3557]">
                    {selectedQuote.items?.length || 0} {(selectedQuote.items?.length || 0) === 1 ? 'Ítem' : 'Ítems'}
                  </span>
                </div>
              </div>

              {/* 1. DOCUMENT TYPE SELECTOR: FACTURA VS NOTA DE ENTREGA */}
              <div className="space-y-2">
                <label className="block text-[11px] font-montserrat font-black uppercase text-[#1D3557] tracking-wider">
                  1. Tipo de Documento a Emitir
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConvertDocType('factura')}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      convertDocType === 'factura'
                        ? 'bg-[#1D3557] border-[#1D3557] text-white shadow-md'
                        : 'bg-[#F8F9FA] border-gray-200 text-[#2B2D42] hover:border-[#1D3557]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className={`w-4 h-4 ${convertDocType === 'factura' ? 'text-[#40E0D0]' : 'text-[#00BFFF]'}`} />
                        <span className="font-montserrat font-black text-xs uppercase tracking-tight">Factura</span>
                      </div>
                      {convertDocType === 'factura' && (
                        <Check className="w-4 h-4 text-[#40E0D0]" />
                      )}
                    </div>
                    <div className="text-[10px] opacity-85">
                      Próximo N°: <span className="font-bold underline">#{nextControlNumberFactura}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertDocType('nota_entrega')}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      convertDocType === 'nota_entrega'
                        ? 'bg-[#1D3557] border-[#1D3557] text-white shadow-md'
                        : 'bg-[#F8F9FA] border-gray-200 text-[#2B2D42] hover:border-[#1D3557]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileCheck className={`w-4 h-4 ${convertDocType === 'nota_entrega' ? 'text-[#40E0D0]' : 'text-emerald-600]'}`} />
                        <span className="font-montserrat font-black text-xs uppercase tracking-tight">Nota de Entrega</span>
                      </div>
                      {convertDocType === 'nota_entrega' && (
                        <Check className="w-4 h-4 text-[#40E0D0]" />
                      )}
                    </div>
                    <div className="text-[10px] opacity-85">
                      Próximo N°: <span className="font-bold underline">#{nextControlNumberNota}</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. PAYMENT CONDITION: CONTADO (PAGADO) VS CRÉDITO */}
              <div className="space-y-2">
                <label className="block text-[11px] font-montserrat font-black uppercase text-[#1D3557] tracking-wider">
                  2. Condición de Pago
                </label>
                <div className="grid grid-cols-2 gap-3 bg-[#F8F9FA] p-1.5 rounded-full border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setBillingPaymentStatus('pagado')}
                    className={`py-2 px-4 rounded-full font-montserrat font-bold text-xs uppercase transition cursor-pointer flex items-center justify-center gap-2 ${
                      billingPaymentStatus === 'pagado'
                        ? 'bg-white text-[#1D3557] border border-slate-300 shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1D3557]'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 text-[#005da9]" />
                    <span>De Contado (Pagado)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPaymentStatus('credito')}
                    className={`py-2 px-4 rounded-full font-montserrat font-bold text-xs uppercase transition cursor-pointer flex items-center justify-center gap-2 ${
                      billingPaymentStatus === 'credito'
                        ? 'bg-white text-[#1D3557] border border-slate-300 shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1D3557]'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-[#005da9]" />
                    <span>A Crédito (CxC)</span>
                  </button>
                </div>
              </div>

              {/* 3A. IF CONTADO: SELECT REGISTERED BANK ACCOUNT */}
              {billingPaymentStatus === 'pagado' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#00BFFF]" />
                    <label className="text-[11px] font-montserrat font-black uppercase text-[#1D3557] tracking-wider">
                      Cuenta Bancaria Registrada (Destino del Cobro)
                    </label>
                  </div>

                  {bankAccounts.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      No hay cuentas bancarias activas registradas en el sistema. Puedes configurarlas en el módulo de Cuentas Bancarias.
                    </div>
                  ) : (
                    <div>
                      <select
                        value={selectedBankAccountId}
                        onChange={(e) => setSelectedBankAccountId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                      >
                        {bankAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} · {acc.bank_name || 'Banco'} ({acc.currency}) — Saldo: {acc.currency === 'USD' ? '$' : 'Bs.'}{Number(acc.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </option>
                        ))}
                      </select>

                      {/* Selected account details badge */}
                      {(() => {
                        const selAcc = bankAccounts.find(a => a.id === selectedBankAccountId);
                        if (!selAcc) return null;
                        const isUsdAcc = selAcc.currency === 'USD';
                        const amountToCredit = isUsdAcc 
                          ? `$${selectedQuote.total_price.toFixed(2)} USD`
                          : `Bs. ${((Number(selectedQuote.total_price) || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
                        return (
                          <div className="mt-2 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl flex items-center justify-between">
                            <span>Ingreso acreditado a cuenta:</span>
                            <span className="font-extrabold">{amountToCredit}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-montserrat font-bold uppercase text-gray-500 mb-1">
                      N° de Referencia / Comprobante (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Ref 948271 o Zelle confirmación"
                      value={billingPaymentReference}
                      onChange={(e) => setBillingPaymentReference(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF]"
                    />
                  </div>
                </div>
              )}

              {/* 3B. IF CREDITO: DATES, INSTALLMENTS AND REAL-TIME SCHEDULE */}
              {billingPaymentStatus === 'credito' && (
                <div className="space-y-4 bg-amber-50/50 border border-amber-200 p-4 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    <label className="text-[11px] font-montserrat font-black uppercase text-amber-900 tracking-wider">
                      Cuentas por Cobrar · Configuración de Crédito y Cuotas
                    </label>
                  </div>

                  <div className="text-xs text-amber-800 bg-amber-100/60 p-2.5 rounded-xl border border-amber-200/80 leading-relaxed">
                    Esta venta se registrará en <strong>Cuentas por Cobrar (CxC)</strong> en tiempo real. Se creará el plan de cuotas y se actualizará el saldo deudor del cliente.
                  </div>

                  {/* Dates: Emisión y Vencimiento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-montserrat font-bold uppercase text-gray-600 mb-1">
                        Fecha de Emisión
                      </label>
                      <input
                        type="date"
                        value={creditIssueDate}
                        onChange={(e) => setCreditIssueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-montserrat font-bold uppercase text-gray-600 mb-1">
                        Fecha de Vencimiento Final
                      </label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Cuotas y Frecuencia */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-montserrat font-bold uppercase text-gray-600 mb-1">
                        Número de Cuotas
                      </label>
                      <select
                        value={creditInstallmentsCount}
                        onChange={(e) => setCreditInstallmentsCount(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value={1}>1 Cuota (Pago Único)</option>
                        <option value={2}>2 Cuotas</option>
                        <option value={3}>3 Cuotas</option>
                        <option value={4}>4 Cuotas</option>
                        <option value={5}>5 Cuotas</option>
                        <option value={6}>6 Cuotas</option>
                        <option value={8}>8 Cuotas</option>
                        <option value={10}>10 Cuotas</option>
                        <option value={12}>12 Cuotas</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-montserrat font-bold uppercase text-gray-600 mb-1">
                        Frecuencia de Pagos
                      </label>
                      <select
                        value={creditFrequency}
                        onChange={(e) => setCreditFrequency(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="semanal">Semanal (Cada 7 días)</option>
                        <option value="quincenal">Quincenal (Cada 15 días)</option>
                        <option value="mensual">Mensual (Cada 30 días)</option>
                      </select>
                    </div>
                  </div>

                  {/* Cuotas Breakdown Table in Real Time */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-montserrat font-black uppercase text-amber-900 tracking-wider block">
                      Cronograma de Cuotas (Tiempo Real)
                    </span>
                    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-2xs max-h-36 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-amber-100/70 text-amber-950 font-bold border-b border-amber-200 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-1.5">Cuota</th>
                            <th className="px-3 py-1.5">Vencimiento</th>
                            <th className="px-3 py-1.5 text-right">Monto (USD)</th>
                            <th className="px-3 py-1.5 text-right">Monto (Bs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100 font-medium text-gray-700">
                          {generatedInstallments.map((inst) => (
                            <tr key={inst.number} className="hover:bg-amber-50/50">
                              <td className="px-3 py-1.5 font-bold text-[#1D3557]">Cuota #{inst.number}</td>
                              <td className="px-3 py-1.5 text-gray-600">{inst.due_date}</td>
                              <td className="px-3 py-1.5 text-right font-extrabold text-amber-900">${inst.amount.toFixed(2)}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-700 font-semibold">Bs. {inst.amount_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-gray-500 italic leading-relaxed">
                Nota: La cotización cambiará automáticamente a estado <strong>"Vendida"</strong>, se descontará el inventario en tiempo real y NO se generará como pedido online.
              </p>

            </div>

            {/* Modal Footer */}
            <div className="bg-[#F8F9FA] px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowBillingModal(false)}
                disabled={isBilling}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-bold text-xs rounded-full shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
              >
                <X className="w-4 h-4 text-[#005da9]" />
                <span>Cancelar</span>
              </button>

              <button
                type="button"
                onClick={handleConvertToSale}
                disabled={isBilling}
                className="px-6 py-2.5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:brightness-110 active:brightness-95 text-white border border-[#005da9]/50 font-montserrat font-black text-xs rounded-full shadow-xs hover:shadow-md transition-all duration-300 flex items-center gap-2 cursor-pointer uppercase tracking-wider select-none disabled:opacity-50"
              >
                {isBilling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#40E0D0]" />
                    <span>Emitiendo Venta...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#40E0D0] stroke-[2.5]" />
                    <span>Confirmar y Emitir {convertDocType === 'nota_entrega' ? 'Nota de Entrega' : 'Factura'}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* NUEVO CLIENTE MODAL (IMAGEN 1 MATCH) */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[999] animate-fade-in">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-scale-up">
            
            {/* Header */}
            <div className="bg-[#1D3557] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-[#00BFFF]" />
                <span className="font-montserrat font-black uppercase text-sm tracking-wider">Nuevo Cliente</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="text-white/85 hover:text-white transition cursor-pointer p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewClient} className="p-6 space-y-4">
              
              {/* Nombre Completo / Razón Social */}
              <div className="space-y-1">
                <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                  Nombre Completo / Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Ej: Inversiones Pérez C.A., María Gómez"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                />
              </div>

              {/* Tipo de Identificación & Cédula o RIF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                    Tipo Identificación *
                  </label>
                  <select
                    value={newClientType}
                    onChange={(e) => setNewClientType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                  >
                    <option value="Natural (V / E)">Natural (V / E)</option>
                    <option value="Jurídico (J)">Jurídico (J)</option>
                    <option value="Gubernamental (G)">Gubernamental (G)</option>
                    <option value="Pasaporte (P)">Pasaporte (P)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                    Cédula o RIF *
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientDocument}
                    onChange={(e) => setNewClientDocument(e.target.value)}
                    placeholder="Ej: V-12345678 o J-31456987"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Teléfono / WhatsApp & Límite de Crédito */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="Ej: 0412-5551234"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                    Límite de Crédito (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newClientCredit}
                    onChange={(e) => setNewClientCredit(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Correo Electrónico */}
              <div className="space-y-1">
                <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="Ej: cliente@ejemplo.com"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition"
                />
              </div>

              {/* Dirección */}
              <div className="space-y-1">
                <label className="block text-[11px] font-montserrat font-black text-[#1D3557] uppercase tracking-wider">
                  Dirección
                </label>
                <textarea
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  placeholder="Ej: Av. Bella Vista, Calle 72, Sector Tierra Negra"
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#00BFFF] focus:bg-white transition resize-none"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 grid grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  disabled={isSavingClient}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs uppercase tracking-wider rounded-full shadow-2xs transition cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Cancelar</span>
                </button>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs uppercase tracking-wider rounded-full shadow-2xs hover:shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  {isSavingClient ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#005da9]" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-[#005da9]" />
                      <span>Guardar Cliente</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
