import { generateText, tool } from 'ai';
import { z } from 'zod';
import model from '../llmClient';
import { prisma } from '../../exports/prisma';

type FlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type IntentActionResult =
  | { action: 'execute'; workflowId: string; reason: string }
  | { action: 'build'; reason: string; workflow: { name: string; triggerKeyword: string | null; nodes: FlowNode[]; edges: FlowEdge[] } }
  | { action: 'none'; reason: string };

const microAlgoAmount = (text: string): number => {
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*algo/i);
  const amount = amountMatch ? Number(amountMatch[1]) : 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 1_000_000);
};

const extractReceiver = (text: string): string => {
  const receiverMatch = text.match(/to\s+([A-Z2-7]{20,})/i);
  return receiverMatch?.[1] ?? '';
};

const buildWorkflowFromPrompt = (prompt: string): { name: string; triggerKeyword: string | null; nodes: FlowNode[]; edges: FlowEdge[] } => {
  const amount = microAlgoAmount(prompt);
  const receiver = extractReceiver(prompt);

  const triggerNode: FlowNode = {
    id: '1',
    type: 'telegram_command',
    position: { x: 0, y: 120 },
    config: { command: prompt, chatId: '' },
  };

  const actionNode: FlowNode = {
    id: '2',
    type: 'send_payment',
    position: { x: 300, y: 120 },
    config: {
      amount: amount > 0 ? amount : 1_000_000,
      receiver,
    },
  };

  const notifyNode: FlowNode = {
    id: '3',
    type: 'telegram_notify',
    position: { x: 600, y: 120 },
    config: { chatId: '', message: 'Workflow executed from Telegram command.' },
  };

  return {
    name: `Workflow: ${prompt.slice(0, 42)}`,
    triggerKeyword: prompt.slice(0, 80),
    nodes: [triggerNode, actionNode, notifyNode],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
    ],
  };
};

export const parseIntent = async (userText: string, walletAddress: string): Promise<IntentActionResult> => {
  let decision: IntentActionResult | null = null;

  await generateText({
    model,
    system: `You are MicroFlux's agentic intent router.
You must choose the right tool for each Telegram message.
Rules:
- First inspect saved workflows using search_saved_workflows.
- If a relevant saved workflow exists, call execute_workflow with that workflowId.
- If no suitable workflow exists, call build_new_workflow.
- Never call multiple final-action tools in one run.`,
    prompt: `Wallet: ${walletAddress}\nUser message: ${userText}`,
    tools: {
      search_saved_workflows: tool({
        description: 'Find workflows belonging to a wallet that might match a request.',
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }: { query: string }) => {
          const workflows = await prisma.workflow.findMany({
            where: {
              userWallet: walletAddress,
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { triggerKeyword: { contains: query, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              name: true,
              triggerKeyword: true,
              isActive: true,
            },
            take: 5,
          });

          return {
            count: workflows.length,
            workflows,
          };
        },
      }),
      execute_workflow: tool({
        description: 'Select an existing workflow to execute now.',
        inputSchema: z.object({
          workflowId: z.string(),
          reason: z.string().default('Matched saved workflow'),
        }),
        execute: async ({ workflowId, reason }: { workflowId: string; reason: string }) => {
          decision = { action: 'execute', workflowId, reason };
          return { ok: true, workflowId, reason };
        },
      }),
      build_new_workflow: tool({
        description: 'Build a new workflow graph when no suitable saved workflow exists.',
        inputSchema: z.object({
          reason: z.string().default('No matching workflow found'),
        }),
        execute: async ({ reason }: { reason: string }) => {
          const workflow = buildWorkflowFromPrompt(userText);
          decision = { action: 'build', reason, workflow };
          return {
            ok: true,
            reason,
            workflowName: workflow.name,
            nodeCount: workflow.nodes.length,
          };
        },
      }),
    },
  });

  if (decision) return decision;

  return {
    action: 'build',
    reason: 'Fallback: no explicit tool action selected by model',
    workflow: buildWorkflowFromPrompt(userText),
  };
};
