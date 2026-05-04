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
    // Regular node properties. The rule.property value may be either
    //   - a single property key (legacy single-UUID rules), or
    //   - a pipe-joined UUID list created by the FilterBar when multiple
    //     node types share the same property label (e.g. "Status" lives on
    //     task, episode, footage with three distinct UUIDs).
    // For pipe-joined keys we OR-match: pick the first UUID that has a
    // defined value on this node, falling back to undefined if none do.
    propertyValue = resolveGroupedPropertyValue(node, rule.property);
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

    case 'before':
    case 'after':
    case 'on_or_before':
    case 'on_or_after': {
      const left = parseFilterDate(propertyValue);
      const right = parseFilterDate(rule.value);
      if (left === null || right === null) {
        // Unparseable on either side → rule does not match (filter excludes the node)
        return false;
      }
      if (rule.operator === 'before') return left < right;
      if (rule.operator === 'after') return left > right;
      if (rule.operator === 'on_or_before') return left <= right;
      return left >= right; // on_or_after
    }

    default:
      // Unknown operator defaults to true (don't filter)
      return true;
  }
}

/**
 * Resolves a (possibly grouped) property key against a node's properties dict.
 *
 * - For a plain key (no `|`), this is a direct `node.properties[key]` lookup.
 * - For a pipe-joined group token (e.g. `"uuid-a|uuid-b|uuid-c"`), each UUID
 *   is tried in order and the first defined, non-empty value wins. Empty
 *   strings are treated as "missing" so that a stale empty entry on one node
 *   type does not shadow a real value stored under another type's UUID.
 */
function resolveGroupedPropertyValue(node: any, propertyKey: string): any {
  if (!propertyKey) return undefined;
  const props = node?.properties;
  if (!props || typeof props !== 'object') return undefined;
  if (!propertyKey.includes('|')) {
    return props[propertyKey];
  }
  const parts = propertyKey.split('|');
  for (const part of parts) {
    if (!part) continue;
    const v = props[part];
    if (v !== undefined && v !== null && v !== '') {
      return v;
    }
  }
  return undefined;
}

/**
 * Parses a value into a UTC day-aligned timestamp (ms) for date comparisons.
 * Accepts:
 *   - "YYYY-MM-DD" (preferred — interpreted as that calendar day)
 *   - ISO datetime strings (e.g. "2026-01-15T12:00:00Z")
 *   - Date objects
 *   - Numeric epoch millis
 * Returns null when the value cannot be parsed as a date.
 *
 * For "YYYY-MM-DD" we anchor to UTC midnight so that comparisons are
 * timezone-stable (a date stored as "2026-01-15" never drifts to the 14th
 * or 16th depending on the user's locale).
 */
function parseFilterDate(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return isNaN(t) ? null : t;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }
  // Fast path for YYYY-MM-DD → UTC midnight
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const t = Date.UTC(year, month - 1, day);
    return isNaN(t) ? null : t;
  }
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : parsed;
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
