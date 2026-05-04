import { describe, it, expect } from 'vitest';
import { resolveNodeLabel, resolveNodeLabelById } from './propertyValueDisplay';
import type { Node } from '../api/client';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    type: 'task',
    properties: {},
    children: [],
    ...overrides,
  };
}

// ── resolveNodeLabel ──────────────────────────────────────────────────────────

describe('resolveNodeLabel', () => {
  it('returns properties.name when present', () => {
    const node = makeNode({ properties: { name: 'Alice' } });
    expect(resolveNodeLabel(node)).toBe('Alice');
  });

  it('prefers properties.name over node.name', () => {
    const node = makeNode({ name: 'TopLevel', properties: { name: 'PropertyName' } });
    expect(resolveNodeLabel(node)).toBe('PropertyName');
  });

  it('falls back to node.name when properties.name is absent', () => {
    const node = makeNode({ name: 'FallbackName', properties: {} });
    expect(resolveNodeLabel(node)).toBe('FallbackName');
  });

  it('falls back to node.id when both name fields are empty', () => {
    const node = makeNode({ id: 'uuid-abc', name: '', properties: { name: '' } });
    expect(resolveNodeLabel(node)).toBe('uuid-abc');
  });

  it('uses explicit fallback over node.id when both names are empty', () => {
    const node = makeNode({ id: 'uuid-abc', name: '', properties: { name: '' } });
    expect(resolveNodeLabel(node, 'CustomFallback')).toBe('CustomFallback');
  });

  it('returns empty string for null node', () => {
    expect(resolveNodeLabel(null)).toBe('');
  });

  it('returns empty string for undefined node', () => {
    expect(resolveNodeLabel(undefined)).toBe('');
  });

  it('returns explicit fallback for null node', () => {
    expect(resolveNodeLabel(null, 'missing')).toBe('missing');
  });

  it('trims whitespace from names', () => {
    const node = makeNode({ properties: { name: '  Bob  ' } });
    expect(resolveNodeLabel(node)).toBe('Bob');
  });
});

// ── resolveNodeLabelById ──────────────────────────────────────────────────────

describe('resolveNodeLabelById', () => {
  const nodes: Record<string, Node> = {
    'person-1': makeNode({ id: 'person-1', properties: { name: 'Alice' } }),
    'person-2': makeNode({ id: 'person-2', name: 'Bob', properties: {} }),
    'person-3': makeNode({ id: 'person-3', properties: { name: '' } }),
  };

  it('resolves to properties.name for a known id', () => {
    expect(resolveNodeLabelById(nodes, 'person-1')).toBe('Alice');
  });

  it('resolves to node.name when properties.name is absent', () => {
    expect(resolveNodeLabelById(nodes, 'person-2')).toBe('Bob');
  });

  it('returns id as fallback when node exists but names are empty', () => {
    expect(resolveNodeLabelById(nodes, 'person-3')).toBe('person-3');
  });

  it('returns id as fallback when node is missing from map', () => {
    expect(resolveNodeLabelById(nodes, 'unknown-id')).toBe('unknown-id');
  });

  it('returns explicit fallback when node is missing', () => {
    expect(resolveNodeLabelById(nodes, 'missing', 'Unknown Person')).toBe('Unknown Person');
  });

  it('works with empty nodes map', () => {
    expect(resolveNodeLabelById({}, 'any-id')).toBe('any-id');
  });
});
