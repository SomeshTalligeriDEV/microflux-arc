import { Router, Request, Response } from 'express';
import { sendTelegramMessageResult } from '../core/integrations/telegram';
import { prisma } from '../exports/prisma';

const router = Router();

/**
 * Workflow / frontend execution: send a Telegram message via the same bot as the rest of MicroFlux.
 * Recipient: `chatId` if set, otherwise `walletAddress` must be linked (`User.telegramId`).
 */
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const { message, chatId, walletAddress } = req.body ?? {};
    const text = String(message ?? '').trim();
    if (!text) {
      return res.status(400).json({ error: 'message is required' });
    }

    let target: string | null = null;
    if (chatId !== undefined && chatId !== null && String(chatId).trim() !== '') {
      target = String(chatId).trim();
    } else if (walletAddress) {
      const user = await prisma.user.findUnique({
        where: { walletAddress: String(walletAddress) },
        select: { telegramId: true },
      });
      target = user?.telegramId?.trim() ?? null;
    }

    if (!target) {
      return res.status(400).json({
        error:
          'No Telegram recipient: set chatId on the node, or link this wallet in Telegram with /link CODE.',
      });
    }

    const result = await sendTelegramMessageResult(target, `[MicroFlux] ${text}`);
    if (!result.ok) {
      const d = result.description.toLowerCase();
      const hint =
        d.includes('chat not found') || d.includes('chat_id is empty')
          ? 'Telegram rejected this chat id. Open the bot and send /start, then /link again with a fresh code from the app. Ensure the connected wallet matches the linked account. You can also paste your numeric user id (from @userinfobot) into the node chatId field.'
          : undefined;
      return res.status(502).json({
        error: result.description,
        hint,
      });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[NOTIFY TELEGRAM]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Telegram notify failed' });
  }
});

export default router;
