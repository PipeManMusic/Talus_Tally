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
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'Unassigned';
  }
  const asString = String(value).trim();
  return asString.length > 0 ? asString : 'Unassigned';
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
): ChartAggregatePoint[] {
  const totals = new Map<string, { sum: number; count: number }>();

  nodes.forEach((node) => {
    const groupValue = toGroupName(node?.properties?.[xAxisProp]);
    const nextValue = yAxisProp === '_count'
      ? 1
      : toNumber(node?.properties?.[yAxisProp]);
    const existing = totals.get(groupValue) ?? { sum: 0, count: 0 };
    existing.sum += nextValue;
    existing.count += 1;
    totals.set(groupValue, existing);
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
  const stats = new Map<string, { seen: number; numericVotes: number; stringVotes: number }>();

  nodes.forEach((node) => {
    const properties = node?.properties;
    if (!properties || typeof properties !== 'object') {
      return;
    }

    Object.entries(properties).forEach(([key, rawValue]) => {
      const current = stats.get(key) ?? { seen: 0, numericVotes: 0, stringVotes: 0 };
      current.seen += 1;

      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        current.numericVotes += 1;
      } else if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed.length > 0) {
          const numericCandidate = Number(trimmed.replace(/,/g, ''));
          if (Number.isFinite(numericCandidate)) {
            current.numericVotes += 1;
          } else {
            current.stringVotes += 1;
          }
        }
      } else if (typeof rawValue === 'boolean') {
        current.stringVotes += 1;
      }

      stats.set(key, current);
    });
  });

  const strings: string[] = [];
  const numbers: string[] = [];

  stats.forEach((value, key) => {
    if (value.numericVotes > 0) {
      numbers.push(key);
    }

    // Keep sparse fields available for grouping even when most values are empty/null.
    if (value.stringVotes > 0 || (value.numericVotes === 0 && value.stringVotes === 0 && value.seen > 0)) {
      strings.push(key);
    }
  });

  strings.sort((a, b) => a.localeCompare(b));
  numbers.sort((a, b) => a.localeCompare(b));

  return { strings, numbers };
}
