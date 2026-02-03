import React from 'react';
import { DatePicker } from './DatePicker';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', onChange, type = 'text', ...props }: InputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Use custom DatePicker for date inputs
  if (type === 'date') {
    return (
      <DatePicker
        value={props.value as string | undefined}
        onChange={(date) => {
          onChange?.({
            target: { value: date }
          } as React.ChangeEvent<HTMLInputElement>);
        }}
        label={label}
        error={error}
        disabled={props.disabled}
      />
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-fg-secondary mb-1 font-body">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        className={`
          w-full bg-bg-dark text-fg-primary border border-border rounded-sm
          px-2 py-1 text-sm font-body
          focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary
          disabled:bg-bg-light disabled:text-fg-disabled disabled:cursor-not-allowed
          transition-colors duration-200
          ${error ? 'border-status-danger' : ''}
          ${className}
        `}
        type={type}
        onChange={handleChange}
        {...props}
      />
      {error && (
        <div className="mt-1 text-xs text-status-danger font-body">{error}</div>
      )}
    </div>
  );
}
