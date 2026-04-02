import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AgileView } from './AgileView';

const apiClientMock = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

vi.mock('../../store', () => ({
  useGraphStore: () => ({ nodes: {} }),
}));

vi.mock('../../store/filterStore', () => ({
  useFilterStore: () => ({ rules: [] }),
}));

vi.mock('../../utils/filterEngine', () => ({
  evaluateNodeVisibility: () => true,
}));

const defaultSchema = {
  node_types: [
    { id: 'task', name: 'Task', features: ['scheduling'], properties: [] },
  ],
} as any;

describe('AgileView', () => {
  beforeEach(() => {
    apiClientMock.executeCommand.mockReset();
    apiClientMock.executeCommand.mockResolvedValue({});
  });

  it('uses status property for drag-and-drop updates', async () => {
    const nodes = {
      'task-1': {
        id: 'task-1',
        type: 'task',
        properties: {
          name: 'Task A',
          estimated_hours: 4,
          status: 'To Do',
        },
      },
    } as any;

    render(
      <AgileView
        sessionId="session-1"
        nodes={nodes}
        velocityScores={{}}
        templateSchema={defaultSchema}
      />,
    );

    const card = screen.getByTestId('agile-card-task-1');
    const doneColumn = screen.getByTestId('agile-column-done');
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      getData(type: string) {
        return this.data[type] || '';
      },
      effectAllowed: 'move',
      dropEffect: 'move',
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(doneColumn, { dataTransfer });
    fireEvent.drop(doneColumn, { dataTransfer });

    await waitFor(() => {
      expect(apiClientMock.executeCommand).toHaveBeenCalledWith('session-1', 'UpdateProperty', {
        node_id: 'task-1',
        property_id: 'status',
        old_value: 'To Do',
        new_value: 'Done',
      });
    });
  });

  it('does not update agile status via drag-and-drop when session is not available', async () => {
    const nodes = {
      'task-1': {
        id: 'task-1',
        type: 'task',
        properties: {
          name: 'Task A',
          estimated_hours: 4,
          status: 'In Progress',
        },
      },
    } as any;

    render(
      <AgileView
        sessionId={null}
        nodes={nodes}
        velocityScores={{}}
        templateSchema={defaultSchema}
      />,
    );

    const card = screen.getByTestId('agile-card-task-1');
    const doneColumn = screen.getByTestId('agile-column-done');
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      getData(type: string) {
        return this.data[type] || '';
      },
      effectAllowed: 'move',
      dropEffect: 'move',
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(doneColumn, { dataTransfer });
    fireEvent.drop(doneColumn, { dataTransfer });

    await waitFor(() => {
      expect(apiClientMock.executeCommand).not.toHaveBeenCalled();
    });
  });

  it('hides nodes with no meaningful hours or velocity', () => {
    const nodes = {
      'task-hidden': {
        id: 'task-hidden',
        type: 'task',
        properties: {
          name: 'Hidden Task',
          estimated_hours: '',
          velocity: 0,
          start_date: '',
          end_date: '',
        },
      },
      'task-visible': {
        id: 'task-visible',
        type: 'task',
        properties: {
          name: 'Visible Task',
          estimated_hours: 1,
          velocity: 0,
        },
      },
    } as any;

    render(
      <AgileView
        sessionId="session-1"
        nodes={nodes}
        velocityScores={{}}
        templateSchema={defaultSchema}
      />,
    );

    expect(screen.queryByText('Hidden Task')).toBeNull();
    expect(screen.getByText('Visible Task')).toBeTruthy();
  });

  it('resolves option UUID status values to column names', () => {
    const nodes = {
      'bug-1': {
        id: 'bug-1',
        type: 'bug-type-uuid',
        properties: {
          name: 'Bug with UUID status',
          estimated_hours: 2,
          status: 'uuid-in-progress',
        },
      },
    } as any;

    const templateSchema = {
      node_types: [
        {
          id: 'bug-type-uuid',
          name: 'Bug',
          features: ['scheduling'],
          properties: [
            {
              id: 'status',
              type: 'select',
              options: [
                { id: 'uuid-to-do', name: 'To Do', indicator_id: 'empty' },
                { id: 'uuid-in-progress', name: 'In Progress', indicator_id: 'partial' },
                { id: 'uuid-done', name: 'Done', indicator_id: 'filled' },
              ],
            },
          ],
        },
      ],
    } as any;

    render(
      <AgileView
        sessionId="session-1"
        nodes={nodes}
        velocityScores={{}}
        templateSchema={templateSchema}
      />,
    );

    // The card should appear in the "In Progress" column, not "To Do"
    const inProgressColumn = screen.getByTestId('agile-column-in-progress');
    expect(inProgressColumn).toHaveTextContent('Bug with UUID status');

    const toDoColumn = screen.getByTestId('agile-column-to-do');
    expect(toDoColumn).not.toHaveTextContent('Bug with UUID status');
  });
});
