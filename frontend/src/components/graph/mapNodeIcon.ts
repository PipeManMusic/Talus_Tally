import { API_BASE_URL } from '../../api/client';

const iconCache = new Map<string, Promise<string | undefined>>();

export function mapNodeIcon(iconId?: string): Promise<string | undefined> {
  if (!iconId) {
    return Promise.resolve(undefined);
  }
  if (iconCache.has(iconId)) {
    return iconCache.get(iconId)!;
  }
  const normalizedIconId = iconId.replace(/\.svg$/i, '');
  const fetchPromise = fetch(`${API_BASE_URL}/api/v1/icons/${normalizedIconId}`)
    .then(async (res) => {
      if (!res.ok) {
        console.warn('[mapNodeIcon] Failed to load icon', iconId, 'status', res.status);
        return undefined;
      }
      const svg = await res.text();
      if (!svg.trim().startsWith('<svg')) {
        console.warn('[mapNodeIcon] Icon payload is not SVG for', iconId);
        return undefined;
      }
      return svg;
    })
    .catch((err) => {
      console.error('[mapNodeIcon] Network error while loading icon', iconId, err);
      return undefined;
    });
  iconCache.set(iconId, fetchPromise);
  return fetchPromise;
}
