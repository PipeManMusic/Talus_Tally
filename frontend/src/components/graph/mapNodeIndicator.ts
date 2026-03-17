import { API_BASE_URL, type IndicatorsConfig, type IndicatorTheme } from '../../api/client';

let indicatorsConfigPromise: Promise<IndicatorsConfig | null> | null = null;
const indicatorSvgCache = new Map<string, string>();
const indicatorSvgPromiseCache = new Map<string, Promise<string | undefined>>();

const getIndicatorsConfig = async (): Promise<IndicatorsConfig | null> => {
  if (!indicatorsConfigPromise) {
    indicatorsConfigPromise = fetch(`${API_BASE_URL}/api/v1/config/indicators`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return indicatorsConfigPromise;
};

const getIndicatorSvg = async (setId: string, indicatorId: string): Promise<string | undefined> => {
  const cacheKey = `${setId}:${indicatorId}`;
  const cachedSvg = indicatorSvgCache.get(cacheKey);
  if (cachedSvg) {
    return cachedSvg;
  }

  const pending = indicatorSvgPromiseCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = fetch(`${API_BASE_URL}/api/v1/indicators/${setId}/${indicatorId}`, { cache: 'force-cache' })
    .then(async (res) => {
      if (!res.ok) {
        return undefined;
      }
      const svg = await res.text();
      const trimmed = svg.trim();
      const hasSvg = trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.includes('<svg');
      if (!hasSvg) {
        return undefined;
      }
      indicatorSvgCache.set(cacheKey, svg);
      return svg;
    })
    .catch(() => undefined)
    .finally(() => {
      indicatorSvgPromiseCache.delete(cacheKey);
    });

  indicatorSvgPromiseCache.set(cacheKey, request);
  return request;
};

// Utility to map backend node to CustomNode data with status indicator SVG/text
export async function mapNodeIndicator(node: any): Promise<any> {
  let statusIndicatorSvg = undefined;
  let statusText = undefined;
  let indicatorTheme: IndicatorTheme | undefined;
  if (node.indicator_id && node.indicator_set) {
    try {
      statusIndicatorSvg = await getIndicatorSvg(node.indicator_set, node.indicator_id);
      if (!statusIndicatorSvg && node.indicator && node.indicator.bullet) {
        if (node.indicator && node.indicator.bullet) {
          statusText = node.indicator.bullet;
        }
      }
    } catch (err) {
      console.error('[mapNodeIndicator] Fetch error:', err);
      if (node.indicator && node.indicator.bullet) {
        statusText = node.indicator.bullet;
      }
    }

    const indicatorsConfig = await getIndicatorsConfig();
    indicatorTheme =
      indicatorsConfig?.indicator_sets?.[node.indicator_set]?.default_theme?.[node.indicator_id];
  }
  const result = {
    ...node,
    statusIndicatorSvg,
    statusText,
    indicator_theme: indicatorTheme,
    indicatorColor: indicatorTheme?.indicator_color,
    textColor: indicatorTheme?.text_color,
    textStyle: indicatorTheme?.text_style,
  };
  if (node.schema_shape || node.schema_color) {
    console.log('[mapNodeIndicator] Node', node.id, 'has shape:', node.schema_shape, 'color:', node.schema_color);
  }
  return result;
}

