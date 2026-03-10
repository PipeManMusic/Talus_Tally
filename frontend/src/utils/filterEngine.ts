import type { FilterRule } from '../store/filterStore';

/**
 * Evaluates whether a node passes all active filter rules (AND logic).
 * If no rules are active, returns true (node is visible).
 * 
 * @param node - The node object to evaluate
 * @param rules - Array of filter rules to apply
 * @returns true if node passes all rules, false otherwise
 */
export function evaluateNodeVisibility(node: any, rules: FilterRule[]): boolean {
  if (rules.length === 0) {
    return true;
  }

  // Node must pass ALL rules (AND logic)
  return rules.every((rule) => evaluateRule(node, rule));
}

/**
 * Evaluates a single rule against a node's properties.
 * Safely handles cases where the property doesn't exist or has unexpected types.
 * Supports special properties like velocity_score, blocking_status, and node_type.
 * 
 * @param node - The node being evaluated (may include velocity and blocking data)
 * @param rule - The filter rule to apply
 * @returns true if the node passes the rule, false otherwise
 */
function evaluateRule(node: any, rule: FilterRule): boolean {
  let propertyValue: any;

  // Handle special properties first
  if (rule.property === 'velocity_score') {
    // Use totalVelocity if available, otherwise treat as 0
    propertyValue = node?.velocity?.totalVelocity ?? 0;
  } else if (rule.property === 'blocking_status') {
    // blocking_status is handled specially since it's a boolean/enum
    return evaluateBlockingStatus(node, rule);
  } else if (rule.property === 'node_type') {
    // Node type is stored at the top-level node.type field
    propertyValue = node?.type;
  } else {
    // Regular node properties
    propertyValue = node?.properties?.[rule.property];
  }

  switch (rule.operator) {
    case 'equals':
      return propertyValue === rule.value || String(propertyValue) === String(rule.value);

    case 'not_equals':
      return propertyValue !== rule.value && String(propertyValue) !== String(rule.value);

    case 'contains':
      // Convert both to strings and do case-insensitive comparison
      return String(propertyValue)
        .toLowerCase()
        .includes(String(rule.value).toLowerCase());

    case 'greater_than':
      // Convert to numbers for comparison
      const numValue = Number(propertyValue);
      const numRuleValue = Number(rule.value);
      // Return false if either conversion results in NaN
      if (isNaN(numValue) || isNaN(numRuleValue)) {
        return false;
      }
      return numValue > numRuleValue;

    case 'less_than':
      // Convert to numbers for comparison
      const numValue2 = Number(propertyValue);
      const numRuleValue2 = Number(rule.value);
      // Return false if either conversion results in NaN
      if (isNaN(numValue2) || isNaN(numRuleValue2)) {
        return false;
      }
      return numValue2 < numRuleValue2;

    default:
      // Unknown operator defaults to true (don't filter)
      return true;
  }
}

/**
 * Evaluates blocking status filter rules.
 * Supports values: "blocked", "blocking", "not_blocked", "not_blocking"
 */
function evaluateBlockingStatus(node: any, rule: FilterRule): boolean {
  const isBlocked = node?.velocity?.isBlocked === true;
  const blocksNodes = (node?.velocity?.blocksNodeIds?.length ?? 0) > 0;
  const value = String(rule.value).toLowerCase();

  switch (rule.operator) {
    case 'equals':
      if (value === 'blocked') return isBlocked;
      if (value === 'blocking') return blocksNodes;
      if (value === 'not_blocked') return !isBlocked;
      if (value === 'not_blocking') return !blocksNodes;
      return false;

    case 'not_equals':
      if (value === 'blocked') return !isBlocked;
      if (value === 'blocking') return !blocksNodes;
      if (value === 'not_blocked') return isBlocked;
      if (value === 'not_blocking') return blocksNodes;
      return false;

    default:
      return true;
  }
}

/**
 * Extracts all unique property keys from a flat list of nodes.
 * Useful for populating property dropdowns in the filter UI.
 * 
 * @param nodes - Array of nodes to extract properties from
 * @returns Sorted array of unique property keys
 */
export function extractUniquePropertyKeys(nodes: any[]): string[] {
  const keys = new Set<string>();

  nodes.forEach((node) => {
    if (node?.properties && typeof node.properties === 'object') {
      Object.keys(node.properties).forEach((key) => {
        keys.add(key);
      });
    }
  });

  return Array.from(keys).sort();
}
