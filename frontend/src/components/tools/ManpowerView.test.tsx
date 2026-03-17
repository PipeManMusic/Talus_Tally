import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ManpowerView } from './ManpowerView';

const useManpowerPayloadMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useManpowerPayload', () => ({
  useManpowerPayload: useManpowerPayloadMock,
}));

describe('ManpowerView', () => {
  it('renders manpower rows and allows selecting a resource', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01', '2026-01-02'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 8,
            load: {
              '2026-01-01': 4,
              '2026-01-02': 6,
            },
          },
        },
        timestamp: 1,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const onNodeSelect = vi.fn();

    render(
      <ManpowerView
        sessionId="session-1"
        selectedNodeId={null}
        onNodeSelect={onNodeSelect}
      />,
    );

    expect(screen.getByText('Manpower Loading')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Alex'));
    expect(onNodeSelect).toHaveBeenCalledWith('person-1');
  });

  it('shows the empty state when no manpower data exists', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: [],
        resources: {},
        timestamp: 1,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<ManpowerView sessionId="session-1" />);

    expect(screen.getByText('No manpower data available')).toBeInTheDocument();
  });

  it('calls onOverloadChange with overloaded day count and shows legend', async () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01', '2026-01-02'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 4,
            load: {
              '2026-01-01': 8, // 200 % → overloaded
              '2026-01-02': 2, // 50 %  → under capacity
            },
          },
        },
        timestamp: 1,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const onOverloadChange = vi.fn();

    render(<ManpowerView sessionId="session-1" onOverloadChange={onOverloadChange} />);

    expect(screen.getByText('Legend:')).toBeInTheDocument();
    expect(screen.getByText(/1 overloaded person-day/)).toBeInTheDocument();
    expect(onOverloadChange).toHaveBeenCalledWith(1);
  });
});
