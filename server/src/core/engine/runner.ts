import algosdk from 'algosdk';
import { algoClient, normalizeAlgorandAddressInput } from './algorand';
import { sendTelegramMessage } from '../integrations/telegram';
import {
  accountFromServerMnemonic,
  executeAtomicPayments,
  executeWriteToSpreadsheet,
  expandWorkflowMessageTemplate,
  resolvePaymentMicroAlgos,
} from './deterministicPayroll';
import {
  executeASATransfer,
  executeFilterCondition,
  executePriceFeed,
  executeTinymanSwap,
} from './defiExecution';
import {
  evaluateGithubBountyGate,
  executeAppCall,
  executeDiscordNotify,
  executeJsonParser,
} from './githubBountyExecution';

export type WorkflowNode = {
  id: string;
  type: string;
  position?: { x?: number; y?: number };
  config?: Record<string, unknown>;
};

export type WorkflowEdge = {
  id?: string;
  source: string;
  target: string;
};

export type ExecutionContext = {
  triggerChatId?: string | number;
  /** Merged into sharedContext before node execution (e.g. GitHub webhook payload). */
  initialSharedContext?: Record<string, unknown>;
};

export type ExecutionResult = {
  success: boolean;
  message: string;
  txIds: string[];
  steps: string[];
  /** Snapshot of last-run values (e.g. price, atomic group tx id) for API consumers */
  sharedContext?: Record<string, unknown>;
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
  if (type === 'filter_condition') return 'filter';
  return type;
};

function isAllowedProxyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    if (adjList.has(edge.source) && inDegree.has(edge.target)) {
      adjList.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adjList.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!ordered.includes(node.id)) ordered.push(node.id);
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return ordered.map((id) => nodeMap.get(id)!).filter(Boolean);
}

