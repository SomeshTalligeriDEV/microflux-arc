import type { Request } from 'express';
import { executeWorkflow, type ExecutionContext } from '../engine/runner';
import { sendTelegramMessage } from '../integrations/telegram';
import { prisma } from '../../exports/prisma';
import {
  dbNodesToRunnerNodes,
  findActiveWorkflows,
  getWorkflowByIdForTrigger,
  normalizeWebhookPath,
} from './workflowTriggerUtils';

const RESERVED_TELEGRAM_COMMANDS = new Set([
  '/start',
  '/link',
  '/help',
  '/unlink',
  '/workflows',
  '/status',
]);

/** Optional global secret for webhook / external run endpoints */
export function verifyTriggerSecret(req: Request): boolean {
  const secret = process.env.MICROFLUX_TRIGGER_SECRET;
  if (!secret) return true;
  const h =
    req.get('x-microflux-trigger-secret') ||
    req.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    String(req.query.secret ?? '');
  return h === secret;
}

export async function runWorkflowById(
  workflowId: string,
  context: ExecutionContext = {},
): Promise<Awaited<ReturnType<typeof executeWorkflow>> | null> {
  const wf = await getWorkflowByIdForTrigger(workflowId);
  if (!wf) return null;
  const nodes = dbNodesToRunnerNodes(wf.nodes);
  const edges = Array.isArray(wf.edges) ? wf.edges : [];
  return executeWorkflow({ nodes, edges }, context);
}

/**
 * Match saved workflows whose canvas has webhook_trigger.config.path equal to `path`.
 */
export async function findWorkflowIdsByWebhookPath(pathRaw: string): Promise<string[]> {
  const want = normalizeWebhookPath(pathRaw);
  const workflows = await findActiveWorkflows();
  const ids: string[] = [];
  for (const wf of workflows) {
    const nodes = wf.nodes as unknown[];
    if (!Array.isArray(nodes)) continue;
    for (const n of nodes) {
      const node = n as { type?: string; config?: { path?: string } };
      if (node?.type !== 'webhook_trigger') continue;
      const p = normalizeWebhookPath(String(node.config?.path ?? ''));
      if (p && p === want) {
        ids.push(wf.id);
        break;
      }
    }
  }
  return ids;
}

export async function tryExecuteTelegramCommandTrigger(
  walletAddress: string,
  commandText: string,
  telegramChatId: string | number,
): Promise<boolean> {
  const cmd = commandText.trim().toLowerCase();
  if (!cmd.startsWith('/')) return false;
  if (RESERVED_TELEGRAM_COMMANDS.has(cmd)) return false;

  const workflows = await prisma.workflow.findMany({
    where: {
      isActive: true,
      userWallet: { equals: walletAddress, mode: 'insensitive' },
    },
  });

  for (const wf of workflows) {
    const nodes = wf.nodes as unknown[];
    if (!Array.isArray(nodes)) continue;
    const trigger = nodes.find((n) => (n as { type?: string }).type === 'telegram_command') as
      | { type?: string; config?: { command?: string } }
      | undefined;
    if (!trigger?.config) continue;
    const configured = String(trigger.config.command ?? '').trim().toLowerCase();
    if (!configured.startsWith('/')) continue;
    if (configured === cmd) {
      try {
        const runnerNodes = dbNodesToRunnerNodes(nodes);
        const edges = Array.isArray(wf.edges) ? wf.edges : [];
        const result = await executeWorkflow(
          { nodes: runnerNodes, edges },
          { triggerChatId: telegramChatId },
        );
        const summary = result.steps.slice(-12).join('\n') || result.message;
        await sendTelegramMessage(
          telegramChatId,
          `${wf.name} (trigger)\n${summary}`.slice(0, 3900),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Workflow run failed';
        await sendTelegramMessage(telegramChatId, `${wf.name} (trigger) error:\n${msg.slice(0, 3500)}`);
      }
      return true;
    }
  }
  return false;
}
