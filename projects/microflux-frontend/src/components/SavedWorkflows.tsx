import React, { useCallback, useEffect, useState } from 'react';
import { api, type Workflow } from '../services/api';

interface SavedWorkflowsProps {
  activeAddress: string | null;
  onOpenWorkflow: (workflow: Workflow) => void;
}

const SavedWorkflows: React.FC<SavedWorkflowsProps> = ({ activeAddress, onOpenWorkflow }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    if (!activeAddress) {
      setWorkflows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getWorkflows(activeAddress);
      setWorkflows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleRemove = useCallback(
    async (workflowId: string) => {
      if (!activeAddress) return;

      const ok = window.confirm('Remove this workflow from saved workflows?');
      if (!ok) return;

      try {
        await api.deleteWorkflow(workflowId, activeAddress);
        setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove workflow');
      }
    },
    [activeAddress],
  );

  return (
    <div className="page-container animate-fadeIn">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h1 className="page-title">Saved Workflows</h1>
        <p className="page-subtitle">Open, edit, and remove workflows stored in your database.</p>
      </div>

      {!activeAddress && (
        <div className="card">
          <div className="text-sm text-muted">Connect your wallet to view saved workflows.</div>
        </div>
      )}

      {activeAddress && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div className="text-sm font-bold">Your Workflows</div>
              <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
                Wallet: {activeAddress}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadWorkflows} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div style={{
              marginBottom: '12px',
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px',
              color: 'var(--color-error)',
              fontSize: 'var(--text-xs)',
            }}>
              {error}
            </div>
          )}

          {workflows.length === 0 && !loading ? (
            <div className="text-xs text-muted">No saved workflows found.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-input)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <div className="text-sm font-bold">{workflow.name}</div>
                      <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
                        Trigger: {workflow.triggerKeyword || 'none'}
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
                        Nodes: {Array.isArray(workflow.nodes) ? workflow.nodes.length : 0} • Edges: {Array.isArray(workflow.edges) ? workflow.edges.length : 0}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => onOpenWorkflow(workflow)}>
                        Open in Builder
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleRemove(workflow.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SavedWorkflows;
