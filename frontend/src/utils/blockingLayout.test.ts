import type { Node } from '../api/client';
import { buildBlockingHierarchyLayout } from './blockingLayout';

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

  it('positions nodes by hierarchy instead of a flat grid', () => {
    const result = buildBlockingHierarchyLayout(buildNodes(), {
      baseWidth: 160,
      baseHeight: 100,
      maxScale: 1.3,
    });

    const byId = Object.fromEntries(result.positions.map((node) => [node.id, node]));

    expect(result.positions.map((node) => node.id)).toEqual([
      'task-a1',
      'task-a2',
      'phase-a',
      'task-b1',
      'phase-b',
    ]);
    expect(result.depths['phase-a']).toBe(0);
    expect(result.depths['task-a1']).toBe(1);
    expect(byId['phase-a'].x).toBeLessThan(byId['task-a1'].x);
    expect(byId['phase-a'].y).toBeCloseTo((byId['task-a1'].y + byId['task-a2'].y) / 2);
    expect(byId['phase-b'].y).toBeGreaterThan(byId['phase-a'].y);
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

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].id).toBe('task-a1');
    expect(result.depths['task-a1']).toBe(0);
    expect(result.parentIds['task-a1']).toBe('phase-a');
  });
});