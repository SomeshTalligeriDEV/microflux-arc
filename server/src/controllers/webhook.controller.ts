import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/intentParser';
import { executeWorkflow } from '../core/engine/runner';
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

    // 2. Action: Execute workflow
    const result = await executeWorkflow(workflow, { triggerChatId: chatId });

    // 3. Feedback: Reply to the specific user
    const status = result.success ? 'Success' : 'Failed';
    const txLine = result.txIds.length > 0 ? `\nTx: ${result.txIds[0]}` : '';
    await sendTelegramMessage(
      chatId,
      `✅ Intent Parsed & Executed!\nNodes: ${workflow.nodes.length}\nStatus: ${status}${txLine}`,
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error);
    const chatId = req.body?.message?.chat?.id;
    if (chatId) {
      await sendTelegramMessage(chatId, '❌ Execution failed. Check receiver address and server signer configuration.');
    }
    res.sendStatus(200); // Always 200 so Telegram doesn't retry infinitely
  }
};