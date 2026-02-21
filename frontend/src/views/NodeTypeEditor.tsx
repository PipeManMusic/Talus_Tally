import { useState, memo, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';
import { apiClient, API_BASE_URL } from '../api/client';
import { ColorPicker } from '../components/ui/ColorPicker';
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
  properties: Property[];
  icon?: string;
  shape?: string;
  color?: string;
}

export interface Property {
  id: string;
  label: string;
  type: string;
  options?: Array<{ name: string; indicator_id?: string }>;
  markup_profile?: string;
  description?: string;
  indicator_set?: string;
  velocityConfig?: VelocityPropertyConfig;
}

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
    
    const statusIndicators = indicatorsConfig.indicator_sets['status']?.indicators || [];
    
    nodeTypes.forEach(nodeType => {
      nodeType.properties.forEach(property => {
        if (property.type === 'select' && property.options) {
          property.options.forEach(option => {
            if (option.indicator_id) {
              const indicatorMeta = statusIndicators.find(ind => ind.id === option.indicator_id);
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
        setExpandedNodeType(newNodeType.id);
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

  const removeNodeType = (id: string) => {
    // Prevent concurrent deletions
    if (deletingRef.current || loading) {
      console.warn('Delete operation already in progress, ignoring duplicate call');
      return;
    }
    
    // Prevent deletion if only one node type remains
    if (nodeTypes.length <= 1) {
      setErrors(prev => ({
        ...prev,
        [id]: 'At least one node type is required',
      }));
      return;
    }
    
    const nodeType = nodeTypes.find(nt => nt.id === id);
    if (!nodeType) {
      console.error(`Node type ${id} not found`);
      return;
    }
    
    const nodeTypeLabel = nodeType.label || id;
    
    // Set flag to prevent double-clicks
    deletingRef.current = true;
    
    // Show confirmation BEFORE any state changes
    const confirmed = window.confirm(
      `Delete "${nodeTypeLabel}" node type?\n\n` +
      `⚠️ IMPORTANT: If any nodes of this type exist in active projects:\n\n` +
      `• They will become "orphaned nodes"\n` +
      `• Orphaned nodes are preserved with all their data\n` +
      `• You can still view and edit their properties\n` +
      `• You can delete them if no longer needed\n` +
      `• Children CANNOT be added to orphaned nodes\n` +
      `• They exist outside the template structure\n\n` +
      `This protects your data while allowing template evolution.\n\n` +
      `Continue with deletion?`
    );
    
    // CRITICAL: Only proceed if user explicitly confirmed
    if (confirmed !== true) {
      console.log(`Deletion of ${nodeTypeLabel} cancelled by user`);
      deletingRef.current = false;
      return;
    }
    
    // User confirmed - proceed with deletion
    console.log(`Deleting node type: ${nodeTypeLabel}`);
    const filtered = nodeTypes.filter(nt => nt.id !== id);
    setLoading(true);
    
    onChange(filtered)
      .then(() => {
        console.log(`✓ Node type ${nodeTypeLabel} deleted successfully`);
        const newErrors = { ...errors };
        delete newErrors[id];
        setErrors(newErrors);
      })
      .catch((err) => {
        console.error(`✗ Failed to delete node type: ${err instanceof Error ? err.message : String(err)}`);
        setErrors(prev => ({
          ...prev,
          [id]: `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      })
      .finally(() => {
        setLoading(false);
        deletingRef.current = false;
      });
  };

  const updateNodeType = (id: string, updates: Partial<NodeType>) => {
    if (updates.id && expandedNodeType === id) {
      setExpandedNodeType(updates.id);
    }
    
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
    
    const newNodeTypes = displayNodeTypes.map(nt =>
      nt.id === nodeTypeId
        ? { ...nt, properties: nt.properties.filter(p => p.id !== propertyId) }
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
    if ((updates as { id?: string }).id && editingProperty === propertyId) {
      setEditingProperty((updates as { id?: string }).id || null);
    }
    
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

      {/* Add Node Type Button */}
      <button
        onClick={addNodeType}
        className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors font-semibold"
      >
        <Plus size={18} />
        Add Node Type
      </button>

      {/* Node Types List */}
      <div className="space-y-2">
        {displayNodeTypes.map((nodeType, nodeTypeIndex) => (
          <div key={String(nodeTypeIndex)} className="bg-bg-light border border-border rounded overflow-hidden">
            {/* Node Type Header */}
            <div className="flex items-center justify-between p-4 hover:bg-bg-dark/50 transition-colors cursor-pointer"
              onClick={() => setExpandedNodeType(expandedNodeType === nodeType.id ? null : nodeType.id)}>
              <div className="flex items-center gap-3 flex-1">
                <button className="p-0 -m-1 hover:bg-bg-dark rounded">
                  {expandedNodeType === nodeType.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
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
            {expandedNodeType === nodeType.id && (
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

                  {nodeType.properties.length === 0 ? (
                    <p className="text-sm text-fg-secondary">No properties defined</p>
                  ) : (
                    <div className="space-y-3">
                      {nodeType.properties.map((prop, propIndex) => (
                        <PropertyEditor
                          key={`${nodeTypeIndex}-${propIndex}`}
                          property={prop}
                          onUpdate={(updates) =>
                            updateProperty(nodeType.id, prop.id, updates)
                          }
                          onRemove={() =>
                            removeProperty(nodeType.id, prop.id)
                          }
                          isExpanded={editingProperty === prop.id}
                          onToggleExpand={() =>
                            setEditingProperty(editingProperty === prop.id ? null : prop.id)
                          }
                          indicatorsConfig={indicatorsConfig}
                          indicatorSvgCache={indicatorSvgCache}
                          fetchIndicatorSvg={fetchIndicatorSvg}
                          markupProfiles={markupProfiles}
                          metaSchema={metaSchema}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
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
            <h5 className="font-semibold text-fg-primary text-sm">{property.label || property.id}</h5>
            <p className="text-xs text-fg-secondary font-mono">{property.type}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="px-2 py-1 text-status-danger hover:bg-status-danger/20 rounded transition-colors flex-shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Property Details */}
      {isExpanded && (
        <div className="border-t border-border/50 p-3 space-y-3 bg-bg-dark/30">
          {/* Property ID */}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">ID</label>
            {property.indicator_set === 'status' ? (
              <input
                type="text"
                value="status"
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
              className="w-full px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
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
              <label className="text-xs text-fg-secondary mb-2 block">Options (with optional status indicator)</label>
              <div className="space-y-3">
                {(property.options || []).map((option, idx) => (
                  <div key={idx} className="border border-border/50 rounded p-2 space-y-2 bg-bg-dark/20">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) => {
                          const newOptions = [...(property.options || [])];
                          newOptions[idx] = { ...newOptions[idx], name: e.target.value };
                          onUpdate({ options: newOptions });
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
                        <label className="text-xs text-fg-secondary mb-1 block">Status Indicator Icon</label>
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
                                const indicatorMeta = indicatorsConfig.indicator_sets['status']?.indicators?.find(ind => ind.id === newIndicatorId);
                                if (indicatorMeta?.url) {
                                  fetchIndicatorSvg(newIndicatorId, indicatorMeta.url);
                                }
                              }
                            }}
                            className="flex-1 px-2 py-1 bg-bg-light border border-border rounded text-fg-primary text-sm"
                          >
                            <option value="">None - no indicator</option>
                            {indicatorsConfig.indicator_sets['status']?.indicators?.map(ind => (
                              <option key={ind.id} value={ind.id}>
                                {ind.id} - {ind.description}
                              </option>
                            ))}
                          </select>
                          {option.indicator_id && indicatorSvgCache[option.indicator_id] && (() => {
                            const theme = indicatorsConfig.indicator_sets['status']?.default_theme?.[option.indicator_id];
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