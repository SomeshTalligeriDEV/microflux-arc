import { Request, Response } from 'express';
import { prisma } from '../exports/prisma';
import {
  clearPendingExecution,
  getPendingExecution,
  type PendingExecution,
} from '../core/state/executionStore';
import { sendTelegramMessage } from '../core/integrations/telegram';

type ConfirmExecutionBody = {
  token?: string;
  txId?: string;
};

const toExecutionDetails = (pending: PendingExecution, workflow: { id: string; name: string; nodes: unknown; edges: unknown }) => ({
  token: pending.token,
  workflowId: workflow.id,
  workflowName: workflow.name,
  params: pending.params,
  nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
  edges: Array.isArray(workflow.edges) ? workflow.edges : [],
});

export const getExecutionByToken = async (req: Request, res: Response) => {
  const token = String(req.params.token || '').trim();

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const pending = getPendingExecution(token);
  if (!pending) {
    return res.status(404).json({ error: 'Execution request expired or not found' });
  }

  const workflow = await prisma.workflow.findUnique({
    where: { id: pending.workflowId },
    select: { id: true, name: true, nodes: true, edges: true },
  });

  if (!workflow) {
    clearPendingExecution(token);
    return res.status(404).json({ error: 'Workflow not found' });
  }

  return res.status(200).json({
    success: true,
    execution: toExecutionDetails(pending, workflow),
  });
};

export const confirmExecution = async (req: Request, res: Response) => {
  const { token, txId } = req.body as ConfirmExecutionBody;
  const safeToken = String(token || '').trim();
  const safeTxId = String(txId || '').trim();

  if (!safeToken || !safeTxId) {
    return res.status(400).json({ error: 'token and txId are required' });
  }

  const pending = getPendingExecution(safeToken);
  if (!pending) {
    return res.status(404).json({ error: 'Execution request expired or not found' });
  }

  await sendTelegramMessage(
    pending.chatId,
    `✅ Execution Complete! Transaction ID: ${safeTxId}`,
  );

  clearPendingExecution(safeToken);
  return res.status(200).json({ success: true });
};
