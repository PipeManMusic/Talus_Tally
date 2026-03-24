import { useState, memo, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Info, Lock } from 'lucide-react';
import { apiClient, API_BASE_URL } from '../api/client';
import { ColorPicker } from '../components/ui/ColorPicker';
import { Modal } from '../components/ui/Modal';
import type { IconCatalog, IndicatorsConfig, IndicatorTheme } from '../api/client';
import type { MetaSchema } from '../api/client';

export interface VelocityNodeConfig {
  baseScore?: number;
  scoreMode?: 'inherit' | 'standalone';
}

export interface VelocityPropertyConfig {
  enabled?: boolean;
  mode?: 'multiplier' | 'status';
  multiplierFactor?: number;
  statusScores?: Record<string, number>;
}

export interface NodeType {
  id: string;
  label: string;
  allowed_children: string[];
  allowed_asset_types?: string[];
  velocityConfig?: VelocityNodeConfig;
  primary_status_property_id?: string; // Which status property controls node text color/style
  properties: Property[];
  features?: string[];
  icon?: string;
  shape?: string;
  color?: string;
  base_type?: string; // Added for Node Class selector
}

export interface Property {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  value?: string | number | boolean;
  target_type?: string;
  options?: Array<{ name: string; indicator_id?: string }>;
  markup_profile?: string;
  description?: string;
  indicator_set?: string;
  velocityConfig?: VelocityPropertyConfig;
  system_locked?: boolean;
  ui_group?: string;
  semantic_role?: string;
}

const resolveIndicatorSetId = (
  property: Property,
  indicatorsConfig: IndicatorsConfig | null,
): string => {
  if (property.indicator_set && indicatorsConfig?.indicator_sets?.[property.indicator_set]) {
    return property.indicator_set;
  }
  if (indicatorsConfig?.indicator_sets?.status) {
    return 'status';
  }
  return Object.keys(indicatorsConfig?.indicator_sets || {})[0] || 'status';
};

interface NodeTypeEditorProps {
  nodeTypes: NodeType[];
  onChange: (nodeTypes: NodeType[]) => Promise<void>;
}

// Helper to recolor SVG for preview
const recolorSvg = (svgString: string, color: string): string => {
  if (!svgString) return svgString;

  let recolored = svgString;

  recolored = recolored
    .replace(/fill="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill="${value}"`;
      }
      return `fill="${color}"`;
    })
    .replace(/fill='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill='${value}'`;
      }
      return `fill='${color}'`;
    })
    .replace(/stroke="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke="${value}"`;
      }
      return `stroke="${color}"`;
    })
    .replace(/stroke='([^']*)'/gi,(_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke='${value}'`;
      }
      return `stroke='${color}'`;
    });

  recolored = recolored.replace(/style="([^"]*)"/g, (_match, styleContent) => {
    let updatedStyle = String(styleContent)
      .replace(/fill:\s*[^;]+/gi, (fillMatch) => {
        const value = fillMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return fillMatch;
        }
        return `fill:${color}`;
      })
      .replace(/stroke:\s*[^;]+/gi, (strokeMatch) => {
        const value = strokeMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return strokeMatch;
        }
        return `stroke:${color}`;
      });
    return `style="${updatedStyle}"`;
  });

  return recolored;
};

