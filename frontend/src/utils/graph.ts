import type { Graph, Node } from '../api/client';

export function normalizeGraph(graphLike: any): Graph {
  const startTime = performance.now();
  console.log('[normalizeGraph] START');
  
  try {
    if (!graphLike) {
      console.log('[normalizeGraph] No graph data, returning default');
      return { id: 'default', nodes: [], edges: [] };
    }

    const source = graphLike.graph ?? graphLike;

    if (source && Array.isArray(source.nodes)) {
      console.log('[normalizeGraph] Graph already flat, returning as-is');
      return {
        id: source.id || 'default',
        nodes: source.nodes,
        edges: source.edges || [],
      };
    }

    if (source && Array.isArray(source.roots)) {
      console.log('[normalizeGraph] Processing hierarchical graph, roots:', source.roots.length);
      const nodes: Node[] = [];
      const visited = new Set<string>();
      const MAX_DEPTH = 100;
      let processedCount = 0;

      const flattenNodes = (nestedNode: any, ancestry: string[] = []): Node | null => {
        processedCount++;
        
        // Safety check: if we've processed too many nodes, something is wrong
        if (processedCount > 10000) {
          console.error('[normalizeGraph] EMERGENCY STOP: processed >10000 nodes, likely infinite loop!');
          return null;
        }
        
        // Log every 10 nodes to track progress without flooding
        if (processedCount % 10 === 0) {
          console.log(`[normalizeGraph] Progress: ${processedCount} nodes processed...`);
        }
        
        // Prevent infinite recursion with depth limit
        if (ancestry.length >= MAX_DEPTH) {
          console.error('[normalizeGraph] Max recursion depth exceeded!', { nodeId: nestedNode.id, depth: ancestry.length });
          return null;
        }
        
        // MUST use nestedNode.id; if missing, this is malformed data
        const nodeId = nestedNode.id;
        if (!nodeId) {
          console.error('[normalizeGraph] Node missing id field:', nestedNode);
          return null;
        }
        
        if (visited.has(nodeId)) {
          console.warn('[normalizeGraph] Cycle detected! Node already visited:', nodeId);
          const existingNode = nodes.find(n => n.id === nodeId);
          if (existingNode) return existingNode;
          return null;
        }
        
        if (ancestry.includes(nodeId)) {
          console.error('[normalizeGraph] Direct cycle detected! Node:', nodeId);
          const existingNode = nodes.find(n => n.id === nodeId);
          if (existingNode) return existingNode;
          return null;
        }
        
        visited.add(nodeId);

        // Debug: Log what properties we're receiving
        console.log(`[normalizeGraph] Node ${nodeId} (${nestedNode.blueprint_type_id}):`, {
          name: nestedNode.name,
          properties: nestedNode.properties,
          allKeys: Object.keys(nestedNode)
        });

        const node: Node = {
          id: nodeId,
          type: nestedNode.blueprint_type_id || 'unknown',
          properties: {
            name: nestedNode.name || 'Unnamed',
            ...nestedNode.properties,
          },
          children: [],
          indicator_id: nestedNode.indicator_id,
          indicator_set: nestedNode.indicator_set,
          icon_id: nestedNode.icon_id,
          schema_shape: nestedNode.schema_shape,
          schema_color: nestedNode.schema_color,
          allowed_children: nestedNode.allowed_children,
        };

        console.log(`[normalizeGraph] Normalized node ${nodeId}:`, {
          properties: node.properties,
          propertyCount: Object.keys(node.properties).length
        });

        nodes.push(node);

        if (nestedNode.children && Array.isArray(nestedNode.children)) {
          node.children = nestedNode.children
            .map((child: any) => {
              const childNode = flattenNodes(child, [...ancestry, nodeId]);
              return childNode ? childNode.id : null;
            })
            .filter((id: string | null) => id !== null) as string[];
        }

        return node;
        };

      for (const rootNode of source.roots || []) {
        console.log('[normalizeGraph] Processing root node:', rootNode.id || rootNode.blueprint_type_id);
        const processedRoot = flattenNodes(rootNode);
        if (!processedRoot) {
          console.error('[normalizeGraph] Failed to process root node:', rootNode);
        }
      }

      const elapsed = performance.now() - startTime;
      console.log(`[normalizeGraph] COMPLETE: ${nodes.length} nodes in ${elapsed.toFixed(2)}ms`);
      return { id: 'default', nodes, edges: [] };
    }

    console.log('[normalizeGraph] No valid graph structure found, returning empty');
    return { id: 'default', nodes: [], edges: [] };
  } catch (error) {
    const elapsed = performance.now() - startTime;
    console.error(`[normalizeGraph] Fatal error after ${elapsed.toFixed(2)}ms:`, error);
    return { id: 'default', nodes: [], edges: [] };
  }
}
