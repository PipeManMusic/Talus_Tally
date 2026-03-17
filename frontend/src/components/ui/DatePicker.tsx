import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value?: string;
  onChange: (date: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

function parseIsoDateLocal(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  const date = new Date(year, monthIndex, day);
  if (!isValidDate(date)) return null;
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseIsoDateTimeLocal(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const isoDatePart = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(trimmed)?.[1];
  if (!isoDatePart) return null;
  return parseIsoDateLocal(isoDatePart);
}

function parseUsDateLocal(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const monthIndex = Number(match[1]) - 1;
  const day = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, monthIndex, day);
  if (!isValidDate(date)) return null;
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseToValidDate(val: string | undefined): Date {
  const parsed = parseDateValue(val);
  if (parsed) return parsed;
  return new Date();
}

function parseDateValue(value: string | undefined): Date | null {
  return (
    parseIsoDateLocal(value) ||
    parseIsoDateTimeLocal(value) ||
    (value ? parseUsDateLocal(value) : null)
  );
}

export function DatePicker({ value, onChange, label, error, disabled }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => parseToValidDate(value));

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const yearOptions = (() => {
    const selectedYear = currentDate.getFullYear();
    const startYear = selectedYear - 100;
    const endYear = selectedYear + 20;
    const years: number[] = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }
    return years;
  })();

  const getDaysInMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  const getFirstDayOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = Number(e.target.value);
    setCurrentDate(new Date(currentDate.getFullYear(), newMonth, 1));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = Number(e.target.value);
    setCurrentDate(new Date(newYear, currentDate.getMonth(), 1));
  };

  const handleDateClick = (day: number) => {
    const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onChange(formatIsoDateLocal(selectedDate));
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onChange('');
      return;
    }

    const parsedDate = parseDateValue(val);
    if (parsedDate) {
      onChange(formatIsoDateLocal(parsedDate));
      setCurrentDate(parsedDate);
    }
  };

  useEffect(() => {
    const parsed = parseDateValue(value);
    if (parsed) {
      setCurrentDate(parsed);
    }
  }, [value]);

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
  const days: (number | null)[] = Array(firstDay >= 0 ? firstDay : 0).fill(null);
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const selectedDate = parseDateValue(value);

  const displayValue = (() => {
    if (!selectedDate) return '';
    return selectedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  })();

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
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-bg-dark rounded transition-colors"
                type="button"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} className="text-fg-primary" />
              </button>

              <div className="flex items-center gap-2">
                <select
                  value={currentDate.getMonth()}
                  onChange={handleMonthChange}
                  className="bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs"
                  aria-label="Month"
                >
                  {monthNames.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={currentDate.getFullYear()}
                  onChange={handleYearChange}
                  className="bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs"
                  aria-label="Year"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-bg-dark rounded transition-colors"
                type="button"
                aria-label="Next month"
              >
                <ChevronRight size={16} className="text-fg-primary" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="w-6 h-6 flex items-center justify-center text-xs text-fg-secondary font-body"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="w-6 h-6" />;
                }

                const isSelected = !!selectedDate &&
                  selectedDate.getDate() === day &&
                  selectedDate.getMonth() === currentDate.getMonth() &&
                  selectedDate.getFullYear() === currentDate.getFullYear();

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
