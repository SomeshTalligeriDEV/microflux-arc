import algosdk from 'algosdk';
import { algoClient } from './algorand';
import { sendTelegramMessage } from '../integrations/telegram';

type WorkflowNode = {
  id: string;
  type: string;
  position?: { x?: number; y?: number };
  config?: Record<string, unknown>;
};

type ExecutionContext = {
  triggerChatId?: string | number;
};

type ExecutionResult = {
  success: boolean;
  message: string;
  txIds: string[];
  steps: string[];
};

const getServerMnemonic = (): string | null => {
  return (
    process.env.ALGORAND_SENDER_MNEMONIC ||
    process.env.ALGO_MNEMONIC ||
    process.env.WALLET_MNEMONIC ||
    null
  );
};

const toConfig = (node: WorkflowNode): Record<string, unknown> => {
  if (node.config && typeof node.config === 'object') return node.config;
  return {};
};

const normalizeNodeType = (type: string): string => {
  if (type === 'SendPaymentNode') return 'send_payment';
  if (type === 'SendTelegramNode') return 'telegram_notify';
  if (type === 'TimerNode') return 'delay';
  return type;
};

export const executeWorkflow = async (
  workflow: { nodes?: WorkflowNode[] },
  context: ExecutionContext = {},
): Promise<ExecutionResult> => {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const sortedNodes = [...nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

  const txIds: string[] = [];
  const steps: string[] = [];

  console.log('[EXEC] Starting Workflow Execution...');

  for (const node of sortedNodes) {
    const nodeType = normalizeNodeType(node.type);
    const config = toConfig(node);
    console.log(`[EXEC] Executing: ${nodeType} (${node.id})`);

    if (nodeType === 'send_payment') {
      const receiver = String(config.receiver ?? '').trim();
      const amount = Number(config.amount ?? 0);

      if (!receiver || !algosdk.isValidAddress(receiver)) {
        throw new Error(`Invalid receiver address for node ${node.id}`);
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid amount for node ${node.id}`);
      }

      const mnemonic = getServerMnemonic();
      if (!mnemonic) {
        throw new Error('Missing ALGORAND_SENDER_MNEMONIC (or ALGO_MNEMONIC / WALLET_MNEMONIC) in server .env');
      }

      const sender = algosdk.mnemonicToSecretKey(mnemonic);
      const suggestedParams = await algoClient.getTransactionParams().do();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: sender.addr,
        receiver,
        amount: Math.trunc(amount),
        suggestedParams,
      });

      const signedTxn = txn.signTxn(sender.sk);
      const sendResult = await algoClient.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(algoClient, sendResult.txid, 4);

      txIds.push(sendResult.txid);
      steps.push(`[OK] send_payment ${Math.trunc(amount)} microAlgos -> ${receiver} (${sendResult.txid})`);
      continue;
    }

    if (nodeType === 'telegram_notify') {
      const targetChatId =
        typeof config.chatId === 'string' || typeof config.chatId === 'number'
          ? config.chatId
          : context.triggerChatId;
      const message = String(config.message ?? 'Workflow step completed');

      if (targetChatId) {
        await sendTelegramMessage(targetChatId, message);
        steps.push('[OK] telegram_notify message sent');
      } else {
        steps.push('[SKIP] telegram_notify missing chatId');
      }
      continue;
    }

    if (nodeType === 'delay') {
      const duration = Number(config.duration ?? 0);
      if (duration > 0 && Number.isFinite(duration)) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(duration, 30_000)));
      }
      steps.push(`[OK] delay ${Math.max(0, Math.trunc(duration))}ms`);
      continue;
    }

    steps.push(`[SKIP] Unsupported node type: ${nodeType}`);
  }

  return {
    success: true,
    message: `Workflow executed: ${steps.length} step(s), ${txIds.length} on-chain tx(s)`,
    txIds,
    steps,
  };
};