import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface TransactionNodeData {
  label: string;
  amount: number;
  receiver: string;
  note?: string;
}

const TransactionNode = memo(({ data, selected }: NodeProps<TransactionNodeData | any>) => {
  const formatAmount = (amount: number) => {
    return (amount / 1_000_000).toFixed(6);
  };

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[200px] ${
      selected ? 'border-[#00d4aa] shadow-lg' : 'border-gray-600'
    } bg-[#1a1a2e]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-[#00d4aa]" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#00d4aa]/20 flex items-center justify-center">
          <span className="text-[#00d4aa] text-lg">💰</span>
        </div>
        <span className="font-semibold text-white text-sm">{data.label}</span>
      </div>
      
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Amount:</span>
          <span className="text-[#00d4aa] font-mono">{formatAmount(data.amount)} ALGO</span>
        </div>
        {data.receiver && (
          <div className="flex justify-between">
            <span>To:</span>
            <span className="font-mono text-gray-300 truncate max-w-[100px]">
              {data.receiver.slice(0, 8)}...
            </span>
          </div>
        )}
        {data.note && (
          <div className="text-gray-500 italic truncate max-w-[180px]">
            Note: {data.note}
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-[#00d4aa]" />
    </div>
  );
});

TransactionNode.displayName = 'TransactionNode';

export default TransactionNode;
