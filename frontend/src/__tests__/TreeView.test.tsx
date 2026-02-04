import { render, screen } from '@testing-library/react';
import { TreeView, type TreeNode } from '../components/layout/TreeView';

describe('TreeView', () => {
  it('renders tree nodes', () => {
    const nodes: TreeNode[] = [
      {
        id: 'root',
        name: 'Project Alpha',
        type: 'project',
        children: [
          { id: 'phase-1', name: 'Phase 1', type: 'phase', children: [] },
        ],
      },
    ];

    render(<TreeView nodes={nodes} />);

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
  });
});
