import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface AssetTransferNodeData {
  label: string;
  assetId: number;
  amount: number;
  receiver: string;
  clawback?: boolean;
}

const AssetTransferNode = memo(({ data, selected }: NodeProps<AssetTransferNodeData | any>) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[200px] ${
      selected ? 'border-[#6366f1] shadow-lg' : 'border-gray-600'
    } bg-[#1a1a2e]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-[#6366f1]" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#6366f1]/20 flex items-center justify-center">
          <span className="text-[#6366f1] text-lg">🎫</span>
        </div>
        <span className="font-semibold text-white text-sm">{data.label}</span>
        {data.clawback && (
          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
            Clawback
          </span>
        )}
      </div>
      
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Asset ID:</span>
          <span className="text-[#6366f1] font-mono">{data.assetId || 'Not set'}</span>
        </div>
        <div className="flex justify-between">
          <span>Amount:</span>
          <span className="text-[#6366f1] font-mono">{data.amount}</span>
        </div>
        {data.receiver && (
          <div className="flex justify-between">
            <span>To:</span>
            <span className="font-mono text-gray-300 truncate max-w-[100px]">
              {data.receiver.slice(0, 8)}...
            </span>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-[#6366f1]" />
    </div>
  );
});

AssetTransferNode.displayName = 'AssetTransferNode';

export default AssetTransferNode;
