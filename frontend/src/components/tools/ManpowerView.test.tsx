import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ManpowerView } from './ManpowerView';
import { apiClient } from '../../api/client';
import { useGraphStore } from '../../store';

const useManpowerPayloadMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useManpowerPayload', () => ({
  useManpowerPayload: useManpowerPayloadMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

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
        allocation_property_id: 'allocations',
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
        task_allocations: [
          {
            node_id: 'task-1',
            name: 'Task A',
            person_id: 'person-1',
            allocated_hours: 4,
            target_hours: 4,
            status: 'full',
          },
          {
            node_id: 'episode-2',
            name: 'Episode B',
            person_id: 'person-1',
            allocated_hours: 0,
            target_hours: 1,
            status: 'under',
          },
        ],
        person_tasks: {
          'person-1': [
            { node_id: 'task-1', name: 'Task A', start_date: '2026-01-01', end_date: '2026-01-01' },
            { node_id: 'task-2', name: 'Task B', start_date: '2026-01-01', end_date: '2026-01-01' },
            { node_id: 'episode-2', name: 'Episode B', start_date: '2026-01-01', end_date: '2026-01-01' },
          ],
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
            properties: {
              name: 'Task B',
              assigned_to: ['person-1'],
              estimated_hours: 1,
              start_date: '2026-01-01',
              end_date: '2026-01-01',
            },
          } as any,
          'episode-2': {
            id: 'episode-2',
            type: 'episode',
            name: 'Episode B',
            properties: {
              name: 'Episode B',
              assigned_to: ['person-1'],
              estimated_hours: 1,
              start_date: '2026-01-01',
              end_date: '2026-01-01',
            },
          } as any,
        }}
      />,
    );

    expect(screen.getByText('Task A')).toBeInTheDocument();
    expect(screen.getByText('Task B')).toBeInTheDocument();
    expect(screen.getByText('Episode B')).toBeInTheDocument();
  });

  it('keeps inline drafts scoped to a single assignee for shared tasks', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const executeCommand = vi.spyOn(apiClient, 'executeCommand').mockResolvedValue({ success: true });

    // Seed Zustand store so the save path can read the node
    useGraphStore.setState({
      nodes: {
        'episode-1': {
          id: 'episode-1',
          type: 'episode',
          name: 'Shared Episode',
          properties: {
            name: 'Shared Episode',
            assigned_to: ['person-1', 'person-2'],
            estimated_hours: 8,
            start_date: '2026-01-01',
            end_date: '2026-01-01',
            allocations: {},
          },
        } as any,
      },
    });

    useManpowerPayloadMock.mockReturnValue({
      data: {
        date_columns: ['2026-01-01'],
        resources: {
          'person-1': {
            name: 'Alex',
            capacity: 8,
            load: {
              '2026-01-01': { total: 0, tasks: [] },
            },
          },
          'person-2': {
            name: 'Blair',
            capacity: 8,
            load: {
              '2026-01-01': { total: 0, tasks: [] },
            },
          },
        },
        task_allocations: [
          {
            node_id: 'episode-1',
            name: 'Shared Episode',
            person_id: 'person-1',
            allocated_hours: 0,
            target_hours: 4,
            status: 'under',
          },
          {
            node_id: 'episode-1',
            name: 'Shared Episode',
            person_id: 'person-2',
            allocated_hours: 0,
            target_hours: 4,
            status: 'under',
          },
        ],
        person_tasks: {
          'person-1': [
            { node_id: 'episode-1', name: 'Shared Episode', start_date: '2026-01-01', end_date: '2026-01-01' },
          ],
          'person-2': [
            { node_id: 'episode-1', name: 'Shared Episode', start_date: '2026-01-01', end_date: '2026-01-01' },
          ],
        },
        timestamp: 1,
      },
      loading: false,
      error: null,
      refresh,
    });

    render(
      <ManpowerView
        sessionId="session-1"
        nodes={{
          'episode-1': {
            id: 'episode-1',
            type: 'episode',
            name: 'Shared Episode',
            properties: {
              name: 'Shared Episode',
              assigned_to: ['person-1', 'person-2'],
              estimated_hours: 8,
              start_date: '2026-01-01',
              end_date: '2026-01-01',
              allocations: {},
            },
          } as any,
        }}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: '3' } });

    expect(inputs[0]).toHaveValue('3');
    expect(inputs[1]).toHaveValue('');

    fireEvent.blur(inputs[0]);

    await waitFor(() => {
      expect(executeCommand).toHaveBeenCalledWith('session-1', 'UpdateProperty', {
        node_id: 'episode-1',
        property_id: 'allocations',
        old_value: {},
        new_value: {
          '2026-01-01': {
            'person-1': 3,
          },
        },
      });
      expect(refresh).toHaveBeenCalled();
    });
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
    expect(screen.getAllByText(/1 overbooked person-day/).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText(/1 overbooked person-day/).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText(/1 overbooked person-day/).length).toBeGreaterThan(0);
  });
});
