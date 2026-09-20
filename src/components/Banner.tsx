/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Product, ProductImage, Category, BannerSlide } from '../types';
import { dbService } from '../lib/supabase';
import { handleImageError, DEFAULT_BANNER_FALLBACK } from '../lib/imageUtils';

interface BannerProps {
  onSelectCategoryByName?: (keyword: string) => void;
  setOnlyOffers?: (val: boolean) => void;
  products?: Product[];
  productImages?: ProductImage[];
  categories?: Category[];
  onViewProduct?: (product: Product) => void;
}

export default function Banner({
  onSelectCategoryByName,
  setOnlyOffers,
}: BannerProps) {
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const loadSlides = async () => {
    try {
      const fetched = await dbService.getBannerSlides();
      const activeOnly = fetched.filter((s) => s.active !== false);
      setSlides(activeOnly.length > 0 ? activeOnly : fetched);
    } catch (e) {
      console.error('Error loading banner slides:', e);
    }
  };

  useEffect(() => {
    loadSlides();
    window.addEventListener('bellavista_banner_updated', loadSlides);
    return () => {
      window.removeEventListener('bellavista_banner_updated', loadSlides);
    };
  }, []);

  // Auto-play interval (5 seconds)
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex] || slides[0];

  const handleSlideAction = (slide: BannerSlide) => {
    if (slide.target_offer && setOnlyOffers) {
      setOnlyOffers(true);
      const section = document.getElementById('products-display-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    } else if (slide.target_category && onSelectCategoryByName) {
      onSelectCategoryByName(slide.target_category);
      const section = document.getElementById('products-display-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 40) {
      // Swiped left -> next
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    } else if (diff < -40) {
      // Swiped right -> prev
      setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
    }
    setTouchStartX(null);
  };

  return (
    <div className="relative w-full select-none mb-6">
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-[1500px] mx-auto rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-[#131921] aspect-[2.4/1] md:aspect-[3.2/1]"
      >
        {/* Background Image */}
        <img
          src={currentSlide.image_url}
          alt={currentSlide.title}
          className="w-full h-full object-cover transition-all duration-700 ease-in-out"
          referrerPolicy="no-referrer"
          onError={(e) => handleImageError(e, DEFAULT_BANNER_FALLBACK)}
        />

        {/* Dark Gradient Overlay for optimal text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent flex flex-col justify-center px-6 sm:px-10 md:px-16 py-6 text-white">
          <div className="max-w-xl space-y-2 sm:space-y-3">
            {currentSlide.badge && (
              <span className="inline-flex items-center gap-1.5 bg-[#FF9900] text-[#131921] text-[10px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-md w-fit animate-pulse">
                <Sparkles className="w-3.5 h-3.5 stroke-[3]" />
                {currentSlide.badge}
              </span>
            )}

            <h2 className="text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-md">
              {currentSlide.title}
            </h2>

            {currentSlide.subtitle && (
              <p className="text-xs sm:text-sm md:text-base text-gray-200 font-medium line-clamp-2 leading-relaxed drop-shadow-sm">
                {currentSlide.subtitle}
              </p>
            )}

            {(currentSlide.target_category || currentSlide.target_offer || currentSlide.button_text) && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleSlideAction(currentSlide)}
                  className="inline-flex items-center gap-2 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg active:scale-95 transition cursor-pointer border border-white/20"
                >
                  <span>{currentSlide.button_text || 'Ver Más Detalle'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Carousel Prev / Next Controls */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition cursor-pointer border border-white/10 active:scale-95 items-center justify-center"
              aria-label="Anterior slide"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % slides.length)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition cursor-pointer border border-white/10 active:scale-95 items-center justify-center"
              aria-label="Siguiente slide"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Dots Indicators */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-xs">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id || idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    currentIndex === idx ? 'w-6 bg-[#FF9900]' : 'w-2 bg-white/60 hover:bg-white'
                  }`}
                  aria-label={`Ir a pantalla ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

