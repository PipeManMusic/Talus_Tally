import { convertNodesToTree } from '../utils/treeUtils';

describe('convertNodesToTree', () => {
  const templateSchema = {
    node_types: [
      { id: 'project_root', allowed_children: ['phase'] },
      { id: 'phase', allowed_children: ['task'] },
      { id: 'task', allowed_children: [] },
    ],
  };

  it('converts flat node map to tree and attaches allowed_children', () => {
    const nodes = {
      root: { id: 'root', type: 'project_root', properties: { name: 'Root' }, children: ['phase1'] },
      phase1: { id: 'phase1', type: 'phase', properties: { name: 'Phase 1' }, children: ['task1'] },
      task1: { id: 'task1', type: 'task', properties: { name: 'Task 1' }, children: [] },
    };
    const tree = convertNodesToTree(nodes, templateSchema);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].allowed_children).toEqual(['phase']);
    expect(tree[0].children[0].id).toBe('phase1');
    expect(tree[0].children[0].allowed_children).toEqual(['task']);
    expect(tree[0].children[0].children[0].id).toBe('task1');
    expect(tree[0].children[0].children[0].allowed_children).toEqual([]);
  });

  it('returns empty array for empty nodes', () => {
    expect(convertNodesToTree({}, templateSchema)).toEqual([]);
  });

  it('handles missing templateSchema gracefully', () => {
    const nodes = {
      root: { id: 'root', type: 'project_root', properties: { name: 'Root' }, children: [] },
    };
    const tree = convertNodesToTree(nodes, null);
    expect(tree[0].allowed_children).toEqual([]);
  });
});
