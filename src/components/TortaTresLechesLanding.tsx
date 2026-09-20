/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Beautiful Premium Landing Page for "Torta Tres Leches Choco Arequipe Porción Individual"
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, ShoppingCart, Star, Heart, Award, Sparkles, Utensils, 
  Layers, Check, Share2, Info, ArrowRight, ShieldCheck, Clock,
  MessageCircle, Barcode, HeartHandshake, Zap
} from 'lucide-react';
import { Product, Category } from '../types';
import { dbService } from '../lib/supabase.ts';
import { CurrencyCode, formatCurrency } from '../lib/currency';

interface TortaTresLechesLandingProps {
  products: Product[];
  categories: Category[];
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  onAddToCart: (product: Product, quantity: number) => void;
  onClose: () => void;
  onRefreshProducts: () => Promise<void>;
  onOpenCart: () => void;
}

export default function TortaTresLechesLanding({
  products,
  categories,
  activeCurrency,
  currencyRates,
  onAddToCart,
  onClose,
  onRefreshProducts,
  onOpenCart
}: TortaTresLechesLandingProps) {
  // Try to find the actual product in the list
  const existingProduct = products.find(p => 
    p && p.name && typeof p.name === 'string' && p.name.toLowerCase().includes('tres leches') && 
    (p.name.toLowerCase().includes('choco') || p.name.toLowerCase().includes('arequipe'))
  ) || products.find(p => p && p.sku === 'TORTA-3L-CA');

  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  
  // Toppings selection
  const [toppings, setToppings] = useState({
    extraChocolate: false,
    dobleArequipe: false,
    almendras: false,
    doblePorcion: false
  });

  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'details' | 'ingredients' | 'reviews'>('details');
  const [liked, setLiked] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState([
    { id: 1, author: 'Valeria M.', rating: 5, text: 'Es la mejor tres leches de chocolate que he probado en San Cristóbal. Súper húmeda y el arequipe es de otro mundo.', date: 'Hace 2 días' },
    { id: 2, author: 'Carlos D.', rating: 5, text: 'La porción individual es bastante generosa. Me encanta que tenga trozos de chocolate rallado arriba. Excelente relación calidad/precio.', date: 'Hace 1 semana' },
    { id: 3, author: 'María Camila R.', rating: 4, text: 'Deliciosa e irresistible. El toque de cacao en el bizcocho equilibra perfectamente el dulce.', date: 'Hace 2 semanas' }
  ]);

  const [newReviewName, setNewReviewName] = useState('');
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const basePriceUSD = 3.50; // Base price for the premium dessert in USD

  // Calculate customized price in USD
  const getCustomizedPriceUSD = () => {
    let total = basePriceUSD;
    if (toppings.extraChocolate) total += 0.50;
    if (toppings.dobleArequipe) total += 0.75;
    if (toppings.almendras) total += 1.00;
    if (toppings.doblePorcion) total += 2.50;
    return total;
  };

  const totalPriceUSD = getCustomizedPriceUSD();

  // Create the product in database if it doesn't exist
  const handleAutoCreateProduct = async () => {
    setIsCreatingProduct(true);
    try {
      // Find "Postres" category or fall back
      const postresCat = categories.find(c => c && c.name && typeof c.name === 'string' && c.name.toLowerCase().includes('postre')) || categories[0];
      const categoryId = postresCat ? postresCat.id : 'c5fd6476-9639-4cd6-af3e-8515f366fd07';

      const newProd = {
        sku: 'TORTA-3L-CA',
        name: 'Torta Tres Leches Choco Arequipe Porción Individual',
        slug: 'torta-tres-leches-choco-arequipe-porcion-individual',
        description: 'Nuestra mítica Torta Tres Leches, elaborada con bizcochuelo esponjoso de cacao premium, bañada en una rica infusión artesanal de tres leches de cacao, coronada con hilos abundantes de dulce de leche (arequipe) y lluvia de chocolate semidulce.',
        price: basePriceUSD,
        offer_price: null,
        stock: 50,
        category_id: categoryId,
        brand_id: products[0]?.brand_id || 'no-brand', // fall back to any or default
        featured: true,
        active: true,
        technical_sheet_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587',
        barcode_qr: '7598888123456'
      };

      const created = await dbService.createProduct(newProd);
      setCreatedProduct(created);
      await onRefreshProducts();
      alert('¡Producto creado con éxito en el catálogo de postres!');
    } catch (err: any) {
      console.error('Error creating product:', err);
      alert('Error al registrar el producto en la base de datos: ' + err.message);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  // Add the customized product to shopping cart
  const handleOrder = () => {
    const productToUse = existingProduct || createdProduct;

    // To construct the custom product variant matching the selected toppings
    const selectedToppingNames = [];
    if (toppings.extraChocolate) selectedToppingNames.push('Extra Chocolate');
    if (toppings.dobleArequipe) selectedToppingNames.push('Doble Arequipe');
    if (toppings.almendras) selectedToppingNames.push('Almendras');
    if (toppings.doblePorcion) selectedToppingNames.push('Porción Doble');

    const customizationSuffix = selectedToppingNames.length > 0 
      ? ` (${selectedToppingNames.join(', ')})` 
      : '';

    const customProduct: Product = {
      id: productToUse?.id || 'temp-torta-3l',
      sku: productToUse?.sku || 'TORTA-3L-CA',
      name: `Torta Tres Leches Choco Arequipe${customizationSuffix}`,
      slug: productToUse?.slug || 'torta-tres-leches-choco-arequipe',
      description: productToUse?.description || 'Torta tres leches choco arequipe individual',
      price: totalPriceUSD, // Pass customized price
      offer_price: null,
      stock: productToUse?.stock || 100,
      category_id: productToUse?.category_id || 'c5fd6476-9639-4cd6-af3e-8515f366fd07',
      brand_id: productToUse?.brand_id || 'default',
      featured: true,
      active: true,
      technical_sheet_url: productToUse?.technical_sheet_url || null,
      barcode_qr: productToUse?.barcode_qr || '7598888123456'
    };

    onAddToCart(customProduct, quantity);
  };

  const handleShare = () => {
    setCopiedLink(true);
    navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewName.trim() || !newReviewText.trim()) return;

    const newRev = {
      id: reviews.length + 1,
      author: newReviewName,
      rating: newReviewRating,
      text: newReviewText,
      date: 'Hace un momento'
    };

    setReviews([newRev, ...reviews]);
    setNewReviewName('');
    setNewReviewText('');
    setReviewSuccess(true);
    setTimeout(() => setReviewSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-amber-950/40 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[#FCFBF7] w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-amber-900/10 text-gray-800"
      >
        {/* Absolute Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/80 hover:bg-white text-amber-950 shadow-md hover:scale-105 active:scale-95 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT COLUMN: Premium product media showcase */}
          <div className="lg:col-span-5 bg-gradient-to-b from-amber-950 to-[#3D2314] text-white p-6 md:p-8 flex flex-col justify-between relative min-h-[400px] lg:min-h-full">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
            
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/30 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                <Sparkles className="w-3 h-3 text-[#FF9900]" /> Edición Gourmet Individual
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-black tracking-tight leading-none text-[#FFF5EA]">
                Tres Leches <span className="block text-[#FF9900] mt-1">Choco Arequipe</span>
              </h2>
              <p className="mt-3 text-sm text-gray-300 font-medium leading-relaxed max-w-sm">
                La mítica receta tradicional venezolana reinventada con cacao premium y la dulzura inconfundible del arequipe.
              </p>
            </div>

            {/* Immersive high quality product photo */}
            <div className="my-6 relative rounded-2xl overflow-hidden shadow-2xl aspect-square bg-amber-900/30 max-w-sm mx-auto w-full group border border-white/10">
              <img 
                src="https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=600" 
                alt="Torta Tres Leches Choco Arequipe" 
                className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
              />
              <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full font-mono flex items-center gap-1">
                <Barcode className="w-3 h-3 text-[#FF9900]" /> SKU: TORTA-3L-CA
              </div>
            </div>

            {/* Micro badges */}
            <div className="grid grid-cols-3 gap-2 text-center relative z-10 pt-4 border-t border-white/10">
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <Layers className="w-4 h-4 text-[#FF9900] mx-auto mb-1" />
                <span className="block text-[9px] font-bold text-gray-300 uppercase tracking-wide">3 Capas</span>
              </div>
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <Utensils className="w-4 h-4 text-[#FF9900] mx-auto mb-1" />
                <span className="block text-[9px] font-bold text-gray-300 uppercase tracking-wide">Premium</span>
              </div>
              <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                <Award className="w-4 h-4 text-[#FF9900] mx-auto mb-1" />
                <span className="block text-[9px] font-bold text-gray-300 uppercase tracking-wide">100% Artesanal</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive details and shopping experience */}
          <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
            <div>
              {/* Header section */}
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="text-left">
                  <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">San Cristóbal, Táchira</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex items-center text-[#FF9900]">
                      <Star className="w-4 h-4 fill-current" />
                      <Star className="w-4 h-4 fill-current" />
                      <Star className="w-4 h-4 fill-current" />
                      <Star className="w-4 h-4 fill-current" />
                      <Star className="w-4 h-4 fill-current" />
                    </div>
                    <span className="text-xs font-black text-gray-700">5.0 ({reviews.length} reviews)</span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setLiked(!liked)}
                    className={`p-2 rounded-full border transition cursor-pointer ${liked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                  >
                    <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                  </button>
                  <button 
                    onClick={handleShare}
                    className="p-2 rounded-full bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition cursor-pointer"
                    title="Copiar enlace del producto"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Tabs navigation */}
              <div className="flex border-b border-gray-200 mt-5 text-xs font-bold uppercase tracking-wider">
                <button 
                  onClick={() => setActiveTab('details')}
                  className={`pb-2.5 px-4 border-b-2 transition ${activeTab === 'details' ? 'border-amber-900 text-amber-950 font-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Descripción
                </button>
                <button 
                  onClick={() => setActiveTab('ingredients')}
                  className={`pb-2.5 px-4 border-b-2 transition ${activeTab === 'ingredients' ? 'border-amber-900 text-amber-950 font-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Ingredientes & Preparación
                </button>
                <button 
                  onClick={() => setActiveTab('reviews')}
                  className={`pb-2.5 px-4 border-b-2 transition ${activeTab === 'reviews' ? 'border-amber-900 text-amber-950 font-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Reviews ({reviews.length})
                </button>
              </div>

              {/* TAB CONTENT: DETAILS */}
              {activeTab === 'details' && (
                <div className="mt-5 text-left space-y-4 animate-fadeIn text-sm text-gray-600 leading-relaxed">
                  <p>
                    Experimenta el postre que está redefiniendo la repostería local. Un tierno y aireado bizcochuelo batido a punto de nieve con cacao puro de exportación, reposado durante 12 horas en una infusión densa de tres leches enriquecida con cacao venezolano.
                  </p>
                  
                  <div className="bg-amber-500/5 rounded-2xl p-4 border border-amber-500/10">
                    <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      ¿Por qué elegir nuestra porción individual?
                    </h4>
                    <ul className="space-y-1.5 text-xs text-amber-900 font-semibold">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Humedad perfecta garantizada, cada gota es gloria pura.
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Arequipe real (dulce de leche artesanal, no comercial).
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Empaque premium hermético individual, perfecto para regalo o delivery.
                      </li>
                    </ul>
                  </div>

                  {/* Toppings Selection Header */}
                  <div className="pt-2">
                    <h4 className="font-black text-gray-800 text-xs uppercase tracking-widest mb-3">
                      Personaliza tu Porción Extra (Toppings)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${toppings.extraChocolate ? 'bg-amber-50 border-amber-600' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={toppings.extraChocolate} 
                            onChange={(e) => setToppings({...toppings, extraChocolate: e.target.checked})}
                            className="rounded text-amber-800 focus:ring-amber-800 w-4 h-4 accent-amber-800"
                          />
                          <div className="text-left">
                            <span className="block text-xs font-bold text-gray-800">Lluvia de Chocolate Extra</span>
                            <span className="text-[10px] text-gray-400">Ralladura fina de chocolate negro</span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-amber-800">+{formatCurrency(0.50, activeCurrency, currencyRates)}</span>
                      </label>

                      <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${toppings.dobleArequipe ? 'bg-amber-50 border-amber-600' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={toppings.dobleArequipe} 
                            onChange={(e) => setToppings({...toppings, dobleArequipe: e.target.checked})}
                            className="rounded text-amber-800 focus:ring-amber-800 w-4 h-4 accent-amber-800"
                          />
                          <div className="text-left">
                            <span className="block text-xs font-bold text-gray-800">Doble Arequipe Bañado</span>
                            <span className="text-[10px] text-gray-400">Hilos adicionales bañados</span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-amber-800">+{formatCurrency(0.75, activeCurrency, currencyRates)}</span>
                      </label>

                      <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${toppings.almendras ? 'bg-amber-50 border-amber-600' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={toppings.almendras} 
                            onChange={(e) => setToppings({...toppings, almendras: e.target.checked})}
                            className="rounded text-amber-800 focus:ring-amber-800 w-4 h-4 accent-amber-800"
                          />
                          <div className="text-left">
                            <span className="block text-xs font-bold text-gray-800">Almendras Tostadas</span>
                            <span className="text-[10px] text-gray-400">Laminadas y crujientes</span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-amber-800">+{formatCurrency(1.00, activeCurrency, currencyRates)}</span>
                      </label>

                      <label className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${toppings.doblePorcion ? 'bg-amber-50 border-amber-600' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={toppings.doblePorcion} 
                            onChange={(e) => setToppings({...toppings, doblePorcion: e.target.checked})}
                            className="rounded text-amber-800 focus:ring-amber-800 w-4 h-4 accent-amber-800"
                          />
                          <div className="text-left">
                            <span className="block text-xs font-bold text-gray-800">Porción Familiar Doble</span>
                            <span className="text-[10px] text-gray-400">Bandeja para dos personas</span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-amber-800">+{formatCurrency(2.50, activeCurrency, currencyRates)}</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: INGREDIENTS & PREPARATION */}
              {activeTab === 'ingredients' && (
                <div className="mt-5 text-left space-y-4 animate-fadeIn text-sm text-gray-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl">
                      <h5 className="font-extrabold text-gray-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Layers className="w-4 h-4 text-[#FF9900]" /> Composición de Capas
                      </h5>
                      <ul className="space-y-1.5 text-xs font-semibold text-gray-600">
                        <li>🍰 <strong className="text-gray-800">Base:</strong> Bizcochuelo de cacao 100% natural, horneado lentamente para lograr la máxima capacidad de absorción.</li>
                        <li>🥛 <strong className="text-gray-800">Bojo húmedo:</strong> Mezcla balanceada de leche condensada artesanal, crema de leche fresca y leche evaporada infusionada.</li>
                        <li>🍯 <strong className="text-gray-800">Topping Arequipe:</strong> Dulce de leche cocido tradicional con brillo dorado y textura cremosa.</li>
                        <li>🍫 <strong className="text-gray-800">Decorado:</strong> Finos rizos de chocolate rallado semi-dulce.</li>
                      </ul>
                    </div>
                    <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl">
                      <h5 className="font-extrabold text-gray-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Clock className="w-4 h-4 text-[#FF9900]" /> Proceso de Preparación
                      </h5>
                      <ul className="space-y-1.5 text-xs font-semibold text-gray-600">
                        <li>⏰ <strong className="text-gray-800">Maduración:</strong> El postre pasa 12 horas en frío controlado para homogeneizar las leches.</li>
                        <li>🧁 <strong className="text-gray-800">Frecuencia:</strong> Producida diariamente en lotes pequeños en nuestro obrador de San Cristóbal.</li>
                        <li>📦 <strong className="text-gray-800">Vida útil:</strong> Conservar refrigerado. Consumir preferiblemente dentro de los 4 días.</li>
                      </ul>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2 text-xs text-amber-900 font-semibold">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Alergias: Contiene gluten, derivados de soya, lácteos y trazas de huevo. No contiene nueces en su receta original (salvo si se añade el topping de almendras opcional).</span>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: REVIEWS */}
              {activeTab === 'reviews' && (
                <div className="mt-5 text-left space-y-4 animate-fadeIn text-sm">
                  {reviewSuccess && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200">
                      ¡Tu testimonio ha sido publicado! Muchas gracias por calificar nuestro postre.
                    </div>
                  )}

                  {/* List of reviews */}
                  <div className="space-y-3.5 max-h-[220px] overflow-y-auto pr-2">
                    {reviews.map(rev => (
                      <div key={rev.id} className="p-3 bg-gray-50 border border-gray-150 rounded-xl">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-800 text-xs">{rev.author}</span>
                          <span className="text-[10px] text-gray-400 font-bold">{rev.date}</span>
                        </div>
                        <div className="flex items-center text-[#FF9900] my-1">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" />
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 font-medium leading-relaxed">{rev.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Write a review form */}
                  <form onSubmit={handleAddReview} className="border-t border-gray-100 pt-4 mt-4 space-y-3">
                    <h5 className="font-black text-gray-800 text-xs uppercase tracking-wider">Déjanos tu opinión de este postre</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <input 
                          type="text" 
                          required
                          value={newReviewName}
                          onChange={(e) => setNewReviewName(e.target.value)}
                          placeholder="Tu Nombre (Ej: Pedro G.)"
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-amber-800 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-bold">Calificación:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                              key={star}
                              type="button"
                              onClick={() => setNewReviewRating(star)}
                              className="text-[#FF9900] hover:scale-110 active:scale-95 transition"
                            >
                              <Star className={`w-4 h-4 ${newReviewRating >= star ? 'fill-current' : ''}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <textarea
                        required
                        value={newReviewText}
                        onChange={(e) => setNewReviewText(e.target.value)}
                        placeholder="Comparte tu experiencia con el sabor, la textura o la presentación..."
                        rows={2}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-amber-800 focus:outline-none"
                      />
                    </div>
                    <div className="text-right">
                      <button 
                        type="submit"
                        className="bg-[#3D2314] hover:bg-[#25150c] text-white text-[10px] font-black uppercase tracking-widest px-4.5 py-2 rounded-lg cursor-pointer transition shadow"
                      >
                        Enviar Review
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* LOWER CART SECTION / ORDER TRIGGER */}
            <div className="border-t border-gray-100 pt-6 mt-6">
              {/* Product existence checker / Database sync panel */}
              {!existingProduct && !createdProduct && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="bg-amber-100 text-amber-900 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                      SINCE EN CATÁLOGO
                    </span>
                    <h5 className="text-xs font-extrabold text-amber-950">El postre no está registrado en tu tienda</h5>
                    <p className="text-[10px] text-amber-800 leading-normal font-semibold">
                      Para poder usar la compra interactiva, regístralo en la base de datos automáticamente con un solo clic.
                    </p>
                  </div>
                  <button
                    onClick={handleAutoCreateProduct}
                    disabled={isCreatingProduct}
                    className="w-full sm:w-auto px-4 py-2 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] text-xs font-black rounded-xl transition cursor-pointer disabled:opacity-50 shrink-0 uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current animate-pulse" />
                    {isCreatingProduct ? 'Registrando...' : 'Registrar en DB'}
                  </button>
                </div>
              )}

              {/* Purchase controller */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                {/* Total price calculation */}
                <div className="text-left">
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block">Total Estimado ({activeCurrency})</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-serif font-black text-amber-950 leading-none">
                      {formatCurrency(totalPriceUSD * quantity, activeCurrency, currencyRates)}
                    </span>
                    {quantity > 1 && (
                      <span className="text-xs text-gray-400 font-bold">
                        ({formatCurrency(totalPriceUSD, activeCurrency, currencyRates)} c/u)
                      </span>
                    )}
                  </div>
                  
                  {/* Stock status */}
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-extrabold mt-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-ping"></span>
                    Disponible en Obrador (Listo para entrega)
                  </span>
                </div>

                {/* Counter & Add to cart button */}
                <div className="flex items-center gap-3 w-full sm:w-auto self-stretch sm:self-auto">
                  {/* Quantity Counter */}
                  <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
                    <button 
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-8.5 h-8.5 text-gray-500 hover:text-gray-800 font-bold rounded-lg hover:bg-white transition cursor-pointer flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-9 font-bold font-mono text-center text-sm">{quantity}</span>
                    <button 
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-8.5 h-8.5 text-gray-500 hover:text-gray-800 font-bold rounded-lg hover:bg-white transition cursor-pointer flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to cart / Buy trigger */}
                  <button 
                    onClick={() => {
                      handleOrder();
                      // Close the modal and open the cart drawer to show the success state
                      onClose();
                      setTimeout(() => onOpenCart(), 350);
                    }}
                    className="flex-1 sm:flex-initial px-6 py-3.5 bg-[#3D2314] hover:bg-[#25150c] text-white text-xs font-black rounded-xl transition duration-200 cursor-pointer uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.98]"
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    Pedir Dulce
                  </button>
                </div>
              </div>

              {/* Guarantees bar */}
              <div className="grid grid-cols-2 gap-4 text-center mt-5 pt-4 border-t border-gray-150 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  Garantía de Frescura Real
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <HeartHandshake className="w-4 h-4 text-amber-600 shrink-0" />
                  Elaboración Local Diaria
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
