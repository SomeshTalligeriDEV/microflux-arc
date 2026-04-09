import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NoteNodeData {
  label: string;
  content: string;
  isCheckpoint?: boolean;
}

const NoteNode = memo(({ data, selected }: NodeProps<NoteNodeData | any>) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[180px] max-w-[250px] ${
      selected ? 'border-[#10b981] shadow-lg' : 'border-gray-600'
    } bg-[#1a1a2e]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-[#10b981]" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#10b981]/20 flex items-center justify-center">
          <span className="text-[#10b981] text-lg">📝</span>
        </div>
        <span className="font-semibold text-white text-sm">{data.label}</span>
        {data.isCheckpoint && (
          <span className="text-xs bg-[#10b981]/20 text-[#10b981] px-1.5 py-0.5 rounded">
            ✓
          </span>
        )}
      </div>
      
      {data.content && (
        <div className="text-xs text-gray-400 italic border-l-2 border-[#10b981]/50 pl-2">
          {data.content.length > 60 
            ? `${data.content.slice(0, 60)}...` 
            : data.content}
        </div>
      )}
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-[#10b981]" />
    </div>
  );
});

NoteNode.displayName = 'NoteNode';

export default NoteNode;
