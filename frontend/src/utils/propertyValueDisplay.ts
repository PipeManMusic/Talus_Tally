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
      const propertyId = String(property.id || '').trim();
      if (!propertyId || labels[propertyId]) {
        return;
      }

      const propertyName = String((property as { name?: string }).name ?? '').trim();
      labels[propertyId] = propertyName || formatPropertyIdLabel(propertyId);
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

      const propertyOptions = optionMaps.get(property.id) ?? new Map<string, string>();
      property.options.forEach((option) => {
        if (!option) return;
        const value = String(option.id ?? option.name ?? '').trim();
        const label = String(option.name ?? option.id ?? '').trim();
        if (!value) return;
        if (!propertyOptions.has(value)) {
          propertyOptions.set(value, label || value);
        }
      });
      optionMaps.set(property.id, propertyOptions);
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
    ?.properties?.find((property) => property.id === propertyId)
    ?.options
    ?.find((option) => String(option.id) === raw);

  if (fromNodeType?.name) {
    return fromNodeType.name;
  }

  for (const nodeType of templateSchema.node_types) {
    const property = nodeType.properties?.find((item) => item.id === propertyId);
    const option = property?.options?.find((item) => String(item.id) === raw);
    if (option?.name) {
      return option.name;
    }
  }

  return raw;
}
