import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GanttView } from './GanttView';

const apiClientMock = vi.hoisted(() => ({
  getGanttPayload: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

/** Template schema with scheduling enabled on 'task' type */
const defaultSchema = {
  node_types: [
    { id: 'task', name: 'Task', features: ['scheduling'] },
    { id: 'note', name: 'Note', features: [] },
  ],
  properties: [],
  features: [],
};

/** A standard two-bar payload */
function makeBarsPayload() {
  return {
    bars: [
      {
        nodeId: 'n1', nodeName: 'Alpha', nodeType: 'task',
        startDate: '2026-03-01', endDate: '2026-03-15',
        leftPercent: 10, widthPercent: 20, depth: 0,
        progress: 0.5, status: 'In Progress', assignedTo: [], estimatedHours: 8,
      },
      {
        nodeId: 'n2', nodeName: 'Beta', nodeType: 'task',
        startDate: '2026-06-01', endDate: '2026-06-30',
        leftPercent: 40, widthPercent: 25, depth: 1,
        progress: 0, status: 'To Do', assignedTo: [], estimatedHours: 0,
      },
    ],
    timelineRange: { earliest: '2026-01-01', latest: '2026-12-31' },
    today: '2026-04-15',
  };
}

describe('GanttView', () => {
  beforeEach(() => {
    apiClientMock.getGanttPayload.mockReset();
    apiClientMock.executeCommand.mockReset();
    apiClientMock.getGanttPayload.mockResolvedValue({
      bars: [],
      timelineRange: { earliest: '2026-01-01', latest: '2026-12-31' },
      today: '2026-04-15',
    });
  });

  it('refetches gantt data when refreshSignal changes', async () => {
    const { rerender } = render(
      <GanttView sessionId="session-1" refreshSignal={0} templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledTimes(1);
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledWith('session-1');
    });

    rerender(<GanttView sessionId="session-1" refreshSignal={1} templateSchema={defaultSchema} />);

    await waitFor(() => {
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledTimes(2);
    });
  });

  it('shows empty state when no bars have scheduling feature', async () => {
    const noSchedulingSchema = {
      node_types: [{ id: 'task', name: 'Task', features: [] }],
      properties: [],
      features: [],
    };
    apiClientMock.getGanttPayload.mockResolvedValue(makeBarsPayload());

    render(
      <GanttView sessionId="s1" templateSchema={noSchedulingSchema} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No nodes with scheduling data')).toBeTruthy();
    });
  });

  it('renders bars for scheduling-enabled node types', async () => {
    apiClientMock.getGanttPayload.mockResolvedValue(makeBarsPayload());

    render(
      <GanttView sessionId="s1" templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('gantt-chart')).toBeTruthy();
    });
    // Name appears in label column + bar overlay
    expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
  });

  it('filters out bars for types without scheduling feature', async () => {
    const payload = makeBarsPayload();
    payload.bars.push({
      nodeId: 'n3', nodeName: 'Hidden Note', nodeType: 'note',
      startDate: '2026-05-01', endDate: '2026-05-15',
      leftPercent: 30, widthPercent: 10, depth: 0,
      progress: 0, status: '', assignedTo: [], estimatedHours: 0,
    });
    apiClientMock.getGanttPayload.mockResolvedValue(payload);

    render(
      <GanttView sessionId="s1" templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText('Hidden Note')).toBeNull();
  });

  it('renders zoom control buttons', async () => {
    apiClientMock.getGanttPayload.mockResolvedValue(makeBarsPayload());

    render(
      <GanttView sessionId="s1" templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Day')).toBeTruthy();
    });
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });

  it('switches zoom level on button click', async () => {
    apiClientMock.getGanttPayload.mockResolvedValue(makeBarsPayload());

    render(
      <GanttView sessionId="s1" templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Month')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Month'));
    // After clicking Month, we should see month column headers (e.g., "Jan 2026")
    await waitFor(() => {
      expect(screen.getByText('Jan 2026')).toBeTruthy();
    });
  });

  it('shows status summary in toolbar', async () => {
    apiClientMock.getGanttPayload.mockResolvedValue(makeBarsPayload());

    render(
      <GanttView sessionId="s1" templateSchema={defaultSchema} />,
    );

    await waitFor(() => {
      // Appears in both status summary and footer legend
      expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('To Do').length).toBeGreaterThanOrEqual(1);
  });

  it('shows no-session message when sessionId is null', () => {
    render(<GanttView sessionId={null} />);
    expect(screen.getByText('No project loaded')).toBeTruthy();
  });
});
