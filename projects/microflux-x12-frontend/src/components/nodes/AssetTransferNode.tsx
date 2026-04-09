// components/nodes/AssetTransferNode.tsx — ASA transfer node
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Coins } from 'lucide-react';
import BaseNode from './BaseNode';
import type { AssetTransferNodeData } from '../../types/nodes';
import { ellipseAddress } from '../../lib/algorand';

const AssetTransferNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as AssetTransferNodeData;

  return (
    <BaseNode id={id} data={d} selected={!!selected} icon={<Coins size={16} />}>
      <div className="node-body-row">
        <span>To:</span>
        <span className="node-body-value">{d.receiver ? ellipseAddress(d.receiver) : '—'}</span>
      </div>
      <div className="node-body-row">
        <span>Asset:</span>
        <span className="node-body-value">{d.assetId ? `#${d.assetId}` : '—'}</span>
      </div>
      <div className="node-body-row">
        <span>Amount:</span>
        <span className="node-body-value">{d.amount || '—'}</span>
      </div>
    </BaseNode>
  );
};

export default React.memo(AssetTransferNode);
