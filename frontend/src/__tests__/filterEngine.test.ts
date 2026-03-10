import { describe, expect, it } from 'vitest';
import { evaluateNodeVisibility, extractUniquePropertyKeys } from '../utils/filterEngine';
import type { FilterRule } from '../store/filterStore';

describe('evaluateNodeVisibility', () => {
  describe('with no rules', () => {
    it('returns true - node is always visible when no filters active', () => {
      const node = {
        id: 'test-1',
        name: 'Test Node',
        type: 'task',
        properties: { status: 'active' },
      };

      expect(evaluateNodeVisibility(node, [])).toBe(true);
    });
  });

  describe('equals operator', () => {
    it('returns true when property equals value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { status: 'active' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when property does not equal value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { status: 'inactive' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns false when property is undefined', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('supports numeric equality', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { priority: 5 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'priority',
          operator: 'equals',
          value: 5,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });
  });

  describe('not_equals operator', () => {
    it('returns true when property does not equal value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { status: 'inactive' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'not_equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when property equals value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { status: 'active' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'not_equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns true when property is undefined (undefined !== value)', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'not_equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });
  });

  describe('contains operator', () => {
    it('returns true when property contains substring (case-insensitive)', () => {
      const node = {
        id: 'test-1',
        name: 'Test Node',
        type: 'task',
        properties: { description: 'This is a test description' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'description',
          operator: 'contains',
          value: 'test',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('performs case-insensitive matching', () => {
      const node = {
        id: 'test-1',
        name: 'Test Node',
        type: 'task',
        properties: { description: 'This is a TEST description' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'description',
          operator: 'contains',
          value: 'test',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when property does not contain substring', () => {
      const node = {
        id: 'test-1',
        name: 'Test Node',
        type: 'task',
        properties: { description: 'This is a description' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'description',
          operator: 'contains',
          value: 'missing',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('works with numeric properties (converts to string)', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { id_num: 12345 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'id_num',
          operator: 'contains',
          value: '234',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('handles undefined property gracefully', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'description',
          operator: 'contains',
          value: 'test',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });
  });

  describe('greater_than operator', () => {
    it('returns true when property is greater than value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 1500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'greater_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when property is less than value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'greater_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns false when property equals value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 1000 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'greater_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('converts string values to numbers', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 1500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'greater_than',
          value: '1000',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false for non-numeric property', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { name: 'Test Project' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'name',
          operator: 'greater_than',
          value: 100,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns false for undefined property', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'greater_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });
  });

  describe('less_than operator', () => {
    it('returns true when property is less than value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'less_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when property is greater than value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 1500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'less_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns false when property equals value', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 1000 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'less_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('converts string values to numbers', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { estimated_cost: 500 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'less_than',
          value: '1000',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false for non-numeric property', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { name: 'Test Project' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'name',
          operator: 'less_than',
          value: 100,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('returns false for undefined property', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'estimated_cost',
          operator: 'less_than',
          value: 1000,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });
  });

  describe('AND logic - multiple rules', () => {
    it('returns true only when all rules pass', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {
          status: 'active',
          priority: 5,
          description: 'High priority task',
        },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
        {
          id: 'rule-2',
          property: 'priority',
          operator: 'greater_than',
          value: 3,
        },
        {
          id: 'rule-3',
          property: 'description',
          operator: 'contains',
          value: 'priority',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false if any rule fails (AND logic)', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {
          status: 'active',
          priority: 2, // Fails rule 2
          description: 'High priority task',
        },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
        {
          id: 'rule-2',
          property: 'priority',
          operator: 'greater_than',
          value: 3,
        },
        {
          id: 'rule-3',
          property: 'description',
          operator: 'contains',
          value: 'priority',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('evaluates all rules even if first fails', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: {
          status: 'inactive',
          priority: 5,
        },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
        {
          id: 'rule-2',
          property: 'priority',
          operator: 'greater_than',
          value: 3,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles nodes without properties object', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
      } as any;
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });

    it('handles null property values', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { status: null },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'status',
          operator: 'equals',
          value: null,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('handles empty string values', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { description: '' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'description',
          operator: 'equals',
          value: '',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('handles zero values', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { count: 0 },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'count',
          operator: 'greater_than',
          value: -1,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('handles boolean values', () => {
      const node = {
        id: 'test-1',
        name: 'Test',
        type: 'task',
        properties: { enabled: true },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'enabled',
          operator: 'equals',
          value: true,
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });
  });

  describe('node_type special property', () => {
    it('supports equals filtering against node.type', () => {
      const node = {
        id: 'test-1',
        name: 'Engine Mount Task',
        type: 'task',
        properties: { status: 'active' },
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'node_type',
          operator: 'equals',
          value: 'task',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('supports contains filtering against node.type', () => {
      const node = {
        id: 'test-2',
        name: 'Top-level project',
        type: 'project_root',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'node_type',
          operator: 'contains',
          value: 'root',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(true);
    });

    it('returns false when node.type does not match', () => {
      const node = {
        id: 'test-3',
        name: 'Season node',
        type: 'season',
        properties: {},
      };
      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          property: 'node_type',
          operator: 'equals',
          value: 'task',
        },
      ];

      expect(evaluateNodeVisibility(node, rules)).toBe(false);
    });
  });
});

describe('extractUniquePropertyKeys', () => {
  it('extracts unique property keys from nodes', () => {
    const nodes = [
      {
        id: 'node-1',
        properties: { name: 'Task 1', status: 'active' },
      },
      {
        id: 'node-2',
        properties: { name: 'Task 2', status: 'inactive', priority: 5 },
      },
      {
        id: 'node-3',
        properties: { name: 'Task 3' },
      },
    ];

    const keys = extractUniquePropertyKeys(nodes);

    expect(keys).toContain('name');
    expect(keys).toContain('status');
    expect(keys).toContain('priority');
    expect(keys).toHaveLength(3);
  });

  it('returns sorted keys', () => {
    const nodes = [
      { id: 'node-1', properties: { zebra: 1, apple: 2, middle: 3 } },
    ];

    const keys = extractUniquePropertyKeys(nodes);

    expect(keys).toEqual(['apple', 'middle', 'zebra']);
  });

  it('handles empty array', () => {
    const keys = extractUniquePropertyKeys([]);

    expect(keys).toEqual([]);
  });

  it('handles nodes without properties', () => {
    const nodes = [{ id: 'node-1' }, { id: 'node-2' }] as any;

    const keys = extractUniquePropertyKeys(nodes);

    expect(keys).toEqual([]);
  });

  it('handles nodes with null properties', () => {
    const nodes = [
      { id: 'node-1', properties: { name: 'Test' } },
      { id: 'node-2', properties: null },
    ] as any;

    const keys = extractUniquePropertyKeys(nodes);

    expect(keys).toEqual(['name']);
  });

  it('deduplicates keys across multiple nodes', () => {
    const nodes = [
      { id: 'node-1', properties: { name: 'A', status: 'X' } },
      { id: 'node-2', properties: { name: 'B', status: 'Y' } },
      { id: 'node-3', properties: { name: 'C', status: 'Z' } },
    ];

    const keys = extractUniquePropertyKeys(nodes);

    expect(keys).toEqual(['name', 'status']);
  });
});
