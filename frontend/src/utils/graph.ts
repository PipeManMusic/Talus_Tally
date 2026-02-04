import type { Graph, Node } from '../api/client';

export function normalizeGraph(graphLike: any): Graph {
  if (!graphLike) {
    return { id: 'default', nodes: [], edges: [] };
  }

  const source = graphLike.graph ?? graphLike;

  if (source && Array.isArray(source.nodes)) {
    return {
      id: source.id || 'default',
      nodes: source.nodes,
      edges: source.edges || [],
    };
  }

  if (source && Array.isArray(source.roots)) {
    const nodes: Node[] = [];

    const flattenNodes = (nestedNode: any): Node => {
      console.log('[normalizeGraph] Processing nested node:', {
        id: nestedNode.id,
        type: nestedNode.blueprint_type_id,
        indicator_id: nestedNode.indicator_id,
        indicator_set: nestedNode.indicator_set,
        properties: nestedNode.properties,
      });

      const node: Node = {
        id: nestedNode.id || nestedNode.blueprint_type_id,
        type: nestedNode.blueprint_type_id || 'unknown',
        properties: {
          name: nestedNode.name || 'Unnamed',
          ...nestedNode.properties,
        },
        children: [],
        indicator_id: nestedNode.indicator_id,
        indicator_set: nestedNode.indicator_set,
        icon_id: nestedNode.icon_id,
      };

      console.log('[normalizeGraph] Created node:', node);

      nodes.push(node);

      if (nestedNode.children && Array.isArray(nestedNode.children)) {
        node.children = nestedNode.children.map((child: any) => {
          const childNode = flattenNodes(child);
          return childNode.id;
        });
      }

      return node;
    };

    for (const rootNode of source.roots || []) {
      flattenNodes(rootNode);
    }

    return { id: 'default', nodes, edges: [] };
  }

  return { id: 'default', nodes: [], edges: [] };
}
