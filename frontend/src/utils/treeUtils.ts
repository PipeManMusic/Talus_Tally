// treeUtils.ts
// Pure utility functions for tree conversion and expansion logic
import type { Node, TemplateSchema } from '../api/client';

export interface TreeNode {
  id: string;
  name: string;
  type: string;
  allowed_children: string[];
  children: TreeNode[];
  indicator_id?: string;
  indicator_set?: string;
  parent_id?: string;
  icon_id?: string;
  statusIndicatorSvg?: string;
  statusText?: string;
}

/**
 * Convert flat node map to tree structure, attaching allowed_children from schema.
 */
export function convertNodesToTree(
  nodes: Record<string, Node>,
  templateSchema: TemplateSchema | null
): TreeNode[] {
  const nodeList = Object.values(nodes);
  if (nodeList.length === 0) return [];

  const getAllowedChildren = (type: string): string[] => {
    if (!templateSchema) return [];
    const typeSchema = templateSchema.node_types.find(nt => nt.id === type);
    return typeSchema?.allowed_children || [];
  };

  const buildTree = (node: Node, nodesMap: Record<string, Node>, parentId: string | null): TreeNode => {
    return {
      id: node.id,
      name: node.properties?.name || node.type,
      type: node.type || 'project',
      indicator_id: node.indicator_id ?? undefined,
      indicator_set: node.indicator_set ?? undefined,
      icon_id: node.icon_id ?? undefined,
      statusIndicatorSvg: node.statusIndicatorSvg ?? undefined,
      statusText: node.statusText ?? undefined,
      parent_id: parentId ?? undefined,
      allowed_children: getAllowedChildren(node.type),
      children: node.children?.map(childId => {
        const childNode = nodesMap[childId];
        return childNode ? buildTree(childNode, nodesMap, node.id) : { id: childId, name: 'Unknown', type: 'unknown', allowed_children: [], children: [], parent_id: node.id };
      }) || []
    };
  };

  // Find root nodes (nodes without parents)
  const roots = nodeList.filter(n => !nodeList.some(p => p.children?.includes(n.id)));
  return roots.map(root => buildTree(root, nodes, null));
}

/**
 * Compute next expandedMap for root expansion logic.
 * @param prev Expanded map before update
 * @param tree Current tree
 * @param prevChildCounts Previous child counts for roots
 * @returns [nextExpandedMap, nextChildCounts]
 */
export function updateRootExpansion(
  prev: Record<string, boolean>,
  tree: TreeNode[],
  prevChildCounts: Record<string, number>
): [Record<string, boolean>, Record<string, number>] {
  const next = { ...prev };
  const nextChildCounts = { ...prevChildCounts };
  tree.forEach(root => {
    const prevChildren = prevChildCounts[root.id];
    const currChildren = root.children?.length || 0;
    if ((prevChildren === 0 || prevChildren === undefined) && currChildren === 1) {
      next[root.id] = true;
    }
    nextChildCounts[root.id] = currChildren;
  });
  return [next, nextChildCounts];
}
