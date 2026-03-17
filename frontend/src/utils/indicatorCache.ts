/**
 * Indicator Cache Utility
 * 
 * Caches indicator SVGs as data URLs to avoid repeated HTTP requests.
 * Loads all status indicators once on app startup and serves them from memory.
 */

import { API_BASE_URL } from '../api/client';

interface IndicatorCache {
  [setId: string]: {
    [indicatorId: string]: string; // data URL
  };
}

let cache: IndicatorCache = {};
let loadingPromise: Promise<void> | null = null;

/**
 * Load all status indicators into cache as data URLs.
 * Call once on app initialization.
 */
export async function preloadStatusIndicators(): Promise<void> {
  // If already loading, wait for that to complete
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const indicators = ['empty', 'partial', 'filled', 'alert', 'available'];
      const startTime = performance.now();
      const results = await Promise.all(
        indicators.map(async (indicator) => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/v1/indicators/status/${indicator}`,
              { cache: 'force-cache' } // Use aggressive browser caching
            );
            if (response.ok) {
              const blob = await response.blob();
              const dataUrl = URL.createObjectURL(blob);
              return { indicator, dataUrl };
            }
          } catch (err) {
            console.warn(`Failed to preload indicator: status/${indicator}`, err);
          }
          return null;
        })
      );

      // Store in cache
      if (!cache['status']) {
        cache['status'] = {};
      }

      results.forEach((result) => {
        if (result) {
          cache['status'][result.indicator] = result.dataUrl;
        }
      });

      const elapsed = performance.now() - startTime;
      console.log(`✓ [IndicatorCache] Preloaded ${Object.keys(cache['status']).length} status indicators in ${elapsed.toFixed(1)}ms`);
    } catch (err) {
      console.error('[IndicatorCache] Failed to preload indicators:', err);
    }
  })();

  return loadingPromise;
}

/**
 * Get a cached indicator SVG as a data URL.
 * Falls back to HTTP request if not in cache.
 */
export function getCachedIndicatorUrl(setId: string = 'status', indicatorId: string = 'empty'): string | null {
  const cached = cache[setId]?.[indicatorId];
  if (cached) {
    return cached;
  }

  // Return null if not cached - TreeSvgBullet will fall back to HTTP request
  return null;
}

/**
 * Add an indicator to the cache (used when loading indicators dynamically).
 */
export function setCachedIndicator(setId: string, indicatorId: string, dataUrl: string): void {
  if (!cache[setId]) {
    cache[setId] = {};
  }
  cache[setId][indicatorId] = dataUrl;
}

/**
 * Clear the indicator cache.
 */
export function clearIndicatorCache(): void {
  // Revoke all object URLs to free memory
  Object.values(cache).forEach((set) => {
    Object.values(set).forEach((dataUrl) => {
      try {
        URL.revokeObjectURL(dataUrl);
      } catch {
        // Already revoked or invalid URL
      }
    });
  });
  cache = {};
  loadingPromise = null;
  console.log('[IndicatorCache] Cache cleared');
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): { setCount: number; totalIndicators: number; setIds: string[] } {
  const setIds = Object.keys(cache);
  const totalIndicators = Object.values(cache).reduce((sum, set) => sum + Object.keys(set).length, 0);
  return {
    setCount: setIds.length,
    totalIndicators,
    setIds,
  };
}
