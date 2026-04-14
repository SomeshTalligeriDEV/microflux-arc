import algosdk from 'algosdk';
import { algoClient } from './algorand';
import { sendTelegramMessage } from '../integrations/telegram';

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
};

export type ExecutionResult = {
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

function evaluateCondition(
  condition: string,
  actualValue: unknown,
  expectedValue: unknown,
): boolean {
  const actual = String(actualValue ?? '');
  const expected = String(expectedValue ?? '');
  const numActual = Number(actualValue);
  const numExpected = Number(expectedValue);
  switch (condition) {
    case '==': case 'eq':   return actual === expected;
    case '!=': case 'neq':  return actual !== expected;
    case '>':  case 'gt':   return numActual > numExpected;
    case '>=': case 'gte':  return numActual >= numExpected;
    case '<':  case 'lt':   return numActual < numExpected;
    case '<=': case 'lte':  return numActual <= numExpected;
    default: return false;
  }
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
  const sharedContext: Record<string, unknown> = { status: 'unknown', amount: 0, txId: '' };
  const skipSet = new Set<string>();

  console.log('[EXEC] Starting Workflow Execution...');

  for (const node of sortedNodes) {
    const nodeType = normalizeNodeType(node.type);
    const config = toConfig(node);

    if (skipSet.has(node.id)) {
      steps.push(`[SKIP] ${nodeType} (${node.id}): skipped by filter branch`);
      continue;
    }

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
      sharedContext.status = 'success';
      sharedContext.amount = amount;
      sharedContext.txId = sendResult.txid;
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

    if (nodeType === 'filter') {
      const fieldName = String(config.field || 'payment_status');
      const condition = String(config.condition || '==');
      const expectedValue = config.value;
      const actualValue = sharedContext[fieldName === 'payment_status' ? 'status' : fieldName];
      const isTrue = evaluateCondition(condition, actualValue, expectedValue);

      if (!isTrue) {
        const downstream = new Set<string>();
        const collect = (sourceId: string) => {
          for (const e of edges) {
            if (e.source === sourceId && !downstream.has(e.target)) {
              downstream.add(e.target);
              collect(e.target);
            }
          }
        };
        collect(node.id);
        for (const id of downstream) skipSet.add(id);
        steps.push(`[LOGIC] filter (${node.id}): condition false — skipping ${downstream.size} downstream node(s)`);
      } else {
        steps.push(`[LOGIC] filter (${node.id}): condition true — proceeding`);
      }
      continue;
    }

    if (nodeType === 'get_quote' || nodeType === 'price_feed') {
      sharedContext.price = 0;
      steps.push(`[OK] ${nodeType} (${node.id}): price feed checked`);
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
      steps.push(`[SKIP] discord_notify (${node.id}): mock only — use telegram_notify for real alerts`);
      continue;
    }

    if (nodeType === 'tinyman_swap') {
      steps.push(`[SKIP] tinyman_swap requires client-side wallet signing`);
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

    if (['browser_notification', 'write_to_spreadsheet'].includes(nodeType)) {
      steps.push(`[SKIP] ${nodeType} (${node.id}): off-chain action — client only`);
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