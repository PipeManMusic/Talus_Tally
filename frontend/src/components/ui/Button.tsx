import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const variants = {
  default:
    'bg-bg-light text-fg-primary border border-border hover:bg-bg-selection hover:text-accent-hover hover:border-accent-primary active:bg-bg-dark disabled:text-fg-disabled disabled:border-border disabled:cursor-not-allowed',
  primary:
    'bg-accent-primary text-fg-primary border border-accent-primary hover:bg-accent-hover active:bg-accent-primary disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-status-danger text-fg-primary border border-status-danger hover:bg-red-700 active:bg-status-danger disabled:opacity-50 disabled:cursor-not-allowed',
};

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
};

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        rounded-sm font-body font-medium transition-all duration-200
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
