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

export const createWorkflow = async (req: Request, res: Response) => {
  const { walletAddress, name, triggerKeyword, nodes, edges, isActive } = req.body as WorkflowBody;

  if (!walletAddress || !name || !nodes || !edges) {
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
            where: { walletAddress },
            create: { walletAddress },
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
  const walletAddress = String(req.query.walletAddress || '').trim();

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress query param is required' });
  }

  try {
    const workflows = await prisma.workflow.findMany({
      where: { userWallet: walletAddress },
    });

    return res.status(200).json({ success: true, workflows });
  } catch (error) {
    console.error('DB Error fetching workflows:', error);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
};
