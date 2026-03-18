import { describe, expect, it } from 'vitest';
import { aggregateChartData, getAvailableProperties } from './chartEngine';

describe('aggregateChartData', () => {
  it('splits array x-axis groups and applies count to each element', () => {
    const nodes = [
      { properties: { status: 'Open' } },
      { properties: { status: 'Open' } },
      { properties: { status: '' } },
      { properties: { status: null } },
      { properties: { status: undefined } },
      { properties: { status: ['Blocked', 'Critical'] } },
    ];

    const result = aggregateChartData(nodes, 'status', '_count');

    expect(result).toEqual([
      { name: 'Unassigned', value: 3 },
      { name: 'Open', value: 2 },
      { name: 'Blocked', value: 1 },
      { name: 'Critical', value: 1 },
    ]);
  });

  it('maps assigned_to ids to human names while splitting arrays', () => {
    const nodes = [
      { id: 'person_1', name: 'Alice Johnson', properties: { email: 'alice@example.com' } },
      { id: 'person_2', name: '', properties: { email: 'bob@example.com' } },
      { id: 'task_1', properties: { assigned_to: ['person_1', 'person_2'], estimated_hours: 4 } },
      { id: 'task_2', properties: { assigned_to: ['person_2', 'missing_person'], estimated_hours: 2 } },
    ];

    const result = aggregateChartData(nodes, 'assigned_to', '_count');

    expect(result).toEqual([
      { name: 'bob@example.com', value: 2 },
      { name: 'Unassigned', value: 2 },
      { name: 'Alice Johnson', value: 1 },
      { name: 'missing_person', value: 1 },
    ]);
  });

  it('aggregates numeric y-axis values and defaults invalid numbers to 0', () => {
    const nodes = [
      { properties: { phase: 'A', estimated_hours: 10 } },
      { properties: { phase: 'A', estimated_hours: '5' } },
      { properties: { phase: 'B', estimated_hours: 'bad-input' } },
      { properties: { phase: 'B', estimated_hours: 7 } },
    ];

    const result = aggregateChartData(nodes, 'phase', 'estimated_hours');

    expect(result).toEqual([
      { name: 'A', value: 15 },
      { name: 'B', value: 7 },
    ]);
  });
});

describe('getAvailableProperties', () => {
  it('discovers string/enum/array-string x-axis properties and numeric y-axis properties', () => {
    const nodes = [
      {
        properties: {
          estimated_cost: 100,
          actual_cost: '250',
          status: 'in_progress',
          assigned_to: ['person_1', 'person_2'],
          blocked: true,
          optional_field: null,
          noted_but_empty: undefined,
        },
      },
      {
        properties: {
          estimated_cost: 200,
          actual_cost: '300',
          status: '',
          assigned_to: [],
          optional_field: null,
          noted_but_empty: undefined,
        },
      },
    ];

    const result = getAvailableProperties(nodes);

    expect(result.numbers).toEqual(['actual_cost', 'estimated_cost']);
    expect(result.strings).toEqual(['assigned_to', 'blocked', 'status']);
  });
});
