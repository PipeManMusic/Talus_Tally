import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('emits the exact selected local day in ISO format', () => {
    const onChange = vi.fn();

    render(
      <DatePicker
        value="2026-03-15"
        onChange={onChange}
        label="Start Date"
      />,
    );

    const input = screen.getByPlaceholderText('MM/DD/YYYY');
    fireEvent.click(input);

    fireEvent.click(screen.getByRole('button', { name: '20' }));

    expect(onChange).toHaveBeenCalledWith('2026-03-20');
  });

  it('allows quick year changes via year dropdown', () => {
    const onChange = vi.fn();

    render(
      <DatePicker
        value="2026-03-15"
        onChange={onChange}
        label="Due Date"
      />,
    );

    const input = screen.getByPlaceholderText('MM/DD/YYYY');
    fireEvent.click(input);

    const yearSelect = screen.getByLabelText('Year');
    fireEvent.change(yearSelect, { target: { value: '2030' } });

    fireEvent.click(screen.getByRole('button', { name: '12' }));

    expect(onChange).toHaveBeenCalledWith('2030-03-12');
  });

  it('opens on the correct month/year for existing ISO datetime values', () => {
    const onChange = vi.fn();

    render(
      <DatePicker
        value="2026-11-07T00:00:00Z"
        onChange={onChange}
        label="Milestone"
      />,
    );

    const input = screen.getByPlaceholderText('MM/DD/YYYY');
    fireEvent.click(input);

    const monthSelect = screen.getByLabelText('Month') as HTMLSelectElement;
    const yearSelect = screen.getByLabelText('Year') as HTMLSelectElement;

    expect(monthSelect.value).toBe('10');
    expect(yearSelect.value).toBe('2026');
  });
});
