import { fireEvent, render, screen } from '@testing-library/react';
import { Inspector, type NodeProperty } from '../Inspector';

describe('Inspector', () => {
  const mockProperties: NodeProperty[] = [
    { id: 'name', name: 'Name', type: 'text', value: 'Test Node' },
  ];

  it('renders node type and ID', () => {
    render(
      <Inspector
        nodeId="test-123"
        nodeName="Test Node"
        nodeType="episode"
        properties={mockProperties}
      />
    );

    expect(screen.getByText('episode')).toBeInTheDocument();
    expect(screen.getByText('test-123')).toBeInTheDocument();
  });

  it('shows message when no node selected', () => {
    render(<Inspector properties={[]} />);
    expect(screen.getByText('Select a node to view properties')).toBeInTheDocument();
  });

  it('renders blocking information when present', () => {
    const nodes = {
      'blocker-1': { id: 'blocker-1', properties: { name: 'Blocker Node' } },
      'blocked-1': { id: 'blocked-1', properties: { name: 'Blocked Node' } },
    };

    render(
      <Inspector
        nodeId="test-123"
        nodeName="Test Node"
        nodeType="episode"
        properties={mockProperties}
        blockedByNodes={['blocker-1']}
        blocksNodes={['blocked-1']}
        nodes={nodes}
      />
    );

    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByText('Blocker Node')).toBeInTheDocument();
    expect(screen.getByText('Blocked Node')).toBeInTheDocument();
  });

  it('renders person weekly schedule summary UI', () => {
    const personProperties: NodeProperty[] = [
      { id: 'name', name: 'Full Name', type: 'text', value: 'Alex' },
      { id: 'email', name: 'Email', type: 'text', value: 'alex@example.com' },
      { id: 'capacity_monday', name: 'Capacity Monday (Hours)', type: 'number', value: 8 },
      { id: 'overtime_capacity_monday', name: 'Overtime Capacity Monday (Hours)', type: 'number', value: 2 },
      { id: 'hourly_rate_monday', name: 'Hourly Rate Monday', type: 'number', value: 95 },
    ];

    render(
      <Inspector
        nodeId="person-1"
        nodeName="Alex"
        nodeType="person"
        properties={personProperties}
      />,
    );

    expect(screen.getByText('Weekly Availability')).toBeInTheDocument();
    expect(screen.getByText('Edit Week')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit Week'));
    expect(screen.getByText('Copy Mon Capacity → Tue–Fri')).toBeInTheDocument();
    expect(screen.getByText('Copy Mon OT → Tue–Fri')).toBeInTheDocument();
    expect(screen.getByText('Copy Mon Rate → Tue–Fri')).toBeInTheDocument();
    expect(screen.getByText('Copy Fri Rate → Weekend')).toBeInTheDocument();
    expect(screen.getByText('OT Capacity (hours, 0-24)')).toBeInTheDocument();
  });

  it('supports adding and removing multiple assignees for assigned_to', () => {
    const onPropertyChange = vi.fn();
    const taskProperties: NodeProperty[] = [
      { id: 'name', name: 'Name', type: 'text', value: 'Task A' },
      { id: 'assigned_to', name: 'Assigned To', type: 'text', value: ['person-1'] },
    ];

    const nodes = {
      'person-1': { id: 'person-1', type: 'person', properties: { name: 'Alice Johnson', email: 'alice@example.com' } },
      'person-2': { id: 'person-2', type: 'person', properties: { name: '', email: 'bob@example.com' } },
    };

    render(
      <Inspector
        nodeId="task-1"
        nodeName="Task A"
        nodeType="task"
        properties={taskProperties}
        nodes={nodes}
        onPropertyChange={onPropertyChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Select person…'), {
      target: { value: 'person-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onPropertyChange).toHaveBeenCalledWith('assigned_to', ['person-1', 'person-2']);

    fireEvent.click(screen.getByTitle('Remove assignee'));
    expect(onPropertyChange).toHaveBeenCalledWith('assigned_to', []);
  });

  it('renders manual_allocations as a readable per-day summary', () => {
    const taskProperties: NodeProperty[] = [
      { id: 'name', name: 'Name', type: 'text', value: 'Task A' },
      {
        id: 'manual_allocations',
        name: 'Manual Allocations',
        type: 'text',
        value: {
          '2026-03-17': { 'person-1': 2.5 },
          '2026-03-18': { 'person-2': 1 },
        },
      },
    ];

    const nodes = {
      'person-1': { id: 'person-1', type: 'person', properties: { name: 'Alice Johnson', email: 'alice@example.com' } },
      'person-2': { id: 'person-2', type: 'person', properties: { name: '', email: 'bob@example.com' } },
    };

    render(
      <Inspector
        nodeId="task-1"
        nodeName="Task A"
        nodeType="task"
        properties={taskProperties}
        nodes={nodes}
      />,
    );

    expect(screen.getByText('Manual Allocations')).toBeInTheDocument();
    expect(screen.getByText('2026-03-17')).toBeInTheDocument();
    expect(screen.getByText('2026-03-18')).toBeInTheDocument();
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('2.5h')).toBeInTheDocument();
    expect(screen.getByText('1.0h')).toBeInTheDocument();
    expect(screen.getByText('Edit per-day allocations in the Manpower view task rows.')).toBeInTheDocument();
  });

  describe('Velocity Section', () => {
    it('renders velocity information when provided', () => {
      render(
        <Inspector
          nodeId="test-123"
          nodeName="Test Node"
          nodeType="episode"
          properties={mockProperties}
          velocityScore={{
            nodeId: 'test-123',
            baseScore: -1,
            inheritedScore: 10,
            statusScore: 0,
            numericalScore: 0,
            blockingPenalty: 0,
            blockingBonus: 0,
            totalVelocity: 9,
            isBlocked: false,
          }}
        />
      );

      expect(screen.getByText('Velocity')).toBeInTheDocument();
      expect(screen.getByText('Total Score:')).toBeInTheDocument();
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.getByText('Base:')).toBeInTheDocument();
      expect(screen.getByText('-1')).toBeInTheDocument();
      expect(screen.getByText('Inherited:')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('does not render velocity section when score not provided', () => {
      render(
        <Inspector
          nodeId="test-123"
          nodeName="Test Node"
          nodeType="episode"
          properties={mockProperties}
        />
      );

      expect(screen.queryByText('Velocity')).not.toBeInTheDocument();
    });

    it('shows blocking penalty when node is blocked', () => {
      render(
        <Inspector
          nodeId="test-123"
          nodeName="Test Node"
          nodeType="episode"
          properties={mockProperties}
          velocityScore={{
            nodeId: 'test-123',
            baseScore: 10,
            inheritedScore: 0,
            statusScore: 0,
            numericalScore: 0,
            blockingPenalty: -5,
            blockingBonus: 0,
            totalVelocity: 5,
            isBlocked: true,
          }}
        />
      );

      expect(screen.getByText('Blocking Penalty:')).toBeInTheDocument();
      expect(screen.getByText('-5')).toBeInTheDocument();
    });
  });
});
