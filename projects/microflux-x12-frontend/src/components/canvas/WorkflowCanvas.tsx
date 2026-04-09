// components/canvas/WorkflowCanvas.tsx — Main ReactFlow canvas
import React, { useCallback, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '../nodes/nodeRegistry';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useUIStore } from '../../stores/uiStore';
import { generateNodeId } from '../../lib/storage';
import type { WorkflowNodeData, TransactionNodeData, AssetTransferNodeData, AppCallNodeData, NoteNodeData } from '../../types/nodes';
import Toolbar from './Toolbar';

function getDefaultData(type: string, category: string, label: string): WorkflowNodeData {
  const base = {
    id: '',
    label: label || 'New Node',
    isValid: false,
    validationErrors: [],
  };

  switch (category) {
    case 'transaction':
      return {
        ...base,
        category: 'transaction',
        sender: '',
        receiver: '',
        amount: 0,
        note: '',
        validationErrors: ['Receiver address is required', 'Amount must be greater than 0'],
      } as TransactionNodeData;
    case 'asset_transfer':
      return {
        ...base,
        category: 'asset_transfer',
        sender: '',
        receiver: '',
        assetId: 0,
        amount: 0,
        note: '',
        validationErrors: ['Receiver address is required', 'Asset ID is required', 'Amount must be greater than 0'],
      } as AssetTransferNodeData;
    case 'app_call':
      return {
        ...base,
        category: 'app_call',
        sender: '',
        appId: 0,
        method: '',
        args: [],
        note: '',
        validationErrors: ['App ID is required'],
      } as AppCallNodeData;
    case 'note':
      return {
        ...base,
        category: 'note',
        content: '',
        color: '#f59e0b',
        isValid: true,
        validationErrors: [],
      } as NoteNodeData;
    default:
      return {
        ...base,
        category: 'note',
        content: '',
        color: '#f59e0b',
        isValid: true,
        validationErrors: [],
      } as NoteNodeData;
  }
}

const WorkflowCanvas: React.FC = () => {
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const selectNode = useUIStore((s) => s.selectNode);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const category = event.dataTransfer.getData('application/reactflow-category');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (!type || !reactFlowRef.current) return;

      const position = reactFlowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = generateNodeId();
      const data = getDefaultData(type, category, label);
      data.id = nodeId;

      const newNode = {
        id: nodeId,
        type,
        position,
        data,
      };

      addNode(newNode);
      selectNode(nodeId);
    },
    [addNode, selectNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="app-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#ffffff22', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const data = node.data as unknown as WorkflowNodeData;
            switch (data?.category) {
              case 'transaction': return '#6366f1';
              case 'asset_transfer': return '#8b5cf6';
              case 'app_call': return '#06b6d4';
              case 'note': return '#f59e0b';
              default: return '#6366f1';
            }
          }}
          maskColor="rgba(7,7,13,0.8)"
          style={{ borderRadius: 10, background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}
        />
      </ReactFlow>

      <Toolbar />

      {/* Empty state overlay */}
      {nodes.length === 0 && (
        <div className="canvas-empty-overlay">
          <div className="empty-content">
            <div className="empty-logo">⬡</div>
            <div className="empty-title">Ready to Orchestrate.</div>
            <div className="empty-hint">Drag a trigger from the sidebar to begin your workflow.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowCanvas;
