import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TreeView } from '../TreeView';
import { useFilterStore } from '../../../store/filterStore';
import type { TreeNode } from '../../../utils/treeUtils';

// Polyfill DragEvent for jsdom which lacks it — without this,
// fireEvent.dragOver() falls back to `new Event()` and clientY is lost.
if (typeof globalThis.DragEvent === 'undefined') {
  (globalThis as any).DragEvent = class DragEventPolyfill extends MouseEvent {
    dataTransfer: DataTransfer | null;
    constructor(type: string, init?: any) {
      super(type, init);
      this.dataTransfer = init?.dataTransfer ?? null;
    }
  };
}

vi.mock('../../graph/mapNodeIcon', () => ({
  mapNodeIcon: vi.fn(() => Promise.resolve('<svg></svg>')),
  subscribeToIconCache: vi.fn(() => () => {}),
}));

vi.mock('../../graph/mapNodeIndicator', () => ({
  mapNodeIndicator: vi.fn(async (node: any) => {
    if (node.indicator_id === 'empty') {
      return {
        ...node,
        statusIndicatorSvg: '<svg><circle cx="5" cy="5" r="4"/></svg>',
        statusText: undefined,
        indicatorColor: '#888888',
        textColor: '#888888',
        textStyle: 'normal',
      };
    }
    if (node.indicator_id === 'filled') {
      return {
        ...node,
        statusIndicatorSvg: '<svg><rect x="1" y="1" width="8" height="8"/></svg>',
        statusText: undefined,
        indicatorColor: '#22aa22',
        textColor: '#22aa22',
        textStyle: 'bold',
      };
    }
    return node;
  }),
}));

type DragPayload = {
  nodeId: string;
  nodeType: string;
  parent_id: string | null;
  descendants: string[];
};

const createTree = (): TreeNode[] => [
  {
    id: 'season-1',
    name: 'Season 1',
    type: 'season',
    properties: { name: 'Season 1' },
    allowed_children: ['episode'],
    parent_id: undefined,
    indicator_id: undefined,
    indicator_set: undefined,
    icon_id: undefined,
    statusIndicatorSvg: undefined,
    statusText: undefined,
    children: [
      {
        id: 'episode-a',
        name: 'Episode A',
        type: 'episode',
        properties: { name: 'Episode A' },
        allowed_children: [],
        parent_id: 'season-1',
        indicator_id: undefined,
        indicator_set: undefined,
        icon_id: undefined,
        statusIndicatorSvg: undefined,
        statusText: undefined,
        children: [],
      },
      {
        id: 'episode-b',
        name: 'Episode B',
        type: 'episode',
        properties: { name: 'Episode B' },
        allowed_children: [],
        parent_id: 'season-1',
        indicator_id: undefined,
        indicator_set: undefined,
        icon_id: undefined,
        statusIndicatorSvg: undefined,
        statusText: undefined,
        children: [],
      },
    ],
  },
];

const createRect = (top: number, height: number) => ({
  top,
  left: 0,
  right: 200,
  bottom: top + height,
  height,
  width: 200,
  x: 0,
  y: top,
  toJSON: () => ({ top, height }),
});

const assignBoundingRect = (element: Element, top = 0, height = 40) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => createRect(top, height),
    configurable: true,
    writable: true,
  });
};

const createDataTransfer = (payload: DragPayload) => {
  const json = JSON.stringify(payload);
  return {
    getData: vi.fn((type: string) => (type === 'application/json' ? json : '')),
    setData: vi.fn(),
    dropEffect: 'move',
    effectAllowed: 'move',
  } as unknown as DataTransfer;
};

beforeEach(() => {
  vi.clearAllMocks();
  useFilterStore.setState({
    rules: [],
    filterMode: 'ghost',
    isExpanded: false,
    filterTabVisible: false,
  });
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
    text: async () => '',
  })) as unknown as typeof fetch;
});

