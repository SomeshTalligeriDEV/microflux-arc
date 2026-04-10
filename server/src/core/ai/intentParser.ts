// server/src/core/ai/intentParser.ts
import { generateText, tool } from 'ai';
import { z } from 'zod';
import model from '../llmClient';
import { prisma } from '../../exports/prisma';
import { AGENT_SYSTEM_PROMPT } from './prompts';
import { normalizeAmountToMicroAlgos } from '../utils/amount';

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
  | { action: 'build'; reason: string; workflow: { name: string; triggerKeyword: string; explanation: string; nodes: FlowNode[]; edges: FlowEdge[] } }
  | { action: 'none'; reason: string };

export const parseIntent = async (
  userText: string,
  walletAddress: string,
  source: 'web' | 'telegram',
): Promise<IntentActionResult> => {
  let decision: IntentActionResult | null = null;
  const debug = process.env.MFX_DEBUG_AI === '1' || process.env.MFX_DEBUG_AI === 'true';
  const prompt = `Wallet: ${walletAddress}\nUser message: ${userText}`;
  const contextRule = source === 'web'
    ? "CONTEXT: The user is in the Web Canvas Builder. Assume all requests are to CREATE/BUILD new workflows. Go straight to 'build_new_workflow' unless they explicitly use the word 'Run' or 'Execute'."
    : "CONTEXT: The user is in Telegram. They might want to build a new workflow, or execute an existing one. Always search first.";
  const dynamicSystemPrompt = `${AGENT_SYSTEM_PROMPT}\n\n${contextRule}`;
  let searchAlreadyCalled = false;

  if (debug) {
    console.log('[AI DEBUG] parseIntent:start', {
      source,
      walletAddress,
      userText,
      prompt,
      contextRule,
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
        explanation: z.string().describe('A human-readable explanation of what this workflow does step-by-step'),
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
      }),
      execute: async ({
        reason,
        name,
        triggerKeyword,
        explanation,
        nodes,
        edges,
      }: {
        reason: string;
        name: string;
        triggerKeyword: string;
        explanation: string;
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
            const rawAmount = node.config.amount as unknown;
            const unitHint = (node.config as any).amountUnit ?? (node.config as any).unit;
            node.config.amount = normalizeAmountToMicroAlgos(rawAmount, unitHint);
          }
          return node;
        });

        decision = { 
          action: 'build', 
          reason, 
          workflow: { name, triggerKeyword, explanation, nodes: scaledNodes, edges } 
        };

        if (debug) {
          console.log('🧱 [AI] build_new_workflow:normalized', {
            action: decision.action,
            workflowName: decision.workflow.name,
            triggerKeyword: decision.workflow.triggerKeyword,
            explanation: decision.workflow.explanation,
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
      system: dynamicSystemPrompt,
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
    const err = error as {
      name?: string;
      message?: string;
      cause?: unknown;
      statusCode?: number;
    };

    const errorMessage = String(err?.message ?? 'Unknown AI parser error');
    const isToolJsonParseError = /Failed to parse tool call arguments as JSON|tool call arguments|Unexpected token/i.test(errorMessage);
    const isApiCallError = err?.name === 'APICallError' || typeof err?.statusCode === 'number';

    console.error('[AI Parser Error]', {
      name: err?.name,
      statusCode: err?.statusCode,
      message: errorMessage,
      isToolJsonParseError,
      isApiCallError,
      cause: err?.cause,
    });

    return {
      action: 'none',
      reason: 'The AI encountered an error generating this complex workflow. Try breaking your request into smaller steps.',
    };
  }
};