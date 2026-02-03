import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
}

export function Select({
  label,
  options,
  error,
  className = '',
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-fg-secondary mb-1 font-body">
          {label}
        </label>
      )}
      <select
        className={`
          w-full bg-bg-dark text-fg-primary border border-border rounded-sm
          px-2 py-1 text-sm font-body
          focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary
          disabled:bg-bg-light disabled:text-fg-disabled disabled:cursor-not-allowed
          transition-colors duration-200
          ${error ? 'border-status-danger' : ''}
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <div className="mt-1 text-xs text-status-danger font-body">{error}</div>
      )}
    </div>
  );
}
