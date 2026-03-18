import type { Node } from '../api/client';
import { buildBlockingHierarchyLayout, calculateDependencyLevels } from './blockingLayout';

describe('buildBlockingHierarchyLayout', () => {
  const buildNodes = (): Record<string, Node> => ({
    root: {
      id: 'root',
      type: 'project_root',
      properties: { name: 'Root' },
      children: ['phase-a', 'phase-b'],
    },
    'phase-a': {
      id: 'phase-a',
      type: 'phase',
      properties: { name: 'Phase A' },
      children: ['task-a1', 'task-a2'],
    },
    'phase-b': {
      id: 'phase-b',
      type: 'phase',
      properties: { name: 'Phase B' },
      children: ['task-b1'],
    },
    'task-a1': {
      id: 'task-a1',
      type: 'task',
      properties: { name: 'Task A1' },
      children: [],
    },
    'task-a2': {
      id: 'task-a2',
      type: 'task',
      properties: { name: 'Task A2' },
      children: [],
    },
    'task-b1': {
      id: 'task-b1',
      type: 'task',
      properties: { name: 'Task B1' },
      children: [],
    },
  });

  it('positions nodes in a symmetric pyramid layout', () => {
    const result = buildBlockingHierarchyLayout(buildNodes(), {
      baseWidth: 160,
      baseHeight: 100,
      maxScale: 1.3,
    });

    const byId = Object.fromEntries(result.positions.map((node) => [node.id, node]));

    expect(byId.root).toBeDefined();
    expect(result.depths.root).toBe(0);
    expect(result.depths['phase-a']).toBe(1);
    expect(result.depths['task-a1']).toBe(2);
    // Same generation = same Y row (clean horizontal band).
    expect(byId['phase-a'].y).toBe(byId['phase-b'].y);
    expect(byId['task-a1'].y).toBe(byId['task-b1'].y);
    // Root is above phase row.
    expect(byId.root.y).toBeLessThan(byId['phase-a'].y);
    // Children are below parents (depth drives y).
    expect(byId['task-a1'].y).toBeGreaterThan(byId['phase-a'].y);
    // Siblings spread horizontally (slot drives x).
    expect(byId['task-a2'].x).toBeGreaterThan(byId['task-a1'].x);
    // Parent is centered over its children (pyramid midpoint).
    expect(byId['phase-a'].x).toBeCloseTo((byId['task-a1'].x + byId['task-a2'].x) / 2);
    // phase-b subtree is to the right of phase-a.
    expect(byId['phase-b'].x).toBeGreaterThan(byId['phase-a'].x);
    expect(result.parentIds['task-a1']).toBe('phase-a');
  });

  it('promotes visible descendants when hidden ancestors are filtered out', () => {
    const result = buildBlockingHierarchyLayout(buildNodes(), {
      visibleNodeIds: new Set(['task-a1']),
      hideFilteredNodes: true,
      baseWidth: 160,
      baseHeight: 100,
      maxScale: 1.3,
    });

    expect(result.positions).toHaveLength(2);
    expect(result.positions.map((node) => node.id)).toEqual(expect.arrayContaining(['root', 'task-a1']));
    expect(result.depths.root).toBe(0);
    expect(result.depths['task-a1']).toBe(0);
    expect(result.parentIds['task-a1']).toBe('phase-a');
  });
});

describe('calculateDependencyLevels', () => {
  const makeNode = (id: string, name: string, blockedBy: string[] = []): Node => ({
    id,
    type: 'task',
    properties: {
      name,
      blocked_by: blockedBy,
    },
    children: [],
  });

  it('groups nodes into dependency levels from ready to blocked', () => {
    const levels = calculateDependencyLevels([
      makeNode('a', 'Alpha'),
      makeNode('b', 'Bravo', ['a']),
      makeNode('c', 'Charlie', ['b']),
      makeNode('d', 'Delta', ['a']),
    ]);

    expect(levels).toHaveLength(3);
    expect(levels[0].map((node) => node.id)).toEqual(['a']);
    expect(levels[1].map((node) => node.id)).toEqual(['b', 'd']);
    expect(levels[2].map((node) => node.id)).toEqual(['c']);
  });

  it('limits the result to the selected node chain when targetNodeId is provided', () => {
    const levels = calculateDependencyLevels([
      makeNode('a', 'Alpha'),
      makeNode('b', 'Bravo', ['a']),
      makeNode('c', 'Charlie', ['b']),
      makeNode('x', 'Xray'),
    ], 'b');

    expect(levels).toHaveLength(3);
    expect(levels[0].map((node) => node.id)).toEqual(['a']);
    expect(levels[1].map((node) => node.id)).toEqual(['b']);
    expect(levels[2].map((node) => node.id)).toEqual(['c']);
  });

  it('places cycles into a final unresolved column', () => {
    const levels = calculateDependencyLevels([
      makeNode('a', 'Alpha', ['b']),
      makeNode('b', 'Bravo', ['a']),
      makeNode('c', 'Charlie'),
    ]);

    expect(levels).toHaveLength(2);
    expect(levels[0].map((node) => node.id)).toEqual(['c']);
    expect(levels[1].map((node) => node.id)).toEqual(['a', 'b']);
  });
});