// types/nodes.ts — Node type definitions for Microflux-X1

export type NodeCategory = 'transaction' | 'asset_transfer' | 'app_call' | 'note';

export interface BaseNodeData {
  id: string;
  label: string;
  category: NodeCategory;
  isValid: boolean;
  validationErrors: string[];
}

export interface TransactionNodeData extends BaseNodeData {
  category: 'transaction';
  sender: string;
  receiver: string;
  amount: number; // microAlgos
  note: string;
}

export interface AssetTransferNodeData extends BaseNodeData {
  category: 'asset_transfer';
  sender: string;
  receiver: string;
  assetId: number;
  amount: number;
  note: string;
}

export interface AppCallNodeData extends BaseNodeData {
  category: 'app_call';
  sender: string;
  appId: number;
  method: string;
  args: string[];
  note: string;
}

export interface NoteNodeData extends BaseNodeData {
  category: 'note';
  content: string;
  color: string;
}

export type WorkflowNodeData =
  | TransactionNodeData
  | AssetTransferNodeData
  | AppCallNodeData
  | NoteNodeData;

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; color: string; icon: string }> = {
  transaction: { label: 'Payment', color: '#6366f1', icon: 'ArrowUpRight' },
  asset_transfer: { label: 'ASA Transfer', color: '#8b5cf6', icon: 'Coins' },
  app_call: { label: 'App Call', color: '#06b6d4', icon: 'Code' },
  note: { label: 'Note', color: '#f59e0b', icon: 'StickyNote' },
};
