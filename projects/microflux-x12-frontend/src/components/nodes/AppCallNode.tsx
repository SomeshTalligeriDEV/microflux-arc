// components/nodes/AppCallNode.tsx — Application call node
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Code } from 'lucide-react';
import BaseNode from './BaseNode';
import type { AppCallNodeData } from '../../types/nodes';

const AppCallNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as AppCallNodeData;

  return (
    <BaseNode id={id} data={d} selected={!!selected} icon={<Code size={16} />}>
      <div className="node-body-row">
        <span>App ID:</span>
        <span className="node-body-value">{d.appId || '—'}</span>
      </div>
      <div className="node-body-row">
        <span>Method:</span>
        <span className="node-body-value">{d.method || '—'}</span>
      </div>
    </BaseNode>
  );
};

export default React.memo(AppCallNode);
