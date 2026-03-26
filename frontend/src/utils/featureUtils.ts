import type { NodeTypeSchema } from '../api/client';

/**
 * Check if a given type ID has a specific feature flag.
 * Accepts either a Record (keyed by type id) or an array of schemas.
 */
export function typeHasFeature(
  schemas: NodeTypeSchema[] | Record<string, NodeTypeSchema> | undefined | null,
  typeId: string,
  feature: string,
): boolean {
  if (!schemas || !typeId) return false;
  if (Array.isArray(schemas)) {
    return schemas.find(nt => nt.id === typeId)?.features?.includes(feature) ?? false;
  }
  return schemas[typeId]?.features?.includes(feature) ?? false;
}
