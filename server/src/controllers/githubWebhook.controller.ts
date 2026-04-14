import type { Request, Response } from 'express';
import { executeWorkflow } from '../core/engine/runner';
import { buildGitHubWebhookSharedContext } from '../core/engine/githubBountyExecution';
import { prisma } from '../exports/prisma';
import { dbNodesToRunnerNodes } from '../core/triggers/workflowTriggerUtils';
import { verifyTriggerSecret } from '../core/triggers/triggerRunner';

/**
 * POST /api/webhooks/github/:workflowId — GitHub webhook JSON body; merges into sharedContext and runs workflow.
 * Auth: X-Microflux-Trigger-Secret (or Bearer / ?secret=) when MICROFLUX_TRIGGER_SECRET is set.
 */
export async function executeWebhookTrigger(req: Request, res: Response): Promise<void> {
  try {
    if (!verifyTriggerSecret(req)) {
      res.status(401).json({ error: 'Invalid or missing trigger secret (X-Microflux-Trigger-Secret)' });
      return;
    }

    const workflowId = String(req.params.workflowId || '').trim();
    if (!workflowId) {
      res.status(400).json({ error: 'workflowId path param required' });
      return;
    }

    const wf = await prisma.workflow.findFirst({ where: { id: workflowId, isActive: true } });
    if (!wf) {
      res.status(404).json({ error: 'Workflow not found or inactive' });
      return;
    }

    const initialSharedContext = buildGitHubWebhookSharedContext(req.body);
    const nodes = dbNodesToRunnerNodes(wf.nodes);
    const edges = Array.isArray(wf.edges) ? wf.edges : [];

    const result = await executeWorkflow({ nodes, edges }, { initialSharedContext });

    res.status(200).json({
      ok: true,
      workflowId,
      message: result.message,
      steps: result.steps,
      txIds: result.txIds,
      sharedContext: result.sharedContext,
    });
  } catch (err) {
    console.error('[GITHUB WEBHOOK]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook execution failed' });
  }
}
