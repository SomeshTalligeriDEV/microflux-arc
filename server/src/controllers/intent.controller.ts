import { Request, Response } from 'express';
import { parseIntent as parseIntentFromAi } from '../core/ai/intentParser';


export const parseIntent = async (req: Request, res: Response) => {
  try {
    const { prompt, walletAddress } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    const decision = await parseIntentFromAi(prompt, walletAddress, 'web');
    return res.status(200).json(decision);
  } catch (error) {
    console.error("Intent Parsing Error:", error);
    return res.status(500).json({ error: "Failed to parse intent" });
  }
};