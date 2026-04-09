import { Node, Edge } from '@xyflow/react';

export type NodeType = 'transaction' | 'assetTransfer' | 'appCall' | 'note';

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
}

export interface TransactionNodeData extends WorkflowNodeData {
  type: 'transaction';
  amount: number;
  receiver: string;
  note?: string;
  closeRemainderTo?: string;
}

export interface AssetTransferNodeData extends WorkflowNodeData {
  type: 'assetTransfer';
  assetId: number;
  amount: number;
  receiver: string;
  sender?: string;
  clawback?: boolean;
}

export interface AppCallNodeData extends WorkflowNodeData {
  type: 'appCall';
  appId: number;
  onComplete: 'NoOp' | 'OptIn' | 'CloseOut' | 'ClearState' | 'Update' | 'Delete';
  args: string[];
  accounts?: string[];
  assets?: number[];
  apps?: number[];
}

export interface NoteNodeData extends WorkflowNodeData {
  type: 'note';
  content: string;
  isCheckpoint?: boolean;
}

export type WorkflowNodeType = 
  | TransactionNodeData 
  | AssetTransferNodeData 
  | AppCallNodeData 
  | NoteNodeData;

export type WorkflowNode = Node<WorkflowNodeType>;
export type WorkflowEdge = Edge;

export interface WorkflowDefinition {
  version: '1.0';
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'simulating' | 'success' | 'error';
  txIds: string[];
  groupId?: string;
  appId?: number;
  error?: string;
  executedAt: string;
  fees: number;
}
