// server/src/core/ai/intentParser.ts
import { generateText, tool } from 'ai';
import { z } from 'zod';
import model from '../llmClient';
import { prisma } from '../../exports/prisma';
import { AGENT_SYSTEM_PROMPT } from './prompts';

type FlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, any>;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type IntentActionResult =
  | { action: 'execute'; workflowId: string; reason: string }
  | { action: 'build'; reason: string; workflow: { name: string; triggerKeyword: string; nodes: FlowNode[]; edges: FlowEdge[] } }
  | { action: 'none'; reason: string };

export const parseIntent = async (userText: string, walletAddress: string): Promise<IntentActionResult> => {
  let decision: IntentActionResult | null = null;
  const debug = process.env.MFX_DEBUG_AI === '1' || process.env.MFX_DEBUG_AI === 'true';
  const prompt = `Wallet: ${walletAddress}\nUser message: ${userText}`;
  let searchAlreadyCalled = false;

  if (debug) {
    console.log('[AI DEBUG] parseIntent:start', {
      walletAddress,
      userText,
      prompt,
    });
  }

  const microFluxTools = {
    search_saved_workflows: tool({
      description: 'Find workflows belonging to a wallet that might match a request.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }: { query: string }) => {
        if (searchAlreadyCalled) {
          if (debug) {
            console.log('⚠️ [TOOL] search_saved_workflows blocked: already called once in this parse');
          }
          return {
            result: 'NOTFOUND' as const,
            message: 'Search already executed once for this message. Do not call search again. You must now call build_new_workflow or execute_workflow.',
            workflows: [],
          };
        }

        searchAlreadyCalled = true;
        const sanitizedQuery = query
          .replace(new RegExp(walletAddress, 'gi'), '')
          .replace(/\s+/g, ' ')
          .trim();

        const effectiveQuery = sanitizedQuery.length > 0 ? sanitizedQuery : userText;

        if (debug) {
          console.log('🔍 [TOOL] search_saved_workflows', {
            originalQuery: query,
            effectiveQuery,
            walletAddress,
          });
        }

        const workflows = await prisma.workflow.findMany({
          where: {
            userWallet: walletAddress,
            OR: [
              { name: { contains: effectiveQuery, mode: 'insensitive' } },
              { triggerKeyword: { contains: effectiveQuery, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, triggerKeyword: true },
          take: 3,
        });

        if (debug) {
          console.log('🗄️ [DB] search_saved_workflows:result', {
            count: workflows.length,
            workflows,
          });
        }

        if (workflows.length === 0) {
          return {
            result: 'NOTFOUND' as const,
            message: `No workflows found for "${effectiveQuery}". You should now call build_new_workflow to create one.`,
            workflows: [],
          };
        }

        return {
          result: 'FOUND' as const,
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
        if (debug) {
          console.log('🛠️ [TOOL] execute_workflow', { workflowId, reason });
        }

        decision = { action: 'execute', workflowId, reason };
        return { ok: true, workflowId, reason };
      },
    }),

    build_new_workflow: tool({
      description: 'Build a new workflow graph when no suitable saved workflow exists.',
      inputSchema: z.object({
        reason: z.string(),
        name: z.string(),
        triggerKeyword: z.string(),
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
      }),
      execute: async ({
        reason,
        name,
        triggerKeyword,
        nodes,
        edges,
      }: {
        reason: string;
        name: string;
        triggerKeyword: string;
        nodes: FlowNode[];
        edges: FlowEdge[];
      }) => {
        if (debug) {
          console.log('🛠️ [TOOL] build_new_workflow', {
            reason,
            name,
            triggerKeyword,
            nodesCount: nodes.length,
            edgesCount: edges.length,
          });
        }

        const scaledNodes = nodes.map((node) => {
          if (node.type === 'send_payment' && node.config?.amount) {
            const amount = Number(node.config.amount);
            node.config.amount = amount < 100000 ? amount * 1000000 : amount;
          }
          return node;
        });

        decision = { 
          action: 'build', 
          reason, 
          workflow: { name, triggerKeyword, nodes: scaledNodes, edges } 
        };

        if (debug) {
          console.log('🧱 [AI] build_new_workflow:normalized', {
            action: decision.action,
            workflowName: decision.workflow.name,
            triggerKeyword: decision.workflow.triggerKeyword,
            nodesCount: decision.workflow.nodes.length,
            edgesCount: decision.workflow.edges.length,
          });
        }
        
        return { ok: true, reason, workflowName: name, nodeCount: nodes.length };
      },
    }),
  };

  try {
    const llmResult = await generateText({
      model,
      system: AGENT_SYSTEM_PROMPT,
      prompt,
      toolChoice: 'auto',
      tools: microFluxTools,
    });

    if (debug) {
      console.log('[AI DEBUG] generateText:result', {
        finishReason: (llmResult as any)?.finishReason,
        text: (llmResult as any)?.text,
        toolCalls: (llmResult as any)?.toolCalls,
      });
    }

    if (decision) return decision;

    return {
      action: 'none',
      reason: 'Model completed without triggering a final tool action',
    };
  } catch (error) {
    console.error("AI Parser Error:", error);
    return {
      action: 'none',
      reason: 'Internal AI processing error',
    };
  }
};