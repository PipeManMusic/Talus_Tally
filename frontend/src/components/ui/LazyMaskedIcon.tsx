import { useEffect, useRef, useState } from 'react';

interface LazyMaskedIconProps {
  url: string;
  color: string;
  className?: string;
  rootMargin?: string;
  threshold?: number;
}

export function LazyMaskedIcon({
  url,
  color,
  className = 'h-8 w-8',
  rootMargin = '180px',
  threshold = 0.01,
}: LazyMaskedIconProps) {
  const iconRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = iconRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return (
    <div
      ref={iconRef}
      className={className}
      style={
        visible
          ? {
              backgroundColor: color,
              maskImage: `url(${url})`,
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskImage: `url(${url})`,
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
            }
          : { backgroundColor: 'transparent' }
      }
      aria-hidden="true"
    />
  );
}
