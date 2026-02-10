import { API_BASE_URL, type IndicatorsConfig, type IndicatorTheme } from '../../api/client';

let indicatorsConfigPromise: Promise<IndicatorsConfig | null> | null = null;

const getIndicatorsConfig = async (): Promise<IndicatorsConfig | null> => {
  if (!indicatorsConfigPromise) {
    indicatorsConfigPromise = fetch(`${API_BASE_URL}/api/v1/config/indicators`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return indicatorsConfigPromise;
};

// Utility to map backend node to CustomNode data with status indicator SVG/text
export async function mapNodeIndicator(node: any): Promise<any> {
  let statusIndicatorSvg = undefined;
  let statusText = undefined;
  let indicatorTheme: IndicatorTheme | undefined;
  if (node.indicator_id && node.indicator_set) {
    const url = `${API_BASE_URL}/api/v1/assets/indicators/${node.indicator_set}/${node.indicator_id}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        statusIndicatorSvg = await res.text();
        const trimmed = statusIndicatorSvg.trim();
        const hasSvg = trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.includes('<svg');
        if (!hasSvg) {
          console.warn('[mapNodeIndicator] Invalid SVG for', node.id);
          statusIndicatorSvg = undefined;
        }
      } else {
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

