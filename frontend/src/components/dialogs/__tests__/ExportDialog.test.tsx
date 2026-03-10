import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportDialog } from '../ExportDialog';
import { useFilterStore } from '../../../store/filterStore';
import { useGraphStore } from '../../../store';

const listExportTemplatesMock = vi.fn();
const downloadExportMock = vi.fn();

vi.mock('../../../api/client', () => ({
  apiClient: {
    listExportTemplates: (...args: any[]) => listExportTemplatesMock(...args),
    downloadExport: (...args: any[]) => downloadExportMock(...args),
  },
}));

describe('ExportDialog payload scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExportTemplatesMock.mockResolvedValue({
      templates: [{ id: 'foo.json.j2', name: 'Foo JSON', extension: 'json' }],
      count: 1,
    });
    downloadExportMock.mockResolvedValue(new Blob(['ok'], { type: 'application/json' }));

    useFilterStore.setState({
      rules: [],
      filterMode: 'ghost',
      isExpanded: false,
      filterTabVisible: false,
      savedFilterSets: [],
    });

    useGraphStore.setState({
      currentGraph: null,
      selectedNodeId: null,
      nodes: {
        a: { id: 'a', type: 'task', properties: { name: 'A', status: 'active' }, children: [] },
        b: { id: 'b', type: 'task', properties: { name: 'B', status: 'inactive' }, children: [] },
      },
      clipboard: null,
    } as any);

    if (!window.URL.createObjectURL) {
      (window.URL as any).createObjectURL = vi.fn(() => 'blob:test');
    } else {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:test');
    }
    if (!window.URL.revokeObjectURL) {
      (window.URL as any).revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  it('sends rootNodeId for branch export', async () => {
    render(
      <ExportDialog
        isOpen={true}
        onClose={() => {}}
        sessionId="s1"
        targetNodeId="a"
        velocityScores={{}}
      />
    );

    await screen.findByText(/Select Export Format/i);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(downloadExportMock).toHaveBeenCalled());

    const [, , options] = downloadExportMock.mock.calls[0];
    expect(options.rootNodeId).toBe('a');
    expect(options.includedNodeIds).toBeUndefined();
  });

  it('sends includedNodeIds for global export when filters are active', async () => {
    useFilterStore.setState({
      rules: [
        {
          id: 'r1',
          property: 'status',
          operator: 'equals',
          value: 'active',
        },
      ],
      filterMode: 'ghost',
    } as any);

    render(
      <ExportDialog
        isOpen={true}
        onClose={() => {}}
        sessionId="s1"
        velocityScores={{}}
      />
    );

    await screen.findByText(/Select Export Format/i);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(downloadExportMock).toHaveBeenCalled());

    const [, , options] = downloadExportMock.mock.calls[0];
    expect(options.rootNodeId).toBeUndefined();
    expect(options.includedNodeIds).toEqual(['a']);
  });
});