export const executeWorkflow = async (
  workflow: { nodes?: WorkflowNode[]; edges?: unknown[] },
  context: ExecutionContext = {},
): Promise<ExecutionResult> => {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const edges: WorkflowEdge[] = (Array.isArray(workflow?.edges) ? workflow.edges : [])
    .filter((e: any) => e && typeof e.source === 'string' && typeof e.target === 'string') as WorkflowEdge[];
  const sortedNodes = topologicalSort(nodes, edges);

  const txIds: string[] = [];
  const steps: string[] = [];
  const sharedContext: Record<string, unknown> = {
    status: 'unknown',
    amount: 0,
    txId: '',
    ...(context.initialSharedContext && typeof context.initialSharedContext === 'object'
      ? context.initialSharedContext
      : {}),
  };

  const atomicPaymentIds = new Set<string>();
  for (const n of nodes) {
    const nt = normalizeNodeType(n.type);
    if (nt !== 'atomic_group') continue;
    const cfg = toConfig(n);
    const raw = cfg.paymentNodeIds;
    if (Array.isArray(raw)) {
      for (const id of raw) atomicPaymentIds.add(String(id));
    }
  }

  console.log('[EXEC] Starting Workflow Execution...');

  for (const node of sortedNodes) {
    const nodeType = normalizeNodeType(node.type);
    const config = toConfig(node);

    console.log(`[EXEC] Executing: ${nodeType} (${node.id})`);

    if (nodeType === 'send_payment') {
      if (atomicPaymentIds.has(node.id)) {
        steps.push(`[SKIP] send_payment (${node.id}): included in atomic_group batch`);
        continue;
      }

      const receiver = normalizeAlgorandAddressInput(config.receiver);
      if (!receiver) {
        throw new Error(
          `send_payment ${node.id}: receiver is empty — set Receiver in the builder, Save, then retry.`,
        );
      }
      if (!algosdk.isValidAddress(receiver)) {
        throw new Error(
          `send_payment ${node.id}: not a valid Algorand address (length ${receiver.length}, expected 58)`,
        );
      }

      const mnemonic = getServerMnemonic();
      if (!mnemonic) {
        throw new Error('Missing ALGORAND_SENDER_MNEMONIC (or ALGO_MNEMONIC / WALLET_MNEMONIC) in server .env');
      }

      const microAmount = resolvePaymentMicroAlgos(config, sharedContext);
      const sender = accountFromServerMnemonic(mnemonic);
      sharedContext.senderAddress = String(sender.addr);
      const suggestedParams = await algoClient.getTransactionParams().do();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: sender.addr,
        receiver,
        amount: microAmount,
        suggestedParams,
      });

      const signedTxn = txn.signTxn(sender.sk);
      const sendResult = await algoClient.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(algoClient, sendResult.txid, 4);

      txIds.push(sendResult.txid);
      sharedContext.status = 'success';
      sharedContext.amount = microAmount;
      sharedContext.txId = sendResult.txid;
      steps.push(`[OK] send_payment ${microAmount} microAlgos -> ${receiver} (${sendResult.txid})`);
      continue;
    }

    if (nodeType === 'atomic_group') {
      const raw = config.paymentNodeIds;
      const paymentNodeIds = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
      if (paymentNodeIds.length === 0) {
        throw new Error(`atomic_group (${node.id}): paymentNodeIds must list send_payment node ids`);
      }
      const out = await executeAtomicPayments(nodes, paymentNodeIds, sharedContext);
      for (const id of out.txIds) txIds.push(id);
      steps.push(
        `[OK] atomic_group (${node.id}): ${paymentNodeIds.length} txns, group ${out.groupId.slice(0, 16)}…`,
      );
      continue;
    }

    if (nodeType === 'telegram_notify') {
      const targetChatId =
        typeof config.chatId === 'string' || typeof config.chatId === 'number'
          ? config.chatId
          : context.triggerChatId;
      const rawMessage = String(config.message ?? 'Workflow step completed');
      const message = expandWorkflowMessageTemplate(rawMessage, sharedContext);

      if (targetChatId) {
        await sendTelegramMessage(targetChatId, message);
        steps.push(`[OK] telegram_notify (${node.id}): message sent`);
      } else {
        steps.push('[SKIP] telegram_notify missing chatId (use /link or set chatId on the node)');
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

    if (nodeType === 'filter') {
      const preset = String(config.preset ?? '');
      const proceed =
        preset === 'github_bounty_merged'
          ? evaluateGithubBountyGate(sharedContext)
          : executeFilterCondition(node, sharedContext);
      if (!proceed) {
        steps.push(`[HALT] filter (${node.id}): condition false — workflow stopped`);
        sharedContext.status = 'halted';
        break;
      }
      steps.push(`[LOGIC] filter (${node.id}): condition true — proceeding`);
      continue;
    }

    if (nodeType === 'json_parser') {
      const parsed = await executeJsonParser(node, sharedContext);
      if (!parsed.ok) {
        steps.push(`[HALT] json_parser (${node.id}): no valid Algorand address in PR body`);
        sharedContext.status = 'halted';
        break;
      }
      steps.push(`[OK] json_parser (${node.id}): contributor wallet extracted`);
      continue;
    }

    if (nodeType === 'app_call') {
      try {
        await executeAppCall(node, sharedContext);
        const tid = String(sharedContext.appCallTxId ?? '');
        if (tid) txIds.push(tid);
        steps.push(`[OK] app_call (${node.id}): NoOp confirmed (${tid})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push(`[FAIL] app_call (${node.id}): ${msg}`);
      }
      continue;
    }

    if (nodeType === 'get_quote' || nodeType === 'price_feed') {
      if (nodeType === 'price_feed') {
        await executePriceFeed(node, sharedContext);
        steps.push(
          `[OK] price_feed (${node.id}): ${sharedContext.priceToken}/${String(sharedContext.priceVs).toUpperCase()} = ${sharedContext.price}`,
        );
      } else {
        sharedContext.price = 0;
        steps.push(`[OK] get_quote (${node.id}): stub`);
      }
      continue;
    }

    if (nodeType === 'http_request') {
      const url = String(config.url ?? '').trim();
      const method = String(config.method ?? 'GET').toUpperCase();
      if (!url || !isAllowedProxyUrl(url)) {
        steps.push(`[SKIP] http_request (${node.id}): valid https URL required (private hosts blocked)`);
        continue;
      }
      try {
        const headerObj: Record<string, string> = {
          Accept: 'application/json, text/plain, */*',
        };
        const hdrs = config.headers;
        if (hdrs && typeof hdrs === 'object' && !Array.isArray(hdrs)) {
          for (const [k, v] of Object.entries(hdrs as Record<string, unknown>)) {
            headerObj[k] = String(v);
          }
        }
        const init: RequestInit = {
          method,
          headers: headerObj,
          signal: AbortSignal.timeout(20_000),
        };
        if (method !== 'GET' && method !== 'HEAD' && config.body !== undefined) {
          headerObj['Content-Type'] = headerObj['Content-Type'] ?? 'application/json';
          init.body =
            typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
        }
        const resp = await fetch(url, init);
        const text = await resp.text();
        steps.push(`[OK] http_request (${node.id}): ${method} → ${resp.status} (${text.length}b)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'fetch failed';
        steps.push(`[FAIL] http_request (${node.id}): ${msg}`);
      }
      continue;
    }

    if (nodeType === 'discord_notify') {
      try {
        await executeDiscordNotify(node, sharedContext);
        if (sharedContext.discordSkipped) {
          steps.push(`[SKIP] discord_notify (${node.id}): set https webhookUrl (Discord incoming webhook)`);
        } else {
          steps.push(`[OK] discord_notify (${node.id}): message sent`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push(`[FAIL] discord_notify (${node.id}): ${msg}`);
      }
      continue;
    }

    if (nodeType === 'tinyman_swap') {
      await executeTinymanSwap(node, sharedContext);
      const st = String(sharedContext.swapStatus ?? 'unknown');
      if (st === 'success') {
        const swapTx = String(sharedContext.swapTxId ?? '');
        if (swapTx && swapTx !== 'SIMULATED') txIds.push(swapTx);
        steps.push(
          `[OK] tinyman_swap (${node.id}): ${st} tx=${swapTx} out≈${sharedContext.swapAmountOut}`,
        );
      } else {
        steps.push(
          `[FAIL] tinyman_swap (${node.id}): ${st} ${String(sharedContext.swapError ?? '')}`.trim(),
        );
      }
      continue;
    }

    if (nodeType === 'asa_transfer') {
      await executeASATransfer(node, sharedContext);
      const asaId = String(sharedContext.asaTxId ?? '');
      if (asaId) txIds.push(asaId);
      const recv = normalizeAlgorandAddressInput(config.receiver);
      steps.push(
        `[OK] asa_transfer (${node.id}): ${sharedContext.asaAmount} units → ${recv.slice(0, 8)}… (${sharedContext.asaTxId})`,
      );
      continue;
    }

    if (nodeType === 'debug_log') {
      steps.push(`[LOG] ${node.id}: ${String(config.message ?? '')}`);
      continue;
    }

    if (['timer_loop', 'wallet_event', 'webhook_trigger', 'telegram_command', 'ai_trigger'].includes(nodeType)) {
      steps.push(`[OK] ${nodeType} (${node.id}): trigger acknowledged`);
      continue;
    }

    if (nodeType === 'write_to_spreadsheet') {
      try {
        await executeWriteToSpreadsheet(config, sharedContext);
        steps.push(`[OK] write_to_spreadsheet (${node.id}): row appended`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push(`[FAIL] write_to_spreadsheet (${node.id}): ${msg}`);
      }
      continue;
    }

    if (nodeType === 'browser_notification') {
      steps.push(`[SKIP] browser_notification (${node.id}): client only`);
      continue;
    }

    steps.push(`[SKIP] Unsupported node type: ${nodeType}`);
  }

  return {
    success: true,
    message: `Workflow executed: ${steps.length} step(s), ${txIds.length} on-chain tx(s)`,
    txIds,
    steps,
    sharedContext: { ...sharedContext },
  };
};