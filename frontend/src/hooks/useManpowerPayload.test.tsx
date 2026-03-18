import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { useManpowerPayload } from './useManpowerPayload';

const apiClientMock = vi.hoisted(() => ({
  getManpowerPayload: vi.fn(),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

vi.mock('./useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

function HookHarness({ sessionId, refreshSignal = 0 }: { sessionId: string; refreshSignal?: number }) {
  const { data, loading, error } = useManpowerPayload({
    sessionId,
    refreshSignal,
  });

  return (
    <div>
      <div data-testid="loading">{loading ? 'yes' : 'no'}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="resources">{data ? Object.keys(data.resources).length : 0}</div>
      <div data-testid="first-name">{data ? Object.values(data.resources)[0]?.name ?? '' : ''}</div>
    </div>
  );
}

describe('useManpowerPayload', () => {
  beforeEach(() => {
    apiClientMock.getManpowerPayload.mockReset();
    apiClientMock.getManpowerPayload.mockResolvedValue({
      date_columns: ['2026-01-01'],
      resources: {
        'person-1': {
          name: 'Alex',
          capacity: 8,
          load: {
            '2026-01-01': { total: 4, tasks: [] },
          },
        },
      },
      timestamp: 1,
    });
  });

  it('loads manpower data and exposes the payload', async () => {
    render(<HookHarness sessionId="session-1" />);

    await waitFor(() => {
      expect(apiClientMock.getManpowerPayload).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('resources').textContent).toBe('1');
      expect(screen.getByTestId('first-name').textContent).toBe('Alex');
    });
  });

  it('refetches when refreshSignal changes', async () => {
    const { rerender } = render(<HookHarness sessionId="session-1" refreshSignal={0} />);

    await waitFor(() => {
      expect(apiClientMock.getManpowerPayload).toHaveBeenCalledTimes(1);
    });

    rerender(<HookHarness sessionId="session-1" refreshSignal={1} />);

    await waitFor(() => {
      expect(apiClientMock.getManpowerPayload).toHaveBeenCalledTimes(2);
    });
  });
});