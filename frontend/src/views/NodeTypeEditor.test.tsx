import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeTypeEditor, type NodeType } from './NodeTypeEditor';

const apiClientMock = vi.hoisted(() => ({
  getIconsConfig: vi.fn(),
  getIndicatorsConfig: vi.fn(),
  listMarkupProfiles: vi.fn(),
  getMetaSchema: vi.fn(),
}));

vi.mock('../api/client', () => ({
  API_BASE_URL: 'http://localhost:5000',
  apiClient: apiClientMock,
}));

describe('NodeTypeEditor', () => {
  beforeEach(() => {
    apiClientMock.getIconsConfig.mockResolvedValue({ icons: [] });
    apiClientMock.getIndicatorsConfig.mockResolvedValue({
      indicator_sets: {
        status: {
          description: 'Status',
          indicators: [],
          default_theme: {},
        },
      },
    });
    apiClientMock.listMarkupProfiles.mockResolvedValue([]);
    apiClientMock.getMetaSchema.mockResolvedValue({
      node_classes: [{ id: 'standard', name: 'Standard' }],
      property_types: [
        { id: 'text', description: 'Text' },
        { id: 'select', description: 'Select' },
      ],
    });
  });

  it('allows typing full node type and property ids without remounting the editor row', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [nodeTypes, setNodeTypes] = useState<NodeType[]>([
        {
          id: 'task',
          label: 'Task',
          allowed_children: [],
          properties: [
            {
              id: 'status',
              label: 'Status',
              type: 'text',
            },
          ],
        },
      ]);

      return <NodeTypeEditor nodeTypes={nodeTypes} onChange={async (next) => setNodeTypes(next)} />;
    }

    render(<Harness />);

    await waitFor(() => expect(apiClientMock.getMetaSchema).toHaveBeenCalled());

    await user.click(screen.getByRole('heading', { name: 'Task' }));

    const nodeTypeIdInput = screen.getByDisplayValue('task');
    await user.clear(nodeTypeIdInput);
    await user.type(nodeTypeIdInput, 'task_custom');

    expect(screen.getByDisplayValue('task_custom')).toBeInTheDocument();

    await user.click(screen.getByRole('heading', { name: 'Status' }));

    const propertyIdInput = screen.getByDisplayValue('status');
    await user.clear(propertyIdInput);
    await user.type(propertyIdInput, 'workflow_status');

    expect(screen.getByDisplayValue('workflow_status')).toBeInTheDocument();
  });

  it('persists selected primary status property when checkbox is toggled', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [nodeTypes, setNodeTypes] = useState<NodeType[]>([
        {
          id: 'episode',
          label: 'Episode',
          allowed_children: [],
          properties: [
            {
              id: 'production_status',
              label: 'Production Status',
              type: 'select',
              indicator_set: 'status',
              options: [
                { name: 'Planned', indicator_id: 'empty' },
                { name: 'Done', indicator_id: 'filled' },
              ],
            },
            {
              id: 'publish_status',
              label: 'Publish Status',
              type: 'select',
              indicator_set: 'status',
              options: [
                { name: 'Queued', indicator_id: 'partial' },
                { name: 'Published', indicator_id: 'filled' },
              ],
            },
          ],
        },
      ]);

      return (
        <>
          <NodeTypeEditor nodeTypes={nodeTypes} onChange={async (next) => setNodeTypes(next)} />
          <div data-testid="primary-status-value">{nodeTypes[0].primary_status_property_id || ''}</div>
        </>
      );
    }

    render(<Harness />);

    await waitFor(() => expect(apiClientMock.getMetaSchema).toHaveBeenCalled());

    await user.click(screen.getByRole('heading', { name: 'Episode' }));

    const publishCheckbox = screen.getByRole('checkbox', { name: 'Publish Status' });
    await user.click(publishCheckbox);

    await waitFor(() => {
      expect(screen.getByTestId('primary-status-value').textContent).toBe('publish_status');
    });

    expect(screen.getByRole('checkbox', { name: 'Publish Status' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Production Status' })).not.toBeChecked();
  });

  it('clears primary status when the selected primary property is deleted', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [nodeTypes, setNodeTypes] = useState<NodeType[]>([
        {
          id: 'episode',
          label: 'Episode',
          allowed_children: [],
          primary_status_property_id: 'publish_status',
          properties: [
            {
              id: 'production_status',
              label: 'Production Status',
              type: 'select',
              indicator_set: 'status',
              options: [
                { name: 'Planned', indicator_id: 'empty' },
                { name: 'Done', indicator_id: 'filled' },
              ],
            },
            {
              id: 'publish_status',
              label: 'Publish Status',
              type: 'select',
              indicator_set: 'status',
              options: [
                { name: 'Queued', indicator_id: 'partial' },
                { name: 'Published', indicator_id: 'filled' },
              ],
            },
          ],
        },
      ]);

      return (
        <>
          <NodeTypeEditor nodeTypes={nodeTypes} onChange={async (next) => setNodeTypes(next)} />
          <div data-testid="primary-status-value">{nodeTypes[0].primary_status_property_id || ''}</div>
        </>
      );
    }

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<Harness />);

    await waitFor(() => expect(apiClientMock.getMetaSchema).toHaveBeenCalled());

    await user.click(screen.getByRole('heading', { name: 'Episode' }));
    await user.click(screen.getByRole('heading', { name: 'Publish Status' }));

    const publishHeading = screen.getByRole('heading', { name: 'Publish Status' });
    let publishPropertyCard: HTMLElement | null = publishHeading.parentElement;
    while (publishPropertyCard && !String(publishPropertyCard.className).includes('bg-bg-light/50')) {
      publishPropertyCard = publishPropertyCard.parentElement;
    }
    expect(publishPropertyCard).not.toBeNull();

    const propertyDeleteButton = Array.from(publishPropertyCard!.querySelectorAll('button')).find((button) =>
      String(button.className).includes('text-status-danger')
    ) as HTMLButtonElement | undefined;
    expect(propertyDeleteButton).toBeDefined();
    await user.click(propertyDeleteButton!);

    await waitFor(() => {
      expect(screen.getByTestId('primary-status-value').textContent).toBe('');
    });

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});