import { API_BASE_URL } from '../../api/client';

const iconCache = new Map<string, Promise<string | undefined>>();
const cacheListeners = new Set<() => void>();

const normalizeIconId = (iconId: string): string => iconId.trim().replace(/\.svg$/i, '').toLowerCase();

export function clearIconCache(): void {
  iconCache.clear();
  cacheListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn('[mapNodeIcon] Icon cache listener error', err);
    }
  });
}

export function subscribeToIconCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

export function mapNodeIcon(iconId?: string): Promise<string | undefined> {
  if (!iconId) {
    return Promise.resolve(undefined);
  }

  const cacheKey = normalizeIconId(iconId);

  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }

  const fetchPromise = fetch(`${API_BASE_URL}/api/v1/icons/${cacheKey}`)
    .then(async (res) => {
      if (!res.ok) {
        console.warn('[mapNodeIcon] Failed to load icon', cacheKey, 'status', res.status);
        iconCache.delete(cacheKey);
        return undefined;
      }
      const svg = await res.text();
      if (!svg.trim().startsWith('<svg')) {
        console.warn('[mapNodeIcon] Icon payload is not SVG for', cacheKey);
        iconCache.delete(cacheKey);
        return undefined;
      }
      return svg;
    })
    .catch((err) => {
      console.error('[mapNodeIcon] Network error while loading icon', cacheKey, err);
      iconCache.delete(cacheKey);
      return undefined;
    });

  iconCache.set(cacheKey, fetchPromise);
  return fetchPromise;
}
