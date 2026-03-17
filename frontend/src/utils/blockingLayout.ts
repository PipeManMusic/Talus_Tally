import type { Node } from '../api/client';

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
      return false;
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

  if (projectRootId) {
    (orderedChildren[projectRootId] || []).forEach(addRoot);
  }
  fallbackRoots.forEach(addRoot);

  const depths: Record<string, number> = {};
  const positions: BlockingLayoutNode[] = [];
  const placedIds = new Set<string>();
  const activeStack = new Set<string>();
  const paddingX = 120;
  const paddingY = 100;
  const horizontalSpacing = Math.max(options.baseWidth * options.maxScale + 140, 260);
  const verticalSpacing = Math.max(options.baseHeight * options.maxScale + 36, 120);
  const subtreeGap = Math.max(verticalSpacing * 0.75, 72);
  let nextLeafY = paddingY;

  const placeSubtree = (nodeId: string, depth: number): number => {
    if (!displayedIdSet.has(nodeId)) {
      return nextLeafY;
    }

    if (activeStack.has(nodeId)) {
      const cycleY = nextLeafY;
      nextLeafY += verticalSpacing;
      return cycleY;
    }

    activeStack.add(nodeId);
    depths[nodeId] = depth;

    const children = displayedChildren[nodeId] || [];
    const childPositions: number[] = [];
    children.forEach((childId) => {
      childPositions.push(placeSubtree(childId, depth + 1));
    });

    let y = nextLeafY;
    if (childPositions.length === 0) {
      nextLeafY += verticalSpacing;
    } else {
      y = (childPositions[0] + childPositions[childPositions.length - 1]) / 2;
    }

    if (!placedIds.has(nodeId)) {
      positions.push({
        id: nodeId,
        label: nodes[nodeId]?.properties?.name || nodeId,
        x: paddingX + depth * horizontalSpacing,
        y,
      });
      placedIds.add(nodeId);
    }

    activeStack.delete(nodeId);
    return y;
  };

  rootIds.forEach((rootId, index) => {
    if (placedIds.has(rootId)) {
      return;
    }
    placeSubtree(rootId, 0);
    if (index < rootIds.length - 1) {
      nextLeafY += subtreeGap;
    }
  });

  displayedIds.forEach((nodeId) => {
    if (!placedIds.has(nodeId)) {
      placeSubtree(nodeId, depths[nodeId] ?? 0);
    }
  });

  return {
    positions,
    depths,
    parentIds,
  };
}