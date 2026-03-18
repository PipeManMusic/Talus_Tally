import type { Node } from '../api/client';

function parseBlockedByValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean);
        }
      } catch {
        // Fall back to CSV/single-value parsing.
      }
    }

    if (trimmed.includes(',')) {
      return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }

    return [trimmed];
  }

  if (value === null || value === undefined) {
    return [];
  }

  const coerced = String(value).trim();
  return coerced ? [coerced] : [];
}

function getBlockedByIds(node: Node): string[] {
  return parseBlockedByValue(node?.properties?.blocked_by);
}

function getNodeLabel(node: Node): string {
  return String(node?.properties?.name || node?.id || '');
}

export function calculateDependencyLevels(nodes: Node[], targetNodeId?: string): Node[][] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let workingNodeIds = new Set(nodeMap.keys());

  if (targetNodeId && nodeMap.has(targetNodeId)) {
    const blockersByNode = new Map<string, string[]>();
    const dependentsByNode = new Map<string, string[]>();

    nodes.forEach((node) => {
      const blockers = getBlockedByIds(node);
      blockersByNode.set(node.id, blockers);
      blockers.forEach((blockerId) => {
        if (!dependentsByNode.has(blockerId)) {
          dependentsByNode.set(blockerId, []);
        }
        dependentsByNode.get(blockerId)!.push(node.id);
      });
    });

    const relatedIds = new Set<string>();
    const queue: string[] = [targetNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (relatedIds.has(currentId) || !nodeMap.has(currentId)) {
        continue;
      }

      relatedIds.add(currentId);

      (blockersByNode.get(currentId) || []).forEach((blockerId) => {
        if (!relatedIds.has(blockerId) && nodeMap.has(blockerId)) {
          queue.push(blockerId);
        }
      });

      (dependentsByNode.get(currentId) || []).forEach((dependentId) => {
        if (!relatedIds.has(dependentId) && nodeMap.has(dependentId)) {
          queue.push(dependentId);
        }
      });
    }

    workingNodeIds = relatedIds;
  }

  const workingNodes = Array.from(workingNodeIds)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is Node => Boolean(node));

  if (workingNodes.length === 0) {
    return [];
  }

  const workingSet = new Set(workingNodes.map((node) => node.id));
  const resolvedIds = new Set<string>();
  const remainingIds = new Set(workingSet);
  const levels: Node[][] = [];

  while (remainingIds.size > 0) {
    const readyNodes = Array.from(remainingIds)
      .map((nodeId) => nodeMap.get(nodeId))
      .filter((node): node is Node => Boolean(node))
      .filter((node) => {
        const blockers = getBlockedByIds(node).filter((blockerId) => workingSet.has(blockerId));
        return blockers.every((blockerId) => resolvedIds.has(blockerId));
      })
      .sort((left, right) => getNodeLabel(left).localeCompare(getNodeLabel(right)));

    if (readyNodes.length === 0) {
      const unresolvedNodes = Array.from(remainingIds)
        .map((nodeId) => nodeMap.get(nodeId))
        .filter((node): node is Node => Boolean(node))
        .sort((left, right) => getNodeLabel(left).localeCompare(getNodeLabel(right)));
      levels.push(unresolvedNodes);
      break;
    }

    levels.push(readyNodes);
    readyNodes.forEach((node) => {
      resolvedIds.add(node.id);
      remainingIds.delete(node.id);
    });
  }

  return levels.filter((level) => level.length > 0);
}

export interface BlockingLayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface BlockingLayoutResult {
  positions: BlockingLayoutNode[];
  depths: Record<string, number>;
  parentIds: Record<string, string | undefined>;
}

interface BlockingLayoutOptions {
  visibleNodeIds?: Set<string>;
  hideFilteredNodes?: boolean;
  baseWidth: number;
  baseHeight: number;
  maxScale: number;
}

const PROJECT_ROOT_TYPES = new Set(['project', 'project_root']);

