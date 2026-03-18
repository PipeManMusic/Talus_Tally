import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChartsView } from './ChartsView';
import { useFilterStore } from '../../store/filterStore';

vi.mock('recharts', () => {
  const MockChart = ({ data, children, ...rest }: any) => (
    <div data-testid="chart-data" data-props={JSON.stringify(rest)}>
      {JSON.stringify(data ?? [])}
      {children}
    </div>
  );

  const MockPassthrough = ({ children }: any) => <div>{children}</div>;

  return {
    ResponsiveContainer: MockPassthrough,
    BarChart: MockChart,
    PieChart: MockChart,
    LineChart: MockChart,
    CartesianGrid: MockPassthrough,
    XAxis: MockPassthrough,
    YAxis: MockPassthrough,
    Tooltip: MockPassthrough,
    Legend: MockPassthrough,
    Bar: MockPassthrough,
    Pie: MockPassthrough,
    Line: MockPassthrough,
    Cell: MockPassthrough,
  };
});

describe('ChartsView', () => {
  beforeEach(() => {
    useFilterStore.setState({ rules: [] });
  });

  it('applies active filter rules before chart aggregation', () => {
    useFilterStore.setState({
      rules: [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'Open',
        },
      ],
    });

    const nodes = {
      a: {
        id: 'a',
        type: 'task',
        properties: { status: 'Open', estimated_hours: 3 },
      },
      b: {
        id: 'b',
        type: 'task',
        properties: { status: 'Closed', estimated_hours: 5 },
      },
    } as any;

    render(<ChartsView nodes={nodes} velocityScores={{}} templateSchema={null} />);

    const chartPayload = JSON.parse(screen.getByTestId('chart-data').textContent || '[]');
    expect(chartPayload).toEqual([{ name: 'Open', value: 1 }]);
  });

  it('supports pivot controls and maps assigned_to ids to display names', () => {
    const nodes = {
      person1: {
        id: 'person1',
        type: 'person',
        name: 'Alice Johnson',
        properties: { email: 'alice@example.com' },
      },
      person2: {
        id: 'person2',
        type: 'person',
        name: '',
        properties: { email: 'bob@example.com' },
      },
      task1: {
        id: 'task1',
        type: 'task',
        properties: { status: 'Open', assigned_to: ['person1', 'person2'], estimated_hours: 4 },
      },
      task2: {
        id: 'task2',
        type: 'task',
        properties: { status: 'Open', assigned_to: ['person2'], estimated_hours: 2 },
      },
    } as any;

    render(<ChartsView nodes={nodes} velocityScores={{}} templateSchema={null} />);

    fireEvent.change(screen.getByLabelText('Group By (X-Axis)'), {
      target: { value: 'assigned_to' },
    });

    fireEvent.change(screen.getByLabelText('Value (Y-Axis)'), {
      target: { value: 'estimated_hours' },
    });

    const chartPayload = JSON.parse(screen.getByTestId('chart-data').textContent || '[]');

    const alice = chartPayload.find((entry: any) => entry.name === 'Alice Johnson');
    const bob = chartPayload.find((entry: any) => entry.name === 'bob@example.com');

    expect(alice?.value).toBe(4);
    expect(bob?.value).toBe(6);
  });
});
