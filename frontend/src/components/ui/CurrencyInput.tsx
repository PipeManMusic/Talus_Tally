import React from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}

export function CurrencyInput({ label, value, onChange, error, className = '', ...props }: CurrencyInputProps) {
  // Only allow numbers and a single decimal point
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty, or valid currency (max 2 decimals)
    if (val === '' || /^\d*(\.\d{0,2})?$/.test(val)) {
      onChange(e);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-fg-secondary mb-1 font-body">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-secondary">$</span>
        <input
          className={`pl-6 w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:bg-bg-light disabled:text-fg-disabled disabled:cursor-not-allowed transition-colors duration-200 ${error ? 'border-status-danger' : ''} ${className}`}
          inputMode="decimal"
          pattern="^\\d*(\\.\\d{0,2})?$"
          value={value}
          onChange={handleInput}
          {...props}
        />
      </div>
      {error && (
        <div className="mt-1 text-xs text-status-danger font-body">{error}</div>
      )}
    </div>
  );
}
