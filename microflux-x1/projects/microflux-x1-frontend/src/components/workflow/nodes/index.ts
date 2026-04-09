import TransactionNode from './TransactionNode';
import AssetTransferNode from './AssetTransferNode';
import AppCallNode from './AppCallNode';
import NoteNode from './NoteNode';

export const nodeTypes = {
  transaction: TransactionNode,
  assetTransfer: AssetTransferNode,
  appCall: AppCallNode,
  note: NoteNode,
};

export {
  TransactionNode,
  AssetTransferNode,
  AppCallNode,
  NoteNode,
};
