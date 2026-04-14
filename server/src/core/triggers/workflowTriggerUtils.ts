import algosdk from 'algosdk';
import type { WorkflowNode } from '../engine/runner';
import { normalizeAlgorandAddressInput } from '../engine/algorand';
import { prisma } from '../../exports/prisma';

/** Normalize webhook path from URL or node config for comparison */
export function normalizeWebhookPath(raw: string): string {
  let p = String(raw || '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+$/, '') || '/';
}

/** Prefer a full valid receiver when top-level `config` is stale or truncated vs `data.config`. */
function pickBestReceiverCandidate(
  top: Record<string, unknown>,
  nested: Record<string, unknown>,
  data: Record<string, unknown>,
): string | undefined {
  const rawCandidates = [top.receiver, nested.receiver, data.receiver].filter(
    (v) => typeof v === 'string',
  ) as string[];
  const normalized = rawCandidates.map((r) => normalizeAlgorandAddressInput(r)).filter(Boolean);
  const valid = normalized.find((r) => algosdk.isValidAddress(r));
  if (valid) return valid;
  if (normalized.length === 0) return undefined;
  return normalized.reduce((a, b) => (a.length >= b.length ? a : b));
}

/** Merge top-level config with React-Flow-style `data.config` so server runs match what the canvas saved. */
function mergeNodeConfig(n: Record<string, unknown>): Record<string, unknown> {
  const top = typeof n.config === 'object' && n.config !== null ? { ...(n.config as object) } : {};
  const data = n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : {};
  const nested =
    data.config && typeof data.config === 'object' ? { ...(data.config as object) } : {};
  const merged: Record<string, unknown> = { ...nested, ...top };
  if (typeof data.receiver === 'string' && !(String(merged.receiver ?? '').trim())) {
    merged.receiver = data.receiver;
  }
  const best = pickBestReceiverCandidate(top, nested, data);
  if (best !== undefined) merged.receiver = best;
  return merged;
}

export function dbNodesToRunnerNodes(raw: unknown): WorkflowNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n: any, i: number) => ({
    id: String(n.id ?? `n${i}`),
    type: String(n.type ?? 'debug_log'),
    config: mergeNodeConfig(n),
    position: n.position,
  }));
}

export async function getWorkflowByIdForTrigger(workflowId: string) {
  return prisma.workflow.findFirst({
    where: { id: workflowId, isActive: true },
  });
}

export async function findActiveWorkflows() {
  return prisma.workflow.findMany({ where: { isActive: true } });
}