export function buildBlockingHierarchyLayout(
  nodes: Record<string, Node>,
  options: BlockingLayoutOptions,
): BlockingLayoutResult {
  const nodeIds = Object.keys(nodes);
  if (nodeIds.length === 0) {
    return { positions: [], depths: {}, parentIds: {} };
  }

  const projectRootId = nodeIds.find((id) => PROJECT_ROOT_TYPES.has(nodes[id]?.type));
  const parentIds: Record<string, string | undefined> = {};
  const orderedChildren: Record<string, string[]> = {};

  nodeIds.forEach((id) => {
    orderedChildren[id] = [];
  });

  nodeIds.forEach((id) => {
    const children = Array.isArray(nodes[id]?.children) ? nodes[id].children : [];
    children.forEach((childId) => {
      if (!nodes[childId]) {
        return;
      }
      orderedChildren[id].push(childId);
      if (!parentIds[childId]) {
        parentIds[childId] = id;
      }
    });
  });

  const shouldDisplayNode = (id: string) => {
    if (id === projectRootId) {
      return true;
    }
    if (!options.hideFilteredNodes) {
      return true;
    }
    return options.visibleNodeIds?.has(id) ?? true;
  };

  const displayedIds = nodeIds.filter(shouldDisplayNode);
  const displayedIdSet = new Set(displayedIds);
  const displayedChildren: Record<string, string[]> = {};

  displayedIds.forEach((id) => {
    displayedChildren[id] = (orderedChildren[id] || []).filter((childId) => displayedIdSet.has(childId));
  });

  const fallbackRoots = displayedIds.filter((id) => {
    const parentId = parentIds[id];
    return !parentId || parentId === projectRootId || !displayedIdSet.has(parentId);
  });

  const rootIds: string[] = [];
  const addRoot = (id: string) => {
    if (displayedIdSet.has(id) && !rootIds.includes(id)) {
      rootIds.push(id);
    }
  };

  if (projectRootId && displayedIdSet.has(projectRootId)) {
    addRoot(projectRootId);
  } else {
    fallbackRoots.forEach(addRoot);
  }

  const depths: Record<string, number> = {};
  const positions: BlockingLayoutNode[] = [];
  const paddingX = 120;
  const paddingY = 100;
  const cellSize = Math.max(
    options.baseWidth * options.maxScale + 80,
    options.baseHeight * options.maxScale + 80,
    220,
  );
  const horizontalSpacing = cellSize;
  const verticalSpacing = cellSize;

  // BFS to assign depths from roots.
  const bfsQueue: Array<{ id: string; depth: number }> = rootIds.map((id) => ({ id, depth: 0 }));
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    if (!displayedIdSet.has(current.id)) {
      continue;
    }
    const previousDepth = depths[current.id];
    if (previousDepth !== undefined && previousDepth <= current.depth) {
      continue;
    }
    depths[current.id] = current.depth;
    (displayedChildren[current.id] || []).forEach((childId) => {
      bfsQueue.push({ id: childId, depth: current.depth + 1 });
    });
  }

  // Fallback depth for disconnected nodes.
  displayedIds.forEach((nodeId) => {
    if (depths[nodeId] !== undefined) {
      return;
    }
    let depth = 0;
    const seen = new Set<string>([nodeId]);
    let pid = parentIds[nodeId];
    while (pid && displayedIdSet.has(pid) && !seen.has(pid)) {
      depth += 1;
      seen.add(pid);
      pid = parentIds[pid];
    }
    depths[nodeId] = depth;
  });

  // Family-tree (ancestry) placement:
  //   - leaves receive sequential integer slots
  //   - parents are centered on the midpoint of their children's slots
  //   - this keeps sibling subtrees together and produces connecting-line friendly coordinates
  let leafCounter = 0;
  const nodeYSlot: Record<string, number> = {};
  const placedInTree = new Set<string>();
  const inStack = new Set<string>();

  const placeSubtree = (nodeId: string): number => {
    if (!displayedIdSet.has(nodeId)) {
      return leafCounter;
    }
    if (inStack.has(nodeId)) {
      // Cycle: treat this node as a leaf to break the loop.
      if (nodeYSlot[nodeId] === undefined) {
        nodeYSlot[nodeId] = leafCounter;
        leafCounter += 1;
        placedInTree.add(nodeId);
      }
      return nodeYSlot[nodeId];
    }
    if (nodeYSlot[nodeId] !== undefined) {
      return nodeYSlot[nodeId];
    }

    inStack.add(nodeId);
    placedInTree.add(nodeId);

    const children = (displayedChildren[nodeId] || []).filter((id) => displayedIdSet.has(id));

    if (children.length === 0) {
      // Leaf node.
      nodeYSlot[nodeId] = leafCounter;
      leafCounter += 1;
      inStack.delete(nodeId);
      return nodeYSlot[nodeId];
    }

    // Recurse children first, then center the parent.
    const childSlots = children.map((childId) => placeSubtree(childId));
    const midSlot = (childSlots[0] + childSlots[childSlots.length - 1]) / 2;
    nodeYSlot[nodeId] = midSlot;
    inStack.delete(nodeId);
    return midSlot;
  };

  rootIds.forEach((rootId) => placeSubtree(rootId));
  displayedIds.forEach((nodeId) => {
    if (!placedInTree.has(nodeId)) {
      placeSubtree(nodeId);
    }
  });

  // Group nodes by depth; sort within each level by placeSubtree slot to keep
  // subtree ordering (avoids connector crossings).
  const nodesByDepth: Record<number, string[]> = {};
  displayedIds.forEach((nodeId) => {
    const depth = depths[nodeId] ?? 0;
    if (!nodesByDepth[depth]) nodesByDepth[depth] = [];
    nodesByDepth[depth].push(nodeId);
  });
  Object.values(nodesByDepth).forEach((levelNodes) => {
    levelNodes.sort((a, b) => (nodeYSlot[a] ?? 0) - (nodeYSlot[b] ?? 0));
  });

  // Precompute each node's 0-based index within its depth level (avoids O(n²) indexOf).
  const nodeIndexInLevel: Record<string, number> = {};
  Object.values(nodesByDepth).forEach((levelNodes) => {
    levelNodes.forEach((nodeId, i) => {
      nodeIndexInLevel[nodeId] = i;
    });
  });

  // All rows are centred around the same vertical axis — the mid-point of the
  // widest generation.  Each row fans out symmetrically: narrower near the root
  // and wider toward the leaves, forming a downward-opening pyramid.
  const maxGenWidth = Math.max(...Object.values(nodesByDepth).map((lvl) => lvl.length), 1);
  const centerX = paddingX + ((maxGenWidth - 1) / 2) * cellSize;

  // Emit final positions — pyramid layout.
  displayedIds.forEach((nodeId) => {
    const depth = depths[nodeId] ?? 0;
    const levelNodes = nodesByDepth[depth] ?? [];
    const i = nodeIndexInLevel[nodeId] ?? 0;
    const n = levelNodes.length;
    positions.push({
      id: nodeId,
      label: nodes[nodeId]?.properties?.name || nodeId,
      x: centerX + (i - (n - 1) / 2) * cellSize,
      y: paddingY + depth * cellSize,
    });
  });

  return {
    positions,
    depths,
    parentIds,
  };
}