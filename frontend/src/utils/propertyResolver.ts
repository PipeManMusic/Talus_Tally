import type { NodeTypeSchema, Node } from '../api/client';

/**
 * Get the semantic key of a schema property (e.g., "name", "status", "cost").
 * Use this for identity checks like `propertyKey(prop) === 'name'`.
 */
export function propertyKey(prop: { id: string; key?: string }): string {
  return prop.key ?? prop.id;
}

/**
 * Build a map of semantic key → UUID for a node type's properties.
 * Returns undefined if the schema has no properties.
 */
export function buildPropertyUuidMap(
  nodeType: NodeTypeSchema | undefined,
): Map<string, string> | undefined {
  if (!nodeType?.properties) return undefined;
  const map = new Map<string, string>();
  for (const prop of nodeType.properties) {
    const k = prop.key ?? prop.id;
    map.set(k, prop.id);
  }
  return map;
}

/**
 * Resolve a property value from a node by semantic property key.
 * Looks up the UUID from the schema, then reads node.properties[uuid].
 * Falls back to direct key access if no map is available.
 */
export function getNodeProperty(
  node: Node | undefined,
  propKey: string,
  uuidMap: Map<string, string> | undefined,
  defaultValue?: any,
): any {
  if (!node?.properties) return defaultValue;
  const uuid = uuidMap?.get(propKey) ?? propKey;
  const val = node.properties[uuid];
  return val !== undefined ? val : defaultValue;
}

/**
 * Find a schema property by its semantic key.
 */
export function findPropertyByKey(
  nodeType: NodeTypeSchema | undefined,
  propKey: string,
): NodeTypeSchema['properties'][number] | undefined {
  if (!nodeType?.properties) return undefined;
  return nodeType.properties.find(
    (p) => (p.key ?? p.id) === propKey,
  );
}
