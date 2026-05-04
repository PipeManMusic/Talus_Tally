import { render, screen, fireEvent } from '@testing-library/react';
import { TreeView, type TreeNode } from '../components/layout/TreeView';

// Shared flat list of sibling nodes used in multi-select tests.
const THREE_TASKS: TreeNode[] = [
  { id: 'task-1', name: 'Task Alpha', type: 'task', allowed_children: [], children: [] },
  { id: 'task-2', name: 'Task Beta', type: 'task', allowed_children: [], children: [] },
  { id: 'task-3', name: 'Task Gamma', type: 'task', allowed_children: [], children: [] },
];

describe('TreeView', () => {
  it('renders tree nodes', () => {
    const nodes: TreeNode[] = [
      {
        id: 'root',
        name: 'Project Alpha',
        type: 'project',
        allowed_children: ['phase'],
        children: [
          { id: 'phase-1', name: 'Phase 1', type: 'phase', allowed_children: [], children: [] },
        ],
      },
    ];

    render(<TreeView nodes={nodes} expandedMap={{ root: true }} />);

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
  });

  // ── Ctrl+Click multi-select ──────────────────────────────────────────

  it('Ctrl+Click calls onMultiSelectNode instead of onSelectNode', () => {
    const onSelectNode = vi.fn();
    const onMultiSelectNode = vi.fn();

    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        onSelectNode={onSelectNode}
        onMultiSelectNode={onMultiSelectNode}
      />,
    );

    const row = screen.getByText('Task Beta').closest('[data-testid="tree-item-row"]')!;
    fireEvent.click(row, { ctrlKey: true });

    expect(onMultiSelectNode).toHaveBeenCalledTimes(1);
    expect(onMultiSelectNode).toHaveBeenCalledWith('task-2', 'task');
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('Meta+Click also calls onMultiSelectNode (Mac)', () => {
    const onSelectNode = vi.fn();
    const onMultiSelectNode = vi.fn();

    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        onSelectNode={onSelectNode}
        onMultiSelectNode={onMultiSelectNode}
      />,
    );

    const row = screen.getByText('Task Alpha').closest('[data-testid="tree-item-row"]')!;
    fireEvent.click(row, { metaKey: true });

    expect(onMultiSelectNode).toHaveBeenCalledWith('task-1', 'task');
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('plain click calls onSelectNode, not onMultiSelectNode', () => {
    const onSelectNode = vi.fn();
    const onMultiSelectNode = vi.fn();

    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        onSelectNode={onSelectNode}
        onMultiSelectNode={onMultiSelectNode}
      />,
    );

    const row = screen.getByText('Task Gamma').closest('[data-testid="tree-item-row"]')!;
    fireEvent.click(row);

    expect(onSelectNode).toHaveBeenCalledWith('task-3');
    expect(onMultiSelectNode).not.toHaveBeenCalled();
  });

  // ── Shift+Click range-select ─────────────────────────────────────────

  it('Shift+Click calls onRangeSelectNodes, not onSelectNode', () => {
    const onSelectNode = vi.fn();
    const onRangeSelectNodes = vi.fn();

    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        selectedNodeIds={['task-1']}
        onSelectNode={onSelectNode}
        onRangeSelectNodes={onRangeSelectNodes}
      />,
    );

    const row = screen.getByText('Task Gamma').closest('[data-testid="tree-item-row"]')!;
    fireEvent.click(row, { shiftKey: true });

    expect(onRangeSelectNodes).toHaveBeenCalledTimes(1);
    // Range from task-1 to task-3 should include all three same-type nodes
    const [ids, nodeType] = onRangeSelectNodes.mock.calls[0];
    expect(ids).toContain('task-1');
    expect(ids).toContain('task-2');
    expect(ids).toContain('task-3');
    expect(nodeType).toBe('task');
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('Shift+Click with no anchor falls back to onSelectNode', () => {
    const onSelectNode = vi.fn();
    const onRangeSelectNodes = vi.fn();

    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        // No selectedNodeIds — no anchor
        onSelectNode={onSelectNode}
        onRangeSelectNodes={onRangeSelectNodes}
      />,
    );

    const row = screen.getByText('Task Beta').closest('[data-testid="tree-item-row"]')!;
    fireEvent.click(row, { shiftKey: true });

    // Without an anchor, falls back to a normal single select
    expect(onSelectNode).toHaveBeenCalledWith('task-2');
  });

  // ── isInMultiSelection visual state ─────────────────────────────────

  it('applies multi-selection style to all selected nodes when count > 1', () => {
    render(
      <TreeView
        nodes={THREE_TASKS}
        expandedMap={{}}
        selectedNodeIds={['task-1', 'task-2']}
      />,
    );

    const row1 = screen.getByText('Task Alpha').closest('[data-testid="tree-item-row"]')!;
    const row2 = screen.getByText('Task Beta').closest('[data-testid="tree-item-row"]')!;
    const row3 = screen.getByText('Task Gamma').closest('[data-testid="tree-item-row"]')!;

    // Both selected rows should have the multi-selection class
    expect(row1.className).toMatch(/border-accent-primary\/60/);
    expect(row2.className).toMatch(/border-accent-primary\/60/);
    // Unselected row should not
    expect(row3.className).not.toMatch(/border-accent-primary\/60/);
  });
});
