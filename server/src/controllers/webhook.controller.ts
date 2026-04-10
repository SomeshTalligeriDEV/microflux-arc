import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/intentParser';
import { executeWorkflow } from '../core/engine/runner';
import { sendTelegramMessage } from '../core/integrations/telegram';
import { prisma } from '../exports/prisma'; 
import { resolveNFD } from '../core/integrations/algorand/nfd';
import { Prisma } from '@prisma/client';

export const handleTelegramUpdate = async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = String(message.text).trim();

    console.log(`🤖 Received command: ${userText}`);

    // ── /link CODE flow ─────────────────────
    if (userText.toLowerCase().startsWith('/link ')) {
      const linkCode = userText.slice(6).trim();
      if (!linkCode) {
        await sendTelegramMessage(chatId, '❌ Missing link code. Usage: /link MFX-XXXX');
        return res.sendStatus(200);
      }

      const user = await prisma.user.findUnique({ where: { linkCode } });
      if (!user) {
        await sendTelegramMessage(chatId, '❌ Invalid or expired link code. Please generate a new one in MicroFlux.');
        return res.sendStatus(200);
      }

      const nfd = await resolveNFD(user.walletAddress);
      const updated = await prisma.user.update({
        where: { walletAddress: user.walletAddress },
        data: {
          telegramId: String(chatId),
          linkCode: null,
          nfd: nfd ?? user.nfd,
        },
      });

      await sendTelegramMessage(
        chatId,
        `✅ Telegram linked successfully.\nWallet: ${updated.walletAddress}\nNFD: ${updated.nfd ?? 'Not set'}`,
      );
      return res.sendStatus(200);
    }

    // ── Normal agent execution flow ─────────
    const linkedUser = await prisma.user.findUnique({
      where: { telegramId: String(chatId) },
    });

    if (!linkedUser) {
      await sendTelegramMessage(
        chatId,
        '⚠️ This Telegram is not linked yet.\nGenerate a link code in the app and run: /link YOUR_CODE',
      );
      return res.sendStatus(200);
    }

    const intent = await parseIntent(userText, linkedUser.walletAddress);

    if (intent.action === 'execute') {
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: intent.workflowId,
          userWallet: linkedUser.walletAddress,
        },
      });

      if (!workflow) {
        await sendTelegramMessage(chatId, '❌ I could not find that workflow in your account.');
        return res.sendStatus(200);
      }

      console.log(`[AGENT] Executing workflow ${workflow.id} for wallet ${linkedUser.walletAddress}`);

      const result = await executeWorkflow(
        {
          nodes: (workflow.nodes as unknown as any[]) ?? [],
          edges: (workflow.edges as unknown as any[]) ?? [],
        },
        { triggerChatId: chatId },
      );

      const status = result.success ? 'Success' : 'Failed';
      const txLine = result.txIds.length > 0 ? `\nTx: ${result.txIds[0]}` : '';
      await sendTelegramMessage(
        chatId,
        `✅ Workflow Executed\nName: ${workflow.name}\nStatus: ${status}${txLine}`,
      );

      return res.sendStatus(200);
    }

    if (intent.action === 'build') {
      const created = await prisma.workflow.create({
        data: {
          name: intent.workflow.name,
          triggerKeyword: intent.workflow.triggerKeyword,
          nodes: intent.workflow.nodes as unknown as Prisma.InputJsonValue,
          edges: intent.workflow.edges as unknown as Prisma.InputJsonValue,
          isActive: true,
          user: { connect: { walletAddress: linkedUser.walletAddress } },
        },
      });

      await sendTelegramMessage(
        chatId,
        `🧠 I created a new workflow for this request.\nWorkflow ID: ${created.id}\nName: ${created.name}`,
      );

      return res.sendStatus(200);
    }

    await sendTelegramMessage(chatId, `ℹ️ No action taken: ${intent.reason}`);

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