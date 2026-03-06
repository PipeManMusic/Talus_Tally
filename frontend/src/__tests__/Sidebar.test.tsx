import { render, screen } from '@testing-library/react';
import { TreeView, type TreeNode } from '../components/layout/TreeView';

describe('TreeView', () => {
  it('renders tree nodes', () => {
    const nodes: TreeNode[] = [
      {
        id: 'root',
        name: 'Project Alpha',
        type: 'project',
        allowed_children: ['phase'],
        children: [
          { id: 'phase-1', name: 'Phase 1', type: 'phase', allowed_children: [], children: [] },
        ],
      },
    ];

    render(<TreeView nodes={nodes} expandedMap={{ root: true }} />);

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
  });
});
