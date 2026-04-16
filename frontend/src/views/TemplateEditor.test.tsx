import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplateEditor } from './TemplateEditor';

const apiClientMock = vi.hoisted(() => ({
  listTemplatesForEditor: vi.fn(),
  getTemplateForEditor: vi.fn(),
  updateTemplate: vi.fn(),
  validateTemplate: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiClient: apiClientMock,
}));

vi.mock('../components/layout/TitleBar', () => ({
  TitleBar: () => null,
}));

vi.mock('./NodeTypeEditor', () => ({
  NodeTypeEditor: ({ nodeTypes, onChange }: any) => (
    <div>
      <div data-testid="node-types-count">{nodeTypes.length}</div>
      <button
        onClick={() => {
          const stable = nodeTypes.map((nodeType: any) => ({ ...nodeType }));
          const removed = stable.filter((nodeType: any) => nodeType.id !== 'task-b');
          void onChange(stable);
          void onChange(removed);
        }}
      >
        Trigger Race Delete
      </button>
      <button
        onClick={() => {
          const withStaleAllowedChildren = nodeTypes.map((nodeType: any) => {
            if (nodeType.id !== 'task-a') return { ...nodeType };
            return {
              ...nodeType,
              allowed_children: ['task-b', 'missing-node-type', 'task-a', 'task-b'],
            };
          });
          void onChange(withStaleAllowedChildren);
        }}
      >
        Trigger Stale Allowed Children
      </button>
    </div>
  ),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TemplateEditor', () => {
  beforeEach(() => {
    const template = {
      id: 'template-1',
      name: 'Template One',
      version: '1.0.0',
      description: 'Test',
      node_types: [
        { id: 'task-a', label: 'Task A', allowed_children: [], properties: [] },
        { id: 'task-b', label: 'Task B', allowed_children: [], properties: [] },
      ],
    };

    apiClientMock.listTemplatesForEditor.mockResolvedValue({
      templates: [
        { id: 'template-1', name: 'Template One', version: '1.0.0', description: 'Test' },
      ],
    });
    apiClientMock.getTemplateForEditor.mockResolvedValue(template);
    apiClientMock.validateTemplate.mockResolvedValue({ is_valid: true, errors: [] });
  });

  it('ignores stale update responses so deleted node types do not reappear', async () => {
    const first = createDeferred<any>();
    const second = createDeferred<any>();

    apiClientMock.updateTemplate
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    render(<TemplateEditor onClose={() => {}} />);

    await screen.findByText('template-1');
    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(screen.getByTestId('node-types-count').textContent).toBe('2');
    });

    fireEvent.click(screen.getByText('Trigger Race Delete'));

    second.resolve({
      template: {
        id: 'template-1',
        name: 'Template One',
        version: '1.0.0',
        description: 'Test',
        node_types: [
          { id: 'task-a', label: 'Task A', allowed_children: [], properties: [] },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('node-types-count').textContent).toBe('1');
    });

    first.resolve({
      template: {
        id: 'template-1',
        name: 'Template One',
        version: '1.0.0',
        description: 'Test',
        node_types: [
          { id: 'task-a', label: 'Task A', allowed_children: [], properties: [] },
          { id: 'task-b', label: 'Task B', allowed_children: [], properties: [] },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('node-types-count').textContent).toBe('1');
    });
  });

  it('sanitizes stale allowed_children before sending template update', async () => {
    apiClientMock.updateTemplate.mockResolvedValue({
      template: {
        id: 'template-1',
        name: 'Template One',
        version: '1.0.0',
        description: 'Test',
        node_types: [
          { id: 'task-a', label: 'Task A', allowed_children: ['task-b'], properties: [] },
          { id: 'task-b', label: 'Task B', allowed_children: [], properties: [] },
        ],
      },
    });

    render(<TemplateEditor onClose={() => {}} />);

    await screen.findByText('template-1');
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByTestId('node-types-count').textContent).toBe('2');
    });

    fireEvent.click(screen.getByText('Trigger Stale Allowed Children'));

    // With the deferred-save refactor, node type changes only update local
    // draft state. Trigger an explicit Save to persist.
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiClientMock.updateTemplate).toHaveBeenCalled();
    });

    const latestCall = apiClientMock.updateTemplate.mock.calls.at(-1);
    expect(latestCall).toBeTruthy();
    const payload = latestCall?.[1];
    const taskA = payload.node_types.find((nodeType: any) => nodeType.id === 'task-a');
    expect(Array.isArray(taskA.allowed_children)).toBe(true);
    expect(taskA.allowed_children.includes('missing-node-type')).toBe(false);
    expect(taskA.allowed_children.includes('task-a')).toBe(false);
    expect(new Set(taskA.allowed_children).size).toBe(taskA.allowed_children.length);
  });
});
