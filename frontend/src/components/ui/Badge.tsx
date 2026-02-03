interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-bg-selection text-fg-primary border border-border',
  primary: 'bg-accent-primary text-fg-primary',
  success: 'bg-status-success text-fg-primary',
  warning: 'bg-status-warning text-fg-primary',
  danger: 'bg-status-danger text-fg-primary',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export function Badge({
  variant = 'default',
  children,
  size = 'sm',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-block rounded-full font-medium
        ${variants[variant]}
        ${sizes[size]}
      `}
    >
      {children}
    </span>
  );
}
