import { updateRootExpansion, TreeNode } from './treeUtils';

describe('updateRootExpansion', () => {
  const makeTree = (rootChildren: number) => [
    { id: 'root', name: 'Root', type: 'project_root', allowed_children: ['phase'], children: Array(rootChildren).fill({ id: 'child', name: 'Child', type: 'phase', allowed_children: [], children: [] }) },
  ];

  it('expands root when it gains its first child', () => {
    const prev = {};
    const prevChildCounts = { root: 0 };
    const tree = makeTree(1);
    const [next, nextCounts] = updateRootExpansion(prev, tree, prevChildCounts);
    expect(next.root).toBe(true);
    expect(nextCounts.root).toBe(1);
  });

  it('does not expand root if it already had children', () => {
    const prev = { root: false };
    const prevChildCounts = { root: 2 };
    const tree = makeTree(3);
    const [next, nextCounts] = updateRootExpansion(prev, tree, prevChildCounts);
    expect(next.root).toBe(false);
    expect(nextCounts.root).toBe(3);
  });

  it('does not expand root if it still has no children', () => {
    const prev = {};
    const prevChildCounts = { root: 0 };
    const tree = makeTree(0);
    const [next, nextCounts] = updateRootExpansion(prev, tree, prevChildCounts);
    expect(next.root).toBeUndefined();
    expect(nextCounts.root).toBe(0);
  });
});
