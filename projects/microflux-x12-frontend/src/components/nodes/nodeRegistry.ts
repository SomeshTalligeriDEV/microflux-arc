// components/nodes/nodeRegistry.ts — Node type registry
import TransactionNode from './TransactionNode';
import AssetTransferNode from './AssetTransferNode';
import AppCallNode from './AppCallNode';
import NoteNode from './NoteNode';

export const nodeTypes = {
  transactionNode: TransactionNode,
  assetTransferNode: AssetTransferNode,
  appCallNode: AppCallNode,
  noteNode: NoteNode,
};

export type NodeTypeKey = keyof typeof nodeTypes;
