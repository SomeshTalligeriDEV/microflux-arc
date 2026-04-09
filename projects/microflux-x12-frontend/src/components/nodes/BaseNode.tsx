// components/nodes/BaseNode.tsx — Shared node wrapper
import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useUIStore } from '../../stores/uiStore';
import type { WorkflowNodeData, NodeCategory, NODE_CATEGORIES } from '../../types/nodes';

const categoryColors: Record<NodeCategory, string> = {
  transaction: '#6366f1',
  asset_transfer: '#8b5cf6',
  app_call: '#06b6d4',
  note: '#f59e0b',
};

const categoryLabels: Record<NodeCategory, string> = {
  transaction: 'Payment',
  asset_transfer: 'ASA Transfer',
  app_call: 'App Call',
  note: 'Note',
};

interface BaseNodeProps {
  id: string;
  data: WorkflowNodeData;
  selected: boolean;
  icon: React.ReactNode;
  children?: React.ReactNode;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
}

const BaseNode: React.FC<BaseNodeProps> = ({
  id,
  data,
  selected,
  icon,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
}) => {
  const selectNode = useUIStore((s) => s.selectNode);
  const color = categoryColors[data.category];

  return (
    <div
      className={`workflow-node ${selected ? 'selected' : ''} ${data.isValid ? '' : 'invalid'}`}
      onClick={() => selectNode(id)}
    >
      {/* Color bar */}
      <div className="node-color-bar" style={{ background: color }} />

      {/* Header */}
      <div className="node-header">
        <div className="node-icon" style={{ background: `${color}22`, color }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="node-title">{data.label}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {categoryLabels[data.category]}
          </div>
        </div>
        <div
          className="node-status"
          style={{
            background: data.isValid ? 'var(--accent-emerald)' : 'var(--accent-rose)',
            boxShadow: data.isValid
              ? '0 0 6px rgba(16,185,129,0.5)'
              : '0 0 6px rgba(244,63,94,0.5)',
          }}
        />
      </div>

      {/* Body */}
      {children && <div className="node-body">{children}</div>}

      {/* Handles */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: color, borderColor: color }}
        />
      )}
      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: color, borderColor: color }}
        />
      )}
    </div>
  );
};

export default React.memo(BaseNode);
