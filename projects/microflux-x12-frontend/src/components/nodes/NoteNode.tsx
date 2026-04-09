// components/nodes/NoteNode.tsx — Metadata annotation node
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import BaseNode from './BaseNode';
import type { NoteNodeData } from '../../types/nodes';

const NoteNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as unknown as NoteNodeData;

  return (
    <BaseNode id={id} data={d} selected={!!selected} icon={<StickyNote size={16} />}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
        {d.content || 'No content'}
      </div>
    </BaseNode>
  );
};

export default React.memo(NoteNode);
