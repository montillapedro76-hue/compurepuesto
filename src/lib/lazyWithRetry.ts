import React, { ComponentType, LazyExoticComponent } from 'react';

/**
 * Robust wrapper for React.lazy that automatically retries failed dynamic imports
 * caused by network latency, temporary proxy hiccups, or dev-server module compilation.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retriesLeft: number = 3,
  intervalMs: number = 1200
): LazyExoticComponent<T> {
  return React.lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      const execute = (remainingAttempts: number, delay: number) => {
        factory()
          .then((module) => {
            resolve(module);
          })
          .catch((error: any) => {
            const errorMsg = String(error?.message || error || '');
            const isImportError =
              errorMsg.includes('Failed to fetch dynamically imported module') ||
              errorMsg.includes('Loading chunk') ||
              errorMsg.includes('dynamically imported module') ||
              error?.name === 'TypeError';

            if (remainingAttempts > 0 && isImportError) {
              console.warn(
                `[lazyWithRetry] Error de red al cargar módulo dinámico. Reintentando en ${delay}ms (${remainingAttempts} reintentos restantes)...`,
                error
              );
              setTimeout(() => {
                execute(remainingAttempts - 1, delay * 1.5);
              }, delay);
            } else {
              console.error(
                '[lazyWithRetry] No se pudo cargar el módulo dinámico tras varios intentos:',
                error
              );
              reject(error);
            }
          });
      };

      execute(retriesLeft, intervalMs);
    });
  });
}
