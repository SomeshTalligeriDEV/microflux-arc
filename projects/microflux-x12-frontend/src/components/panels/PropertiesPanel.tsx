// components/panels/PropertiesPanel.tsx — Node configuration panel
import React from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useUIStore } from '../../stores/uiStore';
import type {
  WorkflowNodeData,
  TransactionNodeData,
  AssetTransferNodeData,
  AppCallNodeData,
  NoteNodeData,
} from '../../types/nodes';
import { Trash2 } from 'lucide-react';

const PropertiesPanel: React.FC = () => {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as unknown as WorkflowNodeData | undefined;

  if (!selectedNode || !data) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">
          Select a node to edit its properties<br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            or drag a new node from the sidebar
          </span>
        </div>
      </div>
    );
  }

  const update = (field: string, value: any) => {
    updateNodeData(selectedNode.id, { [field]: value } as any);
  };

  return (
    <div className="panel-content animate-slide-in-right" key={selectedNode.id}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{data.label}</div>
          <span className={`badge ${data.isValid ? 'badge-success' : 'badge-error'}`}>
            {data.isValid ? '✓ Valid' : '✗ Invalid'}
          </span>
        </div>
        <button className="btn-icon" onClick={() => { removeNode(selectedNode.id); useUIStore.getState().selectNode(null); }} title="Delete node">
          <Trash2 size={16} color="var(--accent-rose)" />
        </button>
      </div>

      {/* Label */}
      <div className="input-group">
        <label className="input-label">Label</label>
        <input className="input" value={data.label} onChange={(e) => update('label', e.target.value)} />
      </div>

      {/* Category-specific fields */}
      {data.category === 'transaction' && (
        <TransactionFields data={data as TransactionNodeData} update={update} />
      )}
      {data.category === 'asset_transfer' && (
        <AssetTransferFields data={data as AssetTransferNodeData} update={update} />
      )}
      {data.category === 'app_call' && (
        <AppCallFields data={data as AppCallNodeData} update={update} />
      )}
      {data.category === 'note' && (
        <NoteFields data={data as NoteNodeData} update={update} />
      )}

      {/* Validation errors */}
      {data.validationErrors.length > 0 && (
        <div className="panel-section" style={{ marginTop: 16 }}>
          <div className="panel-section-title">Validation Issues</div>
          {data.validationErrors.map((err, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--accent-rose)', padding: '2px 0', display: 'flex', gap: 6 }}>
              <span>⚠</span> {err}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Field Components ---

const TransactionFields: React.FC<{ data: TransactionNodeData; update: (f: string, v: any) => void }> = ({ data, update }) => (
  <>
    <div className="input-group">
      <label className="input-label">Receiver Address</label>
      <input
        className="input input-mono"
        value={data.receiver}
        onChange={(e) => update('receiver', e.target.value)}
        placeholder="ALGO address (58 chars)"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Amount (microAlgos)</label>
      <input
        className="input"
        type="number"
        value={data.amount}
        onChange={(e) => update('amount', Math.floor(Number(e.target.value) || 0))}
        placeholder="e.g. 1000000 = 1 ALGO"
      />
      <div className="input-hint">{data.amount > 0 ? `${(data.amount / 1_000_000).toFixed(6)} ALGO` : ''}</div>
    </div>
    <div className="input-group">
      <label className="input-label">Note (optional)</label>
      <input
        className="input"
        value={data.note}
        onChange={(e) => update('note', e.target.value)}
        placeholder="Transaction note"
      />
    </div>
  </>
);

const AssetTransferFields: React.FC<{ data: AssetTransferNodeData; update: (f: string, v: any) => void }> = ({ data, update }) => (
  <>
    <div className="input-group">
      <label className="input-label">Receiver Address</label>
      <input
        className="input input-mono"
        value={data.receiver}
        onChange={(e) => update('receiver', e.target.value)}
        placeholder="ALGO address (58 chars)"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Asset ID</label>
      <input
        className="input"
        type="number"
        value={data.assetId}
        onChange={(e) => update('assetId', Math.floor(Number(e.target.value) || 0))}
        placeholder="ASA ID"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Amount</label>
      <input
        className="input"
        type="number"
        value={data.amount}
        onChange={(e) => update('amount', Math.floor(Number(e.target.value) || 0))}
        placeholder="Asset units"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Note (optional)</label>
      <input
        className="input"
        value={data.note}
        onChange={(e) => update('note', e.target.value)}
        placeholder="Transfer note"
      />
    </div>
  </>
);

const AppCallFields: React.FC<{ data: AppCallNodeData; update: (f: string, v: any) => void }> = ({ data, update }) => (
  <>
    <div className="input-group">
      <label className="input-label">Application ID</label>
      <input
        className="input"
        type="number"
        value={data.appId}
        onChange={(e) => update('appId', Math.floor(Number(e.target.value) || 0))}
        placeholder="App ID on testnet"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Method Name</label>
      <input
        className="input"
        value={data.method}
        onChange={(e) => update('method', e.target.value)}
        placeholder="e.g. execute"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Arguments (comma separated)</label>
      <input
        className="input input-mono"
        value={(data.args || []).join(', ')}
        onChange={(e) => update('args', e.target.value.split(',').map((s: string) => s.trim()))}
        placeholder="arg1, arg2"
      />
    </div>
    <div className="input-group">
      <label className="input-label">Note (optional)</label>
      <input
        className="input"
        value={data.note}
        onChange={(e) => update('note', e.target.value)}
        placeholder="Call note"
      />
    </div>
  </>
);

const NoteFields: React.FC<{ data: NoteNodeData; update: (f: string, v: any) => void }> = ({ data, update }) => (
  <>
    <div className="input-group">
      <label className="input-label">Content</label>
      <textarea
        className="textarea"
        value={data.content}
        onChange={(e) => update('content', e.target.value)}
        placeholder="Annotation or description..."
        rows={4}
      />
    </div>
    <div className="input-group">
      <label className="input-label">Color Tag</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {['#f59e0b', '#6366f1', '#06b6d4', '#10b981', '#f43f5e'].map((c) => (
          <button
            key={c}
            onClick={() => update('color', c)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: c,
              border: data.color === c ? '2px solid white' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          />
        ))}
      </div>
    </div>
  </>
);

export default PropertiesPanel;
