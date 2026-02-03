interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({
  title,
  subtitle,
  children,
  actions,
  onClick,
  interactive = false,
}: CardProps) {
  return (
    <div
      className={`
        bg-bg-light border border-border rounded-sm
        ${interactive ? 'hover:border-accent-primary cursor-pointer transition-colors' : ''}
      `}
      onClick={onClick}
    >
      {/* Header */}
      {(title || actions) && (
        <div className="flex items-start justify-between px-4 py-3 border-b border-border">
          <div>
            {title && (
              <h3 className="font-display text-fg-primary">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-fg-secondary mt-1">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-4">
        {children}
      </div>
    </div>
  );
}
