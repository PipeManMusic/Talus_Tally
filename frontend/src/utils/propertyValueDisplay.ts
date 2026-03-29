import type { TemplateSchema } from '../api/client';

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
