import type { Node, TemplateSchema } from '../api/client';

export interface SelectOption {
  value: string;
  label: string;
}

export function formatPropertyIdLabel(propertyId: string): string {
  return propertyId
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getPropertyLabelMap(templateSchema: TemplateSchema | null | undefined): Record<string, string> {
  if (!templateSchema?.node_types) {
    return {};
  }

  const labels: Record<string, string> = {};

  templateSchema.node_types.forEach((nodeType) => {
    nodeType.properties?.forEach((property) => {
      const propertyKey = String(property.key || property.id || '').trim();
      const propertyId = String(property.id || '').trim();
      if (!propertyKey) {
        return;
      }

      const propertyName = String((property as { name?: string }).name ?? '').trim();
      const label = propertyName || formatPropertyIdLabel(propertyKey);

      // Index by key (human-readable) if not already set
      if (!labels[propertyKey]) {
        labels[propertyKey] = label;
      }
      // Also index by id (UUID) so node data keyed by UUID gets a label
      if (propertyId && propertyId !== propertyKey && !labels[propertyId]) {
        labels[propertyId] = label;
      }
    });
  });

  return labels;
}

export function getSelectOptionsByProperty(templateSchema: TemplateSchema | null | undefined): Record<string, SelectOption[]> {
  if (!templateSchema?.node_types) {
    return {};
  }

  const optionMaps = new Map<string, Map<string, string>>();

  templateSchema.node_types.forEach((nodeType) => {
    nodeType.properties?.forEach((property) => {
      if (!property.options || !Array.isArray(property.options)) {
        return;
      }

      const propertyKey = property.key || property.id;
      const propertyId = property.id;
      const propertyOptions = optionMaps.get(propertyKey) ?? new Map<string, string>();
      property.options.forEach((option) => {
        if (!option) return;
        const value = String(option.id ?? option.name ?? '').trim();
        const label = String(option.name ?? option.id ?? '').trim();
        if (!value) return;
        if (!propertyOptions.has(value)) {
          propertyOptions.set(value, label || value);
        }
      });
      optionMaps.set(propertyKey, propertyOptions);
      // Also index by UUID so lookups from node data work
      if (propertyId && propertyId !== propertyKey && !optionMaps.has(propertyId)) {
        optionMaps.set(propertyId, propertyOptions);
      }
    });
  });

  const result: Record<string, SelectOption[]> = {};
  optionMaps.forEach((optionMap, propertyId) => {
    result[propertyId] = Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  return result;
}

/**
 * A logical "property group" — all schema property definitions across node
 * types that share the same display label and type. The filter UI shows one
 * dropdown entry per group, and the underlying rule stores a pipe-joined
 * UUID list so that filter evaluation OR-matches across every node type that
 * defines that label (e.g. picking "Status" filters tasks, episodes, footage,
 * etc. using each one's own per-node-type property UUID).
 */
export interface PropertyGroup {
  /** Stable token used as `FilterRule.property` value. Pipe-joined sorted UUIDs. */
  token: string;
  /** Human-readable label shown in dropdowns. */
  label: string;
  /** Schema property type ('text' | 'select' | 'date' | 'number' | ...). */
  type: string;
  /** All per-node-type property UUIDs that share this label + type. */
  uuids: string[];
}

/**
 * Build the property-group list from a template schema.
 *
 * Grouping key is `label.toLowerCase() + type`. Two properties only collapse
 * into one dropdown entry if they share both the visible label AND the data
 * type — keeping e.g. a text "Description" separate from a rich-text
 * "Description" if both ever exist.
 */
export function getPropertyGroups(templateSchema: TemplateSchema | null | undefined): PropertyGroup[] {
  if (!templateSchema?.node_types) {
    return [];
  }

  const buckets = new Map<string, { label: string; type: string; uuids: Set<string> }>();

  templateSchema.node_types.forEach((nodeType) => {
    nodeType.properties?.forEach((property: any) => {
      // The schema endpoint serializes a property's UUID into its `id` field
      // (see backend/api/routes.py get_template_schema). An explicit `uuid`
      // field may also exist on raw template YAML; prefer either one.
      const uuidCandidate =
        (typeof property?.uuid === 'string' && property.uuid.trim()) ||
        (typeof property?.id === 'string' && property.id.trim()) ||
        '';
      if (!uuidCandidate) return;

      const rawLabel = String(
        property?.name ?? property?.label ?? property?.key ?? property?.id ?? '',
      ).trim();
      if (!rawLabel) return;

      const type = typeof property?.type === 'string' && property.type ? property.type : 'text';
      const bucketKey = `${rawLabel.toLowerCase()}::${type}`;
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.uuids.add(uuidCandidate);
      } else {
        buckets.set(bucketKey, { label: rawLabel, type, uuids: new Set([uuidCandidate]) });
      }
    });
  });

  const groups: PropertyGroup[] = [];
  buckets.forEach(({ label, type, uuids }) => {
    const sortedUuids = Array.from(uuids).sort();
    groups.push({
      token: sortedUuids.join('|'),
      label,
      type,
      uuids: sortedUuids,
    });
  });

  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

export function resolvePropertyValueLabel(
  templateSchema: TemplateSchema | null | undefined,
  nodeTypeId: string | undefined,
  propertyId: string,
  rawValue: unknown,
): string {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return 'Unassigned';
  }

  const raw = String(rawValue);
  if (!templateSchema?.node_types) {
    return raw;
  }

  const fromNodeType = templateSchema.node_types
    .find((nodeType) => nodeType.id === nodeTypeId)
    ?.properties?.find((property) => (property.key || property.id) === propertyId)
    ?.options
    ?.find((option) => String(option.id) === raw);

  if (fromNodeType?.name) {
    return fromNodeType.name;
  }

  for (const nodeType of templateSchema.node_types) {
    const property = nodeType.properties?.find((item) => (item.key || item.id) === propertyId);
    const option = property?.options?.find((item) => String(item.id) === raw);
    if (option?.name) {
      return option.name;
    }
  }

  return raw;
}

/**
 * Resolve the human-readable label for a single node.
 * Resolution order: properties.name → node.name → fallback (defaults to node.id or '').
 */
export function resolveNodeLabel(
  node: Node | null | undefined,
  fallback?: string,
): string {
  if (!node) return fallback ?? '';
  const name = String(node.properties?.name ?? node.name ?? '').trim();
  return name || (fallback ?? node.id ?? '');
}

/**
 * Resolve the human-readable label for a node by ID, looking it up in a node map.
 * Resolution order: properties.name → node.name → fallback (defaults to the id itself).
 */
export function resolveNodeLabelById(
  nodes: Record<string, Node>,
  id: string,
  fallback?: string,
): string {
  return resolveNodeLabel(nodes[id], fallback ?? id);
}
