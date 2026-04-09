// components/nodes/TransactionNode.tsx — Payment node
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { ArrowUpRight } from 'lucide-react';
import BaseNode from './BaseNode';
import type { TransactionNodeData } from '../../types/nodes';
import { ellipseAddress, microAlgosToAlgos } from '../../lib/algorand';

const TransactionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as TransactionNodeData;

  return (
    <BaseNode id={id} data={d} selected={!!selected} icon={<ArrowUpRight size={16} />}>
      <div className="node-body-row">
        <span>To:</span>
        <span className="node-body-value">{d.receiver ? ellipseAddress(d.receiver) : '—'}</span>
      </div>
      <div className="node-body-row">
        <span>Amount:</span>
        <span className="node-body-value">{d.amount ? `${microAlgosToAlgos(d.amount)} ALGO` : '—'}</span>
      </div>
    </BaseNode>
  );
};

export default React.memo(TransactionNode);