describe('TreeView drag and drop', () => {
  it('emits move action when dropping inside a new parent', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const targetRow = screen.getByText('Season 1').closest('[data-testid="tree-item-row"]');
    expect(targetRow).not.toBeNull();
    assignBoundingRect(targetRow!);

    const dataTransfer = createDataTransfer({
      nodeId: 'episode-b',
      nodeType: 'episode',
      parent_id: 'other-parent',
      descendants: [],
    });

    fireEvent.dragOver(targetRow!, { dataTransfer, clientY: 20 });
    fireEvent.drop(targetRow!, { dataTransfer, clientY: 20 });

    expect(onContextMenu).toHaveBeenCalledWith('episode-b', 'move:season-1');
  });

  it('emits reorder action when dropping above a sibling', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const targetRow = screen.getByText('Episode A').closest('[data-testid="tree-item-row"]');
    expect(targetRow).not.toBeNull();
    assignBoundingRect(targetRow!);

    const dataTransfer = createDataTransfer({
      nodeId: 'episode-b',
      nodeType: 'episode',
      parent_id: 'season-1',
      descendants: [],
    });

    fireEvent.dragOver(targetRow!, { dataTransfer, clientY: 5 });
    fireEvent.drop(targetRow!, { dataTransfer, clientY: 5 });

    expect(onContextMenu).toHaveBeenCalledWith('episode-b', 'reorder:episode-a:above');
  });

  it('reorders when dropping centered on a sibling without child allowance', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const targetRow = screen.getByText('Episode A').closest('[data-testid="tree-item-row"]');
    expect(targetRow).not.toBeNull();
    assignBoundingRect(targetRow!, 0, 40);

    const dataTransfer = createDataTransfer({
      nodeId: 'episode-b',
      nodeType: 'episode',
      parent_id: 'season-1',
      descendants: [],
    });

    fireEvent.dragOver(targetRow!, { dataTransfer, clientY: 20 });
    fireEvent.drop(targetRow!, { dataTransfer, clientY: 20 });

    expect(onContextMenu).toHaveBeenCalledWith('episode-b', 'reorder:episode-a:below');
  });

  it('ignores drops onto descendant nodes', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const targetRow = screen.getByText('Episode A').closest('[data-testid="tree-item-row"]');
    expect(targetRow).not.toBeNull();
    assignBoundingRect(targetRow!);

    const dataTransfer = createDataTransfer({
      nodeId: 'season-1',
      nodeType: 'season',
      parent_id: null,
      descendants: ['episode-a'],
    });

    fireEvent.dragOver(targetRow!, { dataTransfer, clientY: 10 });
    fireEvent.drop(targetRow!, { dataTransfer, clientY: 10 });

    expect(onContextMenu).not.toHaveBeenCalled();
  });
});

describe('TreeView filtering', () => {
  it('keeps ancestors visible in hide mode when a descendant matches', () => {
    useFilterStore.setState({
      rules: [
        {
          id: 'velocity-rule',
          property: 'velocity_score',
          operator: 'greater_than',
          value: 0,
        },
      ],
      filterMode: 'hide',
    });

    const nodes = createTree();

    render(
      <TreeView
        nodes={nodes}
        velocityScores={{
          'episode-b': { totalVelocity: 3 },
        }}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.queryByText('Episode A')).not.toBeInTheDocument();
    expect(screen.getByText('Episode B')).toBeInTheDocument();
  });

  it('ghosts only the non-matching row, not the whole matching subtree', () => {
    useFilterStore.setState({
      rules: [
        {
          id: 'velocity-rule',
          property: 'velocity_score',
          operator: 'greater_than',
          value: 0,
        },
      ],
      filterMode: 'ghost',
    });

    const nodes = createTree();

    render(
      <TreeView
        nodes={nodes}
        velocityScores={{
          'episode-b': { totalVelocity: 3 },
        }}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const seasonRow = screen.getByText('Season 1').closest('[data-testid="tree-item-row"]');
    const matchingChildRow = screen.getByText('Episode B').closest('[data-testid="tree-item-row"]');

    expect(seasonRow?.className).not.toContain('opacity-30');
    expect(matchingChildRow?.className).not.toContain('opacity-30');
  });
});

describe('TreeView contextual import/export actions', () => {
  it('emits import-csv-here from context menu', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const targetRow = screen.getByText('Episode A').closest('[data-testid="tree-item-row"]');
    expect(targetRow).not.toBeNull();

    fireEvent.contextMenu(targetRow!);
    fireEvent.click(screen.getByText('📥 Import CSV Here'));

    expect(onContextMenu).toHaveBeenCalledWith('episode-a', 'import-csv-here');
  });

  it('emits export-branch from plus flyout menu', () => {
    const nodes = createTree();
    const onContextMenu = vi.fn();

    render(
      <TreeView
        nodes={nodes}
        onContextMenu={onContextMenu}
        expandedMap={{ 'season-1': true }}
        setExpandedMap={vi.fn()}
      />
    );

    const addButton = screen.getAllByTestId('add-child-btn')[0];
    fireEvent.click(addButton);
    fireEvent.click(screen.getByText('📤 Export Branch'));

    expect(onContextMenu).toHaveBeenCalledWith('season-1', 'export-branch');
  });
});

