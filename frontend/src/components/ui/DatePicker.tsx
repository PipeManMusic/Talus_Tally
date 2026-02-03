import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value?: string; // ISO date string (YYYY-MM-DD)
  onChange: (date: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, label, error, disabled }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const isoDate = selectedDate.toISOString().split('T')[0];
    onChange(isoDate);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      onChange(val);
      setCurrentDate(new Date(val));
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // Format display value
  const displayValue = value ? new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }) : '';

  return (
    <div ref={containerRef} className="w-full">
      {label && (
        <label className="block text-sm text-fg-secondary mb-1 font-body">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          placeholder="MM/DD/YYYY"
          className={`
            w-full bg-bg-dark text-fg-primary border border-border rounded-sm
            px-2 py-1 text-sm font-body cursor-pointer
            focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary
            disabled:bg-bg-light disabled:text-fg-disabled disabled:cursor-not-allowed
            transition-colors duration-200
            ${error ? 'border-status-danger' : ''}
          `}
        />

        {isOpen && !disabled && (
          <div className="absolute top-full left-0 mt-1 bg-bg-light border border-border rounded-sm shadow-lg z-50 p-3">
            {/* Month/Year Navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-bg-dark rounded transition-colors"
                type="button"
              >
                <ChevronLeft size={16} className="text-fg-primary" />
              </button>
              <div className="text-sm font-body text-fg-primary">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </div>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-bg-dark rounded transition-colors"
                type="button"
              >
                <ChevronRight size={16} className="text-fg-primary" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div
                  key={day}
                  className="w-6 h-6 flex items-center justify-center text-xs text-fg-secondary font-body"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="w-6 h-6" />;
                }

                // Check if this is the selected day
                const isSelected = value && new Date(value).getDate() === day &&
                  new Date(value).getMonth() === currentDate.getMonth() &&
                  new Date(value).getFullYear() === currentDate.getFullYear();

                return (
                  <button
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`
                      w-6 h-6 flex items-center justify-center text-xs rounded
                      transition-colors duration-150 font-body
                      ${isSelected
                        ? 'bg-accent-primary text-bg-dark font-semibold'
                        : 'text-fg-primary hover:bg-bg-dark'
                      }
                    `}
                    type="button"
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-1 text-xs text-status-danger font-body">{error}</div>
      )}
    </div>
  );
}
