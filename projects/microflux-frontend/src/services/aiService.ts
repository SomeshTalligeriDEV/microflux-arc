import { api } from './api';

// ── Types ───────────────────────────────────

export interface AINode {
  id: string;
  type: string;
  label: string;
  category: 'trigger' | 'action' | 'logic' | 'defi' | 'notification';
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface AIEdge {
  id: string;
  source: string;
  target: string;
}

export interface AIWorkflowResult {
  name: string;
  nodes: AINode[];
  edges: AIEdge[];
  explanation: string;
}

const CATEGORIES = ['trigger', 'action', 'logic', 'defi', 'notification'] as const;
type NodeCategory = (typeof CATEGORIES)[number];

type BackendBuildResult = {
  action: 'build';
  reason?: string;
  workflow: {
    name?: string;
    explanation?: string;
    nodes?: unknown[];
    edges?: unknown[];
  };
};

function inferCategory(type: string): NodeCategory {
  if (['telegram_command', 'timer_loop', 'wallet_event', 'webhook_trigger', 'ai_trigger'].includes(type)) return 'trigger';
  if (['send_payment', 'asa_transfer', 'app_call', 'http_request'].includes(type)) return 'action';
  if (['delay', 'filter', 'debug_log'].includes(type)) return 'logic';
  if (['get_quote', 'price_feed', 'tinyman_swap'].includes(type)) return 'defi';
  return 'notification';
}

function humanizeType(type: string): string {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeNode(node: any, index: number): AINode {
  const type = String(node?.type ?? 'debug_log');
  const categoryRaw = node?.category;
  const category: NodeCategory = CATEGORIES.includes(categoryRaw)
    ? categoryRaw
    : inferCategory(type);

  const position = node?.position && typeof node.position === 'object'
    ? {
        x: Number(node.position.x ?? index * 300),
        y: Number(node.position.y ?? 100),
      }
    : {
        x: Number(node?.x ?? index * 300),
        y: Number(node?.y ?? 100),
      };

  return {
    id: String(node?.id ?? `node_${index + 1}`),
    type,
    label: String(node?.label ?? humanizeType(type)),
    category,
    config: (node?.config ?? node?.params ?? {}) as Record<string, unknown>,
    position,
  };
}

function normalizeEdge(edge: any, index: number): AIEdge {
  return {
    id: String(edge?.id ?? `edge_${index + 1}`),
    source: String(edge?.source ?? edge?.from ?? ''),
    target: String(edge?.target ?? edge?.to ?? ''),
  };
}

export const generateWorkflow = async (prompt: string, walletAddress: string): Promise<AIWorkflowResult> => {
  if (!prompt.trim()) {
    throw new Error('Please provide a workflow description.');
  }

  if (!walletAddress.trim()) {
    throw new Error('Connect wallet to generate workflows.');
  }

  const response = await api.processAIIntent(walletAddress, prompt);

  if (response?.action !== 'build') {
    if (response?.action === 'execute') {
      throw new Error(`AI decided to execute workflow ${response.workflowId} instead of building a new one.`);
    }
    throw new Error(response?.reason || 'AI could not determine how to build this workflow.');
  }

  const result = response as BackendBuildResult;
  const rawNodes = Array.isArray(result.workflow?.nodes) ? result.workflow.nodes : [];
  const rawEdges = Array.isArray(result.workflow?.edges) ? result.workflow.edges : [];

  const nodes = rawNodes.map(normalizeNode);
  const edges = rawEdges.map(normalizeEdge).filter((edge) => edge.source && edge.target);

  return {
    name: String(result.workflow?.name ?? 'AI Workflow'),
    explanation: String(result.workflow?.explanation ?? result.reason ?? 'Workflow generated from backend AI intent parser.'),
    nodes,
    edges,
  };
};
