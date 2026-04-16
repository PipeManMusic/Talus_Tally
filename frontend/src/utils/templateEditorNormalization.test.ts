import { normalizeTemplateNodeTypes } from './templateEditorNormalization';
import { validateTemplateSchema } from './templateValidation';

describe('template editor normalization', () => {
  it('dedupes duplicate properties by id while preserving the richer merged property', () => {
    const [nodeType] = normalizeTemplateNodeTypes([
      {
        id: 'episode',
        label: 'Episode',
        properties: [
          {
            id: '_feat_scheduling_status',
            key: 'status',
            type: 'select',
            indicator_set: 'status',
            label: '',
            options: [],
          },
          {
            id: '_feat_scheduling_status',
            key: 'status',
            type: 'select',
            indicator_set: 'status',
            label: 'Status',
            options: [
              { name: 'To Do' },
              { name: 'In Progress' },
              { name: 'Done' },
            ],
          },
        ],
      },
    ]);

    expect(nodeType.properties).toHaveLength(1);
    expect(nodeType.properties[0].id).toBe('_feat_scheduling_status');
    expect(nodeType.properties[0].key).toBe('status');
    expect(nodeType.properties[0].label).toBe('Status');
    expect(nodeType.properties[0].options).toEqual([
      { name: 'To Do' },
      { name: 'In Progress' },
      { name: 'Done' },
    ]);
  });
});

describe('template schema validation', () => {
  it('flags duplicate property ids before the UI renders them', () => {
    const result = validateTemplateSchema({
      id: 'project_talus',
      name: 'Project Talus',
      node_types: [
        {
          id: 'episode',
          name: 'Episode',
          properties: [
            { id: '_feat_scheduling_status', name: 'Status', type: 'select', options: [{ name: 'To Do' }] },
            { id: '_feat_scheduling_status', name: 'Status Copy', type: 'select', options: [{ name: 'Done' }] },
          ],
        },
      ],
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("node_types[0].properties: duplicate property id '_feat_scheduling_status'");
  });
});