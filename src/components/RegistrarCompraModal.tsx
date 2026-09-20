import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, Plus, Search, Calendar, Truck, FileText, CheckCircle2, 
  Trash2, X, Check, Package, CreditCard, Banknote, Landmark, Clock, ShoppingCart, Minus, ArrowRight, ArrowLeft
} from 'lucide-react';
import { 
  Product, Provider, Category, BusinessBranch,
  BankAccount, AccountPayable, AccountPayablePayment, Purchase, PurchaseItem, PurchaseInstallment
} from '../types.ts';
import { supabase, dbService } from '../lib/supabase.ts';
import { DEFAULT_PRODUCT_FALLBACK } from '../lib/imageUtils.ts';

export interface FormItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode_qr?: string;
  quantity: number;
  unit_cost: number;
  current_stock: number;
  image_url?: string;
}

interface RegistrarCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providers: Provider[];
  products: Product[];
  categories?: Category[];
  bankAccounts: BankAccount[];
  bcvRate: number;
  branchesList?: BusinessBranch[];
  onOpenQuickProductModal: (initialName?: string) => void;
  toastNotify: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  onProviderCreated?: (provider: Provider) => void;
}

export default function RegistrarCompraModal({
  isOpen,
  onClose,
  onSuccess,
  providers,
  products,
  categories = [],
  bankAccounts,
  bcvRate,
  branchesList = [],
  onOpenQuickProductModal,
  toastNotify,
  onProviderCreated
}: RegistrarCompraModalProps) {
  // Wizard Step: 1 (Proveedor/Factura), 2 (Catálogo/Cesta), 3 (Método de Pago), 4 (Resumen)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Providers local state and synchronization
  const [localProviders, setLocalProviders] = useState<Provider[]>(providers || []);
  const [showNewProviderModal, setShowNewProviderModal] = useState<boolean>(false);

  // New Provider Modal Form State (Images 1 & 2)
  const [newProvCode, setNewProvCode] = useState<string>('');
  const [newProvName, setNewProvName] = useState<string>('');
  const [newProvType, setNewProvType] = useState<string>('Jurídico (J / G)');
  const [newProvRif, setNewProvRif] = useState<string>('');
  const [newProvPhone, setNewProvPhone] = useState<string>('');
  const [newProvBankName, setNewProvBankName] = useState<string>('');
  const [isSavingProvider, setIsSavingProvider] = useState<boolean>(false);

  // Step 1: Proveedor y Factura
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [customProviderName, setCustomProviderName] = useState<string>('');
  const [customProviderRif, setCustomProviderRif] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedBranch, setSelectedBranch] = useState<string>('Tienda Bella Vista (SP-01)');
  const [updateProductCost, setUpdateProductCost] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');

  // Keep localProviders synchronized with incoming prop and load on open
  useEffect(() => {
    if (providers && providers.length > 0) {
      setLocalProviders(providers);
    }
  }, [providers]);

  useEffect(() => {
    if (isOpen) {
      dbService.getProviders()
        .then(data => {
          if (data && data.length > 0) {
            setLocalProviders(data);
          }
        })
        .catch(err => console.error("Error loading providers in purchase modal:", err));
    }
  }, [isOpen]);

  const getNextProviderCode = (list: Provider[]): string => {
    let maxNum = 0;
    (list || []).forEach(p => {
      if (!p.code) return;
      const match = p.code.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextNum = maxNum + 1;
    return nextNum < 1000 ? `PROV-${String(nextNum).padStart(3, '0')}` : `PROV-${nextNum}`;
  };

  const handleOpenNewProviderModal = () => {
    setNewProvCode(getNextProviderCode(localProviders));
    setNewProvName('');
    setNewProvType('Jurídico (J / G)');
    setNewProvRif('');
    setNewProvPhone('');
    setNewProvBankName('');
    setShowNewProviderModal(true);
  };

  const handleSaveNewProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvName.trim()) {
      toastNotify('Campo requerido', 'Por favor ingresa la Razón Social del proveedor.', 'error');
      return;
    }
    if (!newProvRif.trim()) {
      toastNotify('Campo requerido', 'Por favor ingresa el RIF o Cédula del proveedor.', 'error');
      return;
    }

    setIsSavingProvider(true);
    try {
      const generatedCode = newProvCode.trim() || getNextProviderCode(localProviders);
      const newProviderData = {
        code: generatedCode,
        name: newProvName.trim(),
        rif: newProvRif.trim(),
        type: newProvType,
        phone: newProvPhone.trim(),
        bank_name: newProvBankName.trim()
      };

      const created = await dbService.createProvider(newProviderData);

      // Add to localProviders list
      setLocalProviders(prev => {
        const filtered = prev.filter(p => p.id !== created.id);
        return [created, ...filtered];
      });

      // Automatically select the new provider and populate Razón Social and RIF
      setSelectedProviderId(created.id);
      setCustomProviderName(created.name);
      setCustomProviderRif(created.rif);
      setCxpEntityName(created.name);

      setShowNewProviderModal(false);
      toastNotify('Proveedor Registrado', `Proveedor ${created.name} (${created.rif}) guardado y cargado automáticamente.`, 'success');

      if (onProviderCreated) {
        onProviderCreated(created);
      }
    } catch (err: any) {
      console.error("Error creating provider:", err);
      toastNotify('Error al guardar', err.message || 'No se pudo registrar el proveedor.', 'error');
    } finally {
      setIsSavingProvider(false);
    }
  };

  // Step 2: Catálogo y Cesta de Compra
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogCategory, setCatalogCategory] = useState<string>('all');
  const [cartItems, setCartItems] = useState<FormItem[]>([]);
  const [productImagesMap, setProductImagesMap] = useState<Record<string, string>>({});

  // Step 3: Método de Pago (Contado vs CXP)
  const [paymentType, setPaymentType] = useState<'contado' | 'cxp'>('contado');
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia Bancaria');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // CXP Details
  const [cxpEntityName, setCxpEntityName] = useState<string>('');
  const [cxpSubject, setCxpSubject] = useState<string>('');
  const [cxpIssueDate, setCxpIssueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [cxpDueDate, setCxpDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [cxpInitialPayment, setCxpInitialPayment] = useState<number | string>(0);
  const [cxpInitialPayBankId, setCxpInitialPayBankId] = useState<string>('');
  const [cxpInitialPayRef, setCxpInitialPayRef] = useState<string>('');
  const [cxpInitialPayMethod, setCxpInitialPayMethod] = useState<string>('Transferencia Bancaria');
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  const [installments, setInstallments] = useState<PurchaseInstallment[]>([]);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize selected bank account if available
  useEffect(() => {
    if (bankAccounts && bankAccounts.length > 0 && !selectedBankId) {
      setSelectedBankId(bankAccounts[0].id);
    }
    if (bankAccounts && bankAccounts.length > 0 && !cxpInitialPayBankId) {
      setCxpInitialPayBankId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankId, cxpInitialPayBankId]);

  // Load product images for catalog display
  useEffect(() => {
    async function loadImages() {
      try {
        const { data, error } = await supabase
          .from('product_images')
          .select('product_id, image_url, is_primary');
        if (!error && Array.isArray(data)) {
          const map: Record<string, string> = {};
          data.forEach((img: any) => {
            if (!map[img.product_id] || img.is_primary) {
              map[img.product_id] = img.image_url;
            }
          });
          setProductImagesMap(map);
        }
      } catch (err) {
        console.warn('Could not load product images:', err);
      }
    }
    loadImages();
  }, []);

  // Filter products for the catalog
  const filteredCatalogProducts = useMemo(() => {
    return products.filter(p => {
      const matchQuery = !catalogSearch.trim() || 
        p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(catalogSearch.toLowerCase())) ||
        (p.barcode_qr && p.barcode_qr.toLowerCase().includes(catalogSearch.toLowerCase()));
      
      const matchCat = catalogCategory === 'all' || p.category_id === catalogCategory;
      return matchQuery && matchCat;
    });
  }, [products, catalogSearch, catalogCategory]);

  // Calculations for the Cart
  const calculations = useMemo(() => {
    const totalItemsCount = cartItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalAmountUsd = cartItems.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)), 0);
    const totalAmountBs = bcvRate > 0 ? totalAmountUsd * bcvRate : 0;
    return { totalItemsCount, totalAmountUsd, totalAmountBs };
  }, [cartItems, bcvRate]);

  // Remaining balance to finance in CXP
  const cxpRemainingToFinance = useMemo(() => {
    const initPay = parseFloat(String(cxpInitialPayment)) || 0;
    return Math.max(0, Number((calculations.totalAmountUsd - initPay).toFixed(2)));
  }, [calculations.totalAmountUsd, cxpInitialPayment]);

  // Helper to re-balance or initialize installments evenly
  const recalculateInstallmentsEvenly = (
    countNum: number,
    totalUsd: number,
    initialPayStr: string | number,
    issueDateStr: string,
    purDateStr: string
  ): PurchaseInstallment[] => {
    const count = Math.max(1, Number(countNum) || 1);
    const initialPay = parseFloat(String(initialPayStr)) || 0;
    const remaining = Math.max(0, Number((totalUsd - initialPay).toFixed(2)));
    const baseAmount = Number((remaining / count).toFixed(2));

    const newInst: PurchaseInstallment[] = [];
    for (let i = 1; i <= count; i++) {
      const d = new Date(issueDateStr || purDateStr || Date.now());
      const daysToAdd = count === 1 ? 30 : (i * 15);
      d.setDate(d.getDate() + daysToAdd);
      const dueDate = d.toISOString().split('T')[0];

      const cuotaAmount = i === count
        ? Number((remaining - (baseAmount * (count - 1))).toFixed(2))
        : baseAmount;

      newInst.push({
        number: i,
        due_date: dueDate,
        amount: Math.max(0, Number(cuotaAmount.toFixed(2))),
        status: 'pendiente'
      });
    }
    return newInst;
  };

  // Automatically recalculate CXP installments when core parameters change
  useEffect(() => {
    if (paymentType === 'cxp') {
      const calculated = recalculateInstallmentsEvenly(
        installmentsCount,
        calculations.totalAmountUsd,
        cxpInitialPayment,
        cxpIssueDate,
        purchaseDate
      );
      setInstallments(calculated);
    } else {
      setInstallments([]);
    }
  }, [paymentType, installmentsCount, calculations.totalAmountUsd, cxpInitialPayment, cxpIssueDate, purchaseDate]);

  // Handler for user manually editing a specific installment amount
  // The remaining debt is automatically redistributed across the subsequent installments
  const handleUpdateInstallmentAmount = (index: number, newAmountVal: number | string) => {
    const val = typeof newAmountVal === 'string' ? (parseFloat(newAmountVal) || 0) : newAmountVal;
    const totalRemaining = cxpRemainingToFinance;

    setInstallments(prev => {
      const copy = prev.map(p => ({ ...p }));
      if (!copy[index]) return prev;

      copy[index].amount = Math.max(0, Number(val.toFixed(2)));

      // Sum of cuotas from 0 to index
      const sumPreceding = copy.slice(0, index + 1).reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
      const subsequentCount = copy.length - 1 - index;

      if (subsequentCount > 0) {
        const remainingForSubsequent = Math.max(0, Number((totalRemaining - sumPreceding).toFixed(2)));
        const baseSubsequent = Number((remainingForSubsequent / subsequentCount).toFixed(2));

        for (let j = index + 1; j < copy.length; j++) {
          if (j === copy.length - 1) {
            const alreadyAssigned = baseSubsequent * (subsequentCount - 1);
            copy[j].amount = Math.max(0, Number((remainingForSubsequent - alreadyAssigned).toFixed(2)));
          } else {
            copy[j].amount = Math.max(0, baseSubsequent);
          }
        }
      }

      return copy;
    });
  };

  // Handler for user editing installment due date
  const handleUpdateInstallmentDueDate = (index: number, newDate: string) => {
    setInstallments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], due_date: newDate };
      }
      return copy;
    });
  };

  // Handler to manually reset/distribute evenly
  const handleResetInstallmentsEvenly = () => {
    const calculated = recalculateInstallmentsEvenly(
      installmentsCount,
      calculations.totalAmountUsd,
      cxpInitialPayment,
      cxpIssueDate,
      purchaseDate
    );
    setInstallments(calculated);
  };

  // Installment sum validation
  const installmentsTotalSum = useMemo(() => {
    return Number(installments.reduce((acc, it) => acc + (Number(it.amount) || 0), 0).toFixed(2));
  }, [installments]);

  const isInstallmentsBalanced = Math.abs(installmentsTotalSum - cxpRemainingToFinance) < 0.02;

  // Helper to add product to cart
  const handleAddProductToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product_id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        const imgUrl = productImagesMap[product.id] || '';
        const costPrice = Number(product.cost_price ?? (Number(product.price || 0) > 0 ? Number(product.price) * 0.7 : 0));
        return [
          ...prev,
          {
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            product_id: product.id,
            product_name: product.name,
            sku: product.sku || '',
            barcode_qr: product.barcode_qr || '',
            quantity: 1,
            unit_cost: costPrice,
            current_stock: Number(product.stock || 0),
            image_url: imgUrl
          }
        ];
      }
    });
  };

  // Helper to update item quantity
  const handleUpdateItemQuantity = (itemId: string, newQty: number) => {
    const qty = Math.max(1, newQty);
    setCartItems(prev => prev.map(item => item.id === itemId ? { ...item, quantity: qty } : item));
  };

  // Helper to update item unit cost
  const handleUpdateItemCost = (itemId: string, newCost: number) => {
    const cost = Math.max(0, newCost);
    setCartItems(prev => prev.map(item => item.id === itemId ? { ...item, unit_cost: cost } : item));
  };

  // Helper to remove item from cart
  const handleRemoveItem = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Helper to clear cart
  const handleClearCart = () => {
    if (confirm('¿Deseas vaciar todos los productos de la cesta?')) {
      setCartItems([]);
    }
  };

  // Helper to get image url
  const getProductImage = (productId: string) => {
    return productImagesMap[productId] || '';
  };

  // Reset form
  const resetForm = () => {
    setWizardStep(1);
    setSelectedProviderId('');
    setCustomProviderName('');
    setCustomProviderRif('');
    setInvoiceNumber('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setSelectedBranch('Tienda Bella Vista (SP-01)');
    setUpdateProductCost(true);
    setNotes('');
    setCatalogSearch('');
    setCatalogCategory('all');
    setCartItems([]);
    setPaymentType('contado');
    setPaymentMethod('Transferencia Bancaria');
    setPaymentReference('');
    setPaymentNotes('');
    setCxpEntityName('');
    setCxpSubject('');
    setCxpInitialPayment(0);
    setCxpInitialPayRef('');
    setInstallmentsCount(1);
    setInstallments([]);
  };

  // Main Save Purchase Handler
  const handleSavePurchase = async () => {
    if (!invoiceNumber.trim()) {
      alert('Por favor ingresa el número de factura o control.');
      setWizardStep(1);
      return;
    }

    if (cartItems.length === 0) {
      alert('La cesta de compra está vacía. Agrega al menos un producto.');
      setWizardStep(2);
      return;
    }

    const providerObj = localProviders.find(p => p.id === selectedProviderId) || providers.find(p => p.id === selectedProviderId);
    const providerName = customProviderName.trim() || (providerObj ? providerObj.name : 'Proveedor General');
    const providerRif = customProviderRif.trim() || (providerObj ? providerObj.rif : '');

    setIsSubmitting(true);

    try {
      const totalAmount = calculations.totalAmountUsd;
      const initialPayNum = parseFloat(String(cxpInitialPayment)) || 0;
      const paymentStatus = paymentType === 'cxp' ? (initialPayNum >= totalAmount ? 'pagado' : 'pendiente') : 'pagado';
      const actualPaymentMethod = paymentType === 'cxp' ? 'Crédito / CXP' : paymentMethod;

      // 1. Prepare items payload
      const itemsPayload: PurchaseItem[] = cartItems.map(item => {
        const currentProd = products.find(p => p.id === item.product_id);
        const curStock = Number(currentProd?.stock || item.current_stock || 0);
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          subtotal: Number((item.quantity * item.unit_cost).toFixed(2)),
          previous_stock: curStock,
          new_stock: curStock + item.quantity
        };
      });

      // 2. Prepare Purchase Record
      const purchasePayload: Omit<Purchase, 'id'> = {
        invoice_number: invoiceNumber.trim(),
        provider_id: selectedProviderId && selectedProviderId !== 'otro' ? selectedProviderId : undefined,
        provider_name: providerName,
        provider_rif: providerRif,
        date: purchaseDate,
        total_amount: totalAmount,
        paid_amount: paymentType === 'cxp' ? initialPayNum : totalAmount,
        initial_payment: paymentType === 'cxp' ? initialPayNum : totalAmount,
        payment_method: actualPaymentMethod,
        payment_status: paymentStatus,
        status: paymentType === 'cxp' ? 'pendiente' : 'completada',
        notes: notes.trim() ? `${notes.trim()} | Sede: ${selectedBranch}` : `Sede: ${selectedBranch}`,
        total_items: calculations.totalItemsCount,
        installments_count: paymentType === 'cxp' ? installmentsCount : undefined,
        installments: paymentType === 'cxp' ? installments : undefined,
        due_date: paymentType === 'cxp' ? cxpDueDate : undefined,
        update_cost_applied: updateProductCost,
        items: itemsPayload
      };

      // 3. Save Purchase in DB and update stocks
      const result = await dbService.createPurchase(purchasePayload, updateProductCost);

      // 4. Linked Financial Movement: Bank Account Debit or CXP Creation
      if (paymentType === 'contado') {
        if (selectedBankId) {
          const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
          const debitAmount = selectedBank?.currency === 'VES' ? calculations.totalAmountBs : calculations.totalAmountUsd;

          try {
            await dbService.updateBankAccountBalance(selectedBankId, -debitAmount);
          } catch (bankErr) {
            console.warn("Could not update bank account balance:", bankErr);
          }

          try {
            await dbService.transferBetweenAccounts({
              id: crypto.randomUUID(),
              from_account_id: selectedBankId,
              from_account_name: selectedBank?.name || 'Cuenta Bancaria',
              to_account_name: `Proveedor: ${providerName}`,
              amount: debitAmount,
              currency: selectedBank?.currency || 'USD',
              exchange_rate: bcvRate,
              reference: paymentReference || invoiceNumber,
              notes: `Egreso por Compra Factura #${invoiceNumber} - Proveedor: ${providerName}`,
              created_at: new Date().toISOString()
            });
          } catch (transErr) {
            console.warn("Could not record bank transfer:", transErr);
          }

          try {
            await dbService.addCashOp({
              type: 'egreso',
              concept: `Pago Compra Factura #${invoiceNumber} - ${providerName}`,
              amount: calculations.totalAmountUsd,
              amount_bs: calculations.totalAmountBs,
              currency_code: selectedBank?.currency || 'USD',
              payment_method: paymentMethod,
              observation: `Banco: ${selectedBank?.name || 'N/A'}. Ref: ${paymentReference || 'N/A'}`
            });
          } catch (cashErr) {
            console.warn("Could not record cash operation:", cashErr);
          }

          window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated'));
        }
      } else if (paymentType === 'cxp') {
        // Register in Cuentas por Pagar (CXP)
        try {
          const remainingDebt = Math.max(0, Number((totalAmount - initialPayNum).toFixed(2)));
          const cxpStatus = remainingDebt <= 0 ? 'pagado' : (initialPayNum > 0 ? 'parcial' : 'pendiente');
          const cxpId = `cxp-pur-${result?.purchase?.id || crypto.randomUUID()}`;

          const newCxp: AccountPayable = {
            id: cxpId,
            purchase_id: result?.purchase?.id,
            invoice_number: invoiceNumber.trim(),
            entity_name: cxpEntityName.trim() || providerName,
            provider_name: cxpEntityName.trim() || providerName,
            provider_rif: providerRif,
            subject: cxpSubject.trim() || `Factura #${invoiceNumber} - Compra`,
            description: `Cuenta por pagar generada desde Compra Factura #${invoiceNumber} por ${calculations.totalItemsCount} productos. Sede: ${selectedBranch}.`,
            total_amount: totalAmount,
            paid_amount: initialPayNum,
            remaining_amount: remainingDebt,
            status: cxpStatus,
            currency: 'USD',
            issue_date: cxpIssueDate ? new Date(cxpIssueDate).toISOString() : new Date().toISOString(),
            due_date: cxpDueDate ? new Date(cxpDueDate).toISOString() : undefined,
            installments_count: installmentsCount,
            installments: installments,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await dbService.saveAccountPayable(newCxp);

          // If there was an initial down payment (abono inicial)
          if (initialPayNum > 0) {
            if (cxpInitialPayBankId) {
              const abonoBank = bankAccounts.find(b => b.id === cxpInitialPayBankId);
              const debitAbono = abonoBank?.currency === 'VES' ? (initialPayNum * bcvRate) : initialPayNum;

              try {
                await dbService.updateBankAccountBalance(cxpInitialPayBankId, -debitAbono);
                await dbService.transferBetweenAccounts({
                  id: crypto.randomUUID(),
                  from_account_id: cxpInitialPayBankId,
                  from_account_name: abonoBank?.name || 'Cuenta Bancaria',
                  to_account_name: `Abono Proveedor: ${providerName}`,
                  amount: debitAbono,
                  currency: abonoBank?.currency || 'USD',
                  exchange_rate: bcvRate,
                  reference: cxpInitialPayRef || `Abono Fac #${invoiceNumber}`,
                  notes: `Abono Inicial Factura #${invoiceNumber} - ${providerName}`,
                  created_at: new Date().toISOString()
                });
                window.dispatchEvent(new CustomEvent('bellavista_bank_accounts_updated'));
              } catch (abonoErr) {
                console.warn("Could not process down payment movement:", abonoErr);
              }
            }

            // Register initial payment in accounts_payable_payments
            try {
              const initialPaymentRecord: AccountPayablePayment = {
                id: `pay-init-${result?.purchase?.id || Date.now()}`,
                cxp_id: cxpId,
                account_payable_id: cxpId,
                amount: initialPayNum,
                payment_method: cxpInitialPayBankId ? (bankAccounts.find(b => b.id === cxpInitialPayBankId)?.name || 'Transferencia') : 'Abono Inicial',
                bank_account_id: cxpInitialPayBankId || undefined,
                payment_date: cxpIssueDate ? new Date(cxpIssueDate).toISOString() : new Date().toISOString(),
                reference: cxpInitialPayRef || `Abono Inicial Fac #${invoiceNumber}`,
                notes: `Abono inicial registrado en compra Factura #${invoiceNumber}`
              };
              const existingPayments = await dbService.getAccountsPayablePayments();
              const filteredPayments = existingPayments.filter(p => p.id !== initialPaymentRecord.id);
              const updatedPayments = [initialPaymentRecord, ...filteredPayments];
              localStorage.setItem('copias_bellavista_accounts_payable_payments', JSON.stringify(updatedPayments));
              window.dispatchEvent(new CustomEvent('bellavista_accounts_payable_payments_updated', { detail: updatedPayments }));
            } catch (payRecErr) {
              console.warn("Could not record initial payment object:", payRecErr);
            }
          }

          // Legacy localStorage synchronization for fallback modules
          try {
            const rawStored = localStorage.getItem('copias_bellavista_cuentas_por_pagar');
            let storedCxps = rawStored ? JSON.parse(rawStored) : [];
            storedCxps = storedCxps.filter((c: any) => !c.id?.startsWith(`cxp-pur-${result?.purchase?.id}`));
            storedCxps.unshift({
              id: newCxp.id,
              provider_name: providerName,
              concept: cxpSubject.trim() || `Factura #${invoiceNumber} - Compra`,
              amount: remainingDebt,
              amount_bs: remainingDebt * (bcvRate || 36.5),
              due_date: cxpDueDate,
              observation: `Generado automáticamente desde Compra Factura #${invoiceNumber}`,
              created_at: new Date().toISOString(),
              status: cxpStatus
            });
            localStorage.setItem('copias_bellavista_cuentas_por_pagar', JSON.stringify(storedCxps));
          } catch (syncErr) {
            console.warn("Could not sync CXP to localStorage:", syncErr);
          }
        } catch (cxpErr) {
          console.warn("Could not create CXP record for credit purchase:", cxpErr);
        }
      }

      toastNotify(
        '¡Compra Registrada!',
        `Factura #${invoiceNumber} guardada con éxito. Stock incrementado en ${calculations.totalItemsCount} unidades.`,
        'success'
      );

      resetForm();
      onClose();
      onSuccess();
    } catch (err: any) {
      console.error('Error saving purchase:', err);
      toastNotify('Error al Registrar Compra', err.message || 'Ocurrió un error inesperado.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-[#005da9]/20 w-full max-w-5xl shadow-2xl overflow-hidden text-left flex flex-col my-auto max-h-[95vh]">
        {/* Modal Header (Frenyer Brand Gradient) */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white flex justify-between items-center shrink-0 border-b border-[#005da9]/30 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/20">
              <ShoppingBag className="w-5 h-5 text-[#40E0D0]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-montserrat font-extrabold uppercase tracking-tight flex items-center gap-2">
                <span>Registro de Compra Nueva</span>
                <span className="text-[10px] bg-[#40E0D0]/20 text-[#40E0D0] px-2 py-0.5 rounded-full font-mono border border-[#40E0D0]/30">
                  Paso {wizardStep} de 4
                </span>
              </h3>
              <p className="text-[11px] text-[#40E0D0] font-medium mt-0.5">
                {wizardStep === 1 && '1. Datos del Proveedor y Factura de Compra'}
                {wizardStep === 2 && '2. Catálogo de Productos y Cesta de Compra'}
                {wizardStep === 3 && '3. Método de Pago (Cuentas Bancarias y Cuentas por Pagar)'}
                {wizardStep === 4 && '4. Resumen y Confirmación del Ingreso'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isSubmitting) onClose();
            }}
            disabled={isSubmitting}
            className="p-1.5 hover:bg-white/20 text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Navigation Bar (Frenyer Colors) */}
        <div className="bg-[#F8F9FA] px-3 sm:px-6 py-2.5 border-b border-gray-200 shrink-0 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[500px] gap-2">
            {[
              { step: 1, label: '1. Proveedor y Factura', icon: Truck },
              { step: 2, label: '2. Catálogo y Cesta', icon: Package, badge: cartItems.length > 0 ? cartItems.length : undefined },
              { step: 3, label: '3. Método de Pago', icon: CreditCard },
              { step: 4, label: '4. Resumen', icon: FileText }
            ].map(({ step, label, badge }) => {
              const isActive = wizardStep === step;
              const isDone = wizardStep > step;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    if (step === 2 && !invoiceNumber.trim()) {
                      alert('Por favor indica primero el número de Factura.');
                      return;
                    }
                    if (step > 2 && cartItems.length === 0) {
                      alert('Debes agregar productos a la cesta antes de continuar.');
                      return;
                    }
                    setWizardStep(step as any);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-montserrat font-extrabold transition cursor-pointer shrink-0 border ${
                    isActive
                      ? 'bg-white text-[#1D3557] border-slate-300 shadow-2xs font-extrabold'
                      : isDone
                      ? 'bg-slate-50 text-[#1D3557] border-slate-300 hover:bg-white'
                      : 'bg-white text-gray-400 hover:text-[#1D3557] border-slate-200'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isActive ? 'bg-[#40E0D0] text-[#1D3557]' : isDone ? 'bg-[#1D3557] text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isDone ? '✓' : step}
                  </div>
                  <span>{label}</span>
                  {badge !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-[#40E0D0] text-[#1D3557]' : 'bg-[#1D3557] text-white'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Content / Multi-Step Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* ===================================================================== */}
          {/* PASO 1: DATOS DEL PROVEEDOR Y FACTURA                                 */}
          {/* ===================================================================== */}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <div className="bg-[#F8F9FA] p-5 rounded-2xl border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                  <Truck className="w-5 h-5 text-[#005da9]" />
                  <h4 className="text-sm font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                    1. Información del Proveedor y Comprobante
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Proveedor Comercial Selector con Botón NUEVO PROVEEDOR */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80">
                        Proveedor Comercial *
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenNewProviderModal}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-[11px] shadow-2xs hover:shadow-xs transition cursor-pointer active:scale-98"
                        title="Registrar nuevo proveedor comercial"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#005da9]" />
                        <span>NUEVO PROVEEDOR</span>
                      </button>
                    </div>
                    <select
                      value={selectedProviderId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedProviderId(val);
                        if (val && val !== 'otro') {
                          const p = localProviders.find(item => item.id === val) || providers.find(item => item.id === val);
                          if (p) {
                            setCustomProviderName(p.name);
                            setCustomProviderRif(p.rif);
                            setCxpEntityName(p.name);
                          }
                        } else if (val === 'otro') {
                          setCustomProviderName('');
                          setCustomProviderRif('');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    >
                      <option value="">-- Seleccionar Proveedor Registrado --</option>
                      {localProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `[${p.code}] ` : ''}{p.name} ({p.rif})
                        </option>
                      ))}
                      <option value="otro">➕ Ingresar Proveedor Manual / Ocasional</option>
                    </select>
                  </div>

                  {/* Factura N° / Control */}
                  <div>
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      N° de Factura o Control *
                    </label>
                    <input
                      type="text"
                      required
                      value={invoiceNumber}
                      onChange={(e) => {
                        setInvoiceNumber(e.target.value);
                        if (!cxpSubject || cxpSubject.startsWith('Factura #')) {
                          setCxpSubject(`Factura #${e.target.value} - Compra`);
                        }
                      }}
                      placeholder="Ej: FAC-009842"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    />
                  </div>

                  {/* Razón Social / Nombre Comercial */}
                  <div>
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      Razón Social del Proveedor *
                    </label>
                    <input
                      type="text"
                      required
                      value={customProviderName}
                      onChange={(e) => {
                        setCustomProviderName(e.target.value);
                        setCxpEntityName(e.target.value);
                      }}
                      placeholder="Ej: Distribuidora Bella Vista C.A."
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    />
                  </div>

                  {/* RIF / Cédula */}
                  <div>
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      RIF / Cédula del Proveedor *
                    </label>
                    <input
                      type="text"
                      required
                      value={customProviderRif}
                      onChange={(e) => setCustomProviderRif(e.target.value)}
                      placeholder="Ej: J-30192834-0"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    />
                  </div>

                  {/* Fecha de Emisión */}
                  <div>
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      Fecha de Factura *
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="date"
                        required
                        value={purchaseDate}
                        onChange={(e) => {
                          setPurchaseDate(e.target.value);
                          setCxpIssueDate(e.target.value);
                        }}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                      />
                    </div>
                  </div>

                  {/* Sede / Sucursal de Recepción */}
                  <div>
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      Sede / Almacén de Entrada *
                    </label>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    >
                      {branchesList.length > 0 ? (
                        branchesList.map(b => (
                          <option key={b.code} value={b.name}>
                            {b.name} ({b.code})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Tienda Bella Vista (SP-01)">Tienda Bella Vista (SP-01)</option>
                          <option value="Depósito Central (DP-01)">Depósito Central (DP-01)</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Observaciones de Compra */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#2B2D42]/80 mb-1.5">
                      Notas u Observaciones del Pedido
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Detalles sobre despacho, condiciones de entrega, garantía..."
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                    />
                  </div>
                </div>

                {/* Checkbox Actualizar Costo */}
                <div className="pt-2 border-t border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateProductCost}
                      onChange={(e) => setUpdateProductCost(e.target.checked)}
                      className="w-4 h-4 rounded text-[#005da9] focus:ring-[#005da9] border-gray-300"
                    />
                    <span className="text-xs font-bold text-[#1D3557]">
                      Actualizar automáticamente el costo unitario de los productos en catálogo según los valores de esta compra.
                    </span>
                  </label>
                </div>
              </div>

              {/* Botón de Siguiente Paso */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!invoiceNumber.trim()) {
                      toastNotify('Campo requerido', 'Por favor ingresa el número de Factura o Control.', 'error');
                      return;
                    }
                    if (!customProviderName.trim()) {
                      toastNotify('Campo requerido', 'Por favor selecciona o ingresa la Razón Social del proveedor.', 'error');
                      return;
                    }
                    if (!customProviderRif.trim()) {
                      toastNotify('Campo requerido', 'Por favor selecciona o ingresa el RIF o Cédula del proveedor.', 'error');
                      return;
                    }
                    setWizardStep(2);
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <span>Continuar al Catálogo de Productos</span>
                  <ArrowRight className="w-4 h-4 text-[#40E0D0]" />
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PASO 2: CATÁLOGO DE PRODUCTOS Y CESTA DE COMPRA                       */}
          {/* ===================================================================== */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* COLUMNA IZQUIERDA: CATÁLOGO DE PRODUCTOS (Estilo Ventas Flash / POS) */}
                <div className="lg:col-span-7 bg-[#F8F9FA] p-4 rounded-2xl border border-gray-200 flex flex-col h-[520px]">
                  {/* Barra Superior del Catálogo */}
                  <div className="space-y-3 shrink-0 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#005da9]" />
                        <h4 className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                          Catálogo de Productos
                        </h4>
                      </div>

                      {/* Botón 'Crear Producto' que llama al formulario 'Añadir Nuevo Producto' */}
                      <button
                        type="button"
                        onClick={() => onOpenQuickProductModal(catalogSearch)}
                        className="px-4 py-1.5 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs flex items-center gap-1.5 cursor-pointer font-montserrat font-bold text-xs active:scale-98 shrink-0"
                        title="Crear un nuevo producto en el catálogo"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#005da9]" />
                        <span>Crear Producto</span>
                      </button>
                    </div>

                    {/* Barra de Búsqueda del Catálogo */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="Buscar por nombre, SKU o código de barras..."
                        className="w-full pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                      />
                      {catalogSearch && (
                        <button
                          type="button"
                          onClick={() => setCatalogSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Categorías Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
                      <button
                        type="button"
                        onClick={() => setCatalogCategory('all')}
                        className={`px-2.5 py-1 rounded-lg font-montserrat font-extrabold uppercase transition shrink-0 ${
                          catalogCategory === 'all'
                            ? 'bg-[#1D3557] text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        Todos ({products.length})
                      </button>
                      {categories.slice(0, 8).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCatalogCategory(c.id)}
                          className={`px-2.5 py-1 rounded-lg font-montserrat font-extrabold uppercase transition shrink-0 ${
                            catalogCategory === c.id
                              ? 'bg-[#1D3557] text-white'
                              : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lista / Grid de Productos del Catálogo */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                    {filteredCatalogProducts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border border-dashed border-gray-300">
                        <div className="w-12 h-12 rounded-full bg-blue-50 text-[#005da9] flex items-center justify-center mb-3">
                          <Package className="w-6 h-6" />
                        </div>
                        <h5 className="text-xs font-bold text-gray-800">No se encontró el producto</h5>
                        <p className="text-[11px] text-gray-500 mt-1 max-w-xs">
                          {catalogSearch ? `No hay resultados para "${catalogSearch}".` : 'No hay productos en esta categoría.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenQuickProductModal(catalogSearch)}
                          className="mt-3 px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs font-montserrat font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                        >
                          <Plus className="w-4 h-4 text-[#005da9]" />
                          <span>Crear "{catalogSearch || 'Nuevo Producto'}"</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredCatalogProducts.map((prod) => {
                          const imgUrl = getProductImage(prod.id);
                          const inCart = cartItems.find(it => it.product_id === prod.id);
                          const cost = Number(prod.cost_price ?? (Number(prod.price || 0) > 0 ? Number(prod.price) * 0.7 : 0));

                          return (
                            <div
                              key={prod.id}
                              onClick={() => handleAddProductToCart(prod)}
                              className={`p-2.5 bg-white rounded-xl border transition flex items-center gap-2.5 cursor-pointer group hover:border-[#005da9] hover:shadow-xs relative ${
                                inCart ? 'border-[#005da9] ring-1 ring-[#005da9]/40 bg-blue-50/20' : 'border-gray-200'
                              }`}
                            >
                              <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-150 overflow-hidden shrink-0 flex items-center justify-center relative">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={prod.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_FALLBACK;
                                    }}
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-gray-400" />
                                )}
                                {inCart && (
                                  <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#005da9] text-white text-[9px] font-black flex items-center justify-center">
                                    {inCart.quantity}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-bold text-gray-900 group-hover:text-[#005da9] truncate" title={prod.name}>
                                  {prod.name}
                                </h5>
                                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">
                                  {prod.sku && <span className="font-mono bg-gray-100 px-1 py-0.2 rounded text-[9px]">SKU: {prod.sku}</span>}
                                  <span>Stock: <strong className="text-gray-700">{prod.stock || 0}</strong></span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-[11px] font-mono font-extrabold text-[#1D3557]">
                                    Costo: ${cost.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] font-montserrat font-extrabold text-[#005da9] group-hover:underline flex items-center gap-0.5">
                                    <Plus className="w-3 h-3 stroke-[3]" />
                                    <span>Agregar</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA: CESTA DE PRODUCTOS DE COMPRA */}
                <div className="lg:col-span-5 bg-white p-4 rounded-2xl border border-gray-200 flex flex-col h-[520px] shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-[#1D3557]" />
                      <h4 className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                        Cesta de Compra ({cartItems.length})
                      </h4>
                    </div>
                    {cartItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCart}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Vaciar</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto py-2 space-y-2.5 pr-1">
                    {cartItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400">
                        <ShoppingCart className="w-10 h-10 mb-2 stroke-1 text-gray-300" />
                        <p className="text-xs font-bold text-gray-500">La cesta de compra está vacía</p>
                        <p className="text-[11px] text-gray-400 mt-1 max-w-xs">
                          Haz click en los productos del catálogo a la izquierda para agregarlos e ingresar cantidades y costos.
                        </p>
                      </div>
                    ) : (
                      cartItems.map((item) => {
                        const rowSubtotal = Number(item.quantity || 0) * Number(item.unit_cost || 0);

                        return (
                          <div
                            key={item.id}
                            className="p-3 bg-[#F8F9FA] rounded-xl border border-gray-200 space-y-2 text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <h6 className="text-xs font-bold text-[#1D3557] truncate" title={item.product_name}>
                                  {item.product_name}
                                </h6>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                                  {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                                  <span>Stock actual: <strong className="text-gray-700">{item.current_stock}</strong></span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded-lg transition"
                                title="Quitar de la cesta"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-200/60 items-center">
                              <div>
                                <label className="block text-[9px] font-montserrat font-extrabold uppercase text-gray-400 mb-0.5">
                                  Cant. Comprada
                                </label>
                                <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.id, Number(item.quantity || 1) - 1)}
                                    className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateItemQuantity(item.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    className="w-full text-center text-xs font-mono font-bold text-[#1D3557] focus:outline-none py-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.id, Number(item.quantity || 1) + 1)}
                                    className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[9px] font-montserrat font-extrabold uppercase text-gray-400 mb-0.5">
                                  Costo Unit. ($)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-mono">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_cost}
                                    onChange={(e) => handleUpdateItemCost(item.id, parseFloat(e.target.value) || 0)}
                                    className="w-full pl-5 pr-1.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-[#1D3557] focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="text-right">
                                <label className="block text-[9px] font-montserrat font-extrabold uppercase text-gray-400 mb-0.5">
                                  Subtotal
                                </label>
                                <div className="font-mono font-black text-xs text-[#005da9]">
                                  ${rowSubtotal.toFixed(2)}
                                </div>
                              </div>
                            </div>

                            <div className="bg-[#1D3557]/5 px-2 py-1 rounded-lg flex items-center justify-between text-[10px] border border-[#1D3557]/10">
                              <span className="text-[#2B2D42]/70 font-medium">Stock post-compra:</span>
                              <span className="font-mono font-bold text-[#1D3557]">
                                {item.current_stock} + {item.quantity} = <strong className="text-[#005da9]">{item.current_stock + item.quantity} uds.</strong>
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200 shrink-0 space-y-3">
                    <div className="bg-[#1D3557] text-white p-3 rounded-xl flex items-center justify-between shadow-xs">
                      <div>
                        <span className="text-[9px] font-montserrat font-extrabold uppercase text-gray-300 block">
                          Total Cesta ({calculations.totalItemsCount} uds.)
                        </span>
                        <span className="text-base font-mono font-black text-[#40E0D0]">
                          ${calculations.totalAmountUsd.toFixed(2)} USD
                        </span>
                      </div>
                      {bcvRate > 0 && (
                        <div className="text-right">
                          <span className="text-[9px] font-mono text-gray-300 block">Tasa BCV: {bcvRate.toFixed(2)}</span>
                          <span className="text-xs font-mono font-bold text-white block">
                            Bs. {calculations.totalAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs font-montserrat font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-[#005da9]" />
                        <span>Paso 1</span>
                      </button>

                      <button
                        type="button"
                        disabled={cartItems.length === 0}
                        onClick={() => setWizardStep(3)}
                        className="flex-1 py-2.5 px-6 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                      >
                        <span>Continuar con Método de Pago</span>
                        <ArrowRight className="w-4 h-4 text-[#40E0D0]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PASO 3: MÉTODO DE PAGO (VINCULADO A CUENTAS BANCARIAS Y CXP)         */}
          {/* ===================================================================== */}
          {wizardStep === 3 && (
            <div className="space-y-5">
              <div className="bg-[#F8F9FA] p-5 rounded-2xl border border-gray-200 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#005da9]" />
                    <h4 className="text-sm font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                      3. Método de Pago y Vinculación Bancaria / CXP
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Total a Liquidar</span>
                    <span className="text-sm font-mono font-black text-[#1D3557]">
                      ${calculations.totalAmountUsd.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* Selector de Modalidad de Pago: Contado vs Cuentas por Pagar (CXP) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentType('contado')}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      paymentType === 'contado'
                        ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-md'
                        : 'bg-white text-[#2B2D42] border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${paymentType === 'contado' ? 'bg-white/10 text-[#40E0D0]' : 'bg-gray-100 text-[#1D3557]'}`}>
                      <Banknote className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-montserrat font-extrabold uppercase">Pago de Contado</h5>
                      <p className={`text-[11px] mt-0.5 ${paymentType === 'contado' ? 'text-gray-300' : 'text-gray-500'}`}>
                        Debita de inmediato el saldo de una cuenta bancaria o caja chica del sistema.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentType('cxp');
                      if (!cxpEntityName) {
                        const p = providers.find(item => item.id === selectedProviderId);
                        setCxpEntityName(p?.name || customProviderName || 'Proveedor General');
                      }
                      if (!cxpSubject) {
                        setCxpSubject(`Factura #${invoiceNumber || 'S/N'} - Compra de Mercancía`);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      paymentType === 'cxp'
                        ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-md'
                        : 'bg-white text-[#2B2D42] border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${paymentType === 'cxp' ? 'bg-white/10 text-[#40E0D0]' : 'bg-amber-100 text-amber-800'}`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-montserrat font-extrabold uppercase flex items-center gap-1.5">
                        <span>Crédito / Cuentas por Pagar (CXP)</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${paymentType === 'cxp' ? 'bg-amber-400 text-black font-black' : 'bg-amber-100 text-amber-800'}`}>
                          Vincular
                        </span>
                      </h5>
                      <p className={`text-[11px] mt-0.5 ${paymentType === 'cxp' ? 'text-gray-300' : 'text-gray-500'}`}>
                        Genera una Cuenta por Pagar (CXP) con calendario de cuotas y seguimiento de saldo pendiente.
                      </p>
                    </div>
                  </button>
                </div>

                {/* DETALLE OPCIÓN A: PAGO DE CONTADO */}
                {paymentType === 'contado' && (
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-4">
                    <h5 className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-[#005da9]" />
                      <span>Selección de Cuenta Bancaria / Origen del Pago</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Cuenta Bancaria / Caja Registrada *
                        </label>
                        <select
                          value={selectedBankId}
                          onChange={(e) => setSelectedBankId(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        >
                          {bankAccounts.length === 0 ? (
                            <option value="">No hay cuentas bancarias registradas en el sistema</option>
                          ) : (
                            bankAccounts.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.account_number ? `...${b.account_number.slice(-4)}` : b.bank_name}) - Saldo: {b.currency === 'VES' ? `Bs. ${(b.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : `$${(b.balance || 0).toFixed(2)} USD`}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Instrumento de Pago *
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPaymentMethod(val);
                            if (val === 'Cuenta por Pagar' || val === 'Crédito / CXP' || val === 'Crédito') {
                              setPaymentType('cxp');
                              if (!cxpEntityName) {
                                const p = providers.find(item => item.id === selectedProviderId);
                                setCxpEntityName(p?.name || customProviderName || 'Proveedor General');
                              }
                              if (!cxpSubject) {
                                setCxpSubject(`Factura #${invoiceNumber || 'S/N'} - Compra de Mercancía`);
                              }
                            }
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        >
                          <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                          <option value="Pago Móvil">Pago Móvil</option>
                          <option value="Efectivo USD">Efectivo USD</option>
                          <option value="Efectivo Bs">Efectivo Bs</option>
                          <option value="Punto de Venta / Tarjeta">Punto de Venta / Tarjeta</option>
                          <option value="Zelle">Zelle</option>
                          <option value="Cuenta por Pagar">Cuenta por Pagar (CXP a Crédito)</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          N° de Referencia / Comprobante
                        </label>
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Ej: REF-884210"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Fecha del Movimiento
                        </label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Detalle de la Operación
                        </label>
                        <input
                          type="text"
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          placeholder="Ej: Pago directo a proveedor"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#005da9]"
                        />
                      </div>
                    </div>

                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#005da9]" />
                        <span className="text-[#1D3557] font-medium">
                          Se registrará automáticamente el egreso por <strong>${calculations.totalAmountUsd.toFixed(2)} USD</strong> en el módulo de Cuentas Bancarias y Caja.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETALLE OPCIÓN B: CRÉDITO / CUENTAS POR PAGAR (CXP) */}
                {paymentType === 'cxp' && (
                  <div className="bg-white p-4 rounded-2xl border border-amber-200/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Vincular a Cuentas por Pagar (CXP)</span>
                      </h5>
                      <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        Módulo de Cuentas Pendientes
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Proveedor Acreedor *
                        </label>
                        <input
                          type="text"
                          value={cxpEntityName}
                          onChange={(e) => setCxpEntityName(e.target.value)}
                          placeholder="Nombre del proveedor"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Concepto de la Cuenta por Pagar *
                        </label>
                        <input
                          type="text"
                          value={cxpSubject}
                          onChange={(e) => setCxpSubject(e.target.value)}
                          placeholder="Ej: Factura #FAC-001 - Compra de mercancía"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Fecha de Emisión
                        </label>
                        <input
                          type="date"
                          value={cxpIssueDate}
                          onChange={(e) => setCxpIssueDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Fecha de Vencimiento General
                        </label>
                        <input
                          type="date"
                          value={cxpDueDate}
                          onChange={(e) => setCxpDueDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-montserrat font-extrabold uppercase text-[#2B2D42]/70 mb-1">
                          Número de Cuotas
                        </label>
                        <select
                          value={installmentsCount}
                          onChange={(e) => setInstallmentsCount(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none"
                        >
                          <option value="1">1 Cuota única</option>
                          <option value="2">2 Cuotas (Quincenal)</option>
                          <option value="3">3 Cuotas</option>
                          <option value="4">4 Cuotas (Mensual)</option>
                          <option value="6">6 Cuotas</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-montserrat font-extrabold uppercase text-amber-900">
                          Abono Inicial / Pago Adelantado (Opcional)
                        </span>
                        <span className="text-[10px] text-amber-800 font-medium">
                          Se debitará de la cuenta bancaria seleccionada
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-montserrat font-extrabold uppercase text-amber-800 mb-1">
                            Monto Abono ($ USD)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={calculations.totalAmountUsd}
                            step="0.01"
                            value={cxpInitialPayment}
                            onChange={(e) => setCxpInitialPayment(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono font-black text-[#1D3557] focus:outline-none"
                          />
                        </div>

                        {parseFloat(String(cxpInitialPayment)) > 0 && (
                          <>
                            <div>
                              <label className="block text-[9px] font-montserrat font-extrabold uppercase text-amber-800 mb-1">
                                Cuenta Origen del Abono *
                              </label>
                              <select
                                value={cxpInitialPayBankId}
                                onChange={(e) => setCxpInitialPayBankId(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-[#2B2D42] focus:outline-none"
                              >
                                <option value="">-- Seleccionar Cuenta --</option>
                                {bankAccounts.map(b => (
                                  <option key={b.id} value={b.id}>
                                    {b.name} ({b.currency})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-montserrat font-extrabold uppercase text-amber-800 mb-1">
                                Referencia del Abono
                              </label>
                              <input
                                type="text"
                                value={cxpInitialPayRef}
                                onChange={(e) => setCxpInitialPayRef(e.target.value)}
                                placeholder="N° Comprobante"
                                className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono font-bold text-[#2B2D42] focus:outline-none"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-xs pt-1 border-t border-amber-200/60 font-mono">
                        <span className="text-gray-600">Saldo Restante por Pagar:</span>
                        <span className="font-black text-amber-900 text-sm">
                          ${Math.max(0, calculations.totalAmountUsd - (parseFloat(String(cxpInitialPayment)) || 0)).toFixed(2)} USD
                        </span>
                      </div>
                    </div>

                    {/* Calendario de Cuotas Interactivo con Edición Manual */}
                    {installments.length > 0 && (
                      <div className="space-y-2 pt-2 bg-blue-50/40 p-3.5 rounded-2xl border border-blue-100">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] block flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[#005da9]" />
                              Calendario de Cuotas ({installments.length})
                            </span>
                            <span className="text-[10px] text-gray-500 block">
                              Puedes modificar el monto de cualquier cuota; el saldo restante se distribuirá automáticamente.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleResetInstallmentsEvenly}
                            className="px-3 py-1 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full font-montserrat font-bold text-[10px] shadow-2xs hover:shadow-xs flex items-center gap-1 cursor-pointer transition active:scale-98"
                          >
                            <span>Partes Iguales</span>
                          </button>
                        </div>

                        {/* Lista de Cuotas Editables */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                          {installments.map((inst, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-blue-100 shadow-xs space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-montserrat font-extrabold text-[#1D3557] text-xs">
                                  Cuota #{inst.number}
                                </span>
                                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                  {inst.status || 'PENDIENTE'}
                                </span>
                              </div>

                              <div>
                                <label className="block text-[9px] font-montserrat font-extrabold uppercase text-gray-400 mb-0.5">
                                  Monto Cuota ($ USD)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={inst.amount}
                                    onChange={(e) => handleUpdateInstallmentAmount(idx, e.target.value)}
                                    className="w-full pl-6 pr-2.5 py-1 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#005da9] rounded-lg text-xs font-mono font-black text-[#1D3557] focus:outline-none transition"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[9px] font-montserrat font-extrabold uppercase text-gray-400 mb-0.5">
                                  Fecha de Vencimiento
                                </label>
                                <input
                                  type="date"
                                  value={inst.due_date}
                                  onChange={(e) => handleUpdateInstallmentDueDate(idx, e.target.value)}
                                  className="w-full px-2 py-1 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#005da9] rounded-lg text-[11px] font-mono font-medium text-[#2B2D42] focus:outline-none transition"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Balance de Validación */}
                        <div className={`p-2 rounded-xl flex items-center justify-between text-xs font-mono border ${
                          isInstallmentsBalanced 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[11px]">Suma de Cuotas:</span>
                            <span className="font-black">${installmentsTotalSum.toFixed(2)} USD</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-600">Saldo a Financiar:</span>
                            <span className="font-black">${cxpRemainingToFinance.toFixed(2)} USD</span>
                            {isInstallmentsBalanced ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black uppercase">
                                Cuadrado ✓
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black uppercase">
                                Dif: ${(installmentsTotalSum - cxpRemainingToFinance).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones de Navegación */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full transition shadow-2xs hover:shadow-xs font-montserrat font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <ArrowLeft className="w-4 h-4 text-[#005da9]" />
                  <span>Volver al Catálogo y Cesta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWizardStep(4)}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <span>Continuar al Resumen Final</span>
                  <ArrowRight className="w-4 h-4 text-[#40E0D0]" />
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PASO 4: RESUMEN Y CONFIRMACIÓN                                        */}
          {/* ===================================================================== */}
          {wizardStep === 4 && (
            <div className="space-y-5">
              <div className="bg-[#F8F9FA] p-5 rounded-2xl border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                  <FileText className="w-5 h-5 text-[#005da9]" />
                  <h4 className="text-sm font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                    4. Resumen y Confirmación de la Compra
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Datos de Proveedor y Factura */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-montserrat font-extrabold uppercase text-gray-400">
                      <Truck className="w-3.5 h-3.5 text-[#005da9]" />
                      <span>Proveedor y Comprobante</span>
                    </div>
                    <div className="font-bold text-[#1D3557] text-sm">
                      {customProviderName || (selectedProviderId && selectedProviderId !== 'otro'
                        ? (localProviders.find(p => p.id === selectedProviderId)?.name || providers.find(p => p.id === selectedProviderId)?.name)
                        : 'Proveedor General')}
                    </div>
                    <div className="text-gray-500 font-mono text-[11px]">
                      RIF: {customProviderRif || (selectedProviderId && selectedProviderId !== 'otro'
                        ? (localProviders.find(p => p.id === selectedProviderId)?.rif || providers.find(p => p.id === selectedProviderId)?.rif)
                        : 'N/A')}
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex justify-between">
                      <span className="text-gray-500">Factura N°:</span>
                      <span className="font-mono font-bold text-[#1D3557]">{invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Fecha de Factura:</span>
                      <span className="font-bold text-[#2B2D42]">{purchaseDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Almacén de Entrada:</span>
                      <span className="font-bold text-[#2B2D42]">{selectedBranch}</span>
                    </div>
                  </div>

                  {/* Datos del Método de Pago */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-montserrat font-extrabold uppercase text-gray-400">
                      <CreditCard className="w-3.5 h-3.5 text-[#005da9]" />
                      <span>Condiciones de Pago</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1D3557] text-sm">
                        {paymentType === 'cxp' ? 'Crédito / Cuenta por Pagar' : 'Pago de Contado'}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                        paymentType === 'cxp' ? 'bg-amber-100 text-amber-800' : 'bg-[#40E0D0]/20 text-[#1D3557]'
                      }`}>
                        {paymentType === 'cxp' ? `${installmentsCount} Cuotas` : paymentMethod}
                      </span>
                    </div>

                    {paymentType === 'contado' ? (
                      <>
                        <div className="pt-2 border-t border-gray-100 flex justify-between">
                          <span className="text-gray-500">Cuenta de Débito:</span>
                          <span className="font-bold text-[#2B2D42]">
                            {bankAccounts.find(b => b.id === selectedBankId)?.name || 'Caja / Banco'}
                          </span>
                        </div>
                        {paymentReference && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Referencia:</span>
                            <span className="font-mono font-bold text-[#2B2D42]">{paymentReference}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Movimiento:</span>
                          <span className="font-bold text-green-700">Liquidado de inmediato</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="pt-2 border-t border-gray-100 flex justify-between">
                          <span className="text-gray-500">Abono Inicial:</span>
                          <span className="font-mono font-bold text-[#2B2D42]">
                            ${parseFloat(String(cxpInitialPayment)) || 0} USD
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Saldo por Pagar:</span>
                          <span className="font-mono font-black text-amber-700">
                            ${Math.max(0, calculations.totalAmountUsd - (parseFloat(String(cxpInitialPayment)) || 0)).toFixed(2)} USD
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Vencimiento Final:</span>
                          <span className="font-bold text-[#2B2D42]">{cxpDueDate}</span>
                        </div>
                        {installments.length > 0 && (
                          <div className="pt-2 border-t border-gray-100">
                            <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                              Cuotas Acordadas ({installments.length}):
                            </span>
                            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                              {installments.map((inst, i) => (
                                <div key={i} className="bg-amber-50/70 p-1.5 rounded border border-amber-200/50 flex justify-between items-center">
                                  <span className="text-[#1D3557] font-bold">Cuota #{inst.number}:</span>
                                  <span className="font-black text-amber-900">${Number(inst.amount).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Tabla de Productos de la Cesta */}
                <div>
                  <h5 className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide mb-2 flex items-center justify-between">
                    <span>Detalle de Productos a Incorporar ({cartItems.length})</span>
                    <span className="text-[10px] text-gray-500 font-normal">
                      {calculations.totalItemsCount} unidades totales
                    </span>
                  </h5>
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#1D3557] text-white font-montserrat font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Producto</th>
                          <th className="p-2.5 text-center">Cant. Comprada</th>
                          <th className="p-2.5 text-right">Costo Unit.</th>
                          <th className="p-2.5 text-right">Subtotal</th>
                          <th className="p-2.5 text-center">Incremento Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {cartItems.map((it, idx) => (
                          <tr key={idx} className="hover:bg-[#F8F9FA]">
                            <td className="p-2.5">
                              <div className="font-bold text-[#1D3557]">{it.product_name}</div>
                              {it.sku && <div className="text-[10px] text-gray-400 font-mono">SKU: {it.sku}</div>}
                            </td>
                            <td className="p-2.5 text-center font-mono font-black text-[#005da9]">
                              +{it.quantity}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-[#2B2D42]">
                              ${Number(it.unit_cost || 0).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-black text-[#1D3557]">
                              ${(it.quantity * it.unit_cost).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="font-mono text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded font-bold">
                                {it.current_stock} ➔ {it.current_stock + it.quantity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Total Gran Tarjeta (Frenyer Navy Gradient) */}
                <div className="bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] text-white p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg border border-[#005da9]/40">
                  <div>
                    <span className="text-[10px] font-montserrat font-extrabold uppercase text-[#40E0D0] tracking-wider block">
                      TOTAL FACTURA DE COMPRA
                    </span>
                    <span className="text-2xl font-mono font-black text-white">
                      ${calculations.totalAmountUsd.toFixed(2)} USD
                    </span>
                  </div>
                  {bcvRate > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-gray-200 block">
                        Tasa Oficial BCV: Bs. {bcvRate.toFixed(2)} / USD
                      </span>
                      <span className="text-base font-mono font-bold text-[#40E0D0] block">
                        Bs. {calculations.totalAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones del Resumen */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full transition shadow-2xs hover:shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <ArrowLeft className="w-4 h-4 text-[#005da9]" />
                  <span>Modificar Datos</span>
                </button>

                <button
                  type="button"
                  onClick={handleSavePurchase}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#40E0D0] border-t-transparent rounded-full animate-spin" />
                      <span>Guardando e Incrementando Stock...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-[#40E0D0] stroke-[2.5]" />
                      <span>Confirmar y Guardar Compra</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL FLOTANTE: NUEVO PROVEEDOR (VER IMAGEN 1)                       */}
      {/* ===================================================================== */}
      {showNewProviderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 transform transition-all">
            {/* Header del Modal */}
            <div className="bg-[#1D3557] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5 text-[#2DD4BF]" />
                <h3 className="text-sm font-montserrat font-black tracking-wider uppercase text-white">
                  NUEVO PROVEEDOR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewProviderModal(false)}
                className="text-white/70 hover:text-white transition p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario del Modal */}
            <form onSubmit={handleSaveNewProvider} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Código */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    CÓDIGO *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProvCode}
                    onChange={(e) => setNewProvCode(e.target.value)}
                    placeholder="PROV-001"
                    className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-mono font-bold text-[#1D3557] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  />
                </div>

                {/* Razón Social */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    RAZÓN SOCIAL *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProvName}
                    onChange={(e) => setNewProvName(e.target.value)}
                    placeholder="Ej: Distribuidora Bella Vista C.A."
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  />
                </div>

                {/* Tipo de Firma */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    TIPO DE FIRMA *
                  </label>
                  <select
                    value={newProvType}
                    onChange={(e) => setNewProvType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  >
                    <option value="Jurídico (J / G)">Jurídico (J / G)</option>
                    <option value="Natural (V / E)">Natural (V / E)</option>
                    <option value="Gubernamental (G)">Gubernamental (G)</option>
                    <option value="Extranjero (E)">Extranjero (E)</option>
                  </select>
                </div>

                {/* RIF / Cédula */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    RIF / CÉDULA *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProvRif}
                    onChange={(e) => setNewProvRif(e.target.value)}
                    placeholder="Ej: J-12345678-9"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    TELÉFONO
                  </label>
                  <input
                    type="text"
                    value={newProvPhone}
                    onChange={(e) => setNewProvPhone(e.target.value)}
                    placeholder="Ej: 0261-7000123"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  />
                </div>

                {/* Banco Receptor */}
                <div>
                  <label className="block text-[11px] font-montserrat font-extrabold uppercase text-[#1D3557] tracking-wider mb-1.5">
                    BANCO RECEPTOR
                  </label>
                  <input
                    type="text"
                    value={newProvBankName}
                    onChange={(e) => setNewProvBankName(e.target.value)}
                    placeholder="Ej: Banesco, Banco de Venezuela..."
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]"
                  />
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewProviderModal(false)}
                  className="flex-1 py-2 px-4 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 text-xs font-montserrat font-bold rounded-full uppercase tracking-wider transition active:scale-98 text-center cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>CANCELAR</span>
                </button>

                <button
                  type="submit"
                  disabled={isSavingProvider}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#1D3557] via-[#005da9] to-[#1D3557] hover:from-[#152741] hover:via-[#004b87] hover:to-[#152741] text-white font-montserrat font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md hover:shadow-lg transition active:scale-95 disabled:opacity-50 text-center flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSavingProvider ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#40E0D0] border-t-transparent rounded-full animate-spin" />
                      <span>GUARDANDO...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-[#40E0D0]" />
                      <span>GUARDAR PROVEEDOR</span>
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
