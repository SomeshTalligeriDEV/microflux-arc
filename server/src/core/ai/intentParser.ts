import { generateObject } from 'ai';
import { z } from 'zod';
import model from '../llmClient';
import { INTENT_SYSTEM_PROMPT } from './prompts';

const IntentSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      // Keep config untyped at schema level for Groq compatibility; normalize later.
      config: z.any(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
    }),
  ),
});

type ParsedWorkflow = z.infer<typeof IntentSchema>;

export const parseIntent = async (userText: string): Promise<ParsedWorkflow> => {
  const { object } = await generateObject({
    model,
    schema: IntentSchema,
    system: INTENT_SYSTEM_PROMPT,
    prompt: userText,
  });

  const normalizedNodes = object.nodes.map((node) => {
    const rawConfig = (node.config && typeof node.config === 'object') ? node.config as Record<string, unknown> : {};

    const normalizedType = node.type === 'SendPaymentNode' ? 'send_payment' : node.type;

    if (normalizedType === 'send_payment') {
      const amount = Number(rawConfig.amount ?? 0);
      return {
        ...node,
        type: 'send_payment',
        config: {
          ...rawConfig,
          amount: amount < 1000 ? amount * 1000000 : amount,
        },
      };
    }

    return {
      ...node,
      type: normalizedType,
      config: rawConfig,
    };
  });

  return {
    nodes: normalizedNodes,
    edges: object.edges,
  };
};
