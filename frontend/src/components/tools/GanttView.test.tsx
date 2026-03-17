import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { GanttView } from './GanttView';

const apiClientMock = vi.hoisted(() => ({
  getGanttPayload: vi.fn(),
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

describe('GanttView', () => {
  beforeEach(() => {
    apiClientMock.getGanttPayload.mockReset();
    apiClientMock.getGanttPayload.mockResolvedValue({
      bars: [],
      timelineRange: {
        earliest: '2026-01-01',
        latest: '2026-12-31',
      },
    });
  });

  it('refetches gantt data when refreshSignal changes', async () => {
    const { rerender } = render(
      <GanttView sessionId="session-1" refreshSignal={0} />,
    );

    await waitFor(() => {
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledTimes(1);
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledWith('session-1');
    });

    rerender(<GanttView sessionId="session-1" refreshSignal={1} />);

    await waitFor(() => {
      expect(apiClientMock.getGanttPayload).toHaveBeenCalledTimes(2);
    });
  });
});
