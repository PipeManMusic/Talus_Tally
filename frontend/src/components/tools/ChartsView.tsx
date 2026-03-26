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
import { useGraphStore } from '../../store';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';
import { aggregateChartData, getAvailableProperties } from '../../utils/chartEngine';
import { formatPropertyIdLabel, getPropertyLabelMap } from '../../utils/propertyValueDisplay';

type ChartType = 'bar' | 'pie' | 'line';

interface ChartsViewProps {
  nodes?: Record<string, Node>;
  velocityScores?: Record<string, VelocityScore>;
  templateSchema?: TemplateSchema | null;
}

const CHART_COLORS = ['#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function ChartsView({ nodes = {}, velocityScores = {}, templateSchema }: ChartsViewProps) {
  const { nodes: storeNodes } = useGraphStore();
  const { rules } = useFilterStore();
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxis, setXAxis] = useState('status');
  const [yAxis, setYAxis] = useState('_count');

  const effectiveNodeMap = useMemo(() => {
    if (Object.keys(nodes).length > 0) {
      return nodes;
    }
    return storeNodes;
  }, [nodes, storeNodes]);

  const allNodes = useMemo(() => {
    return Object.values(effectiveNodeMap).filter((node) => !templateSchema?.node_types?.find(nt => nt.id === node.type)?.features?.includes('is_root'));
  }, [effectiveNodeMap, templateSchema]);

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

  const availableProperties = useMemo(() => {
    return getAvailableProperties(filteredNodes.length > 0 ? filteredNodes : allNodes);
  }, [allNodes, filteredNodes]);

  const propertyLabelMap = useMemo(() => getPropertyLabelMap(templateSchema), [templateSchema]);

  const getPropertyLabel = (propertyId: string): string => {
    return propertyLabelMap[propertyId] || formatPropertyIdLabel(propertyId);
  };

  const xAxisOptions = useMemo(() => {
    return availableProperties.strings.map((property) => ({ value: property, label: getPropertyLabel(property) }));
  }, [availableProperties.strings, propertyLabelMap]);

  const yAxisOptions = useMemo(() => {
    return availableProperties.numbers.map((property) => ({ value: property, label: getPropertyLabel(property) }));
  }, [availableProperties.numbers, propertyLabelMap]);

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
    if (yAxis === '_count') {
      return;
    }

    const yAxisValues = yAxisOptions.map((option) => option.value);
    if (!yAxisValues.includes(yAxis)) {
      const fallback = '_count';
      setYAxis(fallback);
    }
  }, [yAxis, yAxisOptions]);

  const yAxisDisplayName = useMemo(() => (yAxis === '_count' ? 'Count' : getPropertyLabel(yAxis)), [propertyLabelMap, yAxis]);

  const chartData = useMemo(() => {
    if (!xAxis) return [];
    return aggregateChartData(filteredNodes, xAxis, yAxis, 'sum', templateSchema);
  }, [filteredNodes, xAxis, yAxis, templateSchema]);

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      <div className="px-4 py-3 border-b border-border bg-bg-light">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={80} stroke="#cbd5e1" tick={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} />
                  <YAxis stroke="#cbd5e1" tick={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} tickFormatter={(v: number) => Number(v).toFixed(1)} />
                  <Tooltip contentStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} formatter={(value: any) => [Number(value).toFixed(1)]} />
                  <Legend wrapperStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} />
                <Bar
                  dataKey="value"
                  fill="#3b82f6"
                  name={yAxis === '_count' ? 'Count' : yAxisDisplayName}
                />
              </BarChart>
            ) : chartType === 'pie' ? (
              <PieChart>
                 <Tooltip contentStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} formatter={(value: any) => [Number(value).toFixed(1)]} />
                 <Legend wrapperStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} />
                <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={130} label>
                  {chartData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={80} stroke="#cbd5e1" tick={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} />
                  <YAxis stroke="#cbd5e1" tick={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} tickFormatter={(v: number) => Number(v).toFixed(1)} />
                  <Tooltip contentStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} formatter={(value: any) => [Number(value).toFixed(1)]} />
                  <Legend wrapperStyle={{ fontFamily: '"Segoe UI", Arial, sans-serif' }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={yAxis === '_count' ? 'Count' : yAxisDisplayName}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
