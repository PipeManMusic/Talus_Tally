import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import CustomNode from '../CustomNode';
import type { NodeProps } from 'reactflow';

// Helper to wrap CustomNode in ReactFlowProvider
const renderNode = (props: Partial<NodeProps>) => {
  const defaultProps: NodeProps = {
    id: 'test-1',
    data: { label: 'Test Node', nodeData: { id: 'test-1', type: 'episode', properties: {} } },
    selected: false,
    type: 'custom',
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    ...props,
  };

  return render(
    <ReactFlowProvider>
      <CustomNode {...defaultProps} />
    </ReactFlowProvider>
  );
};

describe('CustomNode', () => {
  it('renders node label', () => {
    renderNode({
      data: { label: 'Test Episode', nodeData: { id: 'test-1', type: 'episode', properties: {} } },
    });
    expect(screen.getByText('Test Episode')).toBeInTheDocument();
  });

  it('renders node type', () => {
    renderNode({
      data: { label: 'Test Node', nodeData: { id: 'test-1', type: 'season', properties: {} } },
    });
    expect(screen.getByText('season')).toBeInTheDocument();
  });

  describe('Color Rendering', () => {
    it('applies schema color to node background', () => {
      const { container } = renderNode({
        data: {
          label: 'Season 1',
          nodeData: {
            id: 'season-1',
            type: 'season',
            blueprint_type_id: 'season',
            properties: {},
            schema_color: '#8b5cf6',
          },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveStyle({ background: '#8b5cf6' });
    });

    it('uses default color when schema color not provided', () => {
      const { container } = renderNode({
        data: {
          label: 'Unknown Node',
          nodeData: { id: 'test-1', type: 'unknown', properties: {} },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveStyle({ background: '#a8dadc' });
    });
  });

  describe('Shape Rendering', () => {
    it('applies hexagon shape styling', () => {
      const { container } = renderNode({
        data: {
          label: 'Project',
          nodeData: {
            id: 'project-1',
            type: 'project_root',
            properties: {},
            schema_shape: 'hexagon',
          },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveAttribute('data-shape', 'hexagon');
    });

    it('applies circle shape with border radius', () => {
      const { container } = renderNode({
        data: {
          label: 'Footage',
          nodeData: {
            id: 'footage-1',
            type: 'footage',
            properties: {},
            schema_shape: 'circle',
          },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveAttribute('data-shape', 'circle');
      expect(node).toHaveStyle({ borderRadius: '50%' });
    });

    it('applies roundedSquare shape', () => {
      const { container } = renderNode({
        data: {
          label: 'Episode',
          nodeData: {
            id: 'episode-1',
            type: 'episode',
            properties: {},
            schema_shape: 'roundedSquare',
          },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveAttribute('data-shape', 'roundedSquare');
      expect(node).toHaveStyle({ borderRadius: '12px' });
    });

    it('applies rounded shape with subtle border radius', () => {
      const { container } = renderNode({
        data: {
          label: 'Season',
          nodeData: {
            id: 'season-1',
            type: 'season',
            properties: {},
            schema_shape: 'rounded',
          },
        },
      });

      const node = container.querySelector('.custom-node');
      expect(node).toHaveAttribute('data-shape', 'rounded');
      expect(node).toHaveStyle({ borderRadius: '16px' });
    });
  });
});
