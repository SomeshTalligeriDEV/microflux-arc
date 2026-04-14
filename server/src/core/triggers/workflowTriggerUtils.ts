import type { WorkflowNode } from '../engine/runner';
import { prisma } from '../../exports/prisma';

/** Normalize webhook path from URL or node config for comparison */
export function normalizeWebhookPath(raw: string): string {
  let p = String(raw || '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+$/, '') || '/';
}

export function dbNodesToRunnerNodes(raw: unknown): WorkflowNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n: any, i: number) => ({
    id: String(n.id ?? `n${i}`),
    type: String(n.type ?? 'debug_log'),
    config: typeof n.config === 'object' && n.config !== null ? n.config : {},
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
