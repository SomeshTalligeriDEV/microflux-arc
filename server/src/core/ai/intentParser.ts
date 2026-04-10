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
      config: z.record(z.string(), z.any()),
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
    if (node.type === 'send_payment') {
      const amount = Number(node.config.amount ?? 0);
      return {
        ...node,
        config: {
          ...node.config,
          amount: amount < 1000 ? amount * 1000000 : amount,
        },
      };
    }
    return node;
  });

  return {
    nodes: normalizedNodes,
    edges: object.edges,
  };
};
