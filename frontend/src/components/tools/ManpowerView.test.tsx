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
              '2026-01-01': { total: 4, tasks: [{ id: 'task-1', name: 'Task A', hours: 4, is_manual: false }] },
              '2026-01-02': { total: 6, tasks: [{ id: 'task-2', name: 'Task B', hours: 6, is_manual: false }] },
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

  it('allows selecting a task row for inspector editing', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 8,
            load: {
              '2026-01-01': { total: 4, tasks: [{ id: 'task-1', name: 'Task A', hours: 4, is_manual: false }] },
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

    fireEvent.click(screen.getByText('Task A'));
    expect(onNodeSelect).toHaveBeenCalledWith('task-1');
  });

  it('shows assigned tasks even when they have no dated load yet', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 8,
            load: {
              '2026-01-01': { total: 4, tasks: [{ id: 'task-1', name: 'Task A', hours: 4, is_manual: false }] },
            },
          },
        },
        timestamp: 1,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <ManpowerView
        sessionId="session-1"
        nodes={{
          'task-1': {
            id: 'task-1',
            type: 'task',
            name: 'Task A',
            properties: { assigned_to: ['person-1'], estimated_hours: 4 },
          } as any,
          'task-2': {
            id: 'task-2',
            type: 'task',
            name: 'Task B',
            properties: { assigned_to: ['person-1'], estimated_hours: 1 },
          } as any,
        }}
      />,
    );

    expect(screen.getByText('Task A')).toBeInTheDocument();
    expect(screen.getByText('Task B')).toBeInTheDocument();
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
              '2026-01-01': { total: 8, tasks: [] }, // 200 % → overloaded
              '2026-01-02': { total: 2, tasks: [] }, // 50 %  → under capacity
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
    expect(screen.getByText(/1 overbooked person-day/)).toBeInTheDocument();
    expect(onOverloadChange).toHaveBeenCalledWith(1);
  });

  it('uses day-specific capacities when computing overload count', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01', '2026-01-02'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 6,
            capacity_by_day: {
              '2026-01-01': 0.5,
              '2026-01-02': 8,
            },
            load: {
              '2026-01-01': { total: 2, tasks: [] },
              '2026-01-02': { total: 2, tasks: [] },
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

    expect(onOverloadChange).toHaveBeenCalledWith(1);
    expect(screen.getByText(/1 overbooked person-day/)).toBeInTheDocument();
  });

  it('uses day-specific overtime capacities when computing overload count', () => {
    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01', '2026-01-02'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 4,
            capacity_by_day: {
              '2026-01-01': 4,
              '2026-01-02': 4,
            },
            overtime_capacity_by_day: {
              '2026-01-01': 2,
              '2026-01-02': 0,
            },
            load: {
              '2026-01-01': { total: 6, tasks: [] },
              '2026-01-02': { total: 6, tasks: [] },
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

    expect(onOverloadChange).toHaveBeenCalledWith(1);
    expect(screen.getByText(/1 overbooked person-day/)).toBeInTheDocument();
  });
});
