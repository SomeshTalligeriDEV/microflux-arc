import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/groqClient'; // We'll build this next
import { executeWorkflow } from '../core/engine/runner';
import { sendTelegramMessage } from '../core/integrations/telegram';

export const handleTelegramUpdate = async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = message.text;

    // 1. Brain: Ask Groq to turn the text into a MicroFlux JSON workflow
    const workflow = await parseIntent(userText);

    // 2. Action: Run the generated workflow immediately
    const result = await executeWorkflow(workflow);

    // 3. Feedback: Notify the user on Telegram
    await sendTelegramMessage(chatId, `✅ Intent Parsed & Executed!\nNodes: ${workflow.nodes.length}\nStatus: Success`);

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error);
    res.sendStatus(200); // Always send 200 to Telegram so it stops retrying
  }
};