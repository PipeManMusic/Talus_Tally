import React from 'react';

// Usage: <TreeSvgBullet type="empty" size={14} />
// type: one of 'empty', 'partial', 'filled', 'alert'
// size: px (default 14)




// Use backend API endpoint for SVGs
const svgMap: Record<string, string> = {
  empty: '/api/v1/indicators/status/empty',
  partial: '/api/v1/indicators/status/partial',
  filled: '/api/v1/indicators/status/filled',
  alert: '/api/v1/indicators/status/alert',
};

export function TreeSvgBullet({ type = 'empty', set = 'status', size = 14 }: { type?: string; set?: string; size?: number }) {
  // Compose the backend API endpoint for the SVG
  const src = `/api/v1/indicators/${set || 'status'}/${type || 'empty'}`;
  const [error, setError] = React.useState(false);
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
      alt={type}
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      onError={() => setError(true)}
    />
  );
}
