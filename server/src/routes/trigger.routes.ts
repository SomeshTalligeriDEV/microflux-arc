import { Router, Request, Response } from 'express';
import {
  verifyTriggerSecret,
  runWorkflowById,
  findWorkflowIdsByWebhookPath,
} from '../core/triggers/triggerRunner';
import { prisma } from '../exports/prisma';

const router = Router();

function unauthorized(res: Response) {
  return res.status(401).json({ error: 'Invalid or missing trigger secret (set MICROFLUX_TRIGGER_SECRET)' });
}

/**
 * Webhook: body { "path": "/api/trigger" } must match webhook_trigger node config.path on a saved workflow.
 * Header (optional): X-Microflux-Trigger-Secret — required if MICROFLUX_TRIGGER_SECRET is set in .env
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    if (!verifyTriggerSecret(req)) return unauthorized(res);

    const path = String(req.body?.path ?? '').trim();
    if (!path) {
      return res.status(400).json({ error: 'body.path is required (must match webhook_trigger path on a workflow)' });
    }

    const ids = await findWorkflowIdsByWebhookPath(path);
    if (ids.length === 0) {
      return res.status(404).json({ error: 'No active workflow with this webhook path', path });
    }

    const results: { workflowId: string; steps: string[]; txIds: string[] }[] = [];
    for (const id of ids) {
      const out = await runWorkflowById(id, {});
      if (out) results.push({ workflowId: id, steps: out.steps, txIds: out.txIds });
    }

    return res.status(200).json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error('[TRIGGER WEBHOOK]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook trigger failed' });
  }
});

async function runByIdHandler(req: Request, res: Response) {
  try {
    if (!verifyTriggerSecret(req)) return unauthorized(res);

    const workflowId = String(req.params.workflowId || '').trim();
    if (!workflowId) return res.status(400).json({ error: 'workflowId required' });

    const wf = await prisma.workflow.findFirst({ where: { id: workflowId, isActive: true } });
    if (!wf) return res.status(404).json({ error: 'Workflow not found or inactive' });

    const result = await runWorkflowById(workflowId, {});
    if (!result) return res.status(500).json({ error: 'Execution failed' });

    return res.status(200).json({
      ok: true,
      workflowId,
      message: result.message,
      steps: result.steps,
      txIds: result.txIds,
    });
  } catch (err) {
    console.error('[TRIGGER RUN]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Run failed' });
  }
}

/** Secured run by workflow UUID (cron, Zapier, manual) */
router.post('/run/:workflowId', runByIdHandler);

/** Same as /run — semantic alias for "wallet_event" canvas trigger */
router.post('/wallet-event/:workflowId', runByIdHandler);

/** External AI / automation gate (runs workflow; add LLM filter later) */
router.post('/ai/:workflowId', runByIdHandler);

export default router;
