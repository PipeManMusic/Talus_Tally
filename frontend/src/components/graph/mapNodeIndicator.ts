import { API_BASE_URL } from '../../api/client';

// Utility to map backend node to CustomNode data with status indicator SVG/text
export async function mapNodeIndicator(node: any): Promise<any> {
  let statusIndicatorSvg = undefined;
  let statusText = undefined;
  if (node.indicator_id && node.indicator_set) {
    const url = `${API_BASE_URL}/api/v1/indicators/${node.indicator_set}/${node.indicator_id}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        statusIndicatorSvg = await res.text();
        if (!statusIndicatorSvg.trim().startsWith('<svg')) {
          console.error('[mapNodeIndicator] Invalid SVG for', node.id);
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
  }
  const result = {
    ...node,
    statusIndicatorSvg,
    statusText,
  };
  if (node.schema_shape || node.schema_color) {
    console.log('[mapNodeIndicator] Node', node.id, 'has shape:', node.schema_shape, 'color:', node.schema_color);
  }
  return result;
}

