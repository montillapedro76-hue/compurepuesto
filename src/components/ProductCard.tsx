import React, { useState } from 'react';
import { Share2, AlertTriangle, MessageCircle, Star, CheckCircle2, ShoppingCart, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { Product } from '../types.ts';
import { CurrencyCode, CURRENCIES, formatCurrency } from '../lib/currency';
import { useI18n } from '../lib/i18n.ts';
import { sanitizeImageUrl, handleImageError, DEFAULT_PRODUCT_FALLBACK } from '../lib/imageUtils';

interface ProductCardProps {
  product: Product;
  categoryName: string;
  brandName: string;
  images: string[];
  onViewDetails: (p: Product) => void;
  onShare: (p: Product, e: React.MouseEvent) => void;
  onWhatsAppQuery: (p: Product, e: React.MouseEvent) => void;
  onAddToCart?: (p: Product, e: React.MouseEvent) => void;
  activeCurrency: CurrencyCode;
  currencyRates: Record<CurrencyCode, number>;
  isWishlisted?: boolean;
  onToggleWishlist?: (p: Product, e: React.MouseEvent) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  categoryName,
  brandName,
  images,
  onViewDetails,
  onShare,
  onWhatsAppQuery,
  onAddToCart,
  activeCurrency,
  currencyRates,
  isWishlisted = false,
  onToggleWishlist
}) => {
  const { t } = useI18n();
  const [imageLoaded, setImageLoaded] = useState(false);

  const rawImage = (images && images.length > 0 && images[0]) || 
                   (product as any).technical_sheet_url || 
                   (product as any).image_url || 
                   DEFAULT_PRODUCT_FALLBACK;
  const mainImage = sanitizeImageUrl(rawImage, DEFAULT_PRODUCT_FALLBACK);

  const discountPercentage = product.offer_price 
    ? Math.round(((product.price - product.offer_price) / product.price) * 100)
    : 0;

  const formatPrice = (priceUSD: number) => {
    const rate = currencyRates[activeCurrency] || 1;
    const converted = priceUSD * rate;
    const config = CURRENCIES[activeCurrency];
    const isCOP = activeCurrency === 'COP';
    const decimals = config.decimals;
    
    const formattedNumStr = isCOP ? Math.round(converted).toFixed(0) : converted.toFixed(decimals);
    
    const standardParts = formattedNumStr.split('.');
    const integerPart = standardParts[0];
    const decimalPart = standardParts[1] || '';

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandSeparator);

    if (config.position === 'prefix') {
      return (
        <div className="flex items-start text-[#0F1111]">
          <span className="text-[10px] sm:text-[12px] font-extrabold mt-[2px] sm:mt-[4px] mr-[2px] sm:mr-[4px]">{config.symbol}</span>
          <span className="text-lg sm:text-[24px] md:text-[28px] font-black leading-none tracking-tight">{formattedInteger}</span>
          {decimals > 0 && decimalPart && (
            <span className="text-[10px] sm:text-[12px] font-bold ml-[1px] sm:ml-[2px] leading-none mt-[2px] sm:mt-[4px]">{config.decimalSeparator}{decimalPart}</span>
          )}
        </div>
      );
    } else {
      return (
        <div className="flex items-start text-[#0F1111]">
          <span className="text-lg sm:text-[24px] md:text-[28px] font-black leading-none tracking-tight">{formattedInteger}</span>
          {decimals > 0 && decimalPart && (
            <span className="text-[10px] sm:text-[12px] font-bold ml-[1px] sm:ml-[2px] leading-none mt-[2px] sm:mt-[4px]">{config.decimalSeparator}{decimalPart}</span>
          )}
          <span className="text-[10px] sm:text-[12px] font-extrabold mt-[2px] sm:mt-[4px] ml-[2px] sm:ml-[4px]">{config.symbol}</span>
        </div>
      );
    }
  };

  return (
    <div 
      onClick={() => onViewDetails(product)}
      className="bg-white rounded-2xl overflow-hidden flex flex-col cursor-pointer group select-none relative border border-[#E7E5DF] hover:border-[#DAD7CE] shadow-[0_2px_8px_-2px_rgba(22,32,46,0.04)] hover:shadow-[0_10px_25px_-5px_rgba(22,32,46,0.08)] transition-all duration-300 h-full min-h-[340px] sm:min-h-[390px]"
      id={`product-card-${product.id}`}
    >
      {/* Top Image Canvas */}
      <div className="relative pt-[85%] sm:pt-[95%] bg-[#FAF9F7] overflow-hidden border-b border-[#F0EFEB]">
        {/* Badges top-left */}
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 flex flex-col gap-1.5 items-start">
          {product.featured && (
            <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
              {t('product.featured', 'Destacado')}
            </span>
          )}
          {discountPercentage > 0 && (
            <span className="bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
              -{discountPercentage}%
            </span>
          )}
        </div>

        {/* Action icons top-right */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 flex flex-col gap-1.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist?.(product, e);
            }}
            className={`w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-full border flex items-center justify-center shadow-xs transition-colors cursor-pointer ${
              isWishlisted
                ? 'bg-rose-50 text-rose-500 border-rose-200'
                : 'bg-white/90 backdrop-blur-xs text-slate-400 hover:text-rose-500 hover:bg-white border-[#E7E5DF]'
            }`}
            title={isWishlisted ? "Quitar de favoritos" : "Guardar en favoritos"}
            id={`btn-wishlist-${product.id}`}
          >
            <motion.div
              key={isWishlisted ? 'wishlisted' : 'not-wishlisted'}
              initial={{ scale: 0.8 }}
              animate={{ scale: [0.8, 1.25, 1] }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
            </motion.div>
          </motion.button>

          <button
            onClick={(e) => onShare(product, e)}
            className="w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-full bg-white/90 backdrop-blur-xs hover:bg-white border border-[#E7E5DF] hidden sm:flex items-center justify-center text-slate-600 shadow-xs transition cursor-pointer"
            title="Compartir enlace de producto"
            id={`btn-share-${product.id}`}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Loading skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
            <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse"></div>
          </div>
        )}

        {/* Product Image */}
        <img
          src={mainImage}
          alt={product.name}
          className={`absolute inset-0 w-full h-full object-contain p-3 sm:p-5 transition-transform duration-500 group-hover:scale-105 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            handleImageError(e, DEFAULT_PRODUCT_FALLBACK);
            setImageLoaded(true);
          }}
        />

        {/* Out of Stock visual badge */}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-slate-800 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              {t('product.out_of_stock', 'Agotado')}
            </span>
          </div>
        )}
      </div>

      {/* Info Content Area */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col text-left">
        {/* Category & Brand Meta */}
        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 font-medium truncate">
          <span>{categoryName}</span>
          {brandName && brandName !== 'S/M' && (
            <>
              <span>·</span>
              <span className="text-slate-500 font-semibold">{brandName}</span>
            </>
          )}
        </div>

        {/* Product Name */}
        <h3 
          className="font-bold text-xs sm:text-[13px] md:text-[14px] text-slate-800 group-hover:text-[#293896] transition-colors line-clamp-2 leading-snug mb-2 font-display" 
          title={product.name}
        >
          {product.name}
        </h3>

        {/* Price Section */}
        <div className="mt-auto pt-1">
          {product.offer_price ? (
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                {formatPrice(product.offer_price)}
                <span className="text-[11px] text-slate-400 line-through font-medium">
                  {formatCurrency(product.price, activeCurrency, currencyRates)}
                </span>
              </div>
            </div>
          ) : (
            formatPrice(product.price)
          )}

          {/* Dual Currency Helper for Venezuelan Customers */}
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            {activeCurrency === 'USD' ? (
              <span>≈ Bs. {( (product.offer_price || product.price) * (currencyRates.VES || 1) ).toFixed(2)} (BCV)</span>
            ) : activeCurrency === 'VES' ? (
              <span>≈ ${( (product.offer_price || product.price) / (currencyRates.VES || 1) ).toFixed(2)} USD</span>
            ) : null}
          </div>
        </div>

        {/* Add to Cart Button */}
        {onAddToCart && (
          <div className="mt-3 pt-2.5 border-t border-[#F0EFEB]">
            {product.stock > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart(product, e);
                }}
                className="btn-primary-pill w-full h-[36px] sm:h-[38px] text-[11px] shadow-xs active:scale-95 cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-white" />
                <span>{t('product.add_to_cart', 'AÑADIR AL CARRITO')}</span>
              </button>
            ) : (
              <div className="w-full h-[36px] sm:h-[38px] bg-slate-100 text-slate-400 font-medium text-xs rounded-full flex items-center justify-center border border-slate-200 uppercase tracking-wider">
                {t('product.out_of_stock', 'Agotado')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductCard;
