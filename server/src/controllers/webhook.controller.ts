import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/intentParser';
// import { executeWorkflow } from '../core/engine/runner';
import { sendTelegramMessage } from '../core/integrations/telegram';

export const handleTelegramUpdate = async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = message.text;

    console.log(`🤖 Received command: ${userText}`);

    // 1. Brain: Parse Intent
    const workflow = await parseIntent(userText);

    console.log(`✅ Workflow generated with ${workflow.nodes.length} nodes`);

    // 2. Action: Execute (Mocked for now until runner is complete)
    // const result = await executeWorkflow(workflow);

    // 3. Feedback: Reply to the specific user
    await sendTelegramMessage(chatId, `✅ Intent Parsed!\nI built a workflow with ${workflow.nodes.length} nodes for this action.`);

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error);
    res.sendStatus(200); // Always 200 so Telegram doesn't retry infinitely
  }
};