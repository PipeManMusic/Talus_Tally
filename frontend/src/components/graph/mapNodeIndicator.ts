import { API_BASE_URL } from '../../api/client';

// Utility to map backend node to CustomNode data with status indicator SVG/text
export async function mapNodeIndicator(node: any): Promise<any> {
  let statusIndicatorSvg = undefined;
  let statusText = undefined;
  console.log('[mapNodeIndicator] Node:', node.id, 'indicator_id:', node.indicator_id, 'indicator_set:', node.indicator_set, 'Full node:', node);
  if (node.indicator_id && node.indicator_set) {
    const url = `${API_BASE_URL}/api/v1/indicators/${node.indicator_set}/${node.indicator_id}`;
    console.log('[mapNodeIndicator] Fetching SVG:', url, 'for node', node.id, 'status', node.properties?.status);
    try {
      const res = await fetch(url);
      if (res.ok) {
        statusIndicatorSvg = await res.text();
        if (!statusIndicatorSvg.trim().startsWith('<svg')) {
          console.error('[mapNodeIndicator] Fetched content is not SVG for', node.id, 'content:', statusIndicatorSvg.slice(0, 100));
          statusIndicatorSvg = undefined;
        } else {
          console.log('[mapNodeIndicator] SVG fetched for', node.id, 'length:', statusIndicatorSvg.length);
        }
      } else {
        console.warn('[mapNodeIndicator] SVG fetch failed (HTTP', res.status, ') for', node.id, url);
        if (node.indicator && node.indicator.bullet) {
          statusText = node.indicator.bullet;
        }
      }
    } catch (err) {
      console.error('[mapNodeIndicator] SVG fetch error for', node.id, url, err);
      if (node.indicator && node.indicator.bullet) {
        statusText = node.indicator.bullet;
      }
    }
  } else {
    console.warn('[mapNodeIndicator] No indicator_id/set for node', node.id, node);
  }
  return {
    ...node,
    statusIndicatorSvg,
    statusText,
  };
}
