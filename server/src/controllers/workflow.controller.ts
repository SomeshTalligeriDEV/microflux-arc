import { Request, Response } from 'express';
import { prisma } from '../exports/prisma';

type WorkflowBody = {
  walletAddress?: string;
  name?: string;
  triggerKeyword?: string;
  nodes?: unknown;
  edges?: unknown;
  isActive?: boolean;
};

const normalizeWallet = (wallet?: string) => String(wallet || '').trim().toUpperCase();

export const createWorkflow = async (req: Request, res: Response) => {
  const { walletAddress, name, triggerKeyword, nodes, edges, isActive } = req.body as WorkflowBody;
  const normalizedWallet = normalizeWallet(walletAddress);

  if (!normalizedWallet || !name || !nodes || !edges) {
    return res.status(400).json({ error: 'walletAddress, name, nodes, and edges are required' });
  }

  try {
    const workflow = await prisma.workflow.create({
      data: {
        name,
        triggerKeyword: triggerKeyword ?? null,
        nodes,
        edges,
        isActive: isActive ?? true,
        user: {
          connectOrCreate: {
            where: { walletAddress: normalizedWallet },
            create: { walletAddress: normalizedWallet },
          },
        },
      },
    });

    return res.status(201).json({ success: true, workflow });
  } catch (error) {
    console.error('DB Error creating workflow:', error);
    return res.status(500).json({ error: 'Failed to create workflow' });
  }
};

export const getWorkflowsByWallet = async (req: Request, res: Response) => {
  const walletAddress = normalizeWallet(String(req.params.walletAddress || req.query.walletAddress || ''));

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required (path param or query param)' });
  }

  try {
    const workflows = await prisma.workflow.findMany({
      where: {
        userWallet: {
          equals: walletAddress,
          mode: 'insensitive',
        },
      },
      orderBy: { id: 'desc' },
    });

    return res.status(200).json({ success: true, workflows });
  } catch (error) {
    console.error('DB Error fetching workflows:', error);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
};

export const updateWorkflow = async (req: Request, res: Response) => {
  const workflowId = String(req.params.id || '').trim();
  const { walletAddress, name, triggerKeyword, nodes, edges, isActive } = req.body as WorkflowBody;
  const normalizedWallet = normalizeWallet(walletAddress);

  if (!workflowId) {
    return res.status(400).json({ error: 'workflow id is required' });
  }

  if (!normalizedWallet) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  if (!name || !nodes || !edges) {
    return res.status(400).json({ error: 'name, nodes, and edges are required' });
  }

  try {
    const existing = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userWallet: {
          equals: normalizedWallet,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found for this wallet' });
    }

    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name,
        triggerKeyword: triggerKeyword ?? null,
        nodes,
        edges,
        isActive: isActive ?? true,
      },
    });

    return res.status(200).json({ success: true, workflow });
  } catch (error) {
    console.error('DB Error updating workflow:', error);
    return res.status(500).json({ error: 'Failed to update workflow' });
  }
};

export const deleteWorkflow = async (req: Request, res: Response) => {
  const workflowId = String(req.params.id || '').trim();
  const walletAddress = normalizeWallet(String(req.query.walletAddress || ''));

  if (!workflowId) {
    return res.status(400).json({ error: 'workflow id is required' });
  }

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress query param is required' });
  }

  try {
    const existing = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userWallet: {
          equals: walletAddress,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found for this wallet' });
    }

    await prisma.workflow.delete({ where: { id: workflowId } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('DB Error deleting workflow:', error);
    return res.status(500).json({ error: 'Failed to delete workflow' });
  }
};
