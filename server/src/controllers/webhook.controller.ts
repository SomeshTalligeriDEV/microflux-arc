import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/intentParser';
import { executeWorkflow } from '../core/engine/runner';
import { sendTelegramMessage } from '../core/integrations/telegram';
import { prisma } from '../exports/prisma'; 
import { resolveNFD } from '../core/integrations/algorand/nfd';
import { Prisma } from '@prisma/client';
import { transcribeAudio } from '../services/sarvam.service';

const getTelegramFilePath = async (botToken: string, fileId: string): Promise<string> => {
  const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Telegram getFile failed with status ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; result?: { file_path?: string }; description?: string };
  if (!payload.ok || !payload.result?.file_path) {
    throw new Error(`Telegram getFile returned no file_path: ${payload.description || 'unknown error'}`);
  }

  return payload.result.file_path;
};

const downloadTelegramFile = async (botToken: string, filePath: string): Promise<Buffer> => {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Telegram file download failed with status ${response.status}`);
  }

  const arr = await response.arrayBuffer();
  return Buffer.from(arr);
};

export const handleTelegramUpdate = async (req: Request, res: Response) => {
  try {
    const debug = process.env.MFX_DEBUG_AI === '1' || process.env.MFX_DEBUG_AI === 'true';
    const { message } = req.body;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const hasText = typeof message.text === 'string' && message.text.trim().length > 0;
    const hasVoice = Boolean(message.voice?.file_id);

    if (!hasText && !hasVoice) {
      return res.sendStatus(200);
    }

    let userText = hasText ? String(message.text).trim() : '';

    if (!userText && hasVoice) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.error('Voice transcription skipped: TELEGRAM_BOT_TOKEN is missing');
        await sendTelegramMessage(chatId, 'Could not understand audio');
        return res.sendStatus(200);
      }

      try {
        const fileId = String(message.voice.file_id);
        console.log('[VOICE] Received voice note', { chatId: String(chatId), fileId });
        const filePath = await getTelegramFilePath(token, fileId);
        console.log('[VOICE] Telegram file path resolved', { filePath });
        const audioBuffer = await downloadTelegramFile(token, filePath);
        console.log('[VOICE] Voice file downloaded', { bytes: audioBuffer.length });
        userText = await transcribeAudio(audioBuffer, 'voice.ogg');
        console.log('[VOICE] Transcription complete', { transcript: userText });

        if (debug) {
          console.log('[WEBHOOK DEBUG] voice transcription success', {
            chatId: String(chatId),
            fileId,
            transcript: userText,
          });
        }
      } catch (voiceError) {
        console.error('Voice transcription error:', voiceError);
        await sendTelegramMessage(chatId, 'Could not understand audio');
        return res.sendStatus(200);
      }
    }

    if (!userText) {
      await sendTelegramMessage(chatId, 'Could not understand audio');
      return res.sendStatus(200);
    }

    console.log(`🤖 Received command: ${userText}`);

    // ── /link CODE flow ─────────────────────
    if (userText.toLowerCase().startsWith('/link ')) {
      const linkCode = userText.slice(6).trim().toUpperCase();
      if (!linkCode) {
        await sendTelegramMessage(chatId, '❌ Missing link code. Usage: /link MFX-XXXX');
        return res.sendStatus(200);
      }

      const user = await prisma.user.findUnique({ where: { linkCode } });
      if (!user) {
        await sendTelegramMessage(chatId, '❌ Invalid or expired link code.');
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
        `✅ Wallet successfully linked!\nWallet: ${updated.walletAddress}\nNFD: ${updated.nfd ?? 'Not set'}`,
      );
      return res.sendStatus(200);
    }

    // ── Normal agent execution flow ─────────
    const linkedUser = await prisma.user.findUnique({
      where: { telegramId: String(chatId) },
    });

    if (debug) {
      console.log('[WEBHOOK DEBUG] chat->user lookup', {
        chatId: String(chatId),
        linked: Boolean(linkedUser),
        walletAddress: linkedUser?.walletAddress,
        nfd: linkedUser?.nfd,
      });
    }

    if (!linkedUser) {
      await sendTelegramMessage(
        chatId,
        '⚠️ This Telegram is not linked yet.\nGenerate a link code in the app and run: /link YOUR_CODE',
      );
      return res.sendStatus(200);
    }

    if (userText.toLowerCase() === '/status') {
      const workflows = await prisma.workflow.findMany({
        where: { userWallet: linkedUser.walletAddress },
        select: { name: true },
      });

      const nfdDisplay = linkedUser.nfd || `${linkedUser.walletAddress.slice(0, 8)}...`;
      const wfList = workflows.map((w) => `• ${w.name}`).join('\n') || 'No workflows saved yet.';

      await sendTelegramMessage(
        chatId,
        `👤 **User:** ${nfdDisplay}\n\n📂 **Saved Workflows:**\n${wfList}`,
      );
      return res.sendStatus(200);
    }

    const intent = await parseIntent(userText, linkedUser.walletAddress, 'telegram');

    if (debug) {
      console.log('[WEBHOOK DEBUG] intent decision', intent);
    }

    if (intent.action === 'execute') {
      const fullWorkflow = await prisma.workflow.findFirst({
        where: {
          id: intent.workflowId,
          userWallet: linkedUser.walletAddress,
        },
      });

      if (!fullWorkflow) {
        await sendTelegramMessage(chatId, '❌ I could not find that workflow in your account.');
        return res.sendStatus(200);
      }

      if (debug) {
        console.log('[WEBHOOK DEBUG] execute workflow fetched', {
          workflowId: fullWorkflow.id,
          name: fullWorkflow.name,
          triggerKeyword: fullWorkflow.triggerKeyword,
          nodesType: typeof fullWorkflow.nodes,
          edgesType: typeof fullWorkflow.edges,
        });
      }

      console.log(`[AGENT] Executing workflow ${fullWorkflow.id} for wallet ${linkedUser.walletAddress}`);

      await sendTelegramMessage(
        chatId,
        `⚡️ **Executing: ${fullWorkflow.name}**\nI've started the process on the Algorand blockchain.`,
      );

      const result = await executeWorkflow(
        {
          nodes: (fullWorkflow.nodes as unknown as any[]) ?? [],
          edges: (fullWorkflow.edges as unknown as any[]) ?? [],
        },
        { triggerChatId: chatId },
      );

      const status = result.success ? 'Success' : 'Failed';
      const txLine = result.txIds.length > 0 ? `\nTx: ${result.txIds[0]}` : '';
      await sendTelegramMessage(
        chatId,
        `✅ Workflow Executed\nName: ${fullWorkflow.name}\nStatus: ${status}${txLine}`,
      );

      return res.sendStatus(200);
    }

    if (intent.action === 'build') {
      const created = await prisma.workflow.create({
        data: {
          name: intent.workflow.name,
          triggerKeyword: intent.workflow.triggerKeyword || userText,
          nodes: intent.workflow.nodes as unknown as Prisma.InputJsonValue,
          edges: intent.workflow.edges as unknown as Prisma.InputJsonValue,
          isActive: true,
          user: { connect: { walletAddress: linkedUser.walletAddress } },
        },
      });

      if (debug) {
        console.log('[WEBHOOK DEBUG] build workflow saved', {
          workflowId: created.id,
          name: created.name,
          triggerKeyword: created.triggerKeyword,
          userWallet: created.userWallet,
        });
      }

      await sendTelegramMessage(
        chatId,
        `✨ **New Workflow Created!**\nI've saved "${created.name}" to your dashboard. You can run it anytime by saying "${created.triggerKeyword}".`,
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

