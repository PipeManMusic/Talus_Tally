import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodePropertiesPanel, type PropertyDefinition } from '../components/velocity/NodePropertiesPanel';
import type { Node } from '../api/client';

// Minimal node factory
const makeNode = (id: string, properties: Record<string, any>): Node => ({
  id,
  type: 'task',
  properties,
  children: [],
});

describe('NodePropertiesPanel', () => {
  const defaultProps = {
    blockedByNodes: [] as string[],
    blocksNodes: [] as string[],
    onPropertyChange: vi.fn(),
    onClearBlocks: vi.fn(),
  };

  it('renders ungrouped properties when no propertyDefinitions provided', () => {
    const nodes: Record<string, Node> = {
      'n1': makeNode('n1', { name: 'Test', priority: 5 }),
    };

    render(
      <NodePropertiesPanel
        selectedNodeId="n1"
        nodes={nodes}
        {...defaultProps}
      />
    );

    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  it('groups properties by ui_group when propertyDefinitions provided', () => {
    const nodes: Record<string, Node> = {
      'n1': makeNode('n1', { name: 'Alpha', start_date: '2026-01-01', estimated_cost: 500 }),
    };

    const propertyDefinitions: PropertyDefinition[] = [
      { id: 'name', label: 'Name', type: 'text' },
      { id: 'start_date', label: 'Start Date', type: 'date', system_locked: true, ui_group: 'Schedule' },
      { id: 'estimated_cost', label: 'Estimated Cost ($)', type: 'number', system_locked: true, ui_group: 'Budget' },
    ];

    render(
      <NodePropertiesPanel
        selectedNodeId="n1"
        nodes={nodes}
        propertyDefinitions={propertyDefinitions}
        {...defaultProps}
      />
    );

    // Group headers should exist
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();

    // Property labels should use definition labels
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('Estimated Cost ($)')).toBeInTheDocument();
  });

  it('renders ungrouped properties before grouped ones', () => {
    const nodes: Record<string, Node> = {
      'n1': makeNode('n1', { name: 'First', start_date: '2026-03-01' }),
    };

    const propertyDefinitions: PropertyDefinition[] = [
      { id: 'name', label: 'Name', type: 'text' },
      { id: 'start_date', label: 'Start Date', type: 'date', system_locked: true, ui_group: 'Schedule' },
    ];

    const { container } = render(
      <NodePropertiesPanel
        selectedNodeId="n1"
        nodes={nodes}
        propertyDefinitions={propertyDefinitions}
        {...defaultProps}
      />
    );

    // "Name" input should appear before the "Schedule" header
    const allLabels = container.querySelectorAll('label, span');
    const textContents = Array.from(allLabels).map(el => el.textContent?.trim()).filter(Boolean);
    const nameIdx = textContents.indexOf('Name');
    const scheduleIdx = textContents.indexOf('Schedule');

    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(scheduleIdx).toBeGreaterThan(nameIdx);
  });

  it('shows placeholder when no node selected', () => {
    render(
      <NodePropertiesPanel
        selectedNodeId={null}
        nodes={{}}
        {...defaultProps}
      />
    );

    expect(screen.getByText('Select a node to view properties')).toBeInTheDocument();
  });

  it('renders orphaned properties section as read-only with delete button', () => {
    const nodes: Record<string, Node> = {
      'n1': makeNode('n1', { name: 'Task' }),
    };
    const onDelete = vi.fn();

    render(
      <NodePropertiesPanel
        selectedNodeId="n1"
        nodes={nodes}
        orphanedProperties={{ old_field: 'stale value' }}
        onOrphanedPropertyDelete={onDelete}
        {...defaultProps}
      />
    );

    // Section header
    expect(screen.getByText('Orphaned Properties')).toBeInTheDocument();
    // Property key label + read-only value
    expect(screen.getByText('old_field')).toBeInTheDocument();
    expect(screen.getByText('stale value')).toBeInTheDocument();
    // Delete button exists
    const deleteBtn = screen.getByTitle('Delete orphaned property');
    expect(deleteBtn).toBeInTheDocument();
    deleteBtn.click();
    expect(onDelete).toHaveBeenCalledWith('old_field');
  });

  it('does not render orphaned section when no orphaned properties', () => {
    const nodes: Record<string, Node> = {
      'n1': makeNode('n1', { name: 'Task' }),
    };

    render(
      <NodePropertiesPanel
        selectedNodeId="n1"
        nodes={nodes}
        {...defaultProps}
      />
    );

    expect(screen.queryByText('Orphaned Properties')).toBeNull();
  });
});
