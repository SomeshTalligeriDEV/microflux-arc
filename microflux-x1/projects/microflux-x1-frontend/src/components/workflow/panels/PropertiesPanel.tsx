import { useWorkflowStore } from '../../../stores';
import { TransactionNodeData, AssetTransferNodeData, AppCallNodeData, NoteNodeData } from '../../../types/workflow';

interface PropertiesPanelProps {
  selectedNodeId: string | null;
}

const PropertiesPanel = ({ selectedNodeId }: PropertiesPanelProps) => {
  const { nodes, updateNode, removeNode } = useWorkflowStore();
  
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  
  if (!selectedNode) {
    return (
      <div className="h-full p-4">
        <h2 className="text-white font-semibold mb-4 text-lg">Properties</h2>
        <p className="text-gray-400 text-sm">
          Select a node on the canvas to edit its properties
        </p>
      </div>
    );
  }
  
  const { data, id } = selectedNode;
  
  const handleUpdate = (updates: any) => {
    updateNode(id, updates);
  };
  
  const renderTransactionForm = () => {
    const d = data as TransactionNodeData;
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-gray-400 text-xs mb-1">Label</label>
          <input
            type="text"
            value={d.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#00d4aa] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Amount (microAlgos)</label>
          <input
            type="number"
            value={d.amount}
            onChange={(e) => handleUpdate({ amount: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#00d4aa] focus:outline-none"
          />
          <p className="text-gray-500 text-xs mt-1">
            = {(d.amount / 1_000_000).toFixed(6)} ALGO
          </p>
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Receiver Address</label>
          <input
            type="text"
            value={d.receiver}
            onChange={(e) => handleUpdate({ receiver: e.target.value })}
            placeholder="Enter Algorand address..."
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#00d4aa] focus:outline-none font-mono"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Note (optional)</label>
          <textarea
            value={d.note || ''}
            onChange={(e) => handleUpdate({ note: e.target.value })}
            placeholder="Add a note..."
            rows={3}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#00d4aa] focus:outline-none resize-none"
          />
        </div>
      </div>
    );
  };
  
  const renderAssetTransferForm = () => {
    const d = data as AssetTransferNodeData;
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-gray-400 text-xs mb-1">Label</label>
          <input
            type="text"
            value={d.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#6366f1] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Asset ID</label>
          <input
            type="number"
            value={d.assetId}
            onChange={(e) => handleUpdate({ assetId: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#6366f1] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Amount</label>
          <input
            type="number"
            value={d.amount}
            onChange={(e) => handleUpdate({ amount: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#6366f1] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Receiver Address</label>
          <input
            type="text"
            value={d.receiver}
            onChange={(e) => handleUpdate({ receiver: e.target.value })}
            placeholder="Enter Algorand address..."
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#6366f1] focus:outline-none font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="clawback"
            checked={d.clawback || false}
            onChange={(e) => handleUpdate({ clawback: e.target.checked })}
            className="rounded border-gray-700 bg-[#0a0a0f]"
          />
          <label htmlFor="clawback" className="text-gray-400 text-xs">Clawback transaction</label>
        </div>
      </div>
    );
  };
  
  const renderAppCallForm = () => {
    const d = data as AppCallNodeData;
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-gray-400 text-xs mb-1">Label</label>
          <input
            type="text"
            value={d.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Application ID</label>
          <input
            type="number"
            value={d.appId}
            onChange={(e) => handleUpdate({ appId: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">On Complete</label>
          <select
            value={d.onComplete}
            onChange={(e) => handleUpdate({ onComplete: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#f59e0b] focus:outline-none"
          >
            <option value="NoOp">NoOp</option>
            <option value="OptIn">OptIn</option>
            <option value="CloseOut">CloseOut</option>
            <option value="ClearState">ClearState</option>
            <option value="Update">Update</option>
            <option value="Delete">Delete</option>
          </select>
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Arguments (comma-separated)</label>
          <textarea
            value={d.args?.join(', ') || ''}
            onChange={(e) => handleUpdate({ args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="arg1, arg2, arg3..."
            rows={3}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#f59e0b] focus:outline-none resize-none font-mono"
          />
        </div>
      </div>
    );
  };
  
  const renderNoteForm = () => {
    const d = data as NoteNodeData;
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-gray-400 text-xs mb-1">Label</label>
          <input
            type="text"
            value={d.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#10b981] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Content</label>
          <textarea
            value={d.content}
            onChange={(e) => handleUpdate({ content: e.target.value })}
            placeholder="Add a note or description..."
            rows={5}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded text-white text-sm focus:border-[#10b981] focus:outline-none resize-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="checkpoint"
            checked={d.isCheckpoint || false}
            onChange={(e) => handleUpdate({ isCheckpoint: e.target.checked })}
            className="rounded border-gray-700 bg-[#0a0a0f]"
          />
          <label htmlFor="checkpoint" className="text-gray-400 text-xs">Mark as checkpoint</label>
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Properties</h2>
        <button
          onClick={() => removeNode(id)}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>
      
      <div className="mb-4 pb-4 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Type</span>
        <div className="text-white font-medium mt-1 capitalize">
          {data.type.replace(/([A-Z])/g, ' $1').trim()}
        </div>
      </div>
      
      {data.type === 'transaction' && renderTransactionForm()}
      {data.type === 'assetTransfer' && renderAssetTransferForm()}
      {data.type === 'appCall' && renderAppCallForm()}
      {data.type === 'note' && renderNoteForm()}
    </div>
  );
};

export default PropertiesPanel;
