import { describe, expect, it } from 'vitest';
import { aggregateChartData, getAvailableProperties } from './chartEngine';

describe('aggregateChartData', () => {
  it('aggregates count metric by group and handles unassigned values', () => {
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
      { name: 'Blocked, Critical', value: 1 },
    ]);
  });

  it('aggregates numeric values with sum mode', () => {
    const nodes = [
      { properties: { phase: 'A', estimated_cost: 100 } },
      { properties: { phase: 'A', estimated_cost: '1,200' } },
      { properties: { phase: 'B', estimated_cost: 'bad-input' } },
      { properties: { phase: 'B', estimated_cost: 50 } },
    ];

    const result = aggregateChartData(nodes, 'phase', 'estimated_cost', 'sum');

    expect(result).toEqual([
      { name: 'A', value: 1300 },
      { name: 'B', value: 50 },
    ]);
  });

  it('aggregates numeric values with average mode', () => {
    const nodes = [
      { properties: { owner: 'Alice', velocity_score: 10 } },
      { properties: { owner: 'Alice', velocity_score: 20 } },
      { properties: { owner: 'Bob', velocity_score: 15 } },
      { properties: { owner: 'Bob', velocity_score: '5' } },
    ];

    const result = aggregateChartData(nodes, 'owner', 'velocity_score', 'avg');

    expect(result).toEqual([
      { name: 'Alice', value: 15 },
      { name: 'Bob', value: 10 },
    ]);
  });
});

describe('getAvailableProperties', () => {
  it('detects numeric and string properties including sparse fields', () => {
    const nodes = [
      {
        properties: {
          estimated_cost: 100,
          actual_cost: '250',
          status: 'in_progress',
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
          optional_field: null,
          noted_but_empty: undefined,
        },
      },
    ];

    const result = getAvailableProperties(nodes);

    expect(result.numbers).toEqual(['actual_cost', 'estimated_cost']);
    expect(result.strings).toEqual(['blocked', 'noted_but_empty', 'optional_field', 'status']);
  });
});
