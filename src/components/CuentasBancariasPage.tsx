import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Landmark, 
  Plus, 
  Minus, 
  ArrowLeftRight, 
  Coins, 
  Trash2, 
  Edit2, 
  PlusCircle, 
  DollarSign, 
  Calendar, 
  RotateCw, 
  Download, 
  Check, 
  HelpCircle, 
  Info, 
  X,
  FileText,
  Lock,
  Unlock,
  CreditCard,
  Smartphone,
  Banknote,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Database,
  Copy,
  RefreshCw
} from 'lucide-react';
import { dbService, supabase } from '../lib/supabase';
import { getCachedCurrencyRates } from '../lib/currency';
import { BankAccount, BankTransfer, PaymentMethodConfig, SystemCurrency } from '../types';

interface AssociatedMethod {
  id?: string;
  code?: string;
  name: string;
  currency?: string;
  type?: string;
  incomingCommission: number;
  outgoingCommission: number;
}

interface CuentasBancariasPageProps {
  bcvRate: number;
  currentUser?: any;
  onRefreshData?: () => void;
}

export default function CuentasBancariasPage({ 
  bcvRate = getCachedCurrencyRates().VES, 
  currentUser,
  onRefreshData 
}: CuentasBancariasPageProps) {
  // --- States ---
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // System payment methods & System currencies
  const [systemPaymentMethods, setSystemPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [systemCurrencies, setSystemCurrencies] = useState<SystemCurrency[]>([]);

  // Filter dates for details view: 'all' shows all movements, 'this_month' filters current month, 'custom' filters custom range
  const [dateFilterPreset, setDateFilterPreset] = useState<'all' | 'this_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Default to 1st of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Currency Filter for Bank Accounts
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');

  // Editing and deleting states for payment methods manager
  const [editingPmId, setEditingPmId] = useState<string | null>(null);
  const [pmToDelete, setPmToDelete] = useState<PaymentMethodConfig | null>(null);

  // --- Modals States ---
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [showSupabaseSqlModal, setShowSupabaseSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  // --- Custom Non-Blocking Toast & Confirm States (prevents iframe sandboxing issues) ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // --- Form fields for NEW ACCOUNT / EDIT ACCOUNT ---
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountCurrency, setAccountCurrency] = useState<string>('VES');
  const [initialBalance, setInitialBalance] = useState('');
  const [accountPaymentMethods, setAccountPaymentMethods] = useState<AssociatedMethod[]>([]);
  
  // Selection of existing system payment method inside the Account modal
  const [selectedSystemMethodId, setSelectedSystemMethodId] = useState('');
  const [selectedIncomingCommission, setSelectedIncomingCommission] = useState('0');
  const [selectedOutgoingCommission, setSelectedOutgoingCommission] = useState('0');

  // Inline Create New Method inside Account Modal
  const [showCreateNewMethodForm, setShowCreateNewMethodForm] = useState(false);
  const [newCustomMethodName, setNewCustomMethodName] = useState('');
  const [newCustomMethodCurrency, setNewCustomMethodCurrency] = useState<string>('VES');
  const [newCustomMethodType, setNewCustomMethodType] = useState<'movil' | 'transferencia' | 'efectivo' | 'punto' | 'digital' | 'otro'>('movil');
  const [newCustomMethodIncoming, setNewCustomMethodIncoming] = useState('0');
  const [newCustomMethodOutgoing, setNewCustomMethodOutgoing] = useState('0');

  // --- Form fields for TRANSFER ---
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferCommission, setTransferCommission] = useState('0');
  const [transferCommissionType, setTransferCommissionType] = useState<'fixed' | 'percent'>('fixed');
  const [transferReference, setTransferReference] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [customExchangeRate, setCustomExchangeRate] = useState(String(bcvRate));

  // --- Form fields for DEPOSIT / WITHDRAWAL ---
  const [transactionAccountId, setTransactionAccountId] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [transactionNotes, setTransactionNotes] = useState('');

  // --- Form fields for System Payment Method Manager Modal ---
  const [mgrNewName, setMgrNewName] = useState('');
  const [mgrNewCurrency, setMgrNewCurrency] = useState<string>('VES');
  const [mgrNewType, setMgrNewType] = useState<'movil' | 'transferencia' | 'efectivo' | 'punto' | 'digital' | 'otro'>('movil');
  const [mgrTargetAccountId, setMgrTargetAccountId] = useState('');

  // Helper to parse associated methods from account notes
  const parseAccountPaymentMethods = (account: BankAccount): AssociatedMethod[] => {
    if (!account.notes) return [];
    try {
      const parsed = JSON.parse(account.notes);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return [];
  };

  // Load All Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [accs, trans, pms, currs] = await Promise.all([
        dbService.getBankAccounts(),
        dbService.getBankTransfers(),
        dbService.getPaymentMethods(),
        dbService.getCurrencies()
      ]);

      if (currs && Array.isArray(currs)) {
        setSystemCurrencies(currs);
      }

      let currentAccs = accs;

      // Seed initial accounts if empty to match screenshots
      if (accs.length === 0) {
        const seedAccounts: BankAccount[] = [
          {
            id: 'a1000000-0000-0000-0000-000000000001',
            name: 'Cuenta Dólares',
            bank_name: 'Cuenta Dólares',
            currency: 'USD',
            balance: 2857.60,
            is_active: true,
            notes: JSON.stringify([
              { id: 'pm-efectivo-usd', name: 'Efectivo Dólares (USD)', incomingCommission: 0, outgoingCommission: 0, currency: 'USD', type: 'efectivo' },
              { id: 'pm-zelle', name: 'Zelle (USD)', incomingCommission: 0, outgoingCommission: 0, currency: 'USD', type: 'digital' }
            ]),
            created_at: new Date().toISOString()
          },
          {
            id: 'a1000000-0000-0000-0000-000000000002',
            name: 'Cuenta Bolívares',
            bank_name: 'Cuenta Bolívares',
            currency: 'VES',
            balance: 78331.44,
            is_active: true,
            notes: JSON.stringify([
              { id: 'pm-efectivo-ves', name: 'Efectivo Bolívares (Bs.)', incomingCommission: 0, outgoingCommission: 0, currency: 'VES', type: 'efectivo' },
              { id: 'pm-transferencia-ves', name: 'Transferencia Bancaria Nacional (Bs.)', incomingCommission: 0, outgoingCommission: 0, currency: 'VES', type: 'transferencia' },
              { id: 'pm-pagomovil', name: 'Pago Móvil Interbancario (VES)', incomingCommission: 0, outgoingCommission: 0, currency: 'VES', type: 'movil' },
              { id: 'pm-punto-venta', name: 'Punto de Venta / Tarjeta Débito (POS)', incomingCommission: 0, outgoingCommission: 0, currency: 'VES', type: 'punto' }
            ]),
            created_at: new Date().toISOString()
          },
          {
            id: 'a1000000-0000-0000-0000-000000000004',
            name: 'Binance Pay USDT',
            bank_name: 'Binance (Cripto)',
            currency: 'USDT',
            balance: 1450.00,
            is_active: true,
            notes: JSON.stringify([
              { id: 'pm-binance', name: 'Binance Pay (USDT)', incomingCommission: 0, outgoingCommission: 0, currency: 'USDT', type: 'digital' }
            ]),
            created_at: new Date().toISOString()
          }
        ];
        
        for (const sa of seedAccounts) {
          await dbService.saveBankAccount(sa);
        }
        
        currentAccs = await dbService.getBankAccounts();
      }

      // Ensure a USDT account exists if missing
      const hasUsdtAccount = currentAccs.some(a => (a.currency || '').toUpperCase() === 'USDT');
      if (!hasUsdtAccount) {
        const usdtAccount: BankAccount = {
          id: 'a1000000-0000-0000-0000-000000000004',
          name: 'Binance Pay USDT',
          bank_name: 'Binance (Cripto)',
          currency: 'USDT',
          balance: 0.00,
          is_active: true,
          notes: JSON.stringify([
            { id: 'pm-binance', name: 'Binance Pay (USDT)', incomingCommission: 0, outgoingCommission: 0, currency: 'USDT', type: 'digital' }
          ]),
          created_at: new Date().toISOString()
        };
        await dbService.saveBankAccount(usdtAccount);
        currentAccs = await dbService.getBankAccounts();
      }

      setAccounts(currentAccs);
      setTransfers(trans);

      // Reconcile and fix system payment methods with their bank accounts
      let updatedPms = [...pms];
      let pmsChanged = false;

      currentAccs.forEach(acc => {
        const associated = parseAccountPaymentMethods(acc);
        associated.forEach(m => {
          const matchIndex = updatedPms.findIndex(p => p.id === m.id || p.name.toLowerCase() === m.name.toLowerCase());
          if (matchIndex > -1) {
            if (updatedPms[matchIndex].bank_account_id !== acc.id || updatedPms[matchIndex].bank_account_name !== acc.name) {
              updatedPms[matchIndex] = {
                ...updatedPms[matchIndex],
                bank_account_id: acc.id,
                bank_account_name: acc.name,
                incoming_commission: m.incomingCommission,
                outgoing_commission: m.outgoingCommission
              };
              pmsChanged = true;
            }
          }
        });
      });

      if (pmsChanged) {
        localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedPms));
      }
      setSystemPaymentMethods(updatedPms);

    } catch (err) {
      console.error('Error loading bank accounts data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleBankUpdate = () => {
      loadData();
    };

    window.addEventListener('bellavista_bank_accounts_updated', handleBankUpdate);
    window.addEventListener('bellavista_bank_transfers_updated', handleBankUpdate);
    window.addEventListener('bellavista_payment_methods_updated', handleBankUpdate);
    window.addEventListener('bellavista_currencies_updated', handleBankUpdate);

    // Supabase Realtime subscription
    let channels: any[] = [];
    if (supabase) {
      const channelSuffix = Math.random().toString(36).substring(2, 7);
      const accCh = supabase
        .channel(`bancos_page_acc_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => {
          loadData();
        })
        .subscribe();

      const transfCh = supabase
        .channel(`bancos_page_transf_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transfers' }, () => {
          loadData();
        })
        .subscribe();

      const currCh = supabase
        .channel(`bancos_page_curr_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'system_currencies' }, () => {
          loadData();
        })
        .subscribe();

      const pmCh = supabase
        .channel(`bancos_page_pm_${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => {
          loadData();
        })
        .subscribe();

      channels = [accCh, transfCh, currCh, pmCh];
    }

    return () => {
      window.removeEventListener('bellavista_bank_accounts_updated', handleBankUpdate);
      window.removeEventListener('bellavista_bank_transfers_updated', handleBankUpdate);
      window.removeEventListener('bellavista_payment_methods_updated', handleBankUpdate);
      window.removeEventListener('bellavista_currencies_updated', handleBankUpdate);

      if (supabase && channels.length > 0) {
        channels.forEach(ch => {
          try {
            supabase.removeChannel(ch);
          } catch (e) {}
        });
      }
    };
  }, []);

  // Sync selected account state with accounts array
  useEffect(() => {
    if (selectedAccount) {
      const updated = accounts.find(a => a.id === selectedAccount.id || a.name.toLowerCase().trim() === selectedAccount.name.toLowerCase().trim());
      if (updated) {
        setSelectedAccount(updated);
      }
    }
  }, [accounts]);

  // Memoized filtered accounts
  const filteredAccounts = useMemo(() => {
    if (currencyFilter === 'all') return accounts;
    return accounts.filter(acc => (acc.currency || '').toUpperCase() === currencyFilter.toUpperCase());
  }, [accounts, currencyFilter]);

  // Unique currencies available in accounts and system
  const availableFilterCurrencies = useMemo(() => {
    const list: string[] = [];
    const addIfNew = (code: string) => {
      const upper = (code || '').toUpperCase().trim();
      if (upper && !list.includes(upper)) list.push(upper);
    };
    // Prioritize standard currencies
    addIfNew('VES');
    addIfNew('USD');
    addIfNew('USDT');
    // Add currencies from systemCurrencies
    systemCurrencies.forEach(c => addIfNew(c.code));
    // Add any currency present on existing accounts
    accounts.forEach(a => { if (a.currency) addIfNew(a.currency); });
    return list;
  }, [accounts, systemCurrencies]);

  // Total balance calculation across all accounts in USD
  const getTotalBalanceUSD = () => {
    return accounts.reduce((total, acc) => {
      const balance = Number(acc?.balance || 0);
      const curr = (acc?.currency || '').toUpperCase();
      if (curr === 'USD' || curr === 'USDT') {
        return total + balance;
      } else {
        return total + (balance / (bcvRate || 1));
      }
    }, 0);
  };

  // Notification helper
  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(current => current?.msg === msg ? null : current);
    }, 4500);
  };

  // Helper to get which account has a payment method fixed/locked
  const getMethodBoundAccount = (pm: PaymentMethodConfig, currentEditingId?: string | null) => {
    // 1. Check direct bank_account_id attribute
    if (pm.bank_account_id) {
      const acc = accounts.find(a => a.id === pm.bank_account_id);
      return {
        isBound: true,
        isCurrentAccount: currentEditingId ? pm.bank_account_id === currentEditingId : false,
        accountName: acc?.name || pm.bank_account_name || 'Cuenta del sistema',
        accountId: pm.bank_account_id
      };
    }

    // 2. Check across accounts notes
    for (const acc of accounts) {
      const pms = parseAccountPaymentMethods(acc);
      const isPresent = pms.some(m => m.id === pm.id || m.name.toLowerCase() === pm.name.toLowerCase());
      if (isPresent) {
        return {
          isBound: true,
          isCurrentAccount: currentEditingId ? acc.id === currentEditingId : false,
          accountName: acc.name,
          accountId: acc.id
        };
      }
    }

    return {
      isBound: false,
      isCurrentAccount: false,
      accountName: null,
      accountId: null
    };
  };

  // List of payment methods that are either:
  // 1. Unbound/free in the system (not associated to any other bank account)
  // 2. OR already associated to this account being edited
  // AND not already added into the current modal's accountPaymentMethods draft list.
  const availableUnassociatedMethods = useMemo(() => {
    return systemPaymentMethods.filter(pm => {
      // Check if already added in draft list for this modal
      const isAlreadyInDraft = accountPaymentMethods.some(
        m => (m.id && m.id === pm.id) || (m.code && m.code === pm.code) || m.name.trim().toLowerCase() === pm.name.trim().toLowerCase()
      );
      if (isAlreadyInDraft) return false;

      // Check if bound to a different bank account
      const boundInfo = getMethodBoundAccount(pm, editingAccountId);
      if (boundInfo.isBound && !boundInfo.isCurrentAccount) {
        return false; // Fixed to another account
      }

      return true;
    });
  }, [systemPaymentMethods, accountPaymentMethods, editingAccountId, accounts]);

  // --------------------------------------------------------------------------
  // ACCOUNT CRUD OPERATIONS
  // --------------------------------------------------------------------------

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setAccountName('');
    setBankName('');
    setAccountCurrency('VES');
    setInitialBalance('');
    setAccountPaymentMethods([]);
    setSelectedSystemMethodId('');
    setSelectedIncomingCommission('0');
    setSelectedOutgoingCommission('0');
    setShowCreateNewMethodForm(false);
    setNewCustomMethodName('');
    setNewCustomMethodIncoming('0');
    setNewCustomMethodOutgoing('0');
    setShowNewAccountModal(false);
  };

  const handleOpenNewAccount = () => {
    resetAccountForm();
    setShowNewAccountModal(true);
  };

  const handleOpenEditAccount = (acc: BankAccount) => {
    setEditingAccountId(acc.id);
    setAccountName(acc.name);
    setBankName(acc.bank_name);
    setAccountCurrency(acc.currency || 'VES');
    setInitialBalance(String(acc.balance));
    setAccountPaymentMethods(parseAccountPaymentMethods(acc));
    setSelectedSystemMethodId('');
    setSelectedIncomingCommission('0');
    setSelectedOutgoingCommission('0');
    setShowCreateNewMethodForm(false);
    setShowNewAccountModal(true);
  };

  // Add existing system payment method to the account form
  const handleAssociateSystemMethod = () => {
    if (!selectedSystemMethodId) {
      showNotification('Seleccione un método de pago del sistema para asociar.', 'error');
      return;
    }

    const sysMethod = systemPaymentMethods.find(m => m.id === selectedSystemMethodId);
    if (!sysMethod) return;

    // Verify if already fixed to another account
    const boundInfo = getMethodBoundAccount(sysMethod, editingAccountId);
    if (boundInfo.isBound && !boundInfo.isCurrentAccount) {
      showNotification(`El método "${sysMethod.name}" ya está fijado a la cuenta "${boundInfo.accountName}".`, 'error');
      return;
    }

    // Verify if already added in current form list
    const alreadyAdded = accountPaymentMethods.some(
      m => (m.id && m.id === sysMethod.id) || (m.code && m.code === sysMethod.code) || m.name.toLowerCase() === sysMethod.name.toLowerCase()
    );
    if (alreadyAdded) {
      showNotification('Este método de pago ya está en la lista de esta cuenta.', 'error');
      return;
    }

    const newAssociated: AssociatedMethod = {
      id: sysMethod.id,
      code: sysMethod.code,
      name: sysMethod.name,
      currency: sysMethod.currency,
      type: sysMethod.type,
      incomingCommission: parseFloat(selectedIncomingCommission) || sysMethod.incoming_commission || 0,
      outgoingCommission: parseFloat(selectedOutgoingCommission) || sysMethod.outgoing_commission || 0
    };

    setAccountPaymentMethods(prev => [...prev, newAssociated]);
    setSelectedSystemMethodId('');
    setSelectedIncomingCommission('0');
    setSelectedOutgoingCommission('0');
    showNotification(`Método "${sysMethod.name}" vinculado a la cuenta.`);
  };

  // Create a brand new method on the fly and associate it to this account
  const handleCreateAndAssociateNewMethod = async () => {
    if (!newCustomMethodName.trim()) {
      showNotification('Ingrese el nombre del nuevo método de pago.', 'error');
      return;
    }

    const newId = `pm-${Date.now()}`;
    const newPm: PaymentMethodConfig = {
      id: newId,
      code: newCustomMethodName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      name: newCustomMethodName.trim(),
      currency: newCustomMethodCurrency,
      type: newCustomMethodType,
      is_active: true,
      requires_reference: newCustomMethodType !== 'efectivo',
      allow_pos: true,
      allow_online: true,
      bank_account_name: accountName || 'Esta cuenta',
      incoming_commission: parseFloat(newCustomMethodIncoming) || 0,
      outgoing_commission: parseFloat(newCustomMethodOutgoing) || 0,
      sort_order: systemPaymentMethods.length + 1
    };

    try {
      await dbService.savePaymentMethod(newPm);
      const updatedSystem = [...systemPaymentMethods, newPm];
      setSystemPaymentMethods(updatedSystem);
      localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedSystem));

      const newAssociated: AssociatedMethod = {
        id: newId,
        code: newPm.code,
        name: newPm.name,
        currency: newPm.currency,
        type: newPm.type,
        incomingCommission: parseFloat(newCustomMethodIncoming) || 0,
        outgoingCommission: parseFloat(newCustomMethodOutgoing) || 0
      };

      setAccountPaymentMethods(prev => [...prev, newAssociated]);
      setNewCustomMethodName('');
      setNewCustomMethodIncoming('0');
      setNewCustomMethodOutgoing('0');
      setShowCreateNewMethodForm(false);
      showNotification(`Método "${newPm.name}" registrado en el sistema y vinculado a esta cuenta.`);
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
    } catch (err) {
      console.error('Error creating new payment method:', err);
      showNotification('Error al registrar el método de pago en el sistema.', 'error');
    }
  };

  // Remove / unbind method from current account form
  const handleUnbindMethodFromForm = (index: number) => {
    const updated = [...accountPaymentMethods];
    updated.splice(index, 1);
    setAccountPaymentMethods(updated);
  };

  // Save Account (Create or Edit) and Lock/Fix all associated payment methods to this account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim() || !bankName.trim()) {
      showNotification('Por favor complete los campos obligatorios.', 'error');
      return;
    }

    try {
      const serializedMethods = JSON.stringify(accountPaymentMethods);
      const accountId = editingAccountId || crypto.randomUUID();

      const initBal = parseFloat(initialBalance) || 0;
      const accToSave: BankAccount = {
        id: accountId,
        name: accountName.trim(),
        bank_name: bankName.trim(),
        currency: accountCurrency,
        balance: editingAccountId ? initBal : 0, // Si es nueva cuenta, la transferencia de apertura acreditará el balance inicial
        is_active: true,
        notes: serializedMethods,
        account_type: 'corriente'
      };

      const saved = await dbService.saveBankAccount(accToSave);
      const targetId = saved.id || accountId;

      // Update and Fix all payment methods in the system for this account
      let allSystemPms = await dbService.getPaymentMethods();
      const updatedSystemPms = allSystemPms.map(pm => {
        // Is this method currently associated with this account?
        const isAssociated = accountPaymentMethods.some(m => m.id === pm.id || m.name.toLowerCase() === pm.name.toLowerCase());
        
        if (isAssociated) {
          const assocData = accountPaymentMethods.find(m => m.id === pm.id || m.name.toLowerCase() === pm.name.toLowerCase());
          return {
            ...pm,
            bank_account_id: targetId,
            bank_account_name: saved.name,
            incoming_commission: assocData?.incomingCommission ?? 0,
            outgoing_commission: assocData?.outgoingCommission ?? 0
          };
        } else if (pm.bank_account_id === targetId) {
          // It was previously bound to this account, but removed: free it
          return {
            ...pm,
            bank_account_id: undefined,
            bank_account_name: undefined
          };
        }
        return pm;
      });

      localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedSystemPms));
      setSystemPaymentMethods(updatedSystemPms);

      // Save updated methods to DB
      for (const pm of updatedSystemPms) {
        if (pm.bank_account_id === targetId || (!pm.bank_account_id && allSystemPms.find(x => x.id === pm.id)?.bank_account_id === targetId)) {
          await dbService.savePaymentMethod(pm);
        }
      }

      // If initial balance > 0 on new account, record initial deposit
      if (!editingAccountId && parseFloat(initialBalance) > 0) {
        const initialTransfer: BankTransfer = {
          id: crypto.randomUUID(),
          to_account_id: targetId,
          to_account_name: saved.name,
          amount: parseFloat(initialBalance),
          converted_amount: parseFloat(initialBalance),
          currency: accountCurrency,
          notes: 'Saldo inicial de apertura de la cuenta bancaria',
          reference: 'APERTURA',
          created_by: currentUser?.name || 'Administrador'
        };
        await dbService.transferBetweenAccounts(initialTransfer);
      }

      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
      showNotification(editingAccountId ? 'Cuenta bancaria actualizada y métodos fijados correctamente.' : 'Cuenta bancaria creada y métodos de pago fijados con éxito.');
      resetAccountForm();
      loadData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error(err);
      showNotification('Error al guardar la cuenta bancaria.', 'error');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    setAccountToDelete(acc);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!accountToDelete) return;
    const id = accountToDelete.id;
    try {
      // Free all methods associated to this account
      const updatedSystem = systemPaymentMethods.map(pm => {
        if (pm.bank_account_id === id) {
          return { ...pm, bank_account_id: undefined, bank_account_name: undefined };
        }
        return pm;
      });
      localStorage.setItem('copias_bellavista_payment_methods', JSON.stringify(updatedSystem));
      setSystemPaymentMethods(updatedSystem);

      await dbService.deleteBankAccount(id);
      window.dispatchEvent(new CustomEvent('bellavista_payment_methods_updated'));
      showNotification('Cuenta bancaria eliminada y métodos liberados.');
      setSelectedAccount(null);
      setShowDeleteConfirm(false);
      setAccountToDelete(null);
      loadData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error(err);
      showNotification('Error al eliminar la cuenta.', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // FINANCIAL OPERATIONS (TRANSFERS, DEPOSITS, WITHDRAWALS)
  // --------------------------------------------------------------------------

  // Transfer with custom division rule
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId || !transferAmount) {
      showNotification('Por favor ingrese todos los campos obligatorios.', 'error');
      return;
    }
    if (transferFromId === transferToId) {
      showNotification('La cuenta de origen y destino no pueden ser la misma.', 'error');
      return;
    }

    const fromAcc = accounts.find(a => a.id === transferFromId);
    const toAcc = accounts.find(a => a.id === transferToId);
    if (!fromAcc || !toAcc) return;

    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification('Monto inválido.', 'error');
      return;
    }

    const commVal = parseFloat(transferCommission) || 0;
    let debitFromSource = amt;
    let commAmt = 0;
    if (commVal > 0) {
      if (transferCommissionType === 'fixed') {
        commAmt = commVal;
      } else {
        commAmt = amt * (commVal / 100);
      }
      debitFromSource = amt + commAmt;
    }

    const fromCurr = (fromAcc.currency || 'VES').toUpperCase();
    const toCurr = (toAcc.currency || 'VES').toUpperCase();

    if ((fromAcc.balance || 0) < debitFromSource) {
      showNotification(`Saldo insuficiente incluyendo comisión. Disponible: ${fromCurr === 'USD' || fromCurr === 'USDT' ? '$' : ''}${Number(fromAcc.balance || 0).toFixed(2)} ${fromCurr === 'VES' ? 'Bs.' : fromCurr}`, 'error');
      return;
    }

    try {
      const rate = parseFloat(customExchangeRate) || bcvRate;
      let convertedAmount = amt;

      // CONVERSION RULES (USD, USDT, VES):
      if ((fromCurr === 'USD' || fromCurr === 'USDT') && toCurr === 'VES') {
        convertedAmount = amt * rate; // Multiplicado por la tasa oficial
      } else if (fromCurr === 'VES' && (toCurr === 'USD' || toCurr === 'USDT')) {
        convertedAmount = amt / rate; // Dividido por la tasa oficial
      } else if ((fromCurr === 'USD' && toCurr === 'USDT') || (fromCurr === 'USDT' && toCurr === 'USD')) {
        convertedAmount = amt; // Paridad 1:1
      }

      const transferObj: BankTransfer = {
        from_account_id: transferFromId,
        from_account_name: fromAcc.name,
        to_account_id: transferToId,
        to_account_name: toAcc.name,
        amount: debitFromSource,
        currency: fromAcc.currency,
        exchange_rate: rate,
        converted_amount: convertedAmount,
        reference: transferReference,
        notes: transferNotes || `Transferencia (Monto: ${amt.toFixed(2)} + Comisión: ${commAmt.toFixed(2)})`,
        created_by: currentUser?.name || 'Administrador'
      };

      await dbService.transferBetweenAccounts(transferObj);
      showNotification('Transferencia ejecutada con éxito.');
      setShowTransferModal(false);
      resetTransferForm();
      loadData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error(err);
      showNotification('Error al ejecutar la transferencia.', 'error');
    }
  };

  const resetTransferForm = () => {
    setTransferFromId('');
    setTransferToId('');
    setTransferAmount('');
    setTransferCommission('0');
    setTransferCommissionType('fixed');
    setTransferReference('');
    setTransferNotes('');
    setCustomExchangeRate(String(bcvRate));
  };

  // Deposit
  const handleExecuteDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionAccountId || !transactionAmount) {
      showNotification('Por favor ingrese todos los campos obligatorios.', 'error');
      return;
    }

    const acc = accounts.find(a => a.id === transactionAccountId);
    if (!acc) return;

    const amt = parseFloat(transactionAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification('Monto inválido.', 'error');
      return;
    }

    try {
      const depositObj: BankTransfer = {
        to_account_id: transactionAccountId,
        to_account_name: acc.name,
        amount: amt,
        converted_amount: amt,
        currency: acc.currency,
        reference: transactionReference,
        notes: transactionNotes || 'Ingreso manual de saldo',
        created_by: currentUser?.name || 'Administrador'
      };

      await dbService.transferBetweenAccounts(depositObj);
      showNotification('Saldo ingresado exitosamente.');
      setShowDepositModal(false);
      resetTransactionForm();
      loadData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error(err);
      showNotification('Error al ingresar el saldo.', 'error');
    }
  };

  // Withdrawal
  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionAccountId || !transactionAmount) {
      showNotification('Por favor ingrese todos los campos obligatorios.', 'error');
      return;
    }

    const acc = accounts.find(a => a.id === transactionAccountId);
    if (!acc) return;

    const amt = parseFloat(transactionAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification('Monto inválido.', 'error');
      return;
    }

    if ((acc.balance || 0) < amt) {
      showNotification('Saldo insuficiente en la cuenta para realizar el retiro.', 'error');
      return;
    }

    try {
      const withdrawObj: BankTransfer = {
        from_account_id: transactionAccountId,
        from_account_name: acc.name,
        amount: amt,
        currency: acc.currency,
        reference: transactionReference,
        notes: transactionNotes || 'Retiro manual de saldo',
        created_by: currentUser?.name || 'Administrador'
      };

      await dbService.transferBetweenAccounts(withdrawObj);
      showNotification('Retiro realizado exitosamente.');
      setShowWithdrawModal(false);
      resetTransactionForm();
      loadData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error(err);
      showNotification('Error al efectuar el retiro.', 'error');
    }
  };

  const resetTransactionForm = () => {
    setTransactionAccountId('');
    setTransactionAmount('');
    setTransactionReference('');
    setTransactionNotes('');
  };

  // Save or Update payment method from the global manager modal
  const handleSaveManagerPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgrNewName.trim()) return;

    const pmId = editingPmId || `pm-${Date.now()}`;
    const targetAcc = accounts.find(a => a.id === mgrTargetAccountId);
    const existing = editingPmId ? systemPaymentMethods.find(p => p.id === editingPmId) : null;

    const newPm: PaymentMethodConfig = {
      id: pmId,
      code: existing?.code || mgrNewName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      name: mgrNewName.trim(),
      currency: mgrNewCurrency,
      type: mgrNewType,
      is_active: true,
      requires_reference: existing?.requires_reference !== false,
      allow_pos: existing?.allow_pos !== false,
      allow_online: existing?.allow_online !== false,
      bank_account_id: targetAcc?.id || undefined,
      bank_account_name: targetAcc?.name || undefined,
      incoming_commission: existing?.incoming_commission || 0,
      outgoing_commission: existing?.outgoing_commission || 0,
      sort_order: existing?.sort_order || (systemPaymentMethods.length + 1)
    };

    try {
      await dbService.savePaymentMethod(newPm);
      
      // Update bank account notes if binding changed
      for (const acc of accounts) {
        const methodsInAcc = parseAccountPaymentMethods(acc);
        const hasIt = methodsInAcc.some(m => m.id === pmId);

        if (targetAcc && acc.id === targetAcc.id) {
          const filtered = methodsInAcc.filter(m => m.id !== pmId);
          filtered.push({
            id: pmId,
            code: newPm.code,
            name: newPm.name,
            currency: newPm.currency,
            type: newPm.type,
            incomingCommission: 0,
            outgoingCommission: 0
          });
          await dbService.saveBankAccount({
            ...acc,
            notes: JSON.stringify(filtered)
          });
        } else if (hasIt && (!targetAcc || acc.id !== targetAcc.id)) {
          const filtered = methodsInAcc.filter(m => m.id !== pmId);
          await dbService.saveBankAccount({
            ...acc,
            notes: JSON.stringify(filtered)
          });
        }
      }

      showNotification(editingPmId ? 'Método de pago actualizado exitosamente.' : 'Método de pago registrado exitosamente.');
      setMgrNewName('');
      setMgrTargetAccountId('');
      setEditingPmId(null);
      loadData();
    } catch (err) {
      console.error(err);
      showNotification('Error al guardar el método de pago.', 'error');
    }
  };

  const handleEditPaymentMethod = (pm: PaymentMethodConfig) => {
    setEditingPmId(pm.id);
    setMgrNewName(pm.name);
    setMgrNewCurrency(pm.currency);
    setMgrNewType(pm.type as any || 'otro');
    setMgrTargetAccountId(pm.bank_account_id || '');
  };

  const handleCancelEditPaymentMethod = () => {
    setEditingPmId(null);
    setMgrNewName('');
    setMgrTargetAccountId('');
    setMgrNewCurrency('VES');
    setMgrNewType('movil');
  };

  const handleDeletePaymentMethod = async (pm: PaymentMethodConfig) => {
    try {
      await dbService.deletePaymentMethod(pm.id);
      for (const acc of accounts) {
        const existing = parseAccountPaymentMethods(acc);
        if (existing.some(m => m.id === pm.id)) {
          const filtered = existing.filter(m => m.id !== pm.id);
          await dbService.saveBankAccount({
            ...acc,
            notes: JSON.stringify(filtered)
          });
        }
      }
      showNotification(`Método "${pm.name}" eliminado correctamente.`);
      setPmToDelete(null);
      loadData();
    } catch (err) {
      console.error('Error deleting payment method:', err);
      showNotification('Error al eliminar el método de pago.', 'error');
    }
  };

  // Helper to get all movements for an account (without date restriction)
  const getAllAccountMovements = (accId: string) => {
    const acc = accounts.find(a => a.id === accId) || selectedAccount;
    const cleanAccName = (acc?.name || '').toLowerCase().trim();
    const aliasIds = acc?.alias_ids || (acc?.id ? [acc.id] : [accId]);

    return transfers.filter(t => {
      const isIdMatch = aliasIds.includes(t.from_account_id || '') || 
                        aliasIds.includes(t.to_account_id || '') || 
                        t.from_account_id === accId || 
                        t.to_account_id === accId;
      const cleanFromName = (t.from_account_name || '').toLowerCase().trim();
      const cleanToName = (t.to_account_name || '').toLowerCase().trim();
      const isNameMatch = !!cleanAccName && (cleanFromName === cleanAccName || cleanToName === cleanAccName);

      return isIdMatch || isNameMatch;
    });
  };

  // Helper to filter movements
  const getFilteredAccountMovements = (accId: string) => {
    const all = getAllAccountMovements(accId);
    if (dateFilterPreset === 'all') return all;

    return all.filter(t => {
      if (t.created_at) {
        const tDate = t.created_at.split('T')[0];
        if (startDate && tDate < startDate) return false;
        if (endDate && tDate > endDate) return false;
      }
      return true;
    });
  };

  // Helper to calculate exact display amount for a specific account
  const calculateMovementDisplayAmount = (t: BankTransfer, acc: BankAccount) => {
    const cleanAccName = (acc.name || '').toLowerCase().trim();
    const aliasIds = acc.alias_ids || [acc.id];
    const isIncoming = aliasIds.includes(t.to_account_id || '') || ((t.to_account_name || '').toLowerCase().trim() === cleanAccName);
    const isInterbank = !!(t.from_account_id && t.to_account_id && t.from_account_id !== t.to_account_id);
    const isAccountVES = acc.currency === 'VES';
    const rate = Number(t.exchange_rate) || bcvRate || 1;

    if (isInterbank) {
      if (isIncoming) {
        if (isAccountVES) {
          return Number(t.converted_amount || (t.currency === 'USD' ? (t.amount || 0) * rate : (t.amount || 0)));
        } else {
          return Number(t.converted_amount || (t.currency === 'VES' ? (t.amount || 0) / rate : (t.amount || 0)));
        }
      } else {
        return Number(t.amount || 0);
      }
    }

    // Direct single account movement (Cobro CxC, Pago CxP, Pago Gasto, Deposito, Retiro, POS)
    if (isAccountVES) {
      // If amount was small (< 50) and rate is high (> 50), it was entered in USD and must be in Bs
      if (rate > 50 && Number(t.amount) > 0 && Number(t.amount) < 50) {
        return Number(t.amount) * rate;
      }
      if (t.currency === 'USD') {
        return Number(t.amount) * rate;
      }
      if (t.converted_amount && Number(t.converted_amount) > Number(t.amount) && Number(t.amount) < 50) {
        return Number(t.converted_amount);
      }
      return Number(t.amount || t.converted_amount || 0);
    } else {
      // USD Account
      if (t.currency === 'VES' && rate > 0) {
        return (Number(t.amount) || 0) / rate;
      }
      if (rate > 50 && Number(t.amount) > 500) {
        return Number(t.amount) / rate;
      }
      return Number(t.amount || t.converted_amount || 0);
    }
  };

  // Transfer simulation
  const getTransferSimulationValues = () => {
    const fromAcc = accounts.find(a => a.id === transferFromId);
    const toAcc = accounts.find(a => a.id === transferToId);
    const amt = parseFloat(transferAmount) || 0;
    const rate = parseFloat(customExchangeRate) || bcvRate;

    if (!fromAcc || !toAcc || amt <= 0) return null;

    let debited = amt;
    let credited = amt;

    if (fromAcc.currency === 'USD' && toAcc.currency === 'VES') {
      credited = amt * rate;
    } else if (fromAcc.currency === 'VES' && toAcc.currency === 'USD') {
      credited = amt / rate;
    }

    const commVal = parseFloat(transferCommission) || 0;
    let commSource = 0;
    if (commVal > 0) {
      if (transferCommissionType === 'fixed') {
        commSource = commVal;
      } else {
        commSource = amt * (commVal / 100);
      }
    }

    return {
      debitAmount: debited + commSource,
      creditAmount: credited,
      commissionAmount: commSource,
      fromCurrency: fromAcc.currency,
      toCurrency: toAcc.currency
    };
  };

  const simulation = getTransferSimulationValues();

  // Helper for Payment Method Icons
  const renderMethodIcon = (type?: string) => {
    switch (type) {
      case 'movil': return <Smartphone className="w-3.5 h-3.5 text-violet-600" />;
      case 'efectivo': return <Banknote className="w-3.5 h-3.5 text-emerald-600" />;
      case 'transferencia': return <Landmark className="w-3.5 h-3.5 text-blue-600" />;
      case 'punto': return <CreditCard className="w-3.5 h-3.5 text-amber-600" />;
      default: return <Coins className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      
      {/* ==========================================
          HEADER PANEL DE CONTROL 
          ========================================== */}
      {/* ==========================================
          HEADER PANEL DE CONTROL 
          ========================================== */}
      {!selectedAccount ? (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-[#1D3557]" />
                <h1 className="text-xl font-montserrat font-extrabold text-[#1D3557] tracking-tight">CUENTAS BANCARIAS</h1>
              </div>
              <p className="text-[#2B2D42]/70 text-xs mt-1">
                Gestión de cuentas bancarias y métodos de cobro fijados exclusivamente a cada cuenta.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button 
                onClick={async () => {
                  setIsSyncingCloud(true);
                  try {
                    const refreshed = await dbService.getBankAccounts();
                    setAccounts(refreshed);
                    showNotification('Cuentas bancarias sincronizadas con Supabase exitosamente.');
                  } catch (e) {
                    showNotification('Error al sincronizar con la nube.', 'error');
                  } finally {
                    setIsSyncingCloud(false);
                  }
                }}
                disabled={isSyncingCloud}
                title="Sincronizar cuentas con Supabase"
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar'}</span>
              </button>

              <button 
                onClick={() => setShowSupabaseSqlModal(true)}
                title="Ver Script SQL de Supabase para Cuentas Bancarias"
                className="px-3 py-2 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>SQL Supabase</span>
              </button>

              <button 
                onClick={handleOpenNewAccount}
                className="px-4 py-2 bg-[#1D3557] hover:bg-[#152740] text-white font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>+ Nueva cuenta</span>
              </button>
              <button 
                onClick={() => setShowPaymentMethodsModal(true)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-98"
              >
                <CreditCard className="w-4 h-4 text-[#005da9]" />
                <span>Métodos de pago del sistema</span>
              </button>
            </div>
          </div>

          {/* ==========================================
              BARRA DE ACCIONES FINANCIERAS
              ========================================== */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-[#F8F9FA] p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={() => {
                  resetTransferForm();
                  setShowTransferModal(true);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full transition flex items-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
              >
                <ArrowLeftRight className="w-4 h-4 text-[#005da9]" />
                <span>Transferir entre cuentas</span>
              </button>
              
              <button 
                onClick={() => {
                  resetTransactionForm();
                  setShowWithdrawModal(true);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full transition flex items-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
              >
                <Minus className="w-4 h-4 text-[#005da9]" />
                <span>- Retirar Saldo</span>
              </button>

              <button 
                onClick={() => {
                  resetTransactionForm();
                  setShowDepositModal(true);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full transition flex items-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
              >
                <Plus className="w-4 h-4 text-[#005da9]" />
                <span>+ Ingresar saldo</span>
              </button>
            </div>

            <div className="bg-[#1D3557]/10 text-[#1D3557] px-4 py-2 rounded-xl font-bold text-xs border border-[#1D3557]/20 shadow-2xs flex items-center gap-2">
              <span>Total consolidado:</span>
              <strong className="text-sm font-black text-[#1D3557]">
                ${(getTotalBalanceUSD() || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          {/* ==========================================
              BARRA DE FILTROS POR MONEDA / DIVISA
              ========================================== */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider px-1">
                Moneda:
              </span>
              <button
                type="button"
                onClick={() => setCurrencyFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-montserrat font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                  currencyFilter === 'all'
                    ? 'bg-[#1D3557] text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>Todas</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  currencyFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {accounts.length}
                </span>
              </button>

              {availableFilterCurrencies.map(currCode => {
                const count = accounts.filter(a => (a.currency || '').toUpperCase() === currCode).length;
                const isSelected = currencyFilter.toUpperCase() === currCode;
                const isUSDT = currCode === 'USDT';
                const isUSD = currCode === 'USD';

                return (
                  <button
                    key={currCode}
                    type="button"
                    onClick={() => setCurrencyFilter(currCode)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-montserrat font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? isUSDT
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : isUSD
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-[#005da9] text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{isUSDT ? 'Tether (USDT)' : currCode === 'VES' ? 'Bolívares (VES)' : currCode === 'USD' ? 'Dólares (USD)' : currCode}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-semibold text-gray-500">
              Mostrando <strong className="text-[#1D3557] font-bold">{filteredAccounts.length}</strong> de {accounts.length} cuentas
            </div>
          </div>

          {/* ==========================================
              LISTADO DE TARJETAS DE CUENTAS BANCARIAS
              ========================================== */}
          {filteredAccounts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center my-6">
              <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-montserrat font-extrabold text-[#2B2D42] text-base mb-1">
                No hay cuentas bancarias registradas en {currencyFilter === 'all' ? 'el sistema' : currencyFilter}
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-5">
                {currencyFilter === 'all' 
                  ? 'Comience creando su primera cuenta bancaria para gestionar saldos y métodos de pago.'
                  : `Cree una cuenta bancaria en divisa ${currencyFilter} para asociar métodos de cobro y pagos en esta moneda.`}
              </p>
              <div className="flex items-center justify-center gap-3">
                {currencyFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCurrencyFilter('all')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-montserrat font-bold text-xs rounded-full transition"
                  >
                    Ver todas las cuentas
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleOpenNewAccount();
                    if (currencyFilter !== 'all') {
                      setAccountCurrency(currencyFilter);
                    }
                  }}
                  className="px-4 py-2 bg-[#1D3557] hover:bg-[#152740] text-white font-montserrat font-bold text-xs rounded-full shadow-2xs transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Crear cuenta en {currencyFilter !== 'all' ? currencyFilter : 'el sistema'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredAccounts.map(acc => {
                const pms = parseAccountPaymentMethods(acc);
                const curr = (acc.currency || '').toUpperCase();
                const isUSD = curr === 'USD';
                const isUSDT = curr === 'USDT';
                const isVES = curr === 'VES';
                const equivalentUSD = (isUSD || isUSDT) ? (acc.balance || 0) : ((acc.balance || 0) / (bcvRate || 1));
                
                return (
                  <div 
                    key={acc.id}
                    onClick={() => setSelectedAccount(acc)}
                    className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:shadow-md transition p-5 flex flex-col justify-between cursor-pointer group hover:border-[#1D3557]"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            isUSDT ? 'bg-emerald-100 text-emerald-800' :
                            isUSD ? 'bg-amber-100 text-amber-800' :
                            'bg-[#1D3557]/10 text-[#1D3557]'
                          }`}>
                            <Landmark className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-montserrat font-extrabold text-[#2B2D42] text-sm group-hover:text-[#1D3557]">{acc.name}</h3>
                            <p className="text-[10px] text-[#2B2D42]/60 font-medium">{acc.bank_name}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-montserrat font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          isUSDT ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          isUSD ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {acc.currency}
                        </span>
                      </div>

                      <div className="my-4">
                        {isUSD ? (
                          <p className="text-2xl font-black font-mono text-[#1D3557]">
                            ${(acc?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        ) : isUSDT ? (
                          <div>
                            <p className="text-2xl font-black font-mono text-emerald-700">
                              {(acc?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-base font-bold">USDT</span>
                            </p>
                            <p className="text-xs font-bold font-mono text-[#2B2D42]/60 mt-0.5">
                              Ref: Bs. {((acc?.balance || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-2xl font-black font-mono text-[#1D3557]">
                              Bs. {(acc?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold font-mono text-[#2B2D42]/60 mt-0.5">
                              Ref: ${(equivalentUSD || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* MÉTODOS DE COBRO FIJADOS A ESTA CUENTA */}
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-montserrat font-extrabold text-[#2B2D42]/60 uppercase tracking-wider flex items-center gap-1">
                            <Lock className="w-3 h-3 text-[#1D3557]" />
                            Métodos fijados ({pms.length})
                          </span>
                        </div>
                        
                        {pms.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {pms.map((pm, i) => (
                              <span 
                                key={i}
                                className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-[#1D3557]/10 text-[#1D3557] px-2 py-0.5 rounded-md border border-[#1D3557]/20"
                              >
                                {renderMethodIcon(pm.type)}
                                <span>{pm.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-600 font-semibold italic flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Sin métodos fijados
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-montserrat font-extrabold text-[#00BFFF] group-hover:underline flex items-center gap-1">
                        Ver movimientos
                        <ExternalLink className="w-3 h-3" />
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditAccount(acc);
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-[#1D3557] transition"
                        title="Editar cuenta y métodos asociados"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ==========================================
            VISTA DETALLE DE CUENTA BANCARIA
            ========================================== */
        <div>
          {/* Top Bar navigation */}
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => setSelectedAccount(null)}
              className="flex items-center gap-2 text-xs font-black text-gray-600 hover:text-gray-900 bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-2xs hover:bg-gray-50 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a cuentas</span>
            </button>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleOpenEditAccount(selectedAccount)}
                className="px-3.5 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 text-xs font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                <span>Editar cuenta y métodos</span>
              </button>
              <button 
                onClick={() => handleDeleteAccount(selectedAccount.id)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar cuenta</span>
              </button>
            </div>
          </div>

          {/* Account Detail Header */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#1D3557]/10 flex items-center justify-center">
                <Landmark className="w-7 h-7 text-[#1D3557]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-montserrat font-extrabold text-[#1D3557]">{selectedAccount.name}</h1>
                  <span className={`text-[10px] font-montserrat font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                    selectedAccount.currency === 'USDT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    selectedAccount.currency === 'USD' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {selectedAccount.currency}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#2B2D42]/70 mt-0.5">{selectedAccount.bank_name}</p>
                
                {/* Methods locked to this account */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-montserrat font-extrabold text-[#2B2D42]/60 uppercase">Métodos fijados:</span>
                  <div className="flex flex-wrap gap-1">
                    {parseAccountPaymentMethods(selectedAccount).map((m, i) => (
                      <span key={i} className="text-[10px] font-extrabold bg-[#1D3557]/10 text-[#1D3557] px-2 py-0.5 rounded border border-[#1D3557]/20 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 text-[#1D3557]" />
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right border-t md:border-t-0 md:border-l border-gray-150 pt-4 md:pt-0 md:pl-8">
              <span className="text-[10px] font-montserrat font-extrabold text-[#2B2D42]/60 uppercase tracking-wider block mb-1">Saldo Actual</span>
              {selectedAccount.currency === 'USD' ? (
                <p className="text-3xl font-black font-mono text-[#1D3557]">
                    ${(selectedAccount?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : selectedAccount.currency === 'USDT' ? (
                <div>
                  <p className="text-3xl font-black font-mono text-emerald-700">
                    {(selectedAccount?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl font-bold">USDT</span>
                  </p>
                  <p className="text-xs font-bold font-mono text-[#2B2D42]/60 mt-1">
                    Equivalente: Bs. {((selectedAccount?.balance || 0) * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl font-black font-mono text-[#1D3557]">
                    Bs. {(selectedAccount?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs font-bold font-mono text-[#2B2D42]/60 mt-1">
                    Equivalente: ${(((selectedAccount?.balance || 0) / (bcvRate || 1))).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Movements Filters & Action Bar */}
          <div className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200 shadow-2xs mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Preset Buttons */}
              <div className="flex items-center bg-white p-1 rounded-xl border border-gray-200 shadow-3xs mr-2">
                <button
                  type="button"
                  onClick={() => setDateFilterPreset('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-extrabold transition cursor-pointer ${
                    dateFilterPreset === 'all'
                      ? 'bg-[#1D3557] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Todos ({getAllAccountMovements(selectedAccount.id).length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFilterPreset('this_month');
                    const d = new Date();
                    d.setDate(1);
                    setStartDate(d.toISOString().split('T')[0]);
                    setEndDate(new Date().toISOString().split('T')[0]);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-extrabold transition cursor-pointer ${
                    dateFilterPreset === 'this_month'
                      ? 'bg-[#1D3557] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Este Mes
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterPreset('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-extrabold transition cursor-pointer ${
                    dateFilterPreset === 'custom'
                      ? 'bg-[#1D3557] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Personalizado
                </button>
              </div>

              {dateFilterPreset !== 'all' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-montserrat font-extrabold text-[#2B2D42]">Desde:</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setDateFilterPreset('custom');
                      }}
                      className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-bold text-[#2B2D42] bg-white focus:outline-none focus:border-[#1D3557]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-montserrat font-extrabold text-[#2B2D42]">Hasta:</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDateFilterPreset('custom');
                      }}
                      className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-bold text-[#2B2D42] bg-white focus:outline-none focus:border-[#1D3557]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => loadData()}
                disabled={isLoading}
                className="px-3.5 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 text-xs font-montserrat font-extrabold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-3xs"
                title="Sincronizar directamente con Supabase"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Cargando...' : 'Sincronizar'}</span>
              </button>

              <button 
                onClick={() => window.print()}
                className="px-4 py-2 bg-white text-[#1D3557] hover:bg-gray-100 border border-gray-200 text-xs font-montserrat font-extrabold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-3xs"
              >
                <Download className="w-4 h-4 text-[#1D3557]" />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>

          {/* Table of Movements */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1D3557] text-white text-[10px] font-montserrat font-extrabold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Cuenta</th>
                  <th className="py-3.5 px-4">Fecha</th>
                  <th className="py-3.5 px-4">Usuario</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Detalle / Referencia</th>
                  <th className="py-3.5 px-4">Tasa</th>
                  <th className="py-3.5 px-4">Comisión</th>
                  <th className="py-3.5 px-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {getFilteredAccountMovements(selectedAccount.id).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400 font-bold">
                      {getAllAccountMovements(selectedAccount.id).length > 0 ? (
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-gray-500">No hay movimientos en el rango de fechas seleccionado ({startDate} a {endDate}).</p>
                          <p className="text-xs text-blue-600 font-extrabold">Hay {getAllAccountMovements(selectedAccount.id).length} movimientos registrados en total para esta cuenta.</p>
                          <button
                            type="button"
                            onClick={() => setDateFilterPreset('all')}
                            className="mt-2 px-3 py-1.5 bg-[#1D3557] text-white rounded-lg text-xs font-bold hover:bg-[#1D3557]/90 transition"
                          >
                            Ver todos los movimientos
                          </button>
                        </div>
                      ) : (
                        'No hay movimientos registrados en la base de datos para esta cuenta.'
                      )}
                    </td>
                  </tr>
                ) : (
                  getFilteredAccountMovements(selectedAccount.id).map((t, idx) => {
                    const aliasIds = selectedAccount.alias_ids || [selectedAccount.id];
                    const cleanAccName = (selectedAccount.name || '').toLowerCase().trim();
                    const isIncoming = aliasIds.includes(t.to_account_id || '') || ((t.to_account_name || '').toLowerCase().trim() === cleanAccName);
                    const amountVal = calculateMovementDisplayAmount(t, selectedAccount);

                    return (
                      <tr key={t.id || idx} className="hover:bg-gray-50/50 transition">
                        <td className="py-3 px-4 font-extrabold text-[#2B2D42]">{selectedAccount.name}</td>
                        <td className="py-3 px-4 text-[#2B2D42]/80 font-semibold">
                          {t.created_at ? new Date(t.created_at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Reciente'}
                        </td>
                        <td className="py-3 px-4 text-[#2B2D42] font-bold">{t.created_by || 'Cajero'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-extrabold text-[9px] uppercase tracking-wider ${isIncoming ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {isIncoming ? 'Entrada' : 'Salida'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#2B2D42] max-w-xs truncate font-medium">{t.notes} {t.reference ? `(Ref: ${t.reference})` : ''}</td>
                        <td className="py-3 px-4 text-[#2B2D42]/80 font-bold font-mono">{t.exchange_rate ? `${t.exchange_rate.toFixed(2)} Bs/$` : '-'}</td>
                        <td className="py-3 px-4 text-[#2B2D42]/80 font-semibold font-mono">Bs 0.00</td>
                        <td className={`py-3 px-4 text-right font-black font-mono ${isIncoming ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {isIncoming ? '+' : '-'}{(amountVal || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedAccount.currency}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: NUEVA / EDITAR CUENTA BANCARIA CON ASOCIACIÓN DE MÉTODOS DEL SISTEMA
          ========================================================================= */}
      {showNewAccountModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-gray-100 overflow-hidden my-8 animate-fadeIn">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#1D3557]" />
                <h3 className="font-montserrat font-extrabold text-[#2B2D42] text-sm">
                  {editingAccountId ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'}
                </h3>
              </div>
              <button onClick={resetAccountForm} className="p-1 hover:bg-gray-200 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Nombre de la cuenta bancaria *</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Ej: Banesco, Mercantil, Cuenta Dólares, BNC"
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold"
                  />
                  {accountName && <Check className="absolute right-3 top-2.5 w-4 h-4 text-emerald-500" />}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Banco / Proveedor Financiero *</label>
                <input 
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ej: Banesco Banco Universal, BNC, Zelle, Mercantil"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Moneda de la cuenta *</label>
                  <select 
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold"
                  >
                    {systemCurrencies && systemCurrencies.length > 0 ? (
                      systemCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.symbol || c.code} - {c.code})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="VES">Bolívar venezolano (VES)</option>
                        <option value="USD">Dólar estadounidense (USD)</option>
                        <option value="USDT">Tether USDT (USDT)</option>
                        <option value="EUR">Euro europeo (EUR)</option>
                        <option value="COP">Peso colombiano (COP)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Saldo inicial *</label>
                  <div className="relative">
                    <input 
                      type="number"
                      step="any"
                      required
                      value={initialBalance}
                      disabled={!!editingAccountId}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold"
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] font-black text-gray-400">{accountCurrency}</span>
                  </div>
                </div>
              </div>

              {/* ==========================================================
                  SECCIÓN: ASOCIACIÓN DE MÉTODOS DE PAGO DEL SISTEMA
                  ========================================================== */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#1D3557]" />
                    <label className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase">
                      Métodos de Pago Vinculados a esta Cuenta
                    </label>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20">
                    {accountPaymentMethods.length} vinculado(s)
                  </span>
                </div>
                
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Vincule los métodos de cobro que pertenezcan a esta cuenta. Solo se muestran los métodos del sistema que <strong>NO están asociados a otras cuentas bancarias</strong>.
                </p>

                {/* 1. SELECCIONAR MÉTODO EXISTENTE NO ASOCIADO */}
                <div className="bg-[#f8fafd] border border-[#e2e8f0] p-3.5 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-montserrat font-extrabold text-[#1D3557] uppercase">
                      Vincular método disponible del sistema:
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold">
                      {availableUnassociatedMethods.length} disponible(s)
                    </span>
                  </div>

                  {availableUnassociatedMethods.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={selectedSystemMethodId}
                          onChange={(e) => setSelectedSystemMethodId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-semibold text-gray-800 focus:border-[#1D3557] outline-none"
                        >
                          <option value="">-- Seleccionar método no asociado --</option>
                          {availableUnassociatedMethods.map(pm => (
                            <option key={pm.id} value={pm.id}>
                              [{pm.currency}] {pm.name} • ({pm.type?.toUpperCase() || 'MÉTODO'})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={!selectedSystemMethodId}
                          onClick={handleAssociateSystemMethod}
                          className="px-4 py-2 bg-[#1D3557] hover:bg-[#152741] text-white font-montserrat font-bold text-xs rounded-xl transition cursor-pointer shadow-xs disabled:opacity-40 flex items-center justify-center gap-1.5 active:scale-98 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Vincular Método</span>
                        </button>
                      </div>

                      {selectedSystemMethodId && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">Comisión Ingreso (%)</label>
                            <input
                              type="number"
                              step="any"
                              value={selectedIncomingCommission}
                              onChange={(e) => setSelectedIncomingCommission(e.target.value)}
                              placeholder="0"
                              className="w-full px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">Comisión Egreso (%)</label>
                            <input
                              type="number"
                              step="any"
                              value={selectedOutgoingCommission}
                              onChange={(e) => setSelectedOutgoingCommission(e.target.value)}
                              placeholder="0"
                              className="w-full px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-800 text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>No hay métodos de pago libres en el sistema (todos están asociados o ya vinculados). Use el botón inferior para crear uno nuevo.</span>
                    </div>
                  )}
                </div>

                {/* 2. BOTÓN / FORMULARIO PARA INCLUIR NUEVO MÉTODO DE PAGO DEL SISTEMA */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateNewMethodForm(!showCreateNewMethodForm)}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-[#1D3557] border border-dashed border-[#1D3557]/40 rounded-xl text-xs font-montserrat font-extrabold flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
                  >
                    <PlusCircle className="w-4 h-4 text-[#005da9]" />
                    <span>{showCreateNewMethodForm ? 'Ocultar formulario de nuevo método' : '+ Incluir nuevo método de pago en el sistema'}</span>
                  </button>

                  {showCreateNewMethodForm && (
                    <div className="mt-2.5 bg-[#f0f4f9] border border-[#d2ddec] p-4 rounded-2xl space-y-3 animate-fadeIn">
                      <div className="text-[10px] font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wide">
                        Registrar y Vincular Nuevo Método de Pago:
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                          Nombre del método *
                        </label>
                        <input 
                          type="text"
                          value={newCustomMethodName}
                          onChange={(e) => setNewCustomMethodName(e.target.value)}
                          placeholder="Ej: Pago móvil Mercantil, Transferencia BNC..."
                          className="w-full px-3 py-2 bg-white border border-gray-250 rounded-xl text-xs font-semibold focus:border-[#1D3557] outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Moneda</label>
                          <select 
                            value={newCustomMethodCurrency}
                            onChange={(e) => setNewCustomMethodCurrency(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none"
                          >
                            {systemCurrencies && systemCurrencies.length > 0 ? (
                              systemCurrencies.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name} ({c.symbol || c.code} - {c.code})
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="VES">Bolívares (VES)</option>
                                <option value="USD">Dólares (USD)</option>
                                <option value="USDT">Tether (USDT)</option>
                                <option value="EUR">Euros (EUR)</option>
                                <option value="COP">Pesos Colombianos (COP)</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Tipo</label>
                          <select 
                            value={newCustomMethodType}
                            onChange={(e) => setNewCustomMethodType(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-250 rounded-xl text-xs font-semibold outline-none"
                          >
                            <option value="movil">Pago Móvil</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="punto">Punto de Venta</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="digital">Digital (Zelle / Binance)</option>
                            <option value="otro">Otro</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">Comisión Ingreso (%)</label>
                          <input 
                            type="number"
                            step="any"
                            value={newCustomMethodIncoming}
                            onChange={(e) => setNewCustomMethodIncoming(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-250 rounded-xl text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">Comisión Egreso (%)</label>
                          <input 
                            type="number"
                            step="any"
                            value={newCustomMethodOutgoing}
                            onChange={(e) => setNewCustomMethodOutgoing(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-250 rounded-xl text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={handleCreateAndAssociateNewMethod}
                        className="w-full py-2 bg-[#1D3557] hover:bg-[#152741] text-white font-montserrat font-bold text-xs rounded-xl transition cursor-pointer shadow-xs active:scale-98"
                      >
                        Registrar en el sistema y vincular a esta cuenta
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. LISTADO DE MÉTODOS VINCULADOS A ESTA CUENTA */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-montserrat font-extrabold text-gray-600 uppercase">
                    Métodos fijados actualmente:
                  </div>

                  {accountPaymentMethods.length === 0 ? (
                    <div className="p-3 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <p className="text-[11px] text-gray-500 font-medium">
                        No hay métodos de pago vinculados a esta cuenta aún.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {accountPaymentMethods.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-gray-200 shadow-2xs hover:border-slate-300 transition">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              {renderMethodIcon(m.type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-montserrat font-bold text-gray-800">{m.name}</p>
                                <span className="text-[9px] font-bold text-[#1D3557] bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5 text-[#1D3557]" />
                                  Fijado
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">
                                {m.currency || 'VES'} • {m.type?.toUpperCase() || 'MÉTODO'} {m.incomingCommission || m.outgoingCommission ? `(Com: +${m.incomingCommission}% / -${m.outgoingCommission}%)` : ''}
                              </p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleUnbindMethodFromForm(idx)}
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition cursor-pointer"
                            title="Desvincular método de esta cuenta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={resetAccountForm}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 rounded-full text-xs font-montserrat font-bold shadow-2xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-[#005da9]" />
                  <span>Cancelar</span>
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-slate-50 text-[#1D3557] border border-slate-300 font-montserrat font-bold text-xs rounded-full shadow-2xs hover:shadow-xs transition cursor-pointer active:scale-98 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 text-[#005da9]" />
                  <span>{editingAccountId ? 'Guardar Cambios' : 'Confirmar ingreso'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: TRANSFERENCIA ENTRE CUENTAS
          ========================================== */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#F8F9FA] border-b border-gray-150 flex items-center justify-between">
              <h3 className="font-montserrat font-extrabold text-[#1D3557] text-sm">Transferencia entre cuentas</h3>
              <button onClick={() => setShowTransferModal(false)} className="p-1 hover:bg-gray-200 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Cuenta de origen *</label>
                <select 
                  required
                  value={transferFromId}
                  onChange={(e) => setTransferFromId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                >
                  <option value="">Seleccione...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency} - Disp: {Number(acc.balance || 0).toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Cuenta de destino *</label>
                <select 
                  required
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                >
                  <option value="">Seleccione...</option>
                  {accounts.filter(acc => acc.id !== 'cxc-virtual' && !acc.name?.toLowerCase().includes('cuentas por cobrar')).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Monto a transferir *</label>
                <input 
                  type="number"
                  step="any"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold font-mono text-[#2B2D42]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Tasa de Cambio Oficial *</label>
                  <input 
                    type="number"
                    step="any"
                    required
                    value={customExchangeRate}
                    onChange={(e) => setCustomExchangeRate(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold font-mono text-[#2B2D42] bg-[#F8F9FA]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Comisión de origen</label>
                  <input 
                    type="number"
                    step="any"
                    value={transferCommission}
                    onChange={(e) => setTransferCommission(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold font-mono text-[#2B2D42]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase">Tipo de comisión:</span>
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2B2D42] cursor-pointer">
                  <input 
                    type="radio"
                    name="commType"
                    checked={transferCommissionType === 'fixed'}
                    onChange={() => setTransferCommissionType('fixed')}
                    className="text-[#1D3557] focus:ring-[#1D3557]"
                  />
                  <span>Fija</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2B2D42] cursor-pointer">
                  <input 
                    type="radio"
                    name="commType"
                    checked={transferCommissionType === 'percent'}
                    onChange={() => setTransferCommissionType('percent')}
                    className="text-[#1D3557] focus:ring-[#1D3557]"
                  />
                  <span>Porcentual (%)</span>
                </label>
              </div>

              {/* SIMULACIÓN DE CONVERSIÓN CON LA REGLA DE DIVISIÓN */}
              {simulation && (
                <div className="bg-[#1D3557]/5 rounded-xl p-4 border border-[#1D3557]/15 space-y-1.5 text-xs font-bold text-[#1D3557] shadow-3xs">
                  <p>Cantidad a debitar en cuenta origen: <strong className="text-[#1D3557] font-black font-mono">{simulation.debitAmount.toFixed(2)} {simulation.fromCurrency}</strong></p>
                  <p>Cantidad a acreditar en cuenta destino: <strong className="text-emerald-700 font-black font-mono">{simulation.creditAmount.toFixed(2)} {simulation.toCurrency}</strong></p>
                  {simulation.commissionAmount > 0 && (
                    <p className="text-[10px] text-[#2B2D42]/70">Comisión aplicada: {simulation.commissionAmount.toFixed(2)} {simulation.fromCurrency}</p>
                  )}
                  {simulation.fromCurrency === 'USD' && simulation.toCurrency === 'VES' && (
                    <p className="text-[9px] text-[#1D3557]/80 italic font-medium mt-1">
                      ℹ️ Tasa aplicada: se multiplicó el monto en dólares por {parseFloat(customExchangeRate) || bcvRate} Bs/$ para acreditar bolívares.
                    </p>
                  )}
                  {simulation.fromCurrency === 'VES' && simulation.toCurrency === 'USD' && (
                    <p className="text-[9px] text-[#1D3557]/80 italic font-medium mt-1">
                      ℹ️ Tasa aplicada: se dividió el monto en bolívares entre {parseFloat(customExchangeRate) || bcvRate} Bs/$ para acreditar dólares.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Referencia / Comprobante</label>
                <input 
                  type="text"
                  value={transferReference}
                  onChange={(e) => setTransferReference(e.target.value)}
                  placeholder="Ej: Ref 492042"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Concepto / Notas</label>
                <textarea 
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="Ingrese una nota descriptiva de la operación"
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 bg-white border border-gray-200 text-[#2B2D42] text-xs font-montserrat font-extrabold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-[#1D3557] hover:bg-[#152843] text-white text-xs font-montserrat font-extrabold rounded-xl shadow-xs cursor-pointer"
                >
                  Confirmar transferencia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: INGRESAR SALDO (DEPOSITO)
          ========================================== */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#F8F9FA] border-b border-gray-150 flex items-center justify-between">
              <h3 className="font-montserrat font-extrabold text-[#1D3557] text-sm">Ingresar Saldo</h3>
              <button onClick={() => setShowDepositModal(false)} className="p-1 hover:bg-gray-200 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleExecuteDeposit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Cuenta de Destino *</label>
                <select 
                  required
                  value={transactionAccountId}
                  onChange={(e) => setTransactionAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                >
                  <option value="">Seleccione...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Monto a Ingresar *</label>
                <input 
                  type="number"
                  step="any"
                  required
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold font-mono text-[#2B2D42]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Referencia / Comprobante</label>
                <input 
                  type="text"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder="Ej: Depósito #0294"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Concepto / Notas</label>
                <textarea 
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  placeholder="Ej: Aporte de capital, ingresos por ventas externas"
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowDepositModal(false)}
                  className="px-4 py-2 bg-white border border-gray-200 text-[#2B2D42] text-xs font-montserrat font-extrabold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat text-xs font-black rounded-xl shadow-sm cursor-pointer"
                >
                  Confirmar ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: RETIRAR SALDO
          ========================================== */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-[#F8F9FA] border-b border-gray-150 flex items-center justify-between">
              <h3 className="font-montserrat font-extrabold text-[#1D3557] text-sm">Retirar Saldo</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1 hover:bg-gray-200 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleExecuteWithdrawal} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Cuenta de Origen *</label>
                <select 
                  required
                  value={transactionAccountId}
                  onChange={(e) => setTransactionAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                >
                  <option value="">Seleccione...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency} - Disp: {Number(acc.balance || 0).toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Monto a Retirar *</label>
                <input 
                  type="number"
                  step="any"
                  required
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-bold font-mono text-[#2B2D42]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Referencia / Comprobante</label>
                <input 
                  type="text"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder="Ej: Pago de nómina, gastos operativos"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Concepto / Notas</label>
                <textarea 
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  placeholder="Ej: Pago de servicios, retiro personal, etc."
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#1D3557] text-xs font-semibold text-[#2B2D42]"
                />
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowWithdrawModal(false)}
                  className="px-4 py-2 bg-white border border-gray-200 text-[#2B2D42] text-xs font-montserrat font-extrabold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-montserrat font-black rounded-xl shadow-sm cursor-pointer"
                >
                  Confirmar retiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: GESTOR DE MÉTODOS DE PAGO DEL SISTEMA (CONFIGURACIÓN GLOBAL)
          ========================================================================= */}
      {showPaymentMethodsModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-xl border border-gray-100 overflow-hidden my-8 animate-fadeIn">
            <div className="px-6 py-4 bg-[#F8F9FA] border-b border-gray-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#1D3557]" />
                <h3 className="font-montserrat font-extrabold text-[#1D3557] text-sm">Métodos de Pago del Sistema</h3>
              </div>
              <button onClick={() => setShowPaymentMethodsModal(false)} className="p-1 hover:bg-gray-200 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-xs text-[#2B2D42]/80 font-medium">
                Aquí puede ver todos los métodos de cobro registrados en el sistema y a cuál cuenta bancaria están fijados actualmente.
              </p>

              {/* Form to create/edit system level payment method */}
              <form onSubmit={handleSaveManagerPaymentMethod} className="bg-[#1D3557]/5 rounded-xl border border-[#1D3557]/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider block">
                    {editingPmId ? 'Modificar método de pago seleccionado:' : 'Registrar nuevo método de pago:'}
                  </span>
                  {editingPmId && (
                    <button
                      type="button"
                      onClick={handleCancelEditPaymentMethod}
                      className="text-[10px] font-bold text-gray-500 hover:text-gray-800 underline cursor-pointer"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
                
                <div>
                  <label className="block text-[9px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Nombre del método *</label>
                  <input 
                    type="text"
                    required
                    value={mgrNewName}
                    onChange={(e) => setMgrNewName(e.target.value)}
                    placeholder="Ej: Pago móvil Banesco, Zelle Empresa, Binance USDT"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-[#2B2D42] focus:outline-none focus:border-[#1D3557]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Moneda</label>
                    <select 
                      value={mgrNewCurrency}
                      onChange={(e) => setMgrNewCurrency(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-[#2B2D42]"
                    >
                      {systemCurrencies && systemCurrencies.length > 0 ? (
                        systemCurrencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.symbol || c.code} - {c.code})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="VES">Bolívares (VES)</option>
                          <option value="USD">Dólares (USD)</option>
                          <option value="USDT">Tether (USDT)</option>
                          <option value="EUR">Euros (EUR)</option>
                          <option value="COP">Pesos Colombianos (COP)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Tipo</label>
                    <select 
                      value={mgrNewType}
                      onChange={(e) => setMgrNewType(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-[#2B2D42]"
                    >
                      <option value="movil">Pago Móvil</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="punto">Punto de Venta</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="digital">Digital (Zelle/Binance)</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-montserrat font-extrabold text-[#2B2D42]/70 uppercase mb-1">Fijar a cuenta</label>
                    <select 
                      value={mgrTargetAccountId}
                      onChange={(e) => setMgrTargetAccountId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-[#2B2D42]"
                    >
                      <option value="">-- Sin fijar aún --</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {editingPmId ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button 
                      type="button"
                      onClick={handleCancelEditPaymentMethod}
                      className="w-1/3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-montserrat font-bold text-xs rounded-lg transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="w-2/3 py-2 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat font-black text-xs rounded-lg transition cursor-pointer shadow-2xs"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit"
                    className="w-full py-2 bg-[#1D3557] hover:bg-[#152843] text-white font-montserrat font-black text-xs rounded-lg transition cursor-pointer shadow-2xs"
                  >
                    + Registrar método en el sistema
                  </button>
                )}
              </form>

              {/* List of existing payment methods with their locked accounts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-montserrat font-extrabold text-[#2B2D42]/60 uppercase">Métodos Registrados ({systemPaymentMethods.length})</p>
                  <span className="text-[10px] text-gray-400 font-medium">Modifique o elimine según necesite</span>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {systemPaymentMethods.map((pm) => {
                    const bound = getMethodBoundAccount(pm);
                    return (
                      <div key={pm.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-200 shadow-3xs hover:border-gray-300 transition">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            {renderMethodIcon(pm.type)}
                          </div>
                          <div>
                            <p className="text-xs font-black text-[#2B2D42]">{pm.name}</p>
                            <p className="text-[10px] text-[#2B2D42]/60 font-bold uppercase">{pm.currency} • {pm.type}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {bound.isBound ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#1D3557]/10 text-[#1D3557] border border-[#1D3557]/20">
                              <Lock className="w-3 h-3 text-[#1D3557]" />
                              {bound.accountName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                              <Unlock className="w-3 h-3 text-gray-400" />
                              Sin cuenta
                            </span>
                          )}

                          <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                            <button
                              type="button"
                              onClick={() => handleEditPaymentMethod(pm)}
                              title="Modificar método"
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-[#1D3557] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPmToDelete(pm)}
                              title="Eliminar método"
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm payment method deletion dialog */}
              {pmToDelete && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 space-y-2 animate-fadeIn">
                  <p className="font-bold">
                    ¿Está seguro de que desea eliminar el método de pago "{pmToDelete.name}"?
                  </p>
                  <p className="text-[11px] text-rose-700">
                    Se desvinculará de cualquier cuenta bancaria a la que esté fijado actualmente.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPmToDelete(null)}
                      className="px-3 py-1 bg-white border border-rose-200 text-rose-800 rounded-lg font-bold text-xs hover:bg-rose-100 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePaymentMethod(pmToDelete)}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs"
                    >
                      Sí, eliminar método
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-150 flex items-center justify-end">
                <button 
                  type="button" 
                  onClick={() => setShowPaymentMethodsModal(false)}
                  className="px-5 py-2 bg-white border border-gray-200 text-[#2B2D42] text-xs font-montserrat font-extrabold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL DE SCRIPT SQL DE SUPABASE
          ========================================== */}
      {showSupabaseSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="bg-[#1D3557] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">Tablas Supabase: Cuentas Bancarias</h3>
                  <p className="text-[11px] text-blue-200">Esquema SQL con soporte de Realtime y Respaldo Multi-Nivel</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSupabaseSqlModal(false)}
                className="text-gray-300 hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-2.5 text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Si creaste una cuenta y no se reflejaba en la nube, ejecuta este script en el <strong>SQL Editor de Supabase</strong> para habilitar las tablas <code>bank_accounts</code>, <code>bank_transfers</code>, <code>payment_methods</code> y <code>app_config</code> con permisos de lectura/escritura y Realtime.
                </p>
              </div>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-700 leading-relaxed select-all">
{`-- 1. Tabla de Cuentas Bancarias
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VES',
  account_number TEXT,
  account_type TEXT DEFAULT 'corriente',
  balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Transferencias y Movimientos
CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id TEXT,
  to_account_id TEXT,
  from_account_name TEXT,
  to_account_name TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  amount_bs NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'VES',
  exchange_rate NUMERIC(15,4),
  converted_amount NUMERIC(15,2),
  reference TEXT,
  notes TEXT,
  created_by TEXT DEFAULT 'Administrador',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Métodos de Pago del Sistema
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VES',
  type TEXT NOT NULL DEFAULT 'otro',
  description TEXT,
  instructions TEXT,
  account_details TEXT,
  bank_account_id TEXT,
  bank_account_name TEXT,
  incoming_commission NUMERIC(8,4) DEFAULT 0,
  outgoing_commission NUMERIC(8,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requires_reference BOOLEAN DEFAULT false,
  allow_pos BOOLEAN DEFAULT true,
  allow_online BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Respaldo General (app_config)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Seguridad RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Políticas de Acceso Seguras e Idempotentes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Public full access bank_accounts') THEN
    CREATE POLICY "Public full access bank_accounts" ON public.bank_accounts FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_transfers' AND policyname = 'Public full access bank_transfers') THEN
    CREATE POLICY "Public full access bank_transfers" ON public.bank_transfers FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_methods' AND policyname = 'Public full access payment_methods') THEN
    CREATE POLICY "Public full access payment_methods" ON public.payment_methods FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Public full access app_config') THEN
    CREATE POLICY "Public full access app_config" ON public.app_config FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Habilitar Realtime sin bloqueos ni deadlocks
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;`}
                </pre>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-gray-500 text-[11px] font-medium">
                {accounts.length} cuenta(s) cargada(s) en memoria
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const sqlText = `-- 1. Tabla de Cuentas Bancarias
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VES',
  account_number TEXT,
  account_type TEXT DEFAULT 'corriente',
  balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Transferencias y Movimientos
CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id TEXT,
  to_account_id TEXT,
  from_account_name TEXT,
  to_account_name TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  amount_bs NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'VES',
  exchange_rate NUMERIC(15,4),
  converted_amount NUMERIC(15,2),
  reference TEXT,
  notes TEXT,
  created_by TEXT DEFAULT 'Administrador',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Métodos de Pago del Sistema
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VES',
  type TEXT NOT NULL DEFAULT 'otro',
  description TEXT,
  instructions TEXT,
  account_details TEXT,
  bank_account_id TEXT,
  bank_account_name TEXT,
  incoming_commission NUMERIC(8,4) DEFAULT 0,
  outgoing_commission NUMERIC(8,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requires_reference BOOLEAN DEFAULT false,
  allow_pos BOOLEAN DEFAULT true,
  allow_online BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Respaldo General (app_config)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Seguridad RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Políticas de Acceso Seguras e Idempotentes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Public full access bank_accounts') THEN
    CREATE POLICY "Public full access bank_accounts" ON public.bank_accounts FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_transfers' AND policyname = 'Public full access bank_transfers') THEN
    CREATE POLICY "Public full access bank_transfers" ON public.bank_transfers FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_methods' AND policyname = 'Public full access payment_methods') THEN
    CREATE POLICY "Public full access payment_methods" ON public.payment_methods FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Public full access app_config') THEN
    CREATE POLICY "Public full access app_config" ON public.app_config FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Habilitar Realtime sin bloqueos ni deadlocks
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;`;
                    navigator.clipboard.writeText(sqlText);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copiado al portapapeles' : 'Copiar Script SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSupabaseSqlModal(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL DE CONFIRMACIÓN DE ELIMINACIÓN 
          ========================================== */}
      {showDeleteConfirm && accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-base font-black uppercase text-gray-900 tracking-tight">¿Eliminar Cuenta Bancaria?</h3>
            </div>
            
            <p className="text-xs font-semibold text-gray-600 leading-relaxed">
              ¿Está seguro de que desea eliminar la cuenta bancaria <strong className="text-gray-900 font-extrabold">"{accountToDelete.name}"</strong>? 
              Los métodos de pago vinculados a esta cuenta quedarán liberados en el sistema. Esta acción no se puede deshacer.
            </p>

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setAccountToDelete(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Sí, eliminar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TOAST DE NOTIFICACIONES PREMIUM
          ========================================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-xl p-4 flex items-start gap-3.5 animate-in slide-in-from-bottom-5 duration-350">
          <div className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold text-gray-900 uppercase tracking-tight">{toast.type === 'success' ? 'Éxito' : 'Error'}</p>
            <p className="text-xs font-bold text-gray-500 mt-0.5 leading-normal">{toast.msg}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setToast(null)}
            className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-50 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

    </div>
  );
}
