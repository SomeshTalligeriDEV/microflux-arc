import { Request, Response } from 'express';
import { generateObject } from 'ai';
import model from '../core/llmClient';
import { INTENT_SYSTEM_PROMPT } from '../core/ai/prompts';
import { z } from 'zod';


const WorkflowSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum([
      'TimerNode', 
      'PriceMonitorNode', 
      'ComparatorNode', 
      'SwapTokenNode', 
      'SendPaymentNode', 
      'PortfolioBalanceNode', 
      'SendTelegramNode'
    ]),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.string(), z.any())
  })),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string()
  }))
});


export const parseIntent = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // This is the "Magic" step: English -> JSON Graph
    const { object } = await generateObject({
      model: model,
      schema: WorkflowSchema,
      system: INTENT_SYSTEM_PROMPT,
      prompt: prompt,
    });

    return res.status(200).json(object);
  } catch (error) {
    console.error("Intent Parsing Error:", error);
    return res.status(500).json({ error: "Failed to parse intent" });
  }
};