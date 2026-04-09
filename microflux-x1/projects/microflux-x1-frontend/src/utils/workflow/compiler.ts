import algosdk, { Transaction } from 'algosdk';
import { WorkflowNode, WorkflowEdge } from '../../types/workflow';
import { getAlgodClient } from '../../utils/algorand/client';

/**
 * Topological sort of workflow nodes based on edges
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const result: WorkflowNode[] = [];
  
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Build adjacency list
  const adj = new Map<string, string[]>();
  edges.forEach(e => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });
  
  function visit(nodeId: string) {
    if (temp.has(nodeId)) {
      throw new Error('Cycle detected in workflow');
    }
    if (visited.has(nodeId)) return;
    
    temp.add(nodeId);
    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      visit(neighbor);
    }
    temp.delete(nodeId);
    visited.add(nodeId);
    
    const node = nodeMap.get(nodeId);
    if (node) result.unshift(node);
  }
  
  // Visit all nodes
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      visit(node.id);
    }
  }
  
  return result;
}

/**
 * Compile workflow nodes and edges to Algorand transactions
 */
export async function compileWorkflowToTransactions(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  sender: string
): Promise<Transaction[]> {
  if (nodes.length === 0) {
    return [];
  }
  
  // Sort nodes topologically
  const sorted = topologicalSort(nodes, edges);
  
  // Get suggested params from algod
  const algodClient = getAlgodClient();
  const suggestedParams = await algodClient.getTransactionParams().do();
  
  // Convert nodes to transactions
  const transactions: Transaction[] = [];
  
  for (const node of sorted) {
    const data = node.data;
    
    switch (data.type) {
      case 'transaction': {
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender,
          receiver: data.receiver,
          amount: data.amount,
          note: data.note ? new TextEncoder().encode(data.note) : undefined,
          suggestedParams,
        });
        transactions.push(txn);
        break;
      }
      
      case 'assetTransfer': {
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender,
          receiver: data.receiver,
          amount: BigInt(data.amount),
          assetIndex: data.assetId,
          suggestedParams,
        });
        transactions.push(txn);
        break;
      }
      
      case 'appCall': {
        let txn: Transaction;
        const appArgs = data.args?.map(arg => new TextEncoder().encode(arg)) || [];
        
        switch (data.onComplete) {
          case 'OptIn':
            txn = algosdk.makeApplicationOptInTxnFromObject({
              sender,
              appIndex: data.appId,
              appArgs,
              accounts: data.accounts,
              foreignApps: data.apps,
              foreignAssets: data.assets,
              suggestedParams,
            });
            break;
          case 'CloseOut':
            txn = algosdk.makeApplicationCloseOutTxnFromObject({
              sender,
              appIndex: data.appId,
              appArgs,
              accounts: data.accounts,
              foreignApps: data.apps,
              foreignAssets: data.assets,
              suggestedParams,
            });
            break;
          case 'ClearState':
            txn = algosdk.makeApplicationClearStateTxnFromObject({
              sender,
              appIndex: data.appId,
              appArgs,
              accounts: data.accounts,
              foreignApps: data.apps,
              foreignAssets: data.assets,
              suggestedParams,
            });
            break;
          case 'Delete':
            txn = algosdk.makeApplicationDeleteTxnFromObject({
              sender,
              appIndex: data.appId,
              appArgs,
              accounts: data.accounts,
              foreignApps: data.apps,
              foreignAssets: data.assets,
              suggestedParams,
            });
            break;
          default: // NoOp and Update (Update requires extra data we don't have)
            txn = algosdk.makeApplicationNoOpTxnFromObject({
              sender,
              appIndex: data.appId,
              appArgs,
              accounts: data.accounts,
              foreignApps: data.apps,
              foreignAssets: data.assets,
              suggestedParams,
            });
        }
        transactions.push(txn);
        break;
      }
      
      case 'note':
        // Note nodes don't generate transactions, they're just metadata
        break;
        
      default:
        console.warn(`Unknown node type: ${(data as any).type}`);
    }
  }
  
  // Assign group ID if multiple transactions
  if (transactions.length > 1) {
    algosdk.assignGroupID(transactions);
  }
  
  return transactions;
}
