import { useState, useEffect } from 'react';
import { AlertCircle, Link2, X } from 'lucide-react';
import { apiClient, type Node } from '../../api/client';

interface NodeBlockingEditorProps {
  sessionId: string | null;
  nodes: Record<string, Node>;
}

export function NodeBlockingEditor({ sessionId, nodes }: NodeBlockingEditorProps) {
  const [selectedBlockedNode, setSelectedBlockedNode] = useState<string | null>(null);
  const [selectedBlockingNode, setSelectedBlockingNode] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<Array<{ blockedNodeId: string; blockingNodeId: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load blocking relationships
  useEffect(() => {
    if (!sessionId) return;

    const loadRelationships = async () => {
      try {
        const result = await apiClient.getBlockingGraph(sessionId);
        setRelationships(result.relationships);
      } catch (err) {
        console.error('Error loading blocking relationships:', err);
      }
    };

    loadRelationships();
  }, [sessionId]);

  const handleCreateRelationship = async () => {
    if (!sessionId || !selectedBlockedNode || !selectedBlockingNode) {
      setError('Select both nodes to create a blocking relationship');
      return;
    }

    if (selectedBlockedNode === selectedBlockingNode) {
      setError('A node cannot block itself');
      return;
    }

    // Check if relationship already exists
    if (relationships.some(r => r.blockedNodeId === selectedBlockedNode && r.blockingNodeId === selectedBlockingNode)) {
      setError('This blocking relationship already exists');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      await apiClient.updateBlockingRelationship(sessionId, selectedBlockedNode, selectedBlockingNode);

      // Update local state
      setRelationships([
        ...relationships,
        { blockedNodeId: selectedBlockedNode, blockingNodeId: selectedBlockingNode },
      ]);

      setSuccess(`Created blocking relationship`);
      setSelectedBlockedNode(null);
      setSelectedBlockingNode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create blocking relationship');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRelationship = async (blockedNodeId: string, blockingNodeId: string) => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);

      // Clear the blocking relationship
      await apiClient.updateBlockingRelationship(sessionId, blockedNodeId, null);

      // Update local state
      setRelationships(relationships.filter(r => !(r.blockedNodeId === blockedNodeId && r.blockingNodeId === blockingNodeId)));
      setSuccess(`Removed blocking relationship`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove blocking relationship');
    } finally {
      setLoading(false);
    }
  };

  const nodeList = Object.entries(nodes).map(([id, node]) => ({
    id,
    name: node.properties?.name || `${node.type} (${id.slice(0, 8)})`,
    type: node.type,
  }));

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Link2 size={24} className="text-accent-primary" />
          <h1 className="text-2xl font-display font-bold">Blocking Editor</h1>
        </div>
        <p className="text-sm text-fg-secondary mt-1">
          Define which nodes block other nodes. Blocked nodes get zero score.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="px-6 py-3 bg-status-danger/10 border-b border-status-danger text-status-danger">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="px-6 py-3 bg-status-success/10 border-b border-status-success text-status-success">
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Create New Relationship */}
          <div className="bg-bg-light border border-border rounded-lg p-4">
            <h2 className="font-semibold text-fg-primary mb-4">Create Blocking Relationship</h2>

            <div className="space-y-4">
              {/* Blocked Node Selection */}
              <div>
                <label className="block text-sm font-medium text-fg-primary mb-2">
                  Node Being Blocked
                </label>
                <select
                  value={selectedBlockedNode || ''}
                  onChange={(e) => setSelectedBlockedNode(e.target.value || null)}
                  className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="">Select node to block...</option>
                  {nodeList.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({node.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Blocking Node Selection */}
              <div>
                <label className="block text-sm font-medium text-fg-primary mb-2">
                  Node Doing the Blocking
                </label>
                <select
                  value={selectedBlockingNode || ''}
                  onChange={(e) => setSelectedBlockingNode(e.target.value || null)}
                  className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="">Select blocking node...</option>
                  {nodeList.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({node.type})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreateRelationship}
                disabled={!selectedBlockedNode || !selectedBlockingNode || loading}
                className="w-full px-4 py-2 bg-accent-primary text-fg-primary rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
              >
                {loading ? 'Creating...' : 'Create Relationship'}
              </button>
            </div>
          </div>

          {/* Existing Relationships */}
          {relationships.length > 0 && (
            <div>
              <h2 className="font-semibold text-fg-primary mb-4">Current Blocking Relationships</h2>
              <div className="space-y-2">
                {relationships.map((rel, idx) => {
                  const blockedNode = nodes[rel.blockedNodeId];
                  const blockingNode = nodes[rel.blockingNodeId];
                  const blockedName = blockedNode?.properties?.name || `Node (${rel.blockedNodeId.slice(0, 8)})`;
                  const blockingName = blockingNode?.properties?.name || `Node (${rel.blockingNodeId.slice(0, 8)})`;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-bg-light border border-border rounded-lg p-4"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="px-3 py-1.5 bg-bg-dark rounded text-sm text-fg-primary font-medium">
                            {blockedName}
                          </div>
                          <div className="text-status-danger font-bold">←</div>
                          <div className="px-3 py-1.5 bg-bg-dark rounded text-sm text-fg-primary font-medium">
                            {blockingName}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveRelationship(rel.blockedNodeId, rel.blockingNodeId)}
                        disabled={loading}
                        className="ml-3 p-1.5 hover:bg-status-danger/20 rounded transition-colors text-fg-secondary hover:text-status-danger disabled:opacity-50"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {relationships.length === 0 && (
            <div className="text-center py-12 text-fg-secondary">
              <Link2 size={48} className="mx-auto mb-3 opacity-30" />
              <div className="text-sm">No blocking relationships yet</div>
              <div className="text-xs mt-1">Create one above to define task dependencies</div>
            </div>
          )}
        </div>
      </div>

      {/* Help */}
      <div className="border-t border-border px-6 py-4 bg-bg-light text-xs text-fg-secondary">
        <strong>How Blocking Works:</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Blocked nodes get zero velocity score</li>
          <li>Blocking nodes gain all blocked nodes' points</li>
          <li>Important dependencies float to the top</li>
        </ul>
      </div>
    </div>
  );
}
