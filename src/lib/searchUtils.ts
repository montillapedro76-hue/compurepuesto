import { Product, Category, Brand } from '../types';

/**
 * Normalizes text to lowercase and removes diacritics / accents (NFD format).
 */
export const cleanText = (text: string = ''): string =>
  (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Calculates the priority score of a product based on the search term:
 * - Priority 1: Product name STARTS WITH the search term.
 * - Priority 2: Product name CONTAINS the search term in another position.
 * - Priority 3: Product category name, brand name, description, SKU or Barcode matches/contains the search term.
 * - 999: No match.
 */
export function getProductPriority(
  product: Product,
  searchTerm: string,
  categories: Category[] = [],
  brands: Brand[] = []
): 1 | 2 | 3 | 999 {
  const term = cleanText(searchTerm.trim());
  if (!term) return 1;

  const name = cleanText(product.name || '');
  const sku = cleanText(product.sku || '');
  const barcode = cleanText(product.barcode_qr || '');
  const description = cleanText(product.description || '');

  // 1. Priority 1: Product name starts with search term
  if (name.startsWith(term)) {
    return 1;
  }

  // 2. Priority 2: Product name contains search term in another position
  if (name.includes(term)) {
    return 2;
  }

  // Find category name
  const cat = categories.find(c => c.id === product.category_id);
  const categoryName = cleanText(cat?.name || '');

  // Find brand name
  const brand = brands.find(b => b.id === product.brand_id);
  const brandName = cleanText(brand?.name || '');

  // 3. Priority 3: Category or brand or description or SKU or Barcode matches search term
  if (
    categoryName.includes(term) ||
    brandName.includes(term) ||
    description.includes(term) ||
    sku.includes(term) ||
    barcode.includes(term)
  ) {
    return 3;
  }

  return 999;
}

/**
 * Custom searchProducts function implementing strict 3-tier priority categorization:
 * Priority 1: Name starts with search query
 * Priority 2: Name contains search query
 * Priority 3: Category/Brand/Description/SKU/Barcode contains search query
 */
export function searchProducts(
  query: string,
  products: Product[],
  categories: Category[] = [],
  brands: Brand[] = []
): Product[] {
  const searchTerm = cleanText(query.trim());
  if (!searchTerm) return products;

  const priority1: Product[] = []; // Comienzan con la palabra
  const priority2: Product[] = []; // Contienen la palabra
  const priority3: Product[] = []; // Coincide la categoría / marca / descripción

  products.forEach((product) => {
    const name = cleanText(product.name || '');
    const cat = categories.find((c) => c.id === product.category_id);
    const categoryName = cleanText(cat?.name || '');
    const brandObj = brands.find((b) => b.id === product.brand_id);
    const brandName = cleanText(brandObj?.name || '');
    const description = cleanText(product.description || '');
    const sku = cleanText(product.sku || '');
    const barcode = cleanText(product.barcode_qr || '');

    if (name.startsWith(searchTerm)) {
      priority1.push(product);
    } else if (name.includes(searchTerm)) {
      priority2.push(product);
    } else if (
      categoryName.includes(searchTerm) ||
      brandName.includes(searchTerm) ||
      description.includes(searchTerm) ||
      sku.includes(searchTerm) ||
      barcode.includes(searchTerm)
    ) {
      priority3.push(product);
    }
  });

  // Retorna los arreglos concatenados manteniendo el orden estricto
  return [...priority1, ...priority2, ...priority3];
}

/**
 * Sorts products into 3 priority groups based on search term scoring:
 * Priority 1: Name starts with search term
 * Priority 2: Name contains search term in another position
 * Priority 3: Category/Brand/Description match search term
 */
export function sortProductsByPriority(
  products: Product[],
  searchTerm: string,
  categories: Category[] = [],
  brands: Brand[] = []
): Product[] {
  const term = cleanText(searchTerm.trim());
  if (!term) return products;

  return searchProducts(term, products, categories, brands);
}

