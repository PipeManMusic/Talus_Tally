import { render, screen } from '@testing-library/react';
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