function NodeTypeEditorComponent({ nodeTypes, onChange }: NodeTypeEditorProps) {
  const [expandedNodeType, setExpandedNodeType] = useState<string | null>(null);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, Partial<NodeType>>>({});
  const [icons, setIcons] = useState<IconCatalog[]>([]);
  const [indicatorsConfig, setIndicatorsConfig] = useState<IndicatorsConfig | null>(null);
  const [iconSvgCache, setIconSvgCache] = useState<Record<string, string>>({});
  const [indicatorSvgCache, setIndicatorSvgCache] = useState<Record<string, string>>({});
  const [markupProfiles, setMarkupProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const deletingRef = useRef<boolean>(false);
  const [pendingNodeTypeDelete, setPendingNodeTypeDelete] = useState<{
    displayedId: string;
    sourceId: string;
    nodeTypeLabel: string;
  } | null>(null);

  // Merge props with pending optimistic updates for display
  const displayNodeTypes = nodeTypes.map(nt => ({
    ...nt,
    ...(pendingUpdates[nt.id] || {}),
  }));

  // Load icons and indicators configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const [iconsData, indicatorsData] = await Promise.all([
          apiClient.getIconsConfig(),
          apiClient.getIndicatorsConfig(),
        ]);
        setIcons(iconsData.icons);
        setIndicatorsConfig(indicatorsData);
      } catch (error) {
        console.error('Failed to load config catalogs:', error);
      }
    };

    loadConfigs();
  }, []);

  useEffect(() => {
    const loadMarkupProfiles = async () => {
      try {
        const profiles = await apiClient.listMarkupProfiles();
        setMarkupProfiles(profiles.map((profile) => ({ id: profile.id, label: profile.label || profile.id })));
      } catch (error) {
        console.error('Failed to load markup profiles:', error);
        setMarkupProfiles([]);
      }
    };

    loadMarkupProfiles();
  }, []);

  // Fetch SVG content for an icon
  const fetchIconSvg = async (iconId: string, url?: string) => {
    if (iconSvgCache[iconId]) return; // Already cached
    
    if (!url) return;

    try {
      const response = await fetch(`${API_BASE_URL}${url}`);
      if (response.ok) {
        const svgContent = await response.text();
        setIconSvgCache(prev => ({ ...prev, [iconId]: svgContent }));
      }
    } catch (error) {
      console.error(`Failed to load SVG for icon ${iconId}:`, error);
    }
  };

  // Fetch SVG content for an indicator
  const fetchIndicatorSvg = async (indicatorId: string, url?: string) => {
    if (indicatorSvgCache[indicatorId]) return; // Already cached
    
    if (!url) return;

    try {
      const response = await fetch(`${API_BASE_URL}${url}`);
      if (response.ok) {
        const svgContent = await response.text();
        setIndicatorSvgCache(prev => ({ ...prev, [indicatorId]: svgContent }));
      }
    } catch (error) {
      console.error(`Failed to load SVG for indicator ${indicatorId}:`, error);
    }
  };

  // Pre-load SVGs for icons already selected in node types
  useEffect(() => {
    if (icons.length === 0) return;
    
    nodeTypes.forEach(nodeType => {
      if (nodeType.icon) {
        const iconMeta = icons.find(i => i.id === nodeType.icon);
        if (iconMeta?.url && !iconSvgCache[nodeType.icon]) {
          fetchIconSvg(nodeType.icon, iconMeta.url);
        }
      }
    });
  }, [icons, nodeTypes]);

  // Pre-load SVGs for indicators already selected in node type properties
  useEffect(() => {
    if (!indicatorsConfig) return;

    nodeTypes.forEach(nodeType => {
      nodeType.properties.forEach(property => {
        const setId = resolveIndicatorSetId(property, indicatorsConfig);
        const setIndicators = indicatorsConfig.indicator_sets[setId]?.indicators || [];
        if (property.type === 'select' && property.options) {
          property.options.forEach(option => {
            if (option.indicator_id) {
              const indicatorMeta = setIndicators.find(ind => ind.id === option.indicator_id);
              if (indicatorMeta?.url && !indicatorSvgCache[option.indicator_id]) {
                fetchIndicatorSvg(option.indicator_id, indicatorMeta.url);
              }
            }
          });
        }
      });
    });
  }, [indicatorsConfig, nodeTypes]);


  const normalizeAllowedChildren = (children: string[]) =>
    Array.from(new Set(children.filter(Boolean)));

  const getNodeTypeEditorKey = (nodeTypeIndex: number) => `node-type-${nodeTypeIndex}`;

  const getPropertyEditorKey = (nodeTypeIndex: number, propertyIndex: number) =>
    `${nodeTypeIndex}::${propertyIndex}`;

  const addNodeType = () => {
    if (loading) {
      console.warn('Add operation already in progress');
      return;
    }

    const newNodeType: NodeType = {
      id: `node_type_${Date.now()}`,
      label: 'New Node Type',
      allowed_children: [],
      properties: [
        {
          id: 'name',
          label: 'Name',
          type: 'text',
        },
      ],
      icon: undefined,
      shape: undefined,
      color: undefined,
    };

    setLoading(true);
    onChange([...nodeTypes, newNodeType])
      .then(() => {
        console.log('✓ Node type added successfully');
        setExpandedNodeType(getNodeTypeEditorKey(nodeTypes.length));
      })
      .catch((err) => {
        console.error(`✗ Failed to add node type: ${err instanceof Error ? err.message : String(err)}`);
        setErrors(prev => ({
          ...prev,
          [newNodeType.id]: `Failed to add: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const addPersonNodeType = () => {
    if (loading) {
      console.warn('Add operation already in progress');
      return;
    }

    const canonicalPersonProperties: Property[] = [
      {
        id: 'name',
        label: 'Full Name',
        type: 'text',
        required: true,
        system_locked: true,
      },
      {
        id: 'email',
        label: 'Email',
        type: 'text',
        required: true,
        system_locked: true,
      },
      {
        id: 'capacity_monday',
        label: 'Capacity Monday (Hours)',
        type: 'number',
        required: true,
        value: 8,
        system_locked: true,
      },
      {
        id: 'capacity_tuesday',
        label: 'Capacity Tuesday (Hours)',
        type: 'number',
        required: true,
        value: 8,
        system_locked: true,
      },
      {
        id: 'capacity_wednesday',
        label: 'Capacity Wednesday (Hours)',
        type: 'number',
        required: true,
        value: 8,
        system_locked: true,
      },
      {
        id: 'capacity_thursday',
        label: 'Capacity Thursday (Hours)',
        type: 'number',
        required: true,
        value: 8,
        system_locked: true,
      },
      {
        id: 'capacity_friday',
        label: 'Capacity Friday (Hours)',
        type: 'number',
        required: true,
        value: 8,
        system_locked: true,
      },
      {
        id: 'capacity_saturday',
        label: 'Capacity Saturday (Hours)',
        type: 'number',
        required: true,
        value: 0,
        system_locked: true,
      },
      {
        id: 'capacity_sunday',
        label: 'Capacity Sunday (Hours)',
        type: 'number',
        required: true,
        value: 0,
        system_locked: true,
      },
      {
        id: 'hourly_rate_monday',
        label: 'Hourly Rate Monday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_tuesday',
        label: 'Hourly Rate Tuesday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_wednesday',
        label: 'Hourly Rate Wednesday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_thursday',
        label: 'Hourly Rate Thursday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_friday',
        label: 'Hourly Rate Friday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_saturday',
        label: 'Hourly Rate Saturday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'hourly_rate_sunday',
        label: 'Hourly Rate Sunday',
        type: 'number',
        required: false,
        system_locked: true,
      },
      {
        id: 'overtime_capacity',
        label: 'Overtime Capacity (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_monday',
        label: 'Overtime Capacity Monday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_tuesday',
        label: 'Overtime Capacity Tuesday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_wednesday',
        label: 'Overtime Capacity Wednesday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_thursday',
        label: 'Overtime Capacity Thursday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_friday',
        label: 'Overtime Capacity Friday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_saturday',
        label: 'Overtime Capacity Saturday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'overtime_capacity_sunday',
        label: 'Overtime Capacity Sunday (Hours)',
        type: 'number',
        required: false,
        value: 0,
        system_locked: true,
      },
      {
        id: 'system_role',
        label: 'System Role',
        type: 'text',
        required: false,
        system_locked: true,
      },
    ];

    const canonicalIds = new Set(canonicalPersonProperties.map((property) => property.id));
    const existingPerson = nodeTypes.find((nodeType) => nodeType.id === 'person');
    const customPersonProperties = (existingPerson?.properties || []).filter(
      (property) => !canonicalIds.has(property.id),
    );

    const personNodeType: NodeType = {
      id: 'person',
      label: 'Person',
      allowed_children: [],
      properties: [...canonicalPersonProperties, ...customPersonProperties],
      features: [],
      icon: 'user',
      shape: 'circle',
      color: '#3b82f6',
      base_type: 'asset',
    };

    const personnelAssetsNodeType: NodeType = {
      id: 'personnel_assets',
      label: 'Personnel Assets',
      allowed_children: ['person'],
      properties: [
        {
          id: 'name',
          label: 'Name',
          type: 'text',
          required: true,
        },
      ],
      icon: 'users',
      shape: 'rounded',
      color: '#60a5fa',
      base_type: 'asset',
    };

    const withPersonAndParent = nodeTypes
      .filter((nodeType) => nodeType.id !== 'person' && nodeType.id !== 'personnel_assets')
      .map((nodeType) => {
        if (nodeType.id === 'inventory_root') {
          const filteredChildren = (nodeType.allowed_children || []).filter((childId) => childId !== 'person');
          return {
            ...nodeType,
            allowed_children: normalizeAllowedChildren([...filteredChildren, 'personnel_assets']),
          };
        }
        if (nodeType.id === 'project_root') {
          const filteredChildren = (nodeType.allowed_children || []).filter((childId) => childId !== 'person');
          return {
            ...nodeType,
            allowed_children: normalizeAllowedChildren(filteredChildren),
          };
        }
        return nodeType;
      });

    const nextNodeTypes = [...withPersonAndParent, personnelAssetsNodeType, personNodeType];

    setLoading(true);
    onChange(nextNodeTypes)
      .then(() => {
        console.log('✓ Person node type normalized successfully');
        const nextPersonIndex = nextNodeTypes.findIndex((nodeType) => nodeType.id === 'person');
        if (nextPersonIndex >= 0) {
          setExpandedNodeType(getNodeTypeEditorKey(nextPersonIndex));
        }
      })
      .catch((err) => {
        console.error(`✗ Failed to add person node type: ${err instanceof Error ? err.message : String(err)}`);
        setErrors((prev) => ({
          ...prev,
          person: `Failed to add person: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const executeNodeTypeDelete = (displayedId: string, sourceId: string, nodeTypeLabel: string) => {
    // Prevent concurrent deletions
    if (deletingRef.current || loading) {
      console.warn('Delete operation already in progress, ignoring duplicate call');
      console.warn('[TemplateEditor::DELETE] Delete ignored due to in-progress operation', {
        deletingInProgress: deletingRef.current,
        loading,
      });
      return;
    }

    deletingRef.current = true;

    console.log('[TemplateEditor::DELETE] Deletion confirmed', {
      label: nodeTypeLabel,
      displayedId,
      sourceId,
    });

    const pendingRenamedId = pendingUpdates[sourceId]?.id;
    const idsToDelete = new Set(
      [sourceId, displayedId, pendingRenamedId]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    );

    let filtered: NodeType[];
    try {
      filtered = nodeTypes
        .filter(nt => !idsToDelete.has(nt.id))
        .map(nt => {
          const currentChildren = Array.isArray(nt.allowed_children) ? nt.allowed_children : [];
          const nextChildren = normalizeAllowedChildren(
            currentChildren.filter((childId) => !idsToDelete.has(childId))
          );
          const unchanged =
            nextChildren.length === currentChildren.length &&
            nextChildren.every((childId, idx) => childId === currentChildren[idx]);
          if (unchanged) {
            return nt;
          }
          return {
            ...nt,
            allowed_children: nextChildren,
          };
        });
      console.log('[TemplateEditor::DELETE] Prepared filtered node type payload', {
        originalCount: nodeTypes.length,
        filteredCount: filtered.length,
        deletedSourceId: sourceId,
        idsToDelete: Array.from(idsToDelete),
      });
    } catch (err) {
      console.error(`✗ Failed to prepare node type deletion: ${err instanceof Error ? err.message : String(err)}`);
      setErrors(prev => ({
        ...prev,
        [sourceId]: `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
      deletingRef.current = false;
      return;
    }

    setLoading(true);

    onChange(filtered)
      .then(() => {
        console.log('[TemplateEditor::DELETE] Delete API/update succeeded', {
          label: nodeTypeLabel,
          displayedId,
          sourceId,
        });
        const newErrors = { ...errors };
        delete newErrors[sourceId];
        setErrors(newErrors);
        setPendingUpdates(prev => {
          const next = { ...prev };
          delete next[sourceId];
          return next;
        });
      })
      .catch((err) => {
        console.error(`✗ Failed to delete node type: ${err instanceof Error ? err.message : String(err)}`);
        console.error('[TemplateEditor::DELETE] Delete API/update failed', {
          displayedId,
          sourceId,
          error: err instanceof Error ? err.message : String(err),
        });
        setErrors(prev => ({
          ...prev,
          [sourceId]: `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      })
      .finally(() => {
        setLoading(false);
        deletingRef.current = false;
      });
  };

  const removeNodeType = (id: string) => {
    console.log('[TemplateEditor::DELETE] Delete requested for displayed node type id:', id);

    // Prevent concurrent deletions
    if (deletingRef.current || loading) {
      console.warn('Delete operation already in progress, ignoring duplicate call');
      console.warn('[TemplateEditor::DELETE] Delete ignored due to in-progress operation', {
        deletingInProgress: deletingRef.current,
        loading,
      });
      return;
    }
    
    const pendingIdEntry = Object.entries(pendingUpdates).find(([, updates]) => updates?.id === id);
    const sourceId = pendingIdEntry?.[0] || id;
    console.log('[TemplateEditor::DELETE] Resolved delete IDs', { displayedId: id, sourceId });

    // Prevent deletion if only one node type remains
    if (nodeTypes.length <= 1) {
      console.warn('[TemplateEditor::DELETE] Delete blocked: only one node type remains');
      setErrors(prev => ({
        ...prev,
        [sourceId]: 'At least one node type is required',
      }));
      return;
    }
    
    const nodeType = nodeTypes.find(nt => nt.id === sourceId);
    if (!nodeType) {
      console.error(`Node type ${id} (resolved source: ${sourceId}) not found`);
      console.error('[TemplateEditor::DELETE] Source node type not found in current nodeTypes array', {
        displayedId: id,
        sourceId,
        nodeTypeIds: nodeTypes.map((nt) => nt.id),
      });
      return;
    }
    
    const nodeTypeLabel = nodeType.label || id;

    setPendingNodeTypeDelete({
      displayedId: id,
      sourceId,
      nodeTypeLabel,
    });
    console.log('[TemplateEditor::DELETE] Awaiting modal confirmation', {
      label: nodeTypeLabel,
      displayedId: id,
      sourceId,
    });
  };

  const updateNodeType = (id: string, updates: Partial<NodeType>) => {
    const newNodeTypes = displayNodeTypes.map(nt =>
      nt.id === id ? { ...nt, ...updates } : nt
    );
    
    // Optimistically update UI immediately
    setPendingUpdates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }));
    
    // Persist to backend
    onChange(newNodeTypes)
      .then(() => {
        // Clear pending update on success (prop will have updated)
        setPendingUpdates(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const newErrors = { ...errors };
        delete newErrors[id];
        setErrors(newErrors);
      })
      .catch((err) => {
        console.error(`✗ Failed to update node type: ${err instanceof Error ? err.message : String(err)}`);
        // Clear pending update on error so we don't show stale data
        setPendingUpdates(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setErrors(prev => ({
          ...prev,
          [id]: `Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      });
  };

  const addProperty = (nodeTypeId: string) => {
    const newProperty: Property = {
      id: `prop_${Date.now()}`,
      label: 'New Property',
      type: 'text',
      indicator_set: 'status',
    };
    
    const newNodeTypes = displayNodeTypes.map(nt =>
      nt.id === nodeTypeId
        ? { ...nt, properties: [...nt.properties, newProperty] }
        : nt
    );
    
    // Optimistic update
    setPendingUpdates(prev => ({
      ...prev,
      [nodeTypeId]: {
        ...prev[nodeTypeId],
        properties: newNodeTypes.find(nt => nt.id === nodeTypeId)?.properties || [],
      },
    }));
    
    onChange(newNodeTypes).catch((err) => {
      console.error(`✗ Failed to add property: ${err instanceof Error ? err.message : String(err)}`);
      setPendingUpdates(prev => {
        const next = { ...prev };
        delete next[nodeTypeId];
        return next;
      });
      setErrors(prev => ({
        ...prev,
        [nodeTypeId]: `Failed to add property: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    });
  };

  const removeProperty = (nodeTypeId: string, propertyId: string) => {
    const nodeType = nodeTypes.find(nt => nt.id === nodeTypeId);
    const property = nodeType?.properties.find(p => p.id === propertyId);
    const propertyLabel = property?.label || propertyId;
    
    const confirmed = window.confirm(
      `Delete "${propertyLabel}" property?\n\n` +
      `⚠️ IMPORTANT: If any nodes have data in this property:\n\n` +
      `• The property values will become "orphaned"\n` +
      `• Orphaned property values are preserved\n` +
      `• They appear in an "Orphaned Properties" section\n` +
      `• You can view orphaned property values\n` +
      `• You can delete orphaned properties if no longer needed\n` +
      `• Orphaned properties cannot be edited (read-only)\n\n` +
      `This prevents data loss while allowing template evolution.\n\n` +
      `Continue with deletion?`
    );
    
    if (!confirmed) {
      return;
    }
    
    const newNodeTypes = displayNodeTypes.map(nt => {
      if (nt.id !== nodeTypeId) {
        return nt;
      }

      const nextProperties = nt.properties.filter(p => p.id !== propertyId);
      const shouldClearPrimary = nt.primary_status_property_id === propertyId;

      return {
        ...nt,
        properties: nextProperties,
        primary_status_property_id: shouldClearPrimary ? undefined : nt.primary_status_property_id,
      };
    });
    
    // Optimistic update
    setPendingUpdates(prev => ({
      ...prev,
      [nodeTypeId]: {
        ...prev[nodeTypeId],
        properties: newNodeTypes.find(nt => nt.id === nodeTypeId)?.properties || [],
      },
    }));
    
    onChange(newNodeTypes).catch((err) => {
      console.error(`✗ Failed to remove property: ${err instanceof Error ? err.message : String(err)}`);
      setPendingUpdates(prev => {
        const next = { ...prev };
        delete next[nodeTypeId];
        return next;
      });
      setErrors(prev => ({
        ...prev,
        [nodeTypeId]: `Failed to remove property: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    });
  };

  const updateProperty = (nodeTypeId: string, propertyId: string, updates: Partial<Property>) => {
    const newNodeTypes = displayNodeTypes.map(nt =>
      nt.id === nodeTypeId
        ? {
            ...nt,
            properties: nt.properties.map(p =>
              p.id === propertyId ? { ...p, ...updates } : p
            ),
          }
        : nt
    );
    
    // Optimistic update
    setPendingUpdates(prev => ({
      ...prev,
      [nodeTypeId]: {
        ...prev[nodeTypeId],
        properties: newNodeTypes.find(nt => nt.id === nodeTypeId)?.properties || [],
      },
    }));
    
    onChange(newNodeTypes).catch((err) => {
      console.error(`✗ Failed to update property: ${err instanceof Error ? err.message : String(err)}`);
      setPendingUpdates(prev => {
        const next = { ...prev };
        delete next[nodeTypeId];
        return next;
      });
      setErrors(prev => ({
        ...prev,
        [nodeTypeId]: `Failed to update property: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    });
  };

  const [metaSchema, setMetaSchema] = useState<MetaSchema | null>(null);

  useEffect(() => {
    apiClient.getMetaSchema()
      .then(setMetaSchema)
      .catch(() => setMetaSchema(null));
  }, []);

  return (
    <div className="space-y-4">
      {/* Info Panel - Orphaned Nodes */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-4">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-blue-300 mb-2">About Removing Node Types</h3>
            <p className="text-blue-200/90 mb-2">
              When you remove a node type, existing nodes of that type in active projects become <strong>"orphaned nodes"</strong>.
            </p>
            <ul className="text-blue-200/80 space-y-1 text-xs ml-4">
              <li>• <strong>Data is preserved:</strong> All properties and content remain intact</li>
              <li>• <strong>Read/edit only:</strong> You can view, edit properties, and delete orphaned nodes</li>
              <li>• <strong>No children allowed:</strong> Cannot add new children to orphaned nodes</li>
              <li>• <strong>Outside template:</strong> They exist in a "sandbox" separate from the template structure</li>
            </ul>
            <p className="text-blue-200/70 mt-2 text-xs italic">
              This system protects your data while allowing templates to evolve.
            </p>
          </div>
        </div>
      </div>

      {/* Add Node Type Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          onClick={addNodeType}
          className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors font-semibold"
        >
          <Plus size={18} />
          Add Node Type
        </button>
        <button
          onClick={addPersonNodeType}
          className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded hover:bg-blue-500/30 transition-colors font-semibold"
        >
          <Plus size={18} />
          Add Person Node
        </button>
      </div>
      {!nodeTypes.some((nodeType) => nodeType.id === 'person') && (
        <div className="text-xs text-fg-secondary px-1">
          Need manpower planning? Click <span className="font-semibold text-blue-300">Add Person Node</span> to add the built-in person schema.
        </div>
      )}

      {/* Node Types List */}
      <div className="space-y-2">
        {displayNodeTypes.map((nodeType, nodeTypeIndex) => (
          <div key={getNodeTypeEditorKey(nodeTypeIndex)} className="bg-bg-light border border-border rounded overflow-hidden">
            {/* Node Type Header */}
            <div className="flex items-center justify-between p-4 hover:bg-bg-dark/50 transition-colors cursor-pointer"
              onClick={() => setExpandedNodeType(expandedNodeType === getNodeTypeEditorKey(nodeTypeIndex) ? null : getNodeTypeEditorKey(nodeTypeIndex))}>
              <div className="flex items-center gap-3 flex-1">
                <button className="p-0 -m-1 hover:bg-bg-dark rounded">
                  {expandedNodeType === getNodeTypeEditorKey(nodeTypeIndex) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                <div>
                  <h3 className="font-semibold text-fg-primary">{nodeType.label}</h3>
                  <p className="text-xs text-fg-secondary font-mono">{nodeType.id}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeNodeType(nodeType.id);
                }}
                className="px-2 py-1 text-sm text-status-danger hover:bg-status-danger/20 rounded transition-colors"
                title="Delete node type"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Error Message */}
            {errors[nodeType.id] && (
              <div className="px-4 py-2 bg-status-danger/10 text-status-danger text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {errors[nodeType.id]}
              </div>
            )}

            {/* Node Type Details */}
            {expandedNodeType === getNodeTypeEditorKey(nodeTypeIndex) && (
              <div className="border-t border-border p-4 space-y-4 bg-bg-dark/50">
                {/* Node Type ID */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-1">ID</label>
                  <input
                    type="text"
                    value={nodeType.id}
                    onChange={(e) => updateNodeType(nodeType.id, { id: e.target.value })}
                    className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary font-mono text-sm"
                  />
                </div>

                {/* Node Type Label */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-1">Label</label>
                  <input
                    type="text"
                    value={nodeType.label}
                    onChange={(e) => updateNodeType(nodeType.id, { label: e.target.value })}
                    className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
                  />
                </div>

                {/* Base Type Selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Base Type</label>
                  <select
                    value={nodeType.base_type || 'standard'}
                    onChange={(e) => updateNodeType(nodeType.id, { base_type: e.target.value })}
                    disabled={nodeType.id === 'person'}
                    className={`w-full px-3 py-2 bg-bg-light border border-border rounded-md text-fg-primary${nodeType.id === 'person' ? ' opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {metaSchema?.node_classes?.map((nc: { id: string; name: string }) => (
                      <option key={nc.id} value={nc.id}>{nc.name}</option>
                    ))}
                  </select>
                  {nodeType.id === 'person' && (
                    <p className="text-xs text-fg-muted mt-1">Person nodes are always asset-class nodes.</p>
                  )}
                </div>

                {/* Icon (optional) */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-2">Icon (optional)</label>
                  <div className="flex items-start gap-3">
                    <select
                      value={nodeType.icon || ''}
                      onChange={(e) => {
                        const newIconId = e.target.value || undefined;
                        updateNodeType(nodeType.id, { icon: newIconId });
                        // Fetch SVG for preview
                        if (newIconId) {
                          const iconMeta = icons.find(i => i.id === newIconId);
                          if (iconMeta?.url) {
                            fetchIconSvg(newIconId, iconMeta.url);
                          }
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
                    >
                      <option value="">Select an icon...</option>
                      {icons.map(icon => (
                        <option key={icon.id} value={icon.id}>
                          {icon.id} - {icon.description}
                        </option>
                      ))}
                    </select>
                    {nodeType.icon && iconSvgCache[nodeType.icon] && (
                      <div 
                        className="flex-shrink-0 w-12 h-12 bg-bg-light border border-border rounded p-2 flex items-center justify-center overflow-hidden"
                        dangerouslySetInnerHTML={{ 
                          __html: recolorSvg(iconSvgCache[nodeType.icon], '#e0e0e0') 
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Visual Style */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-2">Visual Style</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-fg-muted mb-1">Shape</label>
                      <select
                        value={nodeType.shape || ''}
                        onChange={(e) => {
                          const value = e.target.value || undefined;
                          updateNodeType(nodeType.id, { shape: value });
                        }}
                        className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm"
                      >
                        <option value="">Default</option>
                        <option value="rounded">Rounded</option>
                        <option value="roundedSquare">Rounded Square</option>
                        <option value="circle">Circle</option>
                        <option value="hexagon">Hexagon</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-fg-muted mb-1">Color</label>
                      <div className="flex items-center gap-2">
                        <ColorPicker
                          value={nodeType.color || ''}
                          onChange={(value) => updateNodeType(nodeType.id, { color: value || undefined })}
                          allowEmpty
                          placeholder="#60a5fa"
                        />
                        <button
                          onClick={() => updateNodeType(nodeType.id, { color: undefined })}
                          className="px-2 py-1 text-xs text-fg-secondary hover:text-fg-primary hover:bg-bg-light rounded transition-colors"
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                      <p className="text-[11px] text-fg-muted mt-1">Use hex colors like #60a5fa. Leave empty for default.</p>
                    </div>
                  </div>
                </div>

                {/* Allowed Children */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-2">Allowed Children</label>
                  {nodeType.id === 'person' ? (
                    <p className="text-xs text-fg-muted">Person nodes cannot have children.</p>
                  ) : (
                  <div className="space-y-2">
                    {nodeType.allowed_children.map((childId, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={childId}
                          onChange={(e) => {
                            const newChildren = [...nodeType.allowed_children];
                            newChildren[idx] = e.target.value;
                            updateNodeType(nodeType.id, {
                              allowed_children: normalizeAllowedChildren(newChildren),
                            });
                          }}
                          className="flex-1 px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm"
                        >
                          {!nodeTypes.some(nt => nt.id === childId) && (
                            <option value={childId}>Missing: {childId}</option>
                          )}
                          {nodeTypes
                            .filter(nt => nt.id !== nodeType.id)
                            .map(nt => (
                              <option key={nt.id} value={nt.id}>
                                {nt.label} ({nt.id})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => {
                            const newChildren = nodeType.allowed_children.filter((_, i) => i !== idx);
                            updateNodeType(nodeType.id, { allowed_children: newChildren });
                          }}
                          className="px-2 py-1 text-status-danger hover:bg-status-danger/20 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const availableChildren = nodeTypes.filter(
                          nt => nt.id !== nodeType.id && !nodeType.allowed_children.includes(nt.id)
                        );
                        if (availableChildren.length === 0) {
                          return;
                        }
                        updateNodeType(nodeType.id, {
                          allowed_children: [...nodeType.allowed_children, availableChildren[0].id],
                        });
                      }}
                      disabled={
                        nodeTypes.filter(
                          nt => nt.id !== nodeType.id && !nodeType.allowed_children.includes(nt.id)
                        ).length === 0
                      }
                      className="text-sm px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Add Child Type
                    </button>
                  </div>
                  )}
                </div>

                {/* Allowed Asset Types (for asset reference nodes) */}
                <div>
                  <label className="block text-sm text-fg-secondary mb-2 flex items-center gap-2">
                    Allowed Asset Types
                    <span title="Specify which asset node types can be added as children. E.g., 'uses_assets' accepts all assets, 'uses_asset_camera_gear' only accepts camera_gear_asset.">
                      <Info size={14} className="text-fg-muted cursor-help" />
                    </span>
                    <span className="text-xs text-fg-muted">(optional - leave empty to allow all asset types)</span>
                  </label>
                  <div className="space-y-2">
                    {(nodeType.allowed_asset_types || []).map((assetType, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={assetType}
                          onChange={(e) => {
                            const newAssetTypes = [...(nodeType.allowed_asset_types || [])];
                            newAssetTypes[idx] = e.target.value;
                            updateNodeType(nodeType.id, {
                              allowed_asset_types: newAssetTypes,
                            });
                          }}
                          className="flex-1 px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm"
                        >
                          {!nodeTypes.some(nt => nt.id === assetType) && (
                            <option value={assetType}>Missing: {assetType}</option>
                          )}
                          {nodeTypes
                            .filter(nt => nt.id.endsWith('_asset'))
                            .map(nt => (
                              <option key={nt.id} value={nt.id}>
                                {nt.label} ({nt.id})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => {
                            const newAssetTypes = (nodeType.allowed_asset_types || []).filter((_, i) => i !== idx);
                            updateNodeType(nodeType.id, { allowed_asset_types: newAssetTypes });
                          }}
                          className="px-2 py-1 text-status-danger hover:bg-status-danger/20 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const availableAssetTypes = nodeTypes.filter(
                          nt => nt.id.endsWith('_asset') && !(nodeType.allowed_asset_types || []).includes(nt.id)
                        );
                        if (availableAssetTypes.length === 0) {
                          return;
                        }
                        updateNodeType(nodeType.id, {
                          allowed_asset_types: [...(nodeType.allowed_asset_types || []), availableAssetTypes[0].id],
                        });
                      }}
                      disabled={
                        nodeTypes.filter(
                          nt => nt.id.endsWith('_asset') && !(nodeType.allowed_asset_types || []).includes(nt.id)
                        ).length === 0
                      }
                      className="text-sm px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Add Asset Type Filter
                    </button>
                  </div>
                </div>

                {/* Built-in Features Section */}
                {nodeType.id !== 'person' && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-semibold text-fg-primary">Built-in Features</h4>
                    <span title="Enable built-in feature macros. When enabled, the backend will inject system-locked properties into this node type automatically.">
                      <Info size={14} className="text-fg-muted cursor-help" />
                    </span>
                  </div>

                  <div className="space-y-2 bg-bg-secondary/30 rounded p-3">
                    <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(nodeType.features || []).includes('scheduling')}
                        onChange={(e) => {
                          const current = nodeType.features || [];
                          const next = e.target.checked
                            ? [...current, 'scheduling']
                            : current.filter(f => f !== 'scheduling');
                          updateNodeType(nodeType.id, { features: next });
                        }}
                        className="rounded"
                      />
                      Enable Scheduling
                      <span className="text-xs text-fg-muted ml-1">(adds Start Date, End Date, Assigned Asset)</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(nodeType.features || []).includes('budgeting')}
                        onChange={(e) => {
                          const current = nodeType.features || [];
                          const next = e.target.checked
                            ? [...current, 'budgeting']
                            : current.filter(f => f !== 'budgeting');
                          updateNodeType(nodeType.id, { features: next });
                        }}
                        className="rounded"
                      />
                      Enable Budgeting
                      <span className="text-xs text-fg-muted ml-1">(adds Estimated Cost)</span>
                    </label>
                  </div>
                </div>
                )}

                {/* Velocity Configuration Section */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-fg-primary">Velocity Configuration</h4>
                      <span title="Configure velocity scoring for prioritization. Leave blank to exclude this node type from velocity calculations.">
                        <Info size={14} className="text-fg-muted cursor-help" />
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3 bg-bg-secondary/30 rounded p-3 mb-3">
                    <div>
                      <label className="block text-sm text-fg-secondary mb-1">
                        Base Score
                        <span className="text-xs ml-2 text-fg-muted">(initial velocity value, optional)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={nodeType.velocityConfig?.baseScore ?? ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          updateNodeType(nodeType.id, {
                            velocityConfig: {
                              ...nodeType.velocityConfig,
                              baseScore: value,
                            },
                          });
                        }}
                        placeholder="e.g., 10"
                        className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-fg-secondary mb-1">
                        Score Mode
                        <span className="text-xs ml-2 text-fg-muted">(how scores are inherited from parents)</span>
                      </label>
                      <select
                        value={nodeType.velocityConfig?.scoreMode ?? ''}
                        onChange={(e) => {
                          const value = e.target.value || undefined;
                          updateNodeType(nodeType.id, {
                            velocityConfig: {
                              ...nodeType.velocityConfig,
                              scoreMode: value as 'inherit' | 'standalone' | undefined,
                            },
                          });
                        }}
                        className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm"
                      >
                        <option value="">-- Not configured --</option>
                        <option value="inherit">Inherit (accumulate from parents)</option>
                        <option value="standalone">Standalone (independent score)</option>
                      </select>
                    </div>

                    {!nodeType.velocityConfig?.baseScore && !nodeType.velocityConfig?.scoreMode && (
                      <p className="text-xs text-fg-muted italic">
                        ℹ️ This node type will be excluded from velocity calculations until at least one velocity setting is configured.
                      </p>
                    )}
                  </div>
                </div>

                {/* Properties Section */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-fg-primary">Properties</h4>
                    <button
                      onClick={() => addProperty(nodeType.id)}
                      className="text-sm px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Add Property
                    </button>
                  </div>

                  {(() => {
                    const statusProperties = nodeType.properties.filter((property) => {
                      if (property.type !== 'select') {
                        return false;
                      }
                      const setId = property.indicator_set || 'status';
                      return setId === 'status';
                    });

                    if (statusProperties.length === 0) {
                      return null;
                    }

                    const primaryStatusPropertyId = nodeType.primary_status_property_id || statusProperties[0]?.id;

                    return (
                      <div className="mb-3 rounded border border-border/70 bg-bg-dark/20 p-2">
                        <label className="text-xs text-fg-secondary mb-2 block">Primary status (controls node text color/style)</label>
                        <div className="flex flex-wrap gap-3">
                          {statusProperties.map((statusProperty) => (
                            <label key={statusProperty.id} className="inline-flex items-center gap-2 text-xs text-fg-primary">
                              <input
                                type="checkbox"
                                checked={primaryStatusPropertyId === statusProperty.id}
                                onChange={(event) => {
                                  updateNodeType(nodeType.id, {
                                    primary_status_property_id: event.target.checked ? statusProperty.id : undefined,
                                  });
                                }}
                                className="rounded"
                              />
                              <span>{statusProperty.label || statusProperty.id}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {nodeType.properties.length === 0 ? (
                    <p className="text-sm text-fg-secondary">No properties defined</p>
                  ) : (
                    <div className="space-y-3">
                      {nodeType.properties.map((prop, propIndex) => {
                        const propertyEditorKey = getPropertyEditorKey(nodeTypeIndex, propIndex);

                        return (
                        <PropertyEditor
                          key={propertyEditorKey}
                          property={prop}
                          onUpdate={(updates) =>
                            updateProperty(nodeType.id, prop.id, updates)
                          }
                          onRemove={() =>
                            removeProperty(nodeType.id, prop.id)
                          }
                          isExpanded={editingProperty === propertyEditorKey}
                          onToggleExpand={() =>
                            setEditingProperty(editingProperty === propertyEditorKey ? null : propertyEditorKey)
                          }
                          indicatorsConfig={indicatorsConfig}
                          indicatorSvgCache={indicatorSvgCache}
                          fetchIndicatorSvg={fetchIndicatorSvg}
                          markupProfiles={markupProfiles}
                          metaSchema={metaSchema}
                        />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!pendingNodeTypeDelete}
        onClose={() => {
          if (pendingNodeTypeDelete) {
            console.log('[TemplateEditor::DELETE] User cancelled deletion');
          }
          setPendingNodeTypeDelete(null);
        }}
        title="Delete Node Type"
        actions={(
          <>
            <button
              onClick={() => {
                console.log('[TemplateEditor::DELETE] User cancelled deletion');
                setPendingNodeTypeDelete(null);
              }}
              className="px-3 py-2 text-sm border border-border rounded text-fg-primary hover:bg-bg-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!pendingNodeTypeDelete) return;
                const { displayedId, sourceId, nodeTypeLabel } = pendingNodeTypeDelete;
                setPendingNodeTypeDelete(null);
                executeNodeTypeDelete(displayedId, sourceId, nodeTypeLabel);
              }}
              className="px-3 py-2 text-sm rounded bg-status-danger text-white hover:opacity-90 transition-opacity"
            >
              Delete Node Type
            </button>
          </>
        )}
      >
        <p className="text-sm text-fg-primary mb-3">
          Delete "{pendingNodeTypeDelete?.nodeTypeLabel || 'this node type'}"?
        </p>
        <p className="text-xs text-fg-secondary">
          Existing project nodes of this type become orphaned and remain read-only until template or data is cleaned up.
        </p>
      </Modal>
    </div>
  );
}

export const NodeTypeEditor = memo(NodeTypeEditorComponent);

// Property Editor Sub-component
const PropertyEditor = memo(function PropertyEditor({
  property,
  onUpdate,
  onRemove,
  isExpanded,
  onToggleExpand,
  indicatorsConfig,
  indicatorSvgCache,
  fetchIndicatorSvg,
  markupProfiles,
  metaSchema,
}: {
  property: Property;
  onUpdate: (updates: Partial<Property>) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  indicatorsConfig: IndicatorsConfig | null;
  indicatorSvgCache: Record<string, string>;
  fetchIndicatorSvg: (indicatorId: string, url?: string) => Promise<void>;
  markupProfiles: Array<{ id: string; label: string }>;
  metaSchema: MetaSchema | null;
}) {
  useEffect(() => {
    if (property.type === 'markup') {
      onUpdate({ type: 'editor' });
    }
  }, [property.type, onUpdate]);

  return (
    <div className="bg-bg-light/50 border border-border/50 rounded overflow-hidden">
      {/* Property Header */}
      <div
        className="flex items-center justify-between p-3 hover:bg-bg-light/80 transition-colors cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 flex-1">
          <button className="p-0">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h5 className="font-semibold text-fg-primary text-sm">{property.label || property.id}</h5>
              {property.system_locked && (
                <span title="System-locked property">
                  <Lock size={12} className="text-fg-muted flex-shrink-0" />
                </span>
              )}
            </div>
            <p className="text-xs text-fg-secondary font-mono">
              {property.type}
              {property.ui_group && <span className="ml-1 text-fg-muted">· {property.ui_group}</span>}
            </p>
          </div>
        </div>
        {!property.system_locked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="px-2 py-1 text-status-danger hover:bg-status-danger/20 rounded transition-colors flex-shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Property Details */}
      {isExpanded && (
        <div className="border-t border-border/50 p-3 space-y-3 bg-bg-dark/30">
          {/* Property ID */}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">ID</label>
            {property.system_locked ? (
              <input
                type="text"
                value={property.id}
                disabled
                className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm font-mono opacity-70 cursor-not-allowed"
              />
            ) : (
              <input
                type="text"
                value={property.id}
                onChange={(e) => onUpdate({ id: e.target.value })}
                className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm font-mono"
              />
            )}
          </div>

          {/* Property Label */}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Label</label>
            <input
              type="text"
              value={property.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              disabled={!!property.system_locked}
              className={`w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm${property.system_locked ? ' opacity-70 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Property Type */}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Type</label>
            <select
              value={property.type === 'markup' ? 'editor' : property.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
              className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
            >
              {metaSchema?.property_types?.map((pt: { id: string; description?: string }) => (
                <option key={pt.id} value={pt.id}>
                  {pt.description ? `${pt.id} - ${pt.description}` : pt.id}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Description (optional)</label>
            <textarea
              value={property.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value || undefined })}
              className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm resize-none"
              rows={2}
              placeholder="Help text for this property"
            />
          </div>

          {/* Markup Profile (for editor type) */}
          {(property.type === 'editor' || property.type === 'markup') && (
            <div>
              <label className="text-xs text-fg-secondary mb-1 block">Editor Template (optional)</label>
              {markupProfiles.length > 0 ? (
                <select
                  value={property.markup_profile || ''}
                  onChange={(e) => onUpdate({ markup_profile: e.target.value || undefined })}
                  className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                >
                  <option value="">None</option>
                  {markupProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={property.markup_profile || ''}
                  onChange={(e) => onUpdate({ markup_profile: e.target.value || undefined })}
                  className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                  placeholder="e.g., script_default"
                />
              )}
            </div>
          )}

          {/* Velocity Configuration Section */}
          <div className="border-t border-border/50 pt-3 mt-3">
            <label className="text-xs text-fg-secondary mb-2 block flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!property.velocityConfig?.enabled}
                onChange={(e) => {
                  if (e.target.checked) {
                    onUpdate({
                      velocityConfig: {
                        enabled: true,
                        mode: 'multiplier',
                      },
                    });
                  } else {
                    onUpdate({ velocityConfig: undefined });
                  }
                }}
                className="rounded"
              />
              Enable velocity configuration for this property
            </label>

            {property.velocityConfig?.enabled && (
              <div className="space-y-2 bg-bg-dark/30 rounded p-2 mt-2">
                <div>
                  <label className="text-xs text-fg-secondary mb-1 block">
                    Velocity Mode
                    <span className="text-fg-muted text-[10px] ml-1">(how this property contributes to velocity)</span>
                  </label>
                  <select
                    value={property.velocityConfig?.mode || 'multiplier'}
                    onChange={(e) => {
                      onUpdate({
                        velocityConfig: {
                          ...property.velocityConfig,
                          mode: e.target.value as 'multiplier' | 'status',
                        },
                      });
                    }}
                    className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-xs"
                  >
                    <option value="multiplier">Multiplier (numeric property)</option>
                    <option value="status">Status (select property with scores)</option>
                  </select>
                </div>

                {property.velocityConfig?.mode === 'multiplier' && (
                  <div>
                    <label className="text-xs text-fg-secondary mb-1 block">Multiplier Factor</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={property.velocityConfig?.multiplierFactor ?? 1}
                      onChange={(e) => {
                        onUpdate({
                          velocityConfig: {
                            ...property.velocityConfig,
                            multiplierFactor: parseFloat(e.target.value) || 1,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-xs"
                      placeholder="e.g., 5"
                    />
                    <p className="text-[10px] text-fg-muted mt-1">Property valor × multiplier = velocity contribution</p>
                  </div>
                )}

                {property.velocityConfig?.mode === 'status' && (
                  <div>
                    <label className="text-xs text-fg-secondary mb-1 block">Status Value Scores</label>
                    <p className="text-[10px] text-fg-muted mb-2">Define velocity points for each status option:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(property.options || []).map((option) => (
                        <div key={option.name} className="flex items-center gap-2">
                          <span className="text-xs flex-1 text-fg-secondary">{option.name}</span>
                          <input
                            type="number"
                            value={property.velocityConfig?.statusScores?.[option.name] ?? 0}
                            onChange={(e) => {
                              const newScores = {
                                ...(property.velocityConfig?.statusScores || {}),
                                [option.name]: parseInt(e.target.value, 10) || 0,
                              };
                              onUpdate({
                                velocityConfig: {
                                  ...property.velocityConfig,
                                  statusScores: newScores,
                                },
                              });
                            }}
                            className="w-16 px-1 py-1 bg-bg-light border border-border rounded text-fg-primary text-xs"
                            placeholder="0"
                          />
                        </div>
                      ))}
                      {(!property.options || property.options.length === 0) && (
                        <p className="text-[10px] text-fg-muted italic">Add options to this property first</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Select Options (for select type) */}
          {property.type === 'select' && (
            <div>
              <label className="text-xs text-fg-secondary mb-2 block">Options (with optional indicator)</label>
              {indicatorsConfig && (
                <div className="mb-2">
                  <label className="text-xs text-fg-secondary mb-1 block">Indicator Set</label>
                  <select
                    value={resolveIndicatorSetId(property, indicatorsConfig)}
                    onChange={(e) => {
                      const newSetId = e.target.value;
                      onUpdate({ indicator_set: newSetId });
                    }}
                    className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                  >
                    {Object.entries(indicatorsConfig.indicator_sets || {}).map(([setId, setData]) => (
                      <option key={setId} value={setId}>
                        {setId} - {setData.description || 'Indicator set'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-3">
                {(property.options || []).map((option, idx) => (
                  <div key={idx} className="border border-border/50 rounded p-2 space-y-2 bg-bg-dark/20">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) => {
                          const oldName = option.name;
                          const newName = e.target.value;
                          const newOptions = [...(property.options || [])];
                          newOptions[idx] = { ...newOptions[idx], name: newName };
                          // Re-key statusScores when an option is renamed
                          const scores = property.velocityConfig?.statusScores;
                          if (scores && oldName in scores && oldName !== newName) {
                            const newScores = { ...scores };
                            newScores[newName] = newScores[oldName];
                            delete newScores[oldName];
                            onUpdate({
                              options: newOptions,
                              velocityConfig: { ...property.velocityConfig, statusScores: newScores },
                            });
                          } else {
                            onUpdate({ options: newOptions });
                          }
                        }}
                        className="flex-1 px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                        placeholder="Option name"
                      />
                      <button
                        onClick={() => {
                          const newOptions = (property.options || []).filter((_, i) => i !== idx);
                          onUpdate({ options: newOptions.length > 0 ? newOptions : undefined });
                        }}
                        className="px-2 py-1 text-status-danger hover:bg-status-danger/20 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    {/* Indicator selection for this option */}
                    {indicatorsConfig && (
                      <div>
                        <label className="text-xs text-fg-secondary mb-1 block">Indicator Icon</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={option.indicator_id || ''}
                            onChange={(e) => {
                              const newOptions = [...(property.options || [])];
                              const newIndicatorId = e.target.value || undefined;
                              newOptions[idx] = { ...newOptions[idx], indicator_id: newIndicatorId };
                              onUpdate({ options: newOptions });
                              
                              // Fetch SVG for the selected indicator
                              if (newIndicatorId) {
                                const setId = resolveIndicatorSetId(property, indicatorsConfig);
                                const indicatorMeta = indicatorsConfig.indicator_sets[setId]?.indicators?.find(ind => ind.id === newIndicatorId);
                                if (indicatorMeta?.url) {
                                  fetchIndicatorSvg(newIndicatorId, indicatorMeta.url);
                                }
                              }
                            }}
                            className="flex-1 px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                          >
                            <option value="">None - no indicator</option>
                            {(() => {
                              const setId = resolveIndicatorSetId(property, indicatorsConfig);
                              const indicators = indicatorsConfig.indicator_sets[setId]?.indicators || [];
                              return indicators.map(ind => (
                              <option key={ind.id} value={ind.id}>
                                {ind.id} - {ind.description}
                              </option>
                              ));
                            })()}
                          </select>
                          {option.indicator_id && indicatorSvgCache[option.indicator_id] && (() => {
                            const setId = resolveIndicatorSetId(property, indicatorsConfig);
                            const theme = indicatorsConfig.indicator_sets[setId]?.default_theme?.[option.indicator_id];
                            const indicatorColor = theme?.indicator_color || '#e0e0e0';
                            const textColor = theme?.text_color || '#e0e0e0';
                            const textStyle = theme?.text_style;
                            
                            return (
                              <div className="flex-shrink-0 flex items-center gap-2 bg-bg-light border border-border rounded p-2">
                                <div 
                                  className="w-8 h-8 flex items-center justify-center overflow-hidden"
                                  dangerouslySetInnerHTML={{ 
                                    __html: recolorSvg(indicatorSvgCache[option.indicator_id], indicatorColor) 
                                  }}
                                />
                                <div className="flex flex-col gap-1">
                                  <div 
                                    className="text-xs font-mono px-1 rounded"
                                    style={{ 
                                      color: textColor,
                                      fontWeight: textStyle === 'bold' ? 'bold' : 'normal',
                                      textDecoration: textStyle === 'strikethrough' ? 'line-through' : 'none'
                                    }}
                                  >
                                    Sample
                                  </div>
                                  <div className="text-[10px] text-fg-secondary font-mono">
                                    {indicatorColor}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newOptions = [...(property.options || [])];
                    newOptions.push({ name: '' });
                    onUpdate({ options: newOptions });
                  }}
                  className="text-xs px-2 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors"
                >
                  + Add Option
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});