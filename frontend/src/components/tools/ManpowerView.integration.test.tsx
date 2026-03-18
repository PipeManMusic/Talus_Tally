import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { ManpowerView } from './ManpowerView';

const apiClientMock = vi.hoisted(() => ({
  getManpowerPayload: vi.fn(),
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

describe('ManpowerView integration', () => {
  beforeEach(() => {
    apiClientMock.getManpowerPayload.mockReset();
    apiClientMock.getManpowerPayload.mockResolvedValue({
      date_columns: ['2026-01-01', '2026-01-02'],
      resources: {
        'person-1': {
          name: 'Alex',
          capacity: 8,
          load: {
            '2026-01-01': { total: 4, tasks: [{ id: 'task-1', name: 'Task A', hours: 4, is_manual: false }] },
            '2026-01-02': { total: 4, tasks: [{ id: 'task-2', name: 'Task B', hours: 4, is_manual: false }] },
          },
        },
        'person-2': {
          name: 'Blair',
          capacity: 8,
          load: {
            '2026-01-01': { total: 3, tasks: [{ id: 'task-3', name: 'Task C', hours: 3, is_manual: false }] },
            '2026-01-02': { total: 3, tasks: [{ id: 'task-4', name: 'Task D', hours: 3, is_manual: false }] },
          },
        },
      },
      timestamp: 1,
    });
  });

  it('renders manpower table rows from hook payload', async () => {
    render(<ManpowerView sessionId="session-1" />);

    await waitFor(() => {
      expect(apiClientMock.getManpowerPayload).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText('Blair')).toBeInTheDocument();
      expect(screen.getAllByTitle('Load 4 / Regular 8').length).toBeGreaterThan(0);
      expect(screen.getAllByTitle('Load 3 / Regular 8').length).toBeGreaterThan(0);
    });
  });
});