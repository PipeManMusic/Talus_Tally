import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Node, VelocityScore, TemplateSchema } from '../../api/client';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';
import { aggregateChartData, getAvailableProperties, type ChartAggregationMode } from '../../utils/chartEngine';
import { formatPropertyIdLabel, getPropertyLabelMap, resolvePropertyValueLabel } from '../../utils/propertyValueDisplay';

type ChartType = 'bar' | 'pie' | 'line';

interface ChartsViewProps {
  nodes?: Record<string, Node>;
  velocityScores?: Record<string, VelocityScore>;
  templateSchema?: TemplateSchema | null;
}

const CHART_COLORS = ['#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const SPECIAL_X_AXIS_OPTIONS = [
  { value: 'node_type', label: 'Node Type' },
  { value: 'velocity_score', label: 'Velocity Score' },
  { value: 'blocking_status', label: 'Blocking Status' },
];

const SPECIAL_Y_AXIS_OPTIONS = [
  { value: 'velocity_score', label: 'Velocity Score' },
  { value: 'blocked_count', label: 'Count of Blocked Nodes' },
  { value: 'blocking_count', label: 'Count of Blocking Nodes' },
];

interface YAxisOption {
  value: string;
  label: string;
  supportsAggregation: boolean;
}

type AxisDataType = 'categorical' | 'numeric';

function getBlockingStatusLabel(score?: VelocityScore): string {
  const isBlocked = score?.isBlocked === true;
  const isBlocking = (score?.blocksNodeIds?.length ?? 0) > 0;

  if (isBlocked && isBlocking) return 'Blocked + Blocking';
  if (isBlocked) return 'Blocked';
  if (isBlocking) return 'Blocking';
  return 'Not Blocked';
}

function getXAxisValue(
  node: Node,
  xAxisKey: string,
  templateSchema: TemplateSchema | null | undefined,
  velocityScores: Record<string, VelocityScore>,
): unknown {
  if (xAxisKey === 'node_type') {
    const typeLabel = templateSchema?.node_types?.find((entry) => entry.id === node.type)?.name;
    return typeLabel || node.type;
  }

  if (xAxisKey === 'velocity_score') {
    return velocityScores[node.id]?.totalVelocity ?? 0;
  }

  if (xAxisKey === 'blocking_status') {
    return getBlockingStatusLabel(velocityScores[node.id]);
  }

  return resolvePropertyValueLabel(templateSchema, node.type, xAxisKey, node.properties?.[xAxisKey]);
}

