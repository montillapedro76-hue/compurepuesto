/**
 * Utilitario integral para gestión robusta de imágenes,
 * evitando enlaces rotos, bloqueos de CORS/Referrer y pantallas en blanco.
 */
import type React from 'react';

// SVG elegante en Data URI para productos sin imagen o con enlace roto
export const DEFAULT_PRODUCT_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20400%22%20width%3D%22400%22%20height%3D%22400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23F1F5F9%22%2F%3E%3Cg%20transform%3D%22translate(150%2C150)%22%20fill%3D%22none%22%20stroke%3D%22%2394A3B8%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M21%2016V8a2%202%200%200%200-1-1.73l-7-4a2%202%200%200%200-2%200l-7%204A2%202%200%200%200%203%208v8a2%202%200%200%200%201%201.73l7%204a2%202%200%200%200%202%200l7-4A2%202%200%200%200%2021%2016z%22%20transform%3D%22scale(4)%22%2F%3E%3Cpolyline%20points%3D%223.27%206.96%2012%2012.01%2020.73%206.96%22%20transform%3D%22scale(4)%22%2F%3E%3Cline%20x1%3D%2212%22%20y1%3D%2222.08%22%20x2%3D%2212%22%20y2%3D%2212%22%20transform%3D%22scale(4)%22%2F%3E%3C%2Fg%3E%3Ctext%20x%3D%22200%22%20y%3D%22300%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20font-weight%3D%22bold%22%20fill%3D%22%2364748B%22%20text-anchor%3D%22middle%22%3ECopias%20Bella%20Vista%3C%2Ftext%3E%3C%2Fsvg%3E";

export const DEFAULT_BANNER_FALLBACK = "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=1500&h=600";

export const DEFAULT_AVATAR_FALLBACK = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150";

/**
 * Corrige y asegura que las URLs de imágenes tengan formato webp/https y no rompan la carga
 */
export function sanitizeImageUrl(url?: string | null, fallback = DEFAULT_PRODUCT_FALLBACK): string {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return fallback;
  }

  const clean = url.trim();

  // Si ya es un data URI o blob, devolverlo directo
  if (clean.startsWith('data:image') || clean.startsWith('blob:')) {
    return clean;
  }

  // Si es de Supabase Storage sin query params, optimizarlo
  if (clean.includes('supabase.co/storage/v1/object/public') && !clean.includes('?')) {
    return `${clean}?width=400&quality=80&format=webp`;
  }

  return clean;
}

/**
 * Manejador estándar de error de carga de imagen para etiquetas <img>
 * Previene bucles infinitos y sustituye la fuente por un placeholder seguro.
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  fallback: string = DEFAULT_PRODUCT_FALLBACK
) {
  const img = event.currentTarget;
  // Prevenir bucle infinito si el fallback también falla
  if (img.src === fallback || img.getAttribute('data-error-handled') === 'true') {
    return;
  }
  img.setAttribute('data-error-handled', 'true');
  img.src = fallback;
}
