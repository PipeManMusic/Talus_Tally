import { resolvePropertyValueLabel } from './propertyValueDisplay';

export interface ChartAggregatePoint {
  name: string;
  value: number;
}

export interface AvailableChartProperties {
  strings: string[];
  numbers: string[];
}

export type ChartAggregationMode = 'sum' | 'avg';

function toGroupName(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Unassigned';
  }
  const asString = String(value).trim();
  return asString.length > 0 ? asString : 'Unassigned';
}

function toGroupNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ['Unassigned'];
    }
    return value.map((item) => toGroupName(item));
  }
  return [toGroupName(value)];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function aggregateChartData(
  nodes: any[],
  xAxisProp: string,
  yAxisProp: string,
  aggregationMode: ChartAggregationMode = 'sum',
  templateSchema?: any,
): ChartAggregatePoint[] {
  const totals = new Map<string, { sum: number; count: number }>();
  const nodeById = new Map<string, any>();

  nodes.forEach((node) => {
    if (node?.id) {
      nodeById.set(String(node.id), node);
    }
  });

  nodes.forEach((node) => {
    const nextValue = yAxisProp === '_count'
      ? 1
      : toNumber(node?.properties?.[yAxisProp]);

    const rawGroups = toGroupNames(node?.properties?.[xAxisProp]);
    rawGroups.forEach((rawGroup) => {
      let groupValue = rawGroup;

      if (xAxisProp === 'assigned_to' && rawGroup !== 'Unassigned') {
        const assignedNode = nodeById.get(rawGroup);
        const assignedName = String(assignedNode?.name ?? '').trim();
        const assignedEmail = String(assignedNode?.properties?.email ?? '').trim();
        groupValue = assignedName || assignedEmail || rawGroup;
      } else if (rawGroup !== 'Unassigned' && templateSchema) {
        // Resolve select option UUIDs to human-readable labels
        const resolved = resolvePropertyValueLabel(
          templateSchema,
          node?.type,
          xAxisProp,
          rawGroup,
        );
        if (resolved !== rawGroup) {
          groupValue = resolved;
        }
      }

      const existing = totals.get(groupValue) ?? { sum: 0, count: 0 };
      existing.sum += nextValue;
      existing.count += 1;
      totals.set(groupValue, existing);
    });
  });

  return Array.from(totals.entries())
    .map(([name, value]) => {
      if (yAxisProp === '_count') {
        return { name, value: value.sum };
      }
      if (aggregationMode === 'avg') {
        return { name, value: value.count > 0 ? value.sum / value.count : 0 };
      }
      return { name, value: value.sum };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function getAvailableProperties(nodes: any[]): AvailableChartProperties {
  const stringKeys = new Set<string>();
  const numberKeys = new Set<string>();

  nodes.forEach((node) => {
    const properties = node?.properties;
    if (!properties || typeof properties !== 'object') {
      return;
    }

    Object.entries(properties).forEach(([key, rawValue]) => {
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        numberKeys.add(key);
        return;
      }

      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed.length > 0) {
          const numericCandidate = Number(trimmed.replace(/,/g, ''));
          if (Number.isFinite(numericCandidate)) {
            numberKeys.add(key);
          } else {
            stringKeys.add(key);
          }
        }
        return;
      }

      if (Array.isArray(rawValue)) {
        const nonEmpty = rawValue.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
        if (nonEmpty.length > 0 && nonEmpty.every((item) => typeof item === 'string')) {
          stringKeys.add(key);
        }
        return;
      }

      if (typeof rawValue === 'boolean') {
        stringKeys.add(key);
      }
    });
  });

  const strings = Array.from(stringKeys);
  const numbers = Array.from(numberKeys);

  strings.sort((a, b) => a.localeCompare(b));
  numbers.sort((a, b) => a.localeCompare(b));

  return { strings, numbers };
}
