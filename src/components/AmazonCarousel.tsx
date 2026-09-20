import React, { useRef, useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ShoppingCart, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  Play, 
  Pause, 
  RotateCcw, 
  ArrowLeftRight,
  GripHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, ProductImage, HomeCarouselCardItem } from '../types';
import { CurrencyCode, formatCurrency } from '../lib/currency';
import { dbService } from '../lib/supabase';

interface AmazonCarouselProps {
  products: Product[];
  categories: Category[];
  productImages: ProductImage[];
  onViewDetails: (product: Product) => void;
  onAddToCart?: (product: Product, e: React.MouseEvent) => void;
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  onSelectCategoryByName: (keyword: string) => void;
}

export default function AmazonCarousel({
  products,
  categories,
  productImages,
  onViewDetails,
  onAddToCart,
  activeCurrency,
  currencyRates,
  onSelectCategoryByName
}: AmazonCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [cardOrderConfig, setCardOrderConfig] = useState<HomeCarouselCardItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoSlideEnabled, setAutoSlideEnabled] = useState(true);
  const [swapNotice, setSwapNotice] = useState<string | null>(null);

  // Auto-scroll loop (moves from right to left smoothly)
  useEffect(() => {
    if (isPaused || !autoSlideEnabled) return;

    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 20) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: 340, behavior: 'smooth' });
        }
      }
    }, 3200);

    return () => clearInterval(interval);
  }, [isPaused, autoSlideEnabled]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const fetched = await dbService.getHomeCarouselCards();
        setCardOrderConfig(fetched);
      } catch (e) {
        console.error('Error loading carousel config:', e);
      }
    };
    loadConfig();
    window.addEventListener('bellavista_home_carousel_updated', loadConfig);
    return () => {
      window.removeEventListener('bellavista_home_carousel_updated', loadConfig);
    };
  }, []);

  // Helper to check scroll position to hide/show navigation arrows
  const checkScrollPosition = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 5);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', checkScrollPosition);
      checkScrollPosition();
      window.addEventListener('resize', checkScrollPosition);
    }
    return () => {
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', checkScrollPosition);
      }
      window.removeEventListener('resize', checkScrollPosition);
    };
  }, [products]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { clientWidth } = scrollRef.current;
      const scrollAmount = direction === 'left' ? -clientWidth * 0.8 : clientWidth * 0.8;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Helper to get product image or fallback
  const getProductImage = (product: Product): string => {
    const associated = productImages.find(img => img.product_id === product.id);
    if (associated?.image_url) return associated.image_url;
    if ((product as any).image_url) return (product as any).image_url;
    return 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&q=80&w=300';
  };

  // Find products matching categories
  const getProductsForCategoryKeyword = (categoryKeywords: string[], productKeywords: string[]): Product[] => {
    const matchedCategoryIds = categories
      .filter(c => c && c.name && categoryKeywords.some(kw => (c.name || '').toLowerCase().includes((kw || '').toLowerCase())))
      .map(c => c.id);

    let matchedProducts = products.filter(p => matchedCategoryIds.includes(p.category_id) && p.stock > 0);

    if (matchedProducts.length < 4) {
      const nameMatched = products.filter(p => 
        p && p.stock > 0 && 
        !matchedProducts.some(mp => mp.id === p.id) &&
        productKeywords.some(kw => 
          (p.name || '').toLowerCase().includes((kw || '').toLowerCase()) || 
          (p.description && (p.description || '').toLowerCase().includes((kw || '').toLowerCase()))
        )
      );
      matchedProducts = [...matchedProducts, ...nameMatched];
    }

    return matchedProducts.slice(0, 4);
  };

  const papeleriaProducts = getProductsForCategoryKeyword(
    ['papeleria', 'papelería'],
    ['papel', 'hoja', 'cartulina', 'cuaderno', 'lápiz', 'lapiz', 'bolígrafo', 'boligrafo', 'marcador', 'sacapuntas', 'borrador', 'tijera', 'regla', 'block', 'tempera', 'témpera', 'pincel', 'goma', 'pega', 'silicon', 'silicón']
  );
  const copiasProducts = getProductsForCategoryKeyword(
    ['copia', 'copias', 'impresion', 'impresión', 'encuadernacion', 'encuadernación', 'anillado', 'plastificado', 'digitalizacion', 'digitalización'],
    ['copia', 'copias', 'impresion', 'impresión', 'encuadernacion', 'encuadernación', 'anillado', 'plastificado', 'escaner', 'escáner']
  );
  const escolarProducts = getProductsForCategoryKeyword(
    ['escolar', 'útiles', 'utiles', 'colegio', 'escolares y marcadores', 'escolares', 'marcadores', 'escolares y utiles', 'escolares y útiles'],
    ['mochila', 'morral', 'cartuchera', 'sacapuntas', 'borrador', 'cuaderno', 'regla', 'marcador', 'marcadores', 'colores', 'creyones', 'lapiz', 'lápiz', 'lapices', 'lápices', 'tijera', 'pega', 'goma', 'tempera', 'témpera', 'escarcha']
  );
  const postresProducts = getProductsForCategoryKeyword(
    ['postre', 'postres', 'dulce', 'dulces', 'reposteria', 'repostería'],
    ['torta', 'tortas', 'quesillo', 'ponque', 'ponqué', 'galleta', 'galletas', 'chocolate', 'dulce', 'dulces', 'postre', 'postres', 'muffin', 'cupcake', 'brownie', 'marquesa']
  );

  const featuredProducts = products.filter(p => p.featured && p.stock > 0);
  const bestSellerProducts = products.filter(p => p.offer_price && p.stock > 0);

  const impresionesCategory = categories.find(c => 
    c && c.name && (
      (c.name || '').toLowerCase().includes('impresion') || 
      (c.name || '').toLowerCase().includes('copia') || 
      (c.name || '').toLowerCase().includes('copiado')
    )
  );
  const impresionesProducts = impresionesCategory 
    ? products.filter(p => p.category_id === impresionesCategory.id && p.stock > 0)
    : [];
  const nitidezCalidadProduct = impresionesProducts[0] || copiasProducts[0] || products.find(p => 
    p && p.name && (
      (p.name || '').toLowerCase().includes('copia') || 
      (p.name || '').toLowerCase().includes('impresion') || 
      (p.name || '').toLowerCase().includes('anillado')
    )
  ) || featuredProducts[0] || products[0];

  const singleFeatured1 = nitidezCalidadProduct;
  const singleFeatured2 = bestSellerProducts[0] || featuredProducts[1] || products[1];

  // Base raw cards definition with curated stationery & bakery studio palette
  const rawCards = [
    {
      id: 'cat-copias',
      type: 'grid',
      title: 'Impresión y Copiado',
      subtitle: 'Encuadernación, planos y copias con nitidez profesional',
      bgClass: 'bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#1E293B] text-white',
      badge: 'Servicio express',
      products: copiasProducts
    },
    {
      id: 'featured-1',
      type: 'single',
      title: 'Destacado del Taller',
      subtitle: 'Artículos de alta precisión y calidad garantizada',
      bgClass: 'bg-gradient-to-br from-[#16202E] via-[#1F2E43] to-[#16202E] text-white',
      badge: 'Recomendado',
      product: singleFeatured1
    },
    {
      id: 'cat-papeleria',
      type: 'grid',
      title: 'Papelería y Oficina',
      subtitle: 'Blocks, carpetas, hojas y suministros de escritorio',
      bgClass: 'bg-gradient-to-br from-[#1E2E38] via-[#15232B] to-[#1E2E38] text-slate-100',
      badge: 'Oficina y taller',
      products: papeleriaProducts
    },
    {
      id: 'cat-escolar',
      type: 'grid',
      title: 'Útiles Escolares',
      subtitle: 'Cuadernos, creyones, reglas y todo para el colegio',
      bgClass: 'bg-gradient-to-br from-[#853018] via-[#6B2410] to-[#853018] text-white',
      badge: 'Temporada escolar',
      products: escolarProducts
    },
    {
      id: 'cat-postres',
      type: 'grid',
      title: 'Obrador y Repostería',
      subtitle: 'Tortas tres leches y dulces preparados artesanalmente',
      bgClass: 'bg-gradient-to-br from-[#3D2314] via-[#26150C] to-[#3D2314] text-amber-100',
      badge: 'Recién preparado',
      products: postresProducts
    },
    {
      id: 'featured-2',
      type: 'single',
      title: 'Oportunidad Especial',
      subtitle: 'Precios preferenciales para tus proyectos en Barinitas',
      bgClass: 'bg-gradient-to-br from-[#172D45] via-[#0F1F31] to-[#172D45] text-white',
      badge: 'Precio especial',
      product: singleFeatured2
    }
  ];

  // Order cards based on cardOrderConfig
  let cards = rawCards;
  if (cardOrderConfig && cardOrderConfig.length > 0) {
    const configMap = new Map<string, HomeCarouselCardItem>(cardOrderConfig.map(c => [c.id, c]));
    cards = [...rawCards]
      .filter(card => {
        const conf = configMap.get(card.id);
        return conf ? conf.enabled !== false : true;
      })
      .sort((a, b) => {
        const confA = configMap.get(a.id);
        const confB = configMap.get(b.id);
        const orderA = confA ? confA.sort_order : 99;
        const orderB = confB ? confB.sort_order : 99;
        return orderA - orderB;
      })
      .map(card => {
        const conf = configMap.get(card.id);
        if (conf) {
          return {
            ...card,
            title: conf.title || card.title,
            subtitle: conf.subtitle || card.subtitle,
            badge: conf.badge || card.badge
          };
        }
        return card;
      });
  }

  // Swap function to interchange position of two adjacent cards
  const handleSwapCards = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= cards.length) return;

    const newCards = [...cards];
    const temp = newCards[fromIndex];
    newCards[fromIndex] = newCards[toIndex];
    newCards[toIndex] = temp;

    // Show temporary notice
    setSwapNotice(`Tarjetas intercambiadas: "${temp.title}" movida a la posición #${toIndex + 1}`);
    setTimeout(() => setSwapNotice(null), 3000);

    // Save new order to config
    const updatedOrderItems: HomeCarouselCardItem[] = newCards.map((c, idx) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      badge: c.badge,
      enabled: true,
      sort_order: idx + 1
    }));

    setCardOrderConfig(updatedOrderItems);

    try {
      await dbService.saveHomeCarouselCards(updatedOrderItems);
    } catch (e) {
      console.error('Error saving swapped cards order:', e);
    }
  };

  // Reset order to default configuration
  const handleResetOrder = async () => {
    const defaultOrderItems: HomeCarouselCardItem[] = rawCards.map((c, idx) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      badge: c.badge,
      enabled: true,
      sort_order: idx + 1
    }));

    setCardOrderConfig(defaultOrderItems);
    setSwapNotice('Orden de tarjetas restablecido');
    setTimeout(() => setSwapNotice(null), 3000);

    try {
      await dbService.saveHomeCarouselCards(defaultOrderItems);
    } catch (e) {
      console.error('Error resetting cards order:', e);
    }
  };

  if (products.length === 0) return null;

  return (
    <div className="relative w-full my-6 select-none group/carousel max-w-[1480px] mx-auto px-1">
      {/* Section Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 px-2">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#D97706] inline-block"></span>
            <span className="text-xs font-bold text-[#D97706] tracking-wide">Colecciones destacadas</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 font-display tracking-tight leading-tight">
            Especiales y Suministros del Taller
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Impresión y copiado, útiles escolares, papelería y dulces artesanales en Barinitas
          </p>
        </div>

        {/* Carousel controls */}
        <div className="flex items-center gap-2">
          {swapNotice && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg animate-fadeIn">
              {swapNotice}
            </span>
          )}
          <button
            onClick={() => setAutoSlideEnabled(!autoSlideEnabled)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title={autoSlideEnabled ? "Pausar desplazamiento automático" : "Activar desplazamiento automático"}
          >
            {autoSlideEnabled ? <Pause className="w-3.5 h-3.5 text-[#D97706]" /> : <Play className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden sm:inline">{autoSlideEnabled ? 'Pausar' : 'Reanudar'}</span>
          </button>
        </div>
      </div>

      {/* Main Carousel Wrapper */}
      <div className="relative">
        {/* Left Scroll Button */}
        {showLeftArrow && (
          <button
            onClick={() => handleScroll('left')}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-16 bg-white/90 hover:bg-white border border-slate-200 rounded-xl shadow-lg hover:shadow-xl items-center justify-center transition duration-200 cursor-pointer text-slate-800 backdrop-blur-xs hover:scale-105 active:scale-95"
            aria-label="Desplazar hacia la izquierda"
          >
            <ChevronLeft className="w-6 h-6 text-slate-700" />
          </button>
        )}

        {/* Right Scroll Button */}
        {showRightArrow && (
          <button
            onClick={() => handleScroll('right')}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-16 bg-white/90 hover:bg-white border border-slate-200 rounded-xl shadow-lg hover:shadow-xl items-center justify-center transition duration-200 cursor-pointer text-slate-800 backdrop-blur-xs hover:scale-105 active:scale-95"
            aria-label="Desplazar hacia la derecha"
          >
            <ChevronRight className="w-6 h-6 text-slate-700" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="flex gap-4 md:gap-5 overflow-x-auto pb-4 pt-1 px-2 scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {cards.map((card, idx) => {
            return (
              <motion.div
                layout
                key={card.id}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                className={`snap-start shrink-0 w-[295px] md:w-[335px] h-[450px] rounded-2xl shadow-sm border border-slate-700/20 p-5 flex flex-col justify-between ${card.bgClass} relative overflow-hidden transition-all duration-300 hover:shadow-xl group/card`}
              >
                {/* Top Control Bar: Card Badge & Discrete Swap Controls */}
                <div className="flex items-center justify-between gap-2 mb-2 z-20">
                  {/* Subtle Reorder Widget */}
                  <div className="flex items-center gap-1 bg-black/25 backdrop-blur-md border border-white/15 px-2 py-0.5 rounded-full text-white/90 shadow-2xs opacity-60 group-hover/card:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSwapCards(idx, idx - 1);
                      }}
                      disabled={idx === 0}
                      className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                      title="Mover a la izquierda"
                    >
                      <ArrowLeft className="w-3 h-3 text-white" />
                    </button>
                    <span className="text-[10px] font-bold px-1 text-white/90">
                      {idx + 1}/{cards.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSwapCards(idx, idx + 1);
                      }}
                      disabled={idx === cards.length - 1}
                      className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                      title="Mover a la derecha"
                    >
                      <ArrowRight className="w-3 h-3 text-white" />
                    </button>
                  </div>

                  {/* Curated Soft Badge */}
                  {card.badge && (
                    <span className="bg-white/20 backdrop-blur-md text-[10px] font-bold px-2.5 py-1 rounded-full text-white border border-white/20 shadow-2xs">
                      {card.badge}
                    </span>
                  )}
                </div>

                {/* Card Headings */}
                <div className="text-left pr-2">
                  <h3 className="text-lg font-bold leading-tight font-display tracking-tight mb-1 text-white">
                    {card.title}
                  </h3>
                  <p className="text-xs text-white/80 font-medium leading-relaxed">
                    {card.subtitle}
                  </p>
                </div>

                {/* Card Content Area */}
                {card.type === 'grid' && card.products ? (
                  /* 2X2 Grid Layout for Category Cards */
                  <div className="grid grid-cols-2 gap-2.5 my-2.5 flex-1 justify-center content-center">
                    {card.products.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => onViewDetails(p)}
                        className="bg-white rounded-xl p-2 flex flex-col items-center justify-between h-[125px] hover:scale-[1.02] transition duration-200 cursor-pointer border border-slate-100 shadow-xs relative"
                      >
                        {/* Image inside box */}
                        <div className="w-full h-[75px] flex items-center justify-center overflow-hidden">
                          <img
                            src={getProductImage(p)}
                            alt={p.name}
                            className="max-w-full max-h-full object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {/* Caption */}
                        <div className="w-full text-center mt-1">
                          <p className="text-[10px] text-slate-800 font-semibold truncate px-0.5" title={p.name}>
                            {p.name}
                          </p>
                          <span className="text-[11px] font-extrabold text-[#D97706]">
                            {formatCurrency(p.offer_price || p.price, activeCurrency, currencyRates)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : card.product ? (
                  /* Single Large Product Card Layout for Featured items */
                  <div
                    onClick={() => onViewDetails(card.product!)}
                    className="bg-white rounded-xl p-3.5 my-2 flex-1 flex flex-col justify-between hover:scale-[1.02] transition duration-200 cursor-pointer border border-slate-100 shadow-xs relative group/single"
                  >
                    {/* Offer badge */}
                    {card.product.offer_price && (
                      <span className="absolute top-2.5 left-2.5 bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                        Oferta
                      </span>
                    )}

                    {/* Image Area */}
                    <div className="w-full h-[175px] flex items-center justify-center overflow-hidden relative p-1 mt-1">
                      <img
                        src={getProductImage(card.product)}
                        alt={card.product.name}
                        className="max-w-full max-h-full object-contain transition duration-300 group-hover/single:scale-105"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Footer Info Area */}
                    <div className="text-left mt-2 border-t border-slate-100 pt-2 flex items-end justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <h4 className="text-xs font-bold text-slate-900 truncate" title={card.product.name}>
                          {card.product.name}
                        </h4>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-sm font-extrabold text-slate-900">
                            {formatCurrency(card.product.offer_price || card.product.price, activeCurrency, currencyRates)}
                          </span>
                          {card.product.offer_price && (
                            <span className="text-[10px] text-slate-400 line-through font-medium">
                              {formatCurrency(card.product.price, activeCurrency, currencyRates)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Add to Cart button */}
                      {onAddToCart && card.product.stock > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(card.product!, e);
                          }}
                          className="w-8 h-8 bg-[#16202E] hover:bg-[#D97706] text-white rounded-lg flex items-center justify-center transition active:scale-95 shadow-xs"
                          title="Añadir al carrito"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 text-[#F59E0B]" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-white/70">No hay productos en esta sección</p>
                  </div>
                )}

                {/* Footer view action */}
                <div className="text-left pt-2 border-t border-white/10 flex items-center justify-between">
                  {card.type === 'grid' ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (card.id === 'cat-copias') {
                          onSelectCategoryByName('copias');
                        } else if (card.id === 'cat-papeleria') {
                          onSelectCategoryByName('papelería');
                        } else if (card.id === 'cat-escolar') {
                          onSelectCategoryByName('Escolares y utiles');
                        } else if (card.id === 'cat-postres') {
                          onSelectCategoryByName('postres');
                        } else {
                          onSelectCategoryByName(card.title);
                        }
                      }}
                      className="text-xs font-semibold text-white/90 hover:text-white hover:underline flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Ver toda la colección</span>
                    </button>
                  ) : card.product ? (
                    <button
                      type="button"
                      onClick={() => onViewDetails(card.product!)}
                      className="text-xs font-semibold text-white/90 hover:text-white hover:underline flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Ver detalles del producto</span>
                    </button>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

