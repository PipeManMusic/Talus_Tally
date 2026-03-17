import React from 'react';
import { getCachedIndicatorUrl } from '../../utils/indicatorCache';

// Usage: <TreeSvgBullet type="empty" size={14} />
// type: one of 'empty', 'partial', 'filled', 'alert'
// size: px (default 14)

export function TreeSvgBullet({ type = 'empty', set = 'status', size = 14 }: { type?: string; set?: string; size?: number }) {
  const setId = set || 'status';
  const indicatorId = type || 'empty';
  const [error, setError] = React.useState(false);

  // First try to use cached data URL (preloaded indicators)
  const cachedUrl = getCachedIndicatorUrl(setId, indicatorId);
  const src = cachedUrl || `/api/v1/indicators/${setId}/${indicatorId}`;

  if (error) {
    // Fallback: show a simple circle if SVG fails to load
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <circle cx={size/2} cy={size/2} r={size/2-1} fill="none" stroke="#888" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <img
      src={src}
      alt={indicatorId}
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      onError={() => setError(true)}
    />
  );
}
