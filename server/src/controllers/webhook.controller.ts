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

const sendTelegramMessageWithMarkup = async (
  chatId: string | number,
  text: string,
  replyMarkup: Record<string, unknown>,
): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Telegram sendMessage with markup failed:', error);
    return false;
  }
};

const answerTelegramCallbackQuery = async (
  callbackQueryId: string,
  options?: { text?: string; showAlert?: boolean },
): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: options?.text,
        show_alert: options?.showAlert ?? false,
      }),
    });
  } catch (error) {
    console.error('Telegram answerCallbackQuery failed:', error);
  }
};

export const handleTelegramUpdate = async (req: Request, res: Response) => {
  try {
    const debug = process.env.MFX_DEBUG_AI === '1' || process.env.MFX_DEBUG_AI === 'true';
    const update = req.body as {
      message?: any;
      callback_query?: {
        id: string;
        data?: string;
        from?: { id?: number };
        message?: { chat?: { id?: number } };
      };
    };
    const { message, callback_query: callbackQuery } = update;

    // ── Callback query handling (inline keyboard clicks) ─────────────────
    if (callbackQuery) {
      const callbackQueryId = String(callbackQuery.id || '').trim();
      const callbackData = String(callbackQuery.data || '').trim();
      const callbackChatId = callbackQuery.message?.chat?.id ?? callbackQuery.from?.id;

      if (!callbackQueryId || !callbackChatId) {
        return res.sendStatus(200);
      }

      try {
        if (callbackData.startsWith('execute_')) {
          const workflowId = callbackData.slice('execute_'.length).trim();
          const linkedUser = await prisma.user.findUnique({
            where: { telegramId: String(callbackChatId) },
          });

          if (!linkedUser) {
            await sendTelegramMessage(
              callbackChatId,
              '⚠️ This Telegram is not linked yet. Use /start for linking instructions.',
            );
            await answerTelegramCallbackQuery(callbackQueryId, {
              text: 'Account not linked',
              showAlert: true,
            });
            return res.sendStatus(200);
          }

          const workflow = await prisma.workflow.findFirst({
            where: {
              id: workflowId,
              userWallet: linkedUser.walletAddress,
            },
            select: { id: true, name: true },
          });

          if (!workflow) {
            await sendTelegramMessage(callbackChatId, '❌ Workflow not found for your account.');
            await answerTelegramCallbackQuery(callbackQueryId, {
              text: 'Workflow not found',
              showAlert: true,
            });
            return res.sendStatus(200);
          }

          await sendTelegramMessage(callbackChatId, `⚡ Executing workflow: ${workflow.name}...`);
          // TODO: Trigger runner.ts here

          await answerTelegramCallbackQuery(callbackQueryId, { text: 'Execution started' });
          return res.sendStatus(200);
        }

        await answerTelegramCallbackQuery(callbackQueryId, { text: 'Unsupported action' });
        return res.sendStatus(200);
      } catch (callbackError) {
        console.error('Callback query handler error:', callbackError);
        await answerTelegramCallbackQuery(callbackQueryId, {
          text: 'Failed to process action',
          showAlert: true,
        });
        return res.sendStatus(200);
      }
    }

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

    // ── /start onboarding flow ─────────────────────
    if (userText === '/start') {
      const linkedUser = await prisma.user.findUnique({
        where: { telegramId: String(chatId) },
      });

      if (!linkedUser) {
        await sendTelegramMessage(
          chatId,
          "👋 Welcome to MicroFlux AI!\n\nI am your autonomous Algorand DeFi agent. To get started, please go to the Web App, click 'Link Telegram', and paste the code here (e.g., /link MFX-1234).",
        );
        return res.sendStatus(200);
      }

      await sendTelegramMessage(
        chatId,
        '👋 Welcome back! Send me a voice note to build a workflow, or type /workflows to see your saved automations.',
      );
      return res.sendStatus(200);
    }

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
        `✅ Wallet successfully linked!\n\nYour bot is now connected to ${updated.walletAddress}. Try sending a voice note like: 'Create a workflow to buy 5 ALGO'.`,
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

    // ── /workflows command with inline keyboard ─────────────────────
    if (userText.toLowerCase() === '/workflows') {
      const workflows = await prisma.workflow.findMany({
        where: { userWallet: linkedUser.walletAddress },
        select: { id: true, name: true },
        orderBy: { id: 'desc' },
      });

      if (workflows.length === 0) {
        await sendTelegramMessage(
          chatId,
          "You don't have any saved workflows yet! Send me a voice note describing what you want to build.",
        );
        return res.sendStatus(200);
      }

      const keyboard = {
        inline_keyboard: workflows.map((workflow) => ([
          {
            text: workflow.name,
            callback_data: `execute_${workflow.id}`,
          },
        ])),
      };

      await sendTelegramMessageWithMarkup(
        chatId,
        'Here are your saved workflows. Click one to run it:',
        keyboard,
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

    // Never route unknown slash commands into AI intent parsing.
    if (userText.startsWith('/')) {
      await sendTelegramMessage(
        chatId,
        'Unknown command. Try /start, /workflows, or send a voice note to build a workflow.',
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
    const chatId = req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendTelegramMessage(chatId, '❌ Execution failed. Check receiver address and server signer configuration.');
    }
    res.sendStatus(200); // Always 200 so Telegram doesn't retry infinitely
  }
};

