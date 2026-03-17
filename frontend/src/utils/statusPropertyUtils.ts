/**
 * Utility functions for handling nodes with multiple status properties.
 * 
 * Status properties are select properties with indicator_set='status'.
 * One status property can be marked as "primary" to control the node's text color.
 */

import type { Node } from '../api/client';
import type { Property } from '../views/NodeTypeEditor';

/**
 * Find all status properties in a node type.
 * 
 * Status properties are select properties with indicator_set='status'.
 */
export function findStatusProperties(properties: Property[]): Property[] {
  return properties.filter(
    (prop) =>
      prop.type === 'select' &&
      (prop.indicator_set === 'status' || prop.indicator_set === undefined)
  );
}

/**
 * Get the primary status property ID.
 * If no primary is explicitly set, returns the first status property ID.
 */
export function getPrimaryStatusPropertyId(
  primaryStatusPropertyId: string | undefined,
  properties: Property[]
): string | undefined {
  if (primaryStatusPropertyId) {
    return primaryStatusPropertyId;
  }
  // Fall back to first status property
  const statusProps = findStatusProperties(properties);
  return statusProps[0]?.id;
}

/**
 * Extract all status values for a node from its properties.
 * 
 * Returns array of { propertyId, propertyLabel, statusValue, indicatorId }
 */
export function extractNodeStatuses(
  node: Node,
  properties: Property[]
): Array<{
  propertyId: string;
  propertyLabel: string;
  statusValue: string | undefined;
  indicatorId: string | undefined;
}> {
  const statusProperties = findStatusProperties(properties);
  
  return statusProperties
    .map((prop) => {
      const statusValue = node.properties?.[prop.id] as string | undefined;
      const option = prop.options?.find((opt) => opt.name === statusValue);
      
      return {
        propertyId: prop.id,
        propertyLabel: prop.label,
        statusValue,
        indicatorId: option?.indicator_id,
      };
    })
    .filter((status) => status.statusValue !== undefined); // Only include properties with a value set
}

/**
 * Get the indicator ID for the primary status property.
 * Used to determine the node's text color.
 */
export function getPrimaryStatusIndicatorId(
  node: Node,
  properties: Property[],
  primaryStatusPropertyId: string | undefined
): string | undefined {
  const primaryPropId = getPrimaryStatusPropertyId(primaryStatusPropertyId, properties);
  if (!primaryPropId) {
    return undefined;
  }

  const primaryProp = properties.find((p) => p.id === primaryPropId);
  if (!primaryProp) {
    return undefined;
  }

  const statusValue = node.properties?.[primaryPropId] as string | undefined;
  const option = primaryProp.options?.find((opt) => opt.name === statusValue);
  
  return option?.indicator_id;
}
