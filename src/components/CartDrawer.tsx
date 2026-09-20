/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Plus, Minus, ShoppingCart, MessageCircle, AlertCircle, MapPin, Navigation, Loader2, User, Lock, Scan, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';
import { Product, CartItem, DiscountCode, LoyaltySettings, StoreUser } from '../types.ts';
import { dbService } from '../lib/supabase.ts';
import { CurrencyCode, formatCurrency, CURRENCIES, getCachedCurrencyRates } from '../lib/currency';
import BarcodeScannerModal from './BarcodeScannerModal';

interface CartQtyInputProps {
  initialQty: number;
  stock: number;
  onQtyChange: (newQty: number) => void;
}

const CartQtyInput: React.FC<CartQtyInputProps> = ({ initialQty, stock, onQtyChange }) => {
  const [localVal, setLocalVal] = useState<string>(initialQty.toString());

  useEffect(() => {
    setLocalVal(initialQty.toString());
  }, [initialQty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (/^\d*$/.test(rawVal)) {
      setLocalVal(rawVal);
      const numericVal = parseInt(rawVal, 10);
      if (!isNaN(numericVal) && numericVal > 0) {
        if (numericVal <= stock) {
          onQtyChange(numericVal);
        } else {
          onQtyChange(stock);
        }
      }
    }
  };

  const handleBlur = () => {
    const numericVal = parseInt(localVal, 10);
    if (isNaN(numericVal) || numericVal <= 0) {
      setLocalVal("1");
      onQtyChange(1);
    } else if (numericVal > stock) {
      setLocalVal(stock.toString());
      onQtyChange(stock);
    } else {
      setLocalVal(numericVal.toString());
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-10 py-0.5 text-center font-extrabold text-gray-800 text-xs bg-gray-50 border-x border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#005da9] focus:bg-white transition"
    />
  );
};

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onAddToCart?: (product: Product, quantity?: number) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  productImages: { product_id: string; image_url: string }[];
  onOrderSuccess?: (orderId: string) => void;
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  currentUser?: StoreUser | null;
  onOpenLoginModal?: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onAddToCart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  productImages,
  onOrderSuccess,
  activeCurrency,
  currencyRates,
  currentUser,
  onOpenLoginModal
}: CartDrawerProps) {
  const [showCartScanner, setShowCartScanner] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (showCartScanner) {
      dbService.getProducts().then(prods => {
        if (prods) setAllProducts(prods);
      }).catch(err => console.error("Error loading products for cart scanning:", err));
    }
  }, [showCartScanner]);

  // Customer info form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [countryPrefix, setCountryPrefix] = useState('+58');
  const [deliveryMethod, setDeliveryMethod] = useState<'b2c' | 'retiro'>('retiro');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState('');
  const [comments, setComments] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pagomovil' | 'efectivo' | 'transferencia' | 'binance' | 'zelle'>('pagomovil');
  const [paymentAmountWith, setPaymentAmountWith] = useState('');
  const [isOrderDataOpen, setIsOrderDataOpen] = useState(false);

  // Helper to parse phone numbers into country prefix and local number
  const parsePhoneString = (rawPhone: string) => {
    if (!rawPhone) return { prefix: '', number: '' };
    let clean = rawPhone.trim();
    let prefix = '';

    if (clean.startsWith('+58')) {
      prefix = '+58';
      clean = clean.substring(3).trim();
    } else if (clean.startsWith('+57')) {
      prefix = '+57';
      clean = clean.substring(3).trim();
    } else if (clean.startsWith('+1')) {
      prefix = '+1';
      clean = clean.substring(2).trim();
    } else if (clean.startsWith('58') && clean.length >= 10) {
      prefix = '+58';
      clean = clean.substring(2).trim();
    } else if (clean.startsWith('57') && clean.length >= 10) {
      prefix = '+57';
      clean = clean.substring(2).trim();
    }

    clean = clean.replace(/^\+/, '').trim();
    return { prefix, number: clean };
  };

  // Auto-fill customer info when opening cart or when currentUser changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadCustomerData = async () => {
      let nameVal = '';
      let emailVal = '';
      let rawPhoneVal = '';
      let addressVal = '';
      let prefixVal = '+58';

      // 1. Check logged in user object
      let userObj = currentUser;
      if (!userObj) {
        try {
          const saved = localStorage.getItem('copias_bellavista_logged_user');
          if (saved) userObj = JSON.parse(saved);
        } catch (e) {}
      }

      if (userObj) {
        nameVal = userObj.name || '';
        emailVal = userObj.email || '';
        if (userObj.phone || (userObj as any).telefono) {
          rawPhoneVal = userObj.phone || (userObj as any).telefono || '';
        }

        if (userObj.email) {
          try {
            const client = await dbService.findClientByIdentifier(userObj.email);
            if (client && isMounted) {
              const fullName = `${client.nombres || ''} ${client.apellidos || ''}`.trim() || client.name;
              if (fullName) nameVal = fullName;
              if (client.correo || client.email) emailVal = client.correo || client.email;
              const clientPhone = client.telefono || client.phone || client.celular || client.num_telefono;
              if (clientPhone) {
                rawPhoneVal = clientPhone;
              }
              if (client.direccion || client.address) {
                addressVal = client.direccion || client.address;
              }
            }
          } catch (err) {
            console.error('Error auto-filling client details:', err);
          }
        }
      }

      // 2. Fallback: Search previous orders matching email or name if phone or address is still missing
      if ((!rawPhoneVal || !addressVal) && (emailVal || nameVal)) {
        try {
          const allOrders = await dbService.getOrders();
          const targetEmail = (emailVal || '').toLowerCase();
          const targetName = (nameVal || '').toLowerCase();
          const userOrder = allOrders.find(o => {
            const oEmail = (o.customer_email || '').toLowerCase();
            const oName = (o.customer_name || '').toLowerCase();
            return (targetEmail && oEmail === targetEmail) || (targetName && oName === targetName);
          });

          if (userOrder) {
            if (!rawPhoneVal && userOrder.phone_number) {
              rawPhoneVal = userOrder.phone_number;
            }
            if (!addressVal && userOrder.address_text) {
              addressVal = userOrder.address_text;
            }
          }
        } catch (e) {}
      }

      // 3. Fallback: Saved checkout info from localStorage
      try {
        const savedCheckoutRaw = localStorage.getItem('copias_bellavista_customer_checkout_info');
        if (savedCheckoutRaw) {
          const parsed = JSON.parse(savedCheckoutRaw);
          if (!nameVal && parsed.name) nameVal = parsed.name;
          if (!emailVal && parsed.email) emailVal = parsed.email;
          if (!rawPhoneVal && parsed.phone) rawPhoneVal = parsed.phone;
          if (!addressVal && parsed.address) addressVal = parsed.address;
          if (!rawPhoneVal && parsed.countryPrefix) prefixVal = parsed.countryPrefix;
          if (parsed.deliveryMethod) setDeliveryMethod(parsed.deliveryMethod);
        }
      } catch (e) {}

      // 4. Parse country prefix and local number from rawPhoneVal
      let phoneNumVal = rawPhoneVal;
      if (rawPhoneVal) {
        const parsedTel = parsePhoneString(rawPhoneVal);
        if (parsedTel.prefix) prefixVal = parsedTel.prefix;
        if (parsedTel.number) phoneNumVal = parsedTel.number;
      }

      if (isMounted) {
        if (nameVal) setCustomerName(nameVal);
        if (emailVal) setCustomerEmail(emailVal);
        if (phoneNumVal) setCustomerPhone(phoneNumVal);
        if (addressVal) setAddress(addressVal);
        if (prefixVal) setCountryPrefix(prefixVal);
      }
    };

    loadCustomerData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser]);
  
  // Marketing states
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [availableCodes, setAvailableCodes] = useState<DiscountCode[]>([]);

  useEffect(() => {
    if (isOpen) {
      dbService.getLoyaltySettings().then(setLoyaltySettings);
      dbService.getDiscountCodes().then(codes => setAvailableCodes(codes.filter(c => c.is_active)));
    }
  }, [isOpen]);

  const handleApplyDiscount = () => {
    setDiscountError('');
    if (!discountInput.trim()) return;
    
    const code = availableCodes.find(c => c.code.toUpperCase() === discountInput.trim().toUpperCase());
    if (!code) {
      setDiscountError('Código de descuento no válido o inactivo.');
      return;
    }
    
    // Check usage limits and dates
    if (code.usage_limit_type === 'limited' && code.usage_limit && code.used_count >= code.usage_limit) {
      setDiscountError('Este código ha alcanzado su límite de usos.');
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (code.start_date && today < code.start_date) {
      setDiscountError('Este código aún no está activo.');
      return;
    }
    if (code.end_date && today > code.end_date) {
      setDiscountError('Este código ha expirado.');
      return;
    }

    setAppliedDiscount(code);
    setDiscountError('');
  };

  // Address suggestions and geolocation states
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [suggestionTimeout, setSuggestionTimeout] = useState<any>(null);

  // Global disabled methods settings
  const [disabledSettings, setDisabledSettings] = useState({
    delivery_b2c: true, // Default true (disabled)
    delivery_retiro: false,
    disable_coupon: true, // Default true (disabled)
    pay_pagomovil: false,
    pay_efectivo: false,
    pay_transferencia: false,
    pay_punto: false,
    pay_otras: false,
    pay_binance: false,
    pay_zelle: false
  });

  useEffect(() => {
    const loadSettings = () => {
      try {
        const saved = localStorage.getItem('copias_bellavista_disabled_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setDisabledSettings({
            delivery_b2c: parsed.delivery_b2c !== undefined ? parsed.delivery_b2c === true : true,
            delivery_retiro: parsed.delivery_retiro === true,
            disable_coupon: parsed.disable_coupon !== undefined ? parsed.disable_coupon === true : true,
            pay_pagomovil: parsed.pay_pagomovil === true,
            pay_efectivo: parsed.pay_efectivo === true,
            pay_transferencia: parsed.pay_transferencia === true,
            pay_punto: parsed.pay_punto === true,
            pay_otras: parsed.pay_otras === true,
            pay_binance: parsed.pay_binance === true,
            pay_zelle: parsed.pay_zelle === true
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadSettings();
    window.addEventListener('storage', loadSettings);
    window.addEventListener('bellavista_settings_updated', loadSettings);
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('bellavista_settings_updated', loadSettings);
    };
  }, []);

  useEffect(() => {
    if (disabledSettings.delivery_retiro && deliveryMethod === 'retiro') {
      setDeliveryMethod('b2c');
    } else if (disabledSettings.delivery_b2c && deliveryMethod === 'b2c') {
      setDeliveryMethod('retiro');
    }
  }, [disabledSettings, deliveryMethod]);

  useEffect(() => {
    const isPayDisabled = (pm: 'pagomovil' | 'efectivo' | 'transferencia' | 'binance' | 'zelle') => {
      if (pm === 'pagomovil' && disabledSettings.pay_pagomovil) return true;
      if (pm === 'efectivo' && disabledSettings.pay_efectivo) return true;
      if (pm === 'transferencia' && disabledSettings.pay_transferencia) return true;
      if (pm === 'binance' && disabledSettings.pay_binance) return true;
      if (pm === 'zelle' && disabledSettings.pay_zelle) return true;
      return false;
    };

    if (isPayDisabled(paymentMethod)) {
      if (!disabledSettings.pay_pagomovil) {
        setPaymentMethod('pagomovil');
      } else if (!disabledSettings.pay_efectivo) {
        setPaymentMethod('efectivo');
      } else if (!disabledSettings.pay_transferencia) {
        setPaymentMethod('transferencia');
      } else if (!disabledSettings.pay_binance) {
        setPaymentMethod('binance');
      } else if (!disabledSettings.pay_zelle) {
        setPaymentMethod('zelle');
      }
    }
  }, [disabledSettings, paymentMethod]);

  const countries = [
    { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
    { code: '+57', flag: '🇨🇴', name: 'Colombia' },
    { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
    { code: '+51', flag: '🇵🇪', name: 'Perú' },
    { code: '+56', flag: '🇨🇱', name: 'Chile' },
    { code: '+54', flag: '🇦🇷', name: 'Argentina' },
    { code: '+34', flag: '🇪🇸', name: 'España' },
    { code: '+1', flag: '🇺🇸', name: 'Estados Unidos' },
    { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  ];

  const handleAddressChange = (val: string) => {
    setAddress(val);
    
    if (suggestionTimeout) {
      clearTimeout(suggestionTimeout);
    }

    if (val.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=4&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'CopiasBellaVista-Applet/1.0'
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            const uniqueSuggestions: string[] = data.map((item: any) => item.display_name);
            setAddressSuggestions(uniqueSuggestions);
          }
        }
      } catch (err) {
        console.error("Error fetching address suggestions:", err);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 500);

    setSuggestionTimeout(timeout);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no está soportada por tu navegador.");
      return;
    }

    setIsLocating(true);
    setLocationStatus('idle');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'CopiasBellaVista-Applet/1.0'
              }
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data && data.display_name) {
              setAddress(data.display_name);
              setLocationStatus('success');
            } else {
              setAddress(`Ubicación: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
              setLocationStatus('success');
            }
          } else {
            setAddress(`Ubicación: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            setLocationStatus('success');
          }
        } catch (err) {
          console.error("Error doing reverse geocoding:", err);
          setAddress(`Ubicación: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          setLocationStatus('success');
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error("Error getting geolocation:", error);
        setLocationStatus('error');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Calculate totals
  const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => {
    const price = item.product.offer_price !== null ? item.product.offer_price : item.product.price;
    return acc + price * item.quantity;
  }, 0);

  let discountAmount = 0;
  if (appliedDiscount) {
    if (appliedDiscount.target_type === 'order') {
      if (!appliedDiscount.min_purchase_amount || cartSubtotal >= appliedDiscount.min_purchase_amount) {
        if (appliedDiscount.discount_type === 'percentage') {
          discountAmount = cartSubtotal * (appliedDiscount.discount_value / 100);
        } else {
          discountAmount = appliedDiscount.discount_value;
        }
      }
    } else if (appliedDiscount.target_type === 'specific_products' && appliedDiscount.target_products) {
      cartItems.forEach(item => {
        if (appliedDiscount.target_products?.includes(item.product.id)) {
          const itemPrice = item.product.offer_price !== null ? item.product.offer_price : item.product.price;
          const itemTotal = itemPrice * item.quantity;
          if (appliedDiscount.discount_type === 'percentage') {
            discountAmount += itemTotal * (appliedDiscount.discount_value / 100);
          } else {
            discountAmount += appliedDiscount.discount_value * item.quantity;
          }
        }
      });
    }
  }

  const totalPrice = Math.max(0, cartSubtotal - discountAmount);

  // Calculate loyalty points (disabled by default unless loyalty settings are active)
  let loyaltyPoints = 0;
  if (loyaltySettings?.is_active && loyaltySettings.amount_for_points > 0) {
    loyaltyPoints = Math.floor(totalPrice / loyaltySettings.amount_for_points) * loyaltySettings.points_per_amount;
  }

  // Helper to get product image
  const getProductImage = (productId: string) => {
    const found = productImages.find(img => img.product_id === productId);
    return found ? found.image_url : 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&q=80&w=150';
  };

  // WhatsApp Order Submission
  const handleConfirmOrder = async () => {
    if (!currentUser) {
      setFormError('Debes iniciar sesión con tu cuenta para procesar tu pedido.');
      if (onOpenLoginModal) {
        onOpenLoginModal();
      }
      return;
    }

    if (disabledSettings.delivery_retiro && disabledSettings.delivery_b2c) {
      setFormError('Lo sentimos, los pedidos y entregas de catálogo están temporalmente inhabilitados.');
      return;
    }
    if (disabledSettings.pay_pagomovil && disabledSettings.pay_efectivo && disabledSettings.pay_transferencia && disabledSettings.pay_binance && disabledSettings.pay_zelle) {
      setFormError('Lo sentimos, todos los métodos de pago en línea están temporalmente inhabilitados.');
      return;
    }

    if (!customerName.trim()) {
      setFormError('Por favor, ingresa tu nombre completo para continuar.');
      setIsOrderDataOpen(true);
      return;
    }
    if (!customerPhone.trim()) {
      setFormError('Por favor, ingresa tu número de teléfono para continuar.');
      setIsOrderDataOpen(true);
      return;
    }
    if (deliveryMethod === 'b2c' && !address.trim()) {
      setFormError('Por favor, ingresa tu dirección para la entrega a domicilio.');
      setIsOrderDataOpen(true);
      return;
    }

    if (disabledSettings.delivery_retiro && deliveryMethod === 'retiro') {
      setFormError('El método de entrega "Retiro en Tienda" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.delivery_b2c && deliveryMethod === 'b2c') {
      setFormError('El método de entrega "Envío a Domicilio" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.pay_pagomovil && paymentMethod === 'pagomovil') {
      setFormError('El método de pago "Pagomóvil" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.pay_efectivo && paymentMethod === 'efectivo') {
      setFormError('El método de pago "Efectivo" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.pay_transferencia && paymentMethod === 'transferencia') {
      setFormError('El método de pago "Transferencia Bancaria" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.pay_binance && paymentMethod === 'binance') {
      setFormError('El método de pago "Binance Pay" está temporalmente inhabilitado.');
      return;
    }
    if (disabledSettings.pay_zelle && paymentMethod === 'zelle') {
      setFormError('El método de pago "Zelle" está temporalmente inhabilitado.');
      return;
    }

    // Validation for cash payment
    if (paymentMethod === 'efectivo') {
      if (!paymentAmountWith.trim()) {
        setFormError('Por favor, indica con cuánto vas a pagar en efectivo.');
        return;
      }
      const amountNum = parseFloat(paymentAmountWith);
      if (isNaN(amountNum) || amountNum <= 0) {
        setFormError('Por favor, ingresa un monto válido.');
        return;
      }
      const convertedTotal = totalPrice * (currencyRates[activeCurrency] || 1);
      if (amountNum < convertedTotal) {
        setFormError(`El monto a pagar (${formatCurrency(amountNum / (currencyRates[activeCurrency] || 1), activeCurrency, currencyRates)}) no puede ser menor al total del pedido (${formatCurrency(totalPrice, activeCurrency, currencyRates)}).`);
        return;
      }
    }

    setFormError('');

    // Save customer checkout details to localStorage for future auto-fill
    try {
      localStorage.setItem('copias_bellavista_customer_checkout_info', JSON.stringify({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim(),
        countryPrefix,
        address: address.trim(),
        deliveryMethod
      }));
    } catch (e) {}

    const fullPhone = `${countryPrefix} ${customerPhone.trim()}`;
    let createdOrderId = '';
    let orderNumStr = '';

    // Try to save to Supabase
    try {
      const orderItems = cartItems.map(item => {
        const itemPrice = item.product.offer_price !== null ? item.product.offer_price : item.product.price;
        return {
          product_id: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          price: itemPrice
        };
      });

      const calculatedTotalsByCurrency: Record<string, number> = {
        USD: totalPrice,
        VES: parseFloat((totalPrice * (currencyRates.VES || 1)).toFixed(2)),
        EUR: parseFloat((totalPrice * (currencyRates.EUR || 1)).toFixed(2)),
        COP: parseFloat((totalPrice * (currencyRates.COP || 1)).toFixed(0))
      };

      const orderData = {
        customer_name: customerName.trim(),
        phone_number: fullPhone,
        customer_email: customerEmail.trim() || null,
        delivery_method: deliveryMethod,
        address_text: deliveryMethod === 'b2c' ? address.trim() : null,
        items: orderItems,
        total_price: totalPrice,
        status: 'pendiente',
        comments: comments.trim() || null,
        payment_method: paymentMethod,
        payment_amount_with: paymentMethod === 'efectivo' ? parseFloat(paymentAmountWith) : null,
        payment_status: 'pendiente',
        points: loyaltyPoints,
        discount_code: appliedDiscount ? appliedDiscount.code : null,
        discount_amount: discountAmount > 0 ? discountAmount : null,
        currency_code: activeCurrency,
        currency_rates_snapshot: currencyRates,
        totals_by_currency: calculatedTotalsByCurrency,
        bcv_rate: currencyRates.VES || getCachedCurrencyRates().VES
      };

      const created = await dbService.createOrder(orderData);
      if (created && created.id) {
        createdOrderId = created.id;
        localStorage.setItem('copias_bellavista_last_order_id', created.id);
        if (created.order_number) {
          orderNumStr = String(created.order_number).padStart(7, '0');
        }
        
        // Update discount usage count
        if (appliedDiscount && appliedDiscount.id) {
           await dbService.saveDiscountCode({
             id: appliedDiscount.id,
             used_count: (appliedDiscount.used_count || 0) + 1
           });
        }
        
        // Add points to customer
        if (loyaltyPoints > 0) {
           await dbService.addCustomerPoints(fullPhone, loyaltyPoints);
        }

        // Clean up purchased items from wishlist
        if (customerEmail.trim()) {
          try {
            for (const item of orderItems) {
              await dbService.removeFromWishlist(customerEmail.trim(), item.product_id);
            }
          } catch (wishlistErr) {
            console.error("Could not clean up items from wishlist:", wishlistErr);
          }
        }
      }
    } catch (e) {
      console.warn("Could not save order to Supabase. This might be because the table is not created yet or Supabase is not configured.", e);
      // We still proceed to send WhatsApp as it is the primary checkout flow!
    }

    if (!orderNumStr) {
      // Temporary sequential estimate or standard fallback starting with "0000001"
      orderNumStr = '0000001';
    }

    const phoneNumber = '584125043857'; // Business contact number in Barinitas
    
    // Construct message with reduced spacing between lines
    let message = `🛒 *NUEVO PEDIDO - COPIAS BELLA VISTA* 🛒\n`;
    message += `🆔 *Pedido N°:* #${orderNumStr}\n`;
    message += `👤 *Cliente:* ${customerName.trim()}\n`;
    message += `📞 *Teléfono:* ${fullPhone}\n`;
    if (customerEmail.trim()) {
      message += `✉️ *Correo:* ${customerEmail.trim()}\n`;
    }
    message += `📦 *Entrega:* ${deliveryMethod === 'retiro' ? 'Retiro en Tienda (Bella Vista, Barinitas)' : 'Envío a Domicilio'}\n`;
    if (deliveryMethod === 'b2c') {
      message += `📍 *Dirección:* ${address.trim()}\n`;
    }

    const methodLabels = {
      pagomovil: 'Pagomóvil',
      efectivo: 'Efectivo',
      transferencia: 'Transferencia Bancaria',
      binance: 'Binance Pay (USDT)',
      zelle: 'Zelle (USD)'
    };
    message += `💳 *Método de Pago:* ${methodLabels[paymentMethod]}\n`;

    if (paymentMethod === 'efectivo') {
      const payWith = parseFloat(paymentAmountWith);
      message += `💵 *Paga con:* ${formatCurrency(payWith, activeCurrency, currencyRates)} (Cambio: ${formatCurrency(payWith - totalPrice, activeCurrency, currencyRates)})\n`;
    }

    if (comments.trim()) {
      message += `📝 *Comentarios/Instrucciones:* ${comments.trim()}\n`;
    }

    if (loyaltyPoints > 0) {
      message += `🎁 *Puntos Ganados:* +${loyaltyPoints} pts\n`;
    }
    message += `---------------------------------------\n`;
    message += `📝 *Detalle del Pedido:*\n`;

    cartItems.forEach((item) => {
      const price = item.product.offer_price !== null ? item.product.offer_price : item.product.price;
      const formattedPrice = formatCurrency(price, activeCurrency, currencyRates);
      const itemSubtotal = formatCurrency(price * item.quantity, activeCurrency, currencyRates);
      
      message += `• ${item.quantity}x _${item.product.name}_ (SKU: ${item.product.sku}) - ${formattedPrice} c/u | Subtotal: ${itemSubtotal}\n`;
    });

    message += `---------------------------------------\n`;
    if (appliedDiscount) {
      message += `🏷️ *Subtotal:* ${formatCurrency(cartSubtotal, activeCurrency, currencyRates)}\n`;
      message += `🎟️ *Descuento aplicado:* ${appliedDiscount.code} (-${formatCurrency(discountAmount, activeCurrency, currencyRates)})\n`;
    }
    message += `💰 *TOTAL A PAGAR:* *${formatCurrency(totalPrice, activeCurrency, currencyRates)}*`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodedMessage}`;
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');

    // Notify parent to open the order tracking view
    if (onOrderSuccess && createdOrderId) {
      onOrderSuccess(createdOrderId);
    } else if (onOrderSuccess) {
      // Fallback if DB save failed
      onOrderSuccess('temp-last-order');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs cursor-pointer"
          />

          {/* Cart Panel Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col select-none border-l border-gray-200"
          >
            {/* Header */}
            <div className="bg-[#131921] text-white px-4 py-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#FF9900]" />
                <h3 className="font-bold text-base uppercase tracking-wider">Tu Carrito</h3>
                <span className="bg-[#FF9900] text-[#131921] text-[11px] font-black rounded-full px-2 py-0.5">
                  {totalItems}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCartScanner(true)}
                  className="p-1.5 bg-[#FF9900]/10 hover:bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/20 rounded-xl text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition"
                  title="Escanear Código de Barras"
                >
                  <Scan className="w-4 h-4" />
                  <span className="text-[10px]">Escanear</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showCartScanner && (
              <BarcodeScannerModal
                onClose={() => setShowCartScanner(false)}
                products={allProducts.length > 0 ? allProducts : cartItems.map(item => item.product)}
                onProductFound={(product) => {
                  if (onAddToCart) {
                    onAddToCart(product, 1);
                  } else {
                    const existing = cartItems.find(item => item.product.id === product.id);
                    if (existing) {
                      onUpdateQuantity(product.id, existing.quantity + 1);
                    }
                  }
                  setShowCartScanner(false);
                }}
              />
            )}

            {/* Cart Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#f8f9fa] text-left">
              {cartItems.length === 0 ? (
                <div className="h-60 flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-16 h-16 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 shadow-2xs">
                    <ShoppingCart className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">Tu carrito está vacío</h4>
                    <p className="text-xs text-gray-400 mt-1">Explora nuestro catálogo y agrega los productos que desees comprar.</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-[#FFD814] hover:bg-[#F7CA00] text-[#0F1111] border border-[#F2C200] rounded text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Seguir Comprando
                  </button>
                </div>
              ) : (
                <>
                  {/* Items list */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <h4 className="font-extrabold text-[11px] text-gray-500 uppercase tracking-wider">Artículos Seleccionados ({totalItems}):</h4>
                    </div>
                    
                    <div className="space-y-2">
                      {cartItems.map((item) => {
                        const itemPrice = item.product.offer_price !== null ? item.product.offer_price : item.product.price;
                        return (
                          <div 
                            key={item.product.id}
                            className="flex gap-2.5 bg-white border border-gray-200/90 rounded-xl p-2 hover:shadow-xs transition relative"
                          >
                            {/* Image */}
                            <div className="w-13 h-13 bg-white border border-gray-200 rounded-lg p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                              <img
                                src={getProductImage(item.product.id)}
                                alt={item.product.name}
                                className="max-h-full max-w-full object-contain mix-blend-multiply"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            {/* Info */}
                            <div className="flex-1 flex flex-col justify-between min-w-0 pr-5">
                              <div>
                                <h5 className="text-xs font-bold text-[#0F1111] truncate" title={item.product.name}>
                                  {item.product.name}
                                </h5>
                                <p className="text-[10px] text-gray-400 font-bold font-mono">SKU: {item.product.sku}</p>
                              </div>

                              <div className="flex items-center justify-between mt-1">
                                {/* Quantity Controls */}
                                <div className="flex items-center border border-gray-300 rounded bg-gray-50 shrink-0">
                                  <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                                    className="px-1.5 py-0.5 text-gray-600 hover:text-gray-900 font-black text-xs cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <CartQtyInput 
                                    initialQty={item.quantity}
                                    stock={item.product.stock}
                                    onQtyChange={(newQty) => onUpdateQuantity(item.product.id, newQty)}
                                  />
                                  <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                                    className="px-1.5 py-0.5 text-gray-600 hover:text-gray-900 font-black text-xs cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>

                                {/* Price */}
                                <span className="text-xs font-black text-[#0F1111]">
                                  {formatCurrency(itemPrice * item.quantity, activeCurrency, currencyRates)}
                                </span>
                              </div>
                            </div>

                            {/* Delete Trash Button */}
                            <button
                              onClick={() => onRemoveItem(item.product.id)}
                              className="absolute top-2 right-2 text-gray-400 hover:text-red-600 transition cursor-pointer p-0.5"
                              title="Eliminar artículo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Customer Information Form & Checkout options (Only if logged in) */}
                  {!currentUser ? (
                    <div className="p-3 bg-[#fffdf5] border border-amber-300/80 rounded-xl text-left shadow-2xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
                        <Lock className="w-4 h-4 text-[#FF9900] shrink-0" />
                        <span>ACCESO REQUERIDO PARA REALIZAR PEDIDO</span>
                      </div>
                      <p className="text-[11px] text-amber-900 font-medium leading-tight">
                        Inicia sesión con tu cuenta para configurar la dirección de entrega, seleccionar método de pago y procesar tu pedido.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenLoginModal) onOpenLoginModal();
                        }}
                        className="w-full py-2.5 px-3 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] font-black text-xs uppercase tracking-wider rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 duration-150"
                      >
                        <User className="w-4 h-4 fill-[#131921]" />
                        <span>INICIAR SESIÓN / REGISTRARSE</span>
                      </button>
                    </div>
                  ) : (
                    <div className="border border-gray-200/90 rounded-xl overflow-hidden bg-white shadow-2xs">
                      {/* Collapsible Header */}
                      <button
                        type="button"
                        onClick={() => setIsOrderDataOpen(!isOrderDataOpen)}
                        className="w-full px-3 py-2 bg-gray-100/80 hover:bg-gray-200/60 transition flex items-center justify-between border-b border-gray-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-extrabold text-xs text-[#0F1111] uppercase tracking-wider">DATOS DEL PEDIDO</span>
                          {!isOrderDataOpen && (
                            <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                              {customerName ? customerName.split(' ')[0] : 'Completo'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs font-bold">
                          <span className="text-[10px] text-gray-500 font-semibold uppercase">
                            {isOrderDataOpen ? 'Ocultar' : 'Desplegar / Editar'}
                          </span>
                          {isOrderDataOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-700" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-700" />
                          )}
                        </div>
                      </button>

                      {/* Compact Summary when Collapsed */}
                      {!isOrderDataOpen && (
                        <div 
                          onClick={() => setIsOrderDataOpen(true)}
                          className="p-2.5 bg-white text-xs text-gray-700 space-y-1 cursor-pointer hover:bg-amber-50/30 transition"
                        >
                          <div className="flex justify-between items-center text-[11px] font-bold text-gray-800">
                            <span className="truncate">👤 {customerName || 'Sin Nombre'}</span>
                            <span className="text-gray-500 font-mono shrink-0 ml-2">{countryPrefix} {customerPhone || 'Sin tel'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">
                              📦 {deliveryMethod === 'b2c' ? 'A Domicilio' : 'Retiro Tienda'}
                            </span>
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 uppercase">
                              💳 {paymentMethod}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Full Form when Expanded */}
                      <AnimatePresence>
                        {isOrderDataOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="p-3.5 space-y-3 bg-white border-t border-gray-100"
                          >
                            {formError && (
                              <div className="flex items-start gap-1.5 p-2 bg-red-50 border border-red-200 text-red-600 rounded text-xs font-medium">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{formError}</span>
                              </div>
                            )}

                            <div className="space-y-3.5">
                              {/* Name input */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Nombre Completo *
                                </label>
                                <input
                                  type="text"
                                  value={customerName}
                                  onChange={(e) => setCustomerName(e.target.value)}
                                  placeholder="Ej. María Pérez"
                                  className="w-full px-3 py-1.5 text-xs text-[#0F1111] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                                />
                              </div>

                              {/* Phone input with country selector */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Número de Teléfono *
                                </label>
                                <div className="flex gap-1.5">
                                  <div className="relative shrink-0">
                                    <select
                                      value={countryPrefix}
                                      onChange={(e) => setCountryPrefix(e.target.value)}
                                      className="h-full px-2.5 py-1.5 text-xs text-[#0F1111] bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900] appearance-none cursor-pointer pr-7 font-extrabold"
                                    >
                                      {countries.map((c) => (
                                        <option key={c.code} value={c.code}>
                                          {c.flag} {c.code}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-500">
                                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                                      </svg>
                                    </div>
                                  </div>
                                  <input
                                    type="tel"
                                    value={customerPhone}
                                    onChange={(e) => {
                                      setCustomerPhone(e.target.value.replace(/[^\d\s-]/g, ''));
                                    }}
                                    placeholder="Ej. 412-1234567"
                                    className="flex-1 min-w-0 px-3 py-1.5 text-xs text-[#0F1111] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                                  />
                                </div>
                              </div>

                              {/* Email input */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Correo Electrónico
                                </label>
                                <input
                                  type="email"
                                  value={customerEmail}
                                  onChange={(e) => setCustomerEmail(e.target.value)}
                                  placeholder="Ej. maria@ejemplo.com"
                                  className="w-full px-3 py-1.5 text-xs text-[#0F1111] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                                />
                              </div>

                              {/* Delivery Option */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Método de Entrega *
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                  {!disabledSettings.delivery_retiro && (
                                    <button
                                      type="button"
                                      onClick={() => setDeliveryMethod('retiro')}
                                      className={`px-3 py-1.5 text-xs font-bold rounded border transition cursor-pointer text-center ${
                                        deliveryMethod === 'retiro'
                                          ? 'bg-[#FF9900]/10 border-[#FF9900] text-[#131921]'
                                          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                      }`}
                                    >
                                      Retiro Tienda
                                    </button>
                                  )}
                                  {!disabledSettings.delivery_b2c && (
                                    <button
                                      type="button"
                                      onClick={() => setDeliveryMethod('b2c')}
                                      className={`px-3 py-1.5 text-xs font-bold rounded border transition cursor-pointer text-center ${
                                        deliveryMethod === 'b2c'
                                          ? 'bg-[#FF9900]/10 border-[#FF9900] text-[#131921]'
                                          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                      }`}
                                    >
                                      A Domicilio
                                    </button>
                                  )}
                                  {disabledSettings.delivery_retiro && disabledSettings.delivery_b2c && (
                                    <div className="col-span-2 p-2.5 bg-rose-50 border border-rose-150 text-rose-800 text-center text-xs font-bold rounded-lg">
                                      ⚠️ Entregas y retiros de catálogo deshabilitados.
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Conditional address field with autocomplete & geolocation */}
                              {deliveryMethod === 'b2c' && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="space-y-1.5"
                                >
                                  <div className="flex justify-between items-center">
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide">
                                      Dirección de Entrega *
                                    </label>
                                    
                                    <button
                                      type="button"
                                      onClick={handleUseCurrentLocation}
                                      disabled={isLocating}
                                      className="inline-flex items-center gap-1 text-[9px] font-black text-[#FF9900] hover:text-[#e68a00] uppercase tracking-wider transition cursor-pointer disabled:opacity-60"
                                    >
                                      {isLocating ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Navigation className="w-3 h-3 text-[#FF9900] animate-pulse" />
                                      )}
                                      {isLocating ? 'Buscando...' : 'Usar mi ubicación actual'}
                                    </button>
                                  </div>

                                  <div className="relative">
                                    <textarea
                                      value={address}
                                      onChange={(e) => handleAddressChange(e.target.value)}
                                      placeholder="Ej. Calle Principal, Sector Bella Vista, Casa Nro. 24"
                                      rows={2}
                                      className="w-full px-3 py-1.5 text-xs text-[#0F1111] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900] resize-none"
                                    />

                                    {addressSuggestions.length > 0 && (
                                      <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg text-left divide-y divide-gray-100">
                                        {addressSuggestions.map((suggestion, index) => (
                                          <button
                                            key={index}
                                            type="button"
                                            onClick={() => {
                                              setAddress(suggestion);
                                              setAddressSuggestions([]);
                                            }}
                                            className="w-full px-3 py-2 text-[10px] text-gray-700 hover:bg-amber-50 text-left truncate block font-medium transition cursor-pointer"
                                          >
                                            📍 {suggestion}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {isLoadingSuggestions && (
                                      <div className="absolute right-3.5 top-2.5">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                      </div>
                                    )}
                                  </div>

                                  {locationStatus === 'success' && (
                                    <p className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                      ✓ Dirección cargada exitosamente mediante GPS.
                                    </p>
                                  )}
                                  {locationStatus === 'error' && (
                                    <p className="text-[9px] text-rose-600 font-bold flex items-center gap-1">
                                      ⚠ Permiso GPS denegado o error. Escribe tu dirección manualmente.
                                    </p>
                                  )}
                                </motion.div>
                              )}

                              {/* Comments Input */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Comentarios u Observaciones (Opcional)
                                </label>
                                <textarea
                                  value={comments}
                                  onChange={(e) => setComments(e.target.value)}
                                  placeholder="Instrucciones especiales para tu pedido o entrega..."
                                  rows={2}
                                  className="w-full px-3 py-1.5 text-xs text-[#0F1111] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900] resize-none font-medium"
                                />
                              </div>

                              {/* Payment Method Dropdown */}
                              <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">
                                  Método de Pago *
                                </label>
                                <select
                                  value={paymentMethod}
                                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                                  className="w-full px-3 py-2 text-xs text-[#0F1111] bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#FF9900] cursor-pointer font-bold"
                                >
                                  {!disabledSettings.pay_pagomovil && <option value="pagomovil">Pagomóvil</option>}
                                  {!disabledSettings.pay_efectivo && <option value="efectivo">Efectivo (USD / Bs)</option>}
                                  {!disabledSettings.pay_transferencia && <option value="transferencia">Transferencia Bancaria</option>}
                                  {!disabledSettings.pay_binance && <option value="binance">Binance Pay (USDT)</option>}
                                  {!disabledSettings.pay_zelle && <option value="zelle">Zelle (USD)</option>}
                                  {disabledSettings.pay_pagomovil && disabledSettings.pay_efectivo && disabledSettings.pay_transferencia && disabledSettings.pay_binance && disabledSettings.pay_zelle && (
                                    <option value="">⚠️ No hay métodos de pago habilitados</option>
                                  )}
                                </select>
                              </div>

                              {/* Dynamic Payment Instructions */}
                              <AnimatePresence mode="wait">
                                {(paymentMethod === 'pagomovil' || paymentMethod === 'transferencia') && (
                                  <motion.div
                                    key="bank-instructions"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="p-3 bg-amber-50 border border-amber-200 rounded text-left space-y-1"
                                  >
                                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                                      Instrucciones de Pago ({paymentMethod === 'pagomovil' ? 'Pagomóvil' : 'Transferencia'})
                                    </p>
                                    <p className="text-xs text-amber-950 font-bold leading-relaxed">
                                      Por favor realice el pago a los siguientes datos:
                                    </p>
                                    <div className="text-[11px] text-amber-950 font-medium space-y-0.5 mt-1 bg-white/60 p-2 rounded border border-amber-100">
                                      <div>🏦 <strong className="font-extrabold">Banco:</strong> Banco Banesco</div>
                                      <div>🆔 <strong className="font-extrabold">Cédula:</strong> V-12.206.392</div>
                                      <div>📞 <strong className="font-extrabold">Teléfono:</strong> 0412-504.38.57</div>
                                      <div className="text-[9px] pt-1 text-amber-800 font-bold">⚠️ Guarde el comprobante de pago para enviarlo adjunto por WhatsApp.</div>
                                    </div>
                                  </motion.div>
                                )}

                                {paymentMethod === 'binance' && (
                                  <motion.div
                                    key="binance-instructions"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="p-3 bg-amber-50 border border-amber-200 rounded text-left space-y-1"
                                  >
                                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                                      Instrucciones de Pago Binance Pay (USDT)
                                    </p>
                                    <p className="text-xs text-amber-950 font-bold leading-relaxed">
                                      Por favor realice su transferencia a la siguiente cuenta Binance:
                                    </p>
                                    <div className="text-[11px] text-amber-950 font-medium space-y-0.5 mt-1 bg-white/60 p-2 rounded border border-amber-100">
                                      <div>🆔 <strong className="font-extrabold">Binance ID:</strong> 827194635</div>
                                      <div>✉️ <strong className="font-extrabold">Correo:</strong> pagos.bellavista@gmail.com</div>
                                      <div>👤 <strong className="font-extrabold">Beneficiario:</strong> Copias Bella Vista</div>
                                      <div className="text-[9px] pt-1 text-amber-800 font-bold">⚠️ Guarde su captura de pago con ID de transacción para enviarla por WhatsApp.</div>
                                    </div>
                                  </motion.div>
                                )}

                                {paymentMethod === 'zelle' && (
                                  <motion.div
                                    key="zelle-instructions"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="p-3 bg-amber-50 border border-amber-200 rounded text-left space-y-1"
                                  >
                                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                                      Instrucciones de Pago Zelle (USD)
                                    </p>
                                    <p className="text-xs text-amber-950 font-bold leading-relaxed">
                                      Por favor realice el pago Zelle a la siguiente cuenta:
                                    </p>
                                    <div className="text-[11px] text-amber-950 font-medium space-y-0.5 mt-1 bg-white/60 p-2 rounded border border-amber-100">
                                      <div>✉️ <strong className="font-extrabold">Correo:</strong> zelle.bellavista@gmail.com</div>
                                      <div>👤 <strong className="font-extrabold">Beneficiario:</strong> Pedro España</div>
                                      <div className="text-[9px] pt-1 text-amber-800 font-bold">⚠️ Guarde el capture o comprobante del pago para enviarlo adjunto por WhatsApp.</div>
                                    </div>
                                  </motion.div>
                                )}

                                {paymentMethod === 'efectivo' && (
                                  <motion.div
                                    key="cash-instructions"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="p-3 bg-blue-50 border border-blue-200 rounded text-left space-y-2.5"
                                  >
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-black text-blue-800 uppercase tracking-wider">
                                        Pago en Efectivo
                                      </p>
                                      <p className="text-xs text-blue-950 font-bold">
                                        Indica el monto exacto del billete con el que vas a pagar para prepararte el cambio:
                                      </p>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-blue-950 font-extrabold">A pagar con ({CURRENCIES[activeCurrency].symbol}):</span>
                                      <input
                                        type="number"
                                        min={Math.ceil(totalPrice * (currencyRates[activeCurrency] || 1))}
                                        step="any"
                                        value={paymentAmountWith}
                                        onChange={(e) => setPaymentAmountWith(e.target.value)}
                                        placeholder={`Mínimo ${(totalPrice * (currencyRates[activeCurrency] || 1)).toFixed(activeCurrency === 'COP' ? 0 : 2)}`}
                                        className="w-32 px-2 py-1 bg-white border border-blue-300 rounded text-xs font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                    </div>

                                    {parseFloat(paymentAmountWith) > (totalPrice * (currencyRates[activeCurrency] || 1)) && (
                                      <p className="text-[10px] text-blue-800 font-extrabold">
                                        💵 Tu cambio estimado será de: <span className="text-emerald-600 font-black">{formatCurrency((parseFloat(paymentAmountWith) - (totalPrice * (currencyRates[activeCurrency] || 1))) / (currencyRates[activeCurrency] || 1), activeCurrency, currencyRates)}</span>
                                      </p>
                                    )}

                                    <div className="text-[10px] text-blue-800 font-bold bg-white/60 p-1.5 rounded border border-blue-100 flex items-center gap-1.5">
                                      ⚠️ <span className="uppercase tracking-wide font-black text-blue-[#FF9900]">Nota:</span> Los billetes deben estar en buen estado.
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Summary & Order Button */}
            {cartItems.length > 0 && (
              <div className="border-t border-gray-200 p-3 space-y-2 bg-white shrink-0 shadow-xs">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-500 text-xs font-medium">
                    <span>Total artículos:</span>
                    <span className="font-bold text-gray-800">{totalItems}</span>
                  </div>
                  
                  {/* Discount Code Section */}
                  {!disabledSettings.disable_coupon && (
                    <div className="pt-1.5 border-t border-gray-100">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Código de descuento"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                          disabled={!!appliedDiscount}
                        />
                        {appliedDiscount ? (
                          <button
                            onClick={() => {
                              setAppliedDiscount(null);
                              setDiscountInput('');
                            }}
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded cursor-pointer transition"
                          >
                            Quitar
                          </button>
                        ) : (
                          <button
                            onClick={handleApplyDiscount}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded cursor-pointer transition"
                          >
                            Aplicar
                          </button>
                        )}
                      </div>
                      {discountError && <p className="text-[10px] text-red-500 font-bold mt-0.5">{discountError}</p>}
                      {appliedDiscount && (
                         <p className="text-[10px] text-green-600 font-bold mt-0.5">¡Código "{appliedDiscount.code}" aplicado! (-{appliedDiscount.discount_type === 'percentage' ? appliedDiscount.discount_value + '%' : formatCurrency(appliedDiscount.discount_value, activeCurrency, currencyRates)})</p>
                      )}
                    </div>
                  )}
                  
                  {appliedDiscount && (
                    <div className="flex justify-between text-gray-500 text-xs border-t border-gray-100 pt-1">
                      <span>Subtotal:</span>
                      <span className="font-bold line-through">{formatCurrency(cartSubtotal, activeCurrency, currencyRates)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-baseline border-t border-gray-100 pt-1">
                    <span className="font-bold text-[#0F1111] text-xs">Total a Pagar:</span>
                    <span className="text-lg font-black text-[#0F1111]">
                      {formatCurrency(totalPrice, activeCurrency, currencyRates)}
                    </span>
                  </div>
                  <p className="text-[9px] text-gray-400 font-bold text-center uppercase tracking-wide">
                    • Pago calculado al cambio oficial de la tasa de referencia •
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  <button
                    onClick={onClearCart}
                    className="py-2.5 px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-full transition cursor-pointer flex items-center justify-center gap-1"
                    title="Vaciar carrito"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar</span>
                  </button>

                  <button
                    onClick={() => {
                      if (!currentUser) {
                        onOpenLoginModal?.();
                      } else {
                        handleConfirmOrder();
                      }
                    }}
                    className="btn-primary-pill col-span-2 py-2.5 text-xs font-bold tracking-wider shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95 duration-100"
                  >
                    {!currentUser ? (
                      <>
                        <User className="w-4 h-4 shrink-0 text-white" />
                        <span className="truncate">INICIAR SESIÓN PARA PEDIR</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4 shrink-0 text-white" />
                        <span>CONFIRMAR PEDIDO ({formatCurrency(totalPrice, activeCurrency, currencyRates)})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
