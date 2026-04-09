import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface AppCallNodeData {
  label: string;
  appId: number;
  onComplete: string;
  args: string[];
  accounts?: string[];
  assets?: number[];
}

const AppCallNode = memo(({ data, selected }: NodeProps<AppCallNodeData | any>) => {
  const onCompleteLabels: Record<string, string> = {
    'NoOp': 'NoOp',
    'OptIn': 'Opt In',
    'CloseOut': 'Close Out',
    'ClearState': 'Clear State',
    'Update': 'Update',
    'Delete': 'Delete',
  };

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[200px] ${
      selected ? 'border-[#f59e0b] shadow-lg' : 'border-gray-600'
    } bg-[#1a1a2e]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-[#f59e0b]" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
          <span className="text-[#f59e0b] text-lg">📱</span>
        </div>
        <span className="font-semibold text-white text-sm">{data.label}</span>
      </div>
      
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>App ID:</span>
          <span className="text-[#f59e0b] font-mono">{data.appId || 'Not set'}</span>
        </div>
        <div className="flex justify-between">
          <span>On Complete:</span>
          <span className="text-gray-300">{onCompleteLabels[data.onComplete] || data.onComplete}</span>
        </div>
        {data.args && data.args.length > 0 && (
          <div className="text-gray-500">
            Args: {data.args.length} argument(s)
          </div>
        )}
        {(data.accounts?.length || 0) > 0 && (
          <div className="text-gray-500">
            Accounts: {data.accounts?.length}
          </div>
        )}
        {(data.assets?.length || 0) > 0 && (
          <div className="text-gray-500">
            Assets: {data.assets?.length}
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-[#f59e0b]" />
    </div>
  );
});

AppCallNode.displayName = 'AppCallNode';

export default AppCallNode;