describe('TreeView multiple status indicators', () => {
  it('renders all status indicators horizontally and uses primary status for text styling', async () => {
    const nodes: TreeNode[] = [
      {
        id: 'episode-a',
        name: 'Episode A',
        type: 'episode',
        properties: { name: 'Episode A', production_status: 'Planned', publish_status: 'Done' },
        allowed_children: [],
        parent_id: undefined,
        indicator_id: undefined,
        indicator_set: undefined,
        icon_id: undefined,
        statusIndicatorSvg: undefined,
        statusText: undefined,
        children: [],
      },
    ];

    const nodeTypeSchemas = {
      episode: {
        id: 'episode',
        name: 'Episode',
        primary_status_property_id: 'publish_status',
        allowed_children: [],
        properties: [
          {
            id: 'production_status',
            name: 'Production Status',
            type: 'select',
            required: false,
            indicator_set: 'status',
            options: [
              { id: 'planned', name: 'Planned', indicator_id: 'empty' },
            ],
          },
          {
            id: 'publish_status',
            name: 'Publish Status',
            type: 'select',
            required: false,
            indicator_set: 'status',
            options: [
              { id: 'done', name: 'Done', indicator_id: 'filled' },
            ],
          },
        ],
      },
    };

    render(
      <TreeView
        nodes={nodes}
        nodeTypeSchemas={nodeTypeSchemas as any}
        expandedMap={{}}
        setExpandedMap={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(rowHasTwoStatusSvgs()).toBe(true);
    });

    const row = screen.getByText('Episode A').closest('[data-testid="tree-item-row"]');
    expect(row).not.toBeNull();

    const statusContainer = row!.querySelector('.status-indicator-svg');
    expect(statusContainer).not.toBeNull();
    expect(statusContainer!.querySelectorAll('svg').length).toBe(2);

    const label = screen.getByText('Episode A');
    expect(label).toHaveStyle({ color: '#22aa22', fontWeight: 'bold' });
  });

  it('avoids duplicate React keys when duplicate status-property ids resolve to the same indicator', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const nodes: TreeNode[] = [
      {
        id: 'episode-dup',
        name: 'Episode Duplicate',
        type: 'episode',
        properties: { duplicate_status: 'Planned' },
        allowed_children: [],
        parent_id: undefined,
        indicator_id: undefined,
        indicator_set: undefined,
        icon_id: undefined,
        statusIndicatorSvg: undefined,
        statusText: undefined,
        children: [],
      },
    ];

    const nodeTypeSchemas = {
      episode: {
        id: 'episode',
        name: 'Episode',
        primary_status_property_id: 'duplicate_status',
        allowed_children: [],
        properties: [
          {
            id: 'duplicate_status',
            name: 'Duplicate Status A',
            type: 'select',
            required: false,
            indicator_set: 'status',
            options: [
              { id: 'planned', name: 'Planned', indicator_id: 'empty' },
            ],
          },
          {
            id: 'duplicate_status',
            name: 'Duplicate Status B',
            type: 'select',
            required: false,
            indicator_set: 'status',
            options: [
              { id: 'planned', name: 'Planned', indicator_id: 'empty' },
            ],
          },
        ],
      },
    };

    render(
      <TreeView
        nodes={nodes}
        nodeTypeSchemas={nodeTypeSchemas as any}
        expandedMap={{}}
        setExpandedMap={vi.fn()}
      />
    );

    await waitFor(() => {
      const row = screen.getByText('Episode Duplicate').closest('[data-testid="tree-item-row"]');
      expect(row?.querySelectorAll('.status-indicator-svg svg').length).toBe(2);
    });

    const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter(([message]) =>
      String(message).includes('Encountered two children with the same key')
    );

    expect(duplicateKeyWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});

function rowHasTwoStatusSvgs(): boolean {
  const row = screen.queryByText('Episode A')?.closest('[data-testid="tree-item-row"]');
  if (!row) {
    return false;
  }
  const statusContainer = row.querySelector('.status-indicator-svg');
  if (!statusContainer) {
    return false;
  }
  return statusContainer.querySelectorAll('svg').length === 2;
}