function getYAxisValue(
  node: Node,
  yAxisKey: string,
  velocityScores: Record<string, VelocityScore>,
): number {
  const score = velocityScores[node.id];

  if (yAxisKey === 'velocity_score') {
    return score?.totalVelocity ?? 0;
  }

  if (yAxisKey === 'blocked_count') {
    return score?.isBlocked ? 1 : 0;
  }

  if (yAxisKey === 'blocking_count') {
    return (score?.blocksNodeIds?.length ?? 0) > 0 ? 1 : 0;
  }

  const rawValue = node.properties?.[yAxisKey];
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : 0;
  }
  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue.trim().replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function ChartsView({ nodes = {}, velocityScores = {}, templateSchema }: ChartsViewProps) {
  const { rules } = useFilterStore();
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxis, setXAxis] = useState('status');
  const [yAxis, setYAxis] = useState('_count');
  const [aggregationMode, setAggregationMode] = useState<ChartAggregationMode>('sum');

  const allNodes = useMemo(() => {
    return Object.values(nodes).filter((node) => node.type !== 'project' && node.type !== 'project_root');
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return allNodes.filter((node) => {
      return evaluateNodeVisibility(
        {
          id: node.id,
          name: node.properties?.name || node.id,
          type: node.type,
          properties: node.properties || {},
          velocity: velocityScores[node.id],
        },
        rules,
      );
    });
  }, [allNodes, rules, velocityScores]);

  const propertySourceNodes = useMemo(() => {
    return rules.length === 0 ? allNodes : filteredNodes;
  }, [allNodes, filteredNodes, rules.length]);

  const availableProperties = useMemo(() => {
    return getAvailableProperties(propertySourceNodes);
  }, [propertySourceNodes]);

  const propertyLabelMap = useMemo(() => getPropertyLabelMap(templateSchema), [templateSchema]);

  const getPropertyLabel = (propertyId: string): string => {
    return propertyLabelMap[propertyId] || formatPropertyIdLabel(propertyId);
  };

  const xAxisOptions = useMemo(() => {
    const merged = [...availableProperties.strings, ...availableProperties.numbers];
    const deduped = Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b));
    const propertyOptions = deduped.map((property) => ({ value: property, label: getPropertyLabel(property) }));
    return [...SPECIAL_X_AXIS_OPTIONS, ...propertyOptions];
  }, [availableProperties.numbers, availableProperties.strings, propertyLabelMap]);

  const xAxisDataType = useMemo<AxisDataType>(() => {
    if (xAxis === 'velocity_score') {
      return 'numeric';
    }
    if (xAxis === 'node_type' || xAxis === 'blocking_status') {
      return 'categorical';
    }
    if (availableProperties.numbers.includes(xAxis)) {
      return 'numeric';
    }
    return 'categorical';
  }, [availableProperties.numbers, xAxis]);

  const yAxisOptions = useMemo(() => {
    const specialOptions: YAxisOption[] = [
      { value: 'velocity_score', label: 'Velocity Score', supportsAggregation: true },
      { value: 'blocked_count', label: 'Count of Blocked Nodes', supportsAggregation: false },
      { value: 'blocking_count', label: 'Count of Blocking Nodes', supportsAggregation: false },
    ];

    const propertyOptions: YAxisOption[] = availableProperties.numbers.map((property) => ({
      value: property,
      label: getPropertyLabel(property),
      supportsAggregation: true,
    }));

    const combined = [...specialOptions, ...propertyOptions];
    const deduped = Array.from(new Map(combined.map((option) => [option.value, option])).values());

    if (xAxisDataType === 'numeric') {
      return deduped;
    }

    return deduped;
  }, [availableProperties.numbers, propertyLabelMap, xAxisDataType]);

  useEffect(() => {
    if (xAxisOptions.length === 0) {
      setXAxis('');
      return;
    }

    const xAxisValues = xAxisOptions.map((option) => option.value);
    if (!xAxisValues.includes(xAxis)) {
      const fallback = xAxisValues.includes('status')
        ? 'status'
        : xAxisOptions[0].value;
      setXAxis(fallback);
    }
  }, [xAxis, xAxisOptions]);

  useEffect(() => {
    const allowCount = true;

    if (xAxisDataType === 'numeric' && yAxis === '_count') {
      const preferred = yAxisOptions.find((option) => option.value === 'velocity_score' && option.supportsAggregation)
        ?? yAxisOptions.find((option) => option.supportsAggregation)
        ?? yAxisOptions[0];
      if (preferred) {
        setYAxis(preferred.value);
      }
      return;
    }

    if (yAxis === '_count') {
      return;
    }

    const yAxisValues = yAxisOptions.map((option) => option.value);
    if (!yAxisValues.includes(yAxis)) {
      const fallback = xAxisDataType === 'numeric'
        ? (yAxisOptions.find((option) => option.supportsAggregation)?.value || yAxisOptions[0]?.value || '_count')
        : '_count';
      setYAxis(fallback);
    }
  }, [xAxisDataType, yAxis, yAxisOptions]);

  const selectedYAxisOption = useMemo(() => {
    return yAxisOptions.find((option) => option.value === yAxis);
  }, [yAxis, yAxisOptions]);

  const supportsAggregationMode = yAxis !== '_count' && Boolean(selectedYAxisOption?.supportsAggregation);

  const yAxisDisplayName = useMemo(() => {
    if (yAxis === '_count') return 'Count';
    return selectedYAxisOption?.label || getPropertyLabel(yAxis);
  }, [selectedYAxisOption?.label, yAxis]);

  useEffect(() => {
    if (supportsAggregationMode && aggregationMode !== 'avg' && xAxisDataType === 'numeric') {
      setAggregationMode('avg');
    }
  }, [aggregationMode, supportsAggregationMode, xAxisDataType]);

  const chartData = useMemo(() => {
    if (!xAxis) return [];
    const displayNodes = filteredNodes.map((node) => ({
      ...node,
      properties: {
        ...(node.properties || {}),
        [xAxis]: getXAxisValue(node, xAxis, templateSchema, velocityScores),
        ...(yAxis !== '_count' ? { [yAxis]: getYAxisValue(node, yAxis, velocityScores) } : {}),
      },
    }));
    return aggregateChartData(displayNodes, xAxis, yAxis, supportsAggregationMode ? aggregationMode : 'sum');
  }, [aggregationMode, filteredNodes, supportsAggregationMode, templateSchema, velocityScores, xAxis, yAxis]);

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      <div className="px-4 py-3 border-b border-border bg-bg-light">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            Chart Type
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              className="px-3 py-2 rounded bg-bg-dark border border-border text-fg-primary"
            >
              <option value="bar">Bar</option>
              <option value="pie">Pie</option>
              <option value="line">Line</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            Group By (X-Axis)
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
              className="px-3 py-2 rounded bg-bg-dark border border-border text-fg-primary"
              disabled={xAxisOptions.length === 0}
            >
              {xAxisOptions.length === 0 ? (
                <option value="">No grouping fields available</option>
              ) : (
                xAxisOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            Value (Y-Axis)
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="px-3 py-2 rounded bg-bg-dark border border-border text-fg-primary"
            >
              <option value="_count">Count (Number of Nodes)</option>
              {yAxisOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            Aggregation
            <select
              value={aggregationMode}
              onChange={(e) => setAggregationMode(e.target.value as ChartAggregationMode)}
              className="px-3 py-2 rounded bg-bg-dark border border-border text-fg-primary"
              disabled={!supportsAggregationMode}
            >
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-fg-secondary text-sm">
            No chart data available for the current filter and pivot settings.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={80} stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="value"
                  fill="#3b82f6"
                  name={yAxis === '_count' ? 'Count' : `${supportsAggregationMode && aggregationMode === 'avg' ? 'Average' : 'Sum'} of ${yAxisDisplayName}`}
                />
              </BarChart>
            ) : chartType === 'pie' ? (
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={130} label>
                  {chartData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={80} stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={yAxis === '_count' ? 'Count' : `${supportsAggregationMode && aggregationMode === 'avg' ? 'Average' : 'Sum'} of ${yAxisDisplayName}`}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
