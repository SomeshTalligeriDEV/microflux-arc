import { Request, Response } from 'express';
import { parseIntent } from '../core/ai/intentParser';
import { sendTelegramMessage } from '../core/integrations/telegram';
import { prisma } from '../exports/prisma'; 
import { resolveNFD } from '../core/integrations/algorand/nfd';
import { Prisma } from '@prisma/client';
import { transcribeAudio } from '../services/sarvam.service';
import { clearChatState, getChatState, setChatState } from '../core/state/chatState';
import { setPendingExecution } from '../core/state/executionStore';
import algosdk from 'algosdk';

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

const hasMissingOrInvalidSendPaymentReceiver = (nodes: unknown): boolean => {
  if (!Array.isArray(nodes)) return false;

  return nodes.some((node) => {
    const candidate = node as {
      type?: unknown;
      config?: { receiver?: unknown };
      data?: { config?: { receiver?: unknown } };
    };

    const nodeType = String(candidate?.type ?? '').toLowerCase();
    const isPaymentNode = nodeType === 'send_payment' || nodeType === 'sendpaymentnode' || nodeType.includes('payment');
    if (!isPaymentNode) return false;

    const receiver = candidate?.config?.receiver ?? candidate?.data?.config?.receiver;
    const receiverStr = String(receiver ?? '').trim();

    if (!receiverStr || receiverStr === 'ALGO_ADDRESS_PLACEHOLDER') return true;
    return !algosdk.isValidAddress(receiverStr);
  });
};

const isLikelyAlgorandAddress = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length === 58 && /^[A-Z2-7]+$/i.test(trimmed);
};

const getApproveBaseUrl = (): string => {
  return (process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
};

const sendExecutionApprovalLink = async (
  chatId: string | number,
  workflowId: string,
  params: Record<string, unknown> = {},
): Promise<string> => {
  const token = crypto.randomUUID();
  const approveUrl = `${getApproveBaseUrl()}/approve/${encodeURIComponent(token)}`;

  setPendingExecution({
    token,
    chatId: String(chatId),
    workflowId,
    params,
  });

  const sentWithButton = await sendTelegramMessageWithMarkup(
    chatId,
    '⚡ Workflow ready! Click below to sign the transaction in your browser.',
    {
      inline_keyboard: [[
        {
          text: '⚡ Open Pera Approval',
          url: approveUrl,
        },
      ]],
    },
  );

  if (!sentWithButton) {
    // Fallback path in case Telegram rejects inline keyboard URL formatting.
    const sentAsText = await sendTelegramMessage(
      chatId,
      `⚡ Workflow ready! Open this approval link in your browser:\n${approveUrl}`,
    );

    if (!sentAsText) {
      throw new Error('Failed to deliver approval link to Telegram chat');
    }
  }

  return token;
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
        if (callbackData.startsWith('confirm_execute_')) {
          const workflowId = callbackData.slice('confirm_execute_'.length).trim();
          const activeState = getChatState(String(callbackChatId));

          const linkedUser = await prisma.user.findUnique({
            where: { telegramId: String(callbackChatId) },
          });

          if (!linkedUser) {
            clearChatState(String(callbackChatId));
            await sendTelegramMessage(callbackChatId, '⚠️ This Telegram is not linked anymore. Please run /start and relink.');
            await answerTelegramCallbackQuery(callbackQueryId, {
              text: 'Account not linked',
              showAlert: true,
            });
            return res.sendStatus(200);
          }

          const fullWorkflow = await prisma.workflow.findFirst({
            where: {
              id: workflowId,
              userWallet: linkedUser.walletAddress,
            },
          });

          if (!fullWorkflow) {
            clearChatState(String(callbackChatId));
            await sendTelegramMessage(callbackChatId, '❌ Workflow not found for your account.');
            await answerTelegramCallbackQuery(callbackQueryId, {
              text: 'Workflow not found',
              showAlert: true,
            });
            return res.sendStatus(200);
          }

          await sendExecutionApprovalLink(
            callbackChatId,
            fullWorkflow.id,
            activeState?.expectedType === 'EXECUTION_CONFIRMATION' && activeState.workflowId === workflowId
              ? (activeState.collectedData || {})
              : {},
          );

          if (activeState?.expectedType === 'EXECUTION_CONFIRMATION' && activeState.workflowId === workflowId) {
            clearChatState(String(callbackChatId));
          }
          await answerTelegramCallbackQuery(callbackQueryId, { text: 'Open approval link' });
          return res.sendStatus(200);
        }

        if (callbackData.startsWith('cancel_execute_')) {
          const workflowId = callbackData.slice('cancel_execute_'.length).trim();
          const activeState = getChatState(String(callbackChatId));

          if (activeState && activeState.expectedType === 'EXECUTION_CONFIRMATION' && activeState.workflowId === workflowId) {
            clearChatState(String(callbackChatId));
          }

          await sendTelegramMessage(callbackChatId, '✅ Execution cancelled. Workflow stays saved and ready for later.');
          await answerTelegramCallbackQuery(callbackQueryId, { text: 'Execution cancelled' });
          return res.sendStatus(200);
        }

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
            select: { id: true, name: true, nodes: true },
          });

          if (!workflow) {
            await sendTelegramMessage(callbackChatId, '❌ Workflow not found for your account.');
            await answerTelegramCallbackQuery(callbackQueryId, {
              text: 'Workflow not found',
              showAlert: true,
            });
            return res.sendStatus(200);
          }

          if (hasMissingOrInvalidSendPaymentReceiver(workflow.nodes)) {
            setChatState(String(callbackChatId), {
              status: 'AWAITING_INPUT',
              expectedType: 'WALLET_ADDRESS',
              workflowId: workflow.id,
              collectedData: {},
            });

            await sendTelegramMessage(
              callbackChatId,
              `⚡ Preparing to execute ${workflow.name}.\n\nPlease reply with the destination Algorand wallet address:`,
            );

            await answerTelegramCallbackQuery(callbackQueryId, { text: 'Waiting for address input' });
            return res.sendStatus(200);
          }

          await sendExecutionApprovalLink(callbackChatId, workflow.id, {});

          await answerTelegramCallbackQuery(callbackQueryId, { text: 'Open approval link' });
          return res.sendStatus(200);
        }

        await answerTelegramCallbackQuery(callbackQueryId, { text: 'Unsupported action' });
        return res.sendStatus(200);
      } catch (callbackError) {
        console.error('Callback query handler error:', callbackError);
        const callbackMessage = callbackError instanceof Error ? callbackError.message : 'Unknown callback handler error';
        await sendTelegramMessage(callbackChatId, `❌ Could not process button action: ${callbackMessage}`);
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

    // ── Conversational state interception (slot filling) ──────────────
    const activeState = getChatState(String(chatId));
    if (activeState && activeState.status === 'AWAITING_INPUT') {
      if (activeState.expectedType === 'WALLET_ADDRESS') {
        if (!hasText || !isLikelyAlgorandAddress(userText)) {
          await sendTelegramMessage(
            chatId,
            "❌ That doesn't look like a valid Algorand address. Please try again.",
          );
          return res.sendStatus(200);
        }

        const workflow = await prisma.workflow.findUnique({
          where: { id: activeState.workflowId },
          select: { id: true, nodes: true },
        });

        if (!workflow) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, '❌ Could not find that workflow anymore. Please try again from /workflows.');
          return res.sendStatus(200);
        }

        const rawNodes = Array.isArray(workflow.nodes) ? [...(workflow.nodes as any[])] : [];
        const sendPaymentIndex = rawNodes.findIndex((node) => {
          const type = String((node as any)?.type ?? '').toLowerCase();
          return type === 'send_payment' || type.includes('payment');
        });

        if (sendPaymentIndex === -1) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, '❌ No payment node found to ingest an address. Please edit the workflow and try again.');
          return res.sendStatus(200);
        }

        const targetNode = { ...(rawNodes[sendPaymentIndex] as any) };
        const targetConfig = targetNode?.config && typeof targetNode.config === 'object'
          ? { ...targetNode.config }
          : {};

        targetConfig.receiver = userText;
        targetNode.config = targetConfig;
        rawNodes[sendPaymentIndex] = targetNode;

        await prisma.workflow.update({
          where: { id: workflow.id },
          data: {
            nodes: rawNodes as unknown as Prisma.InputJsonValue,
          },
        });

        setChatState(String(chatId), {
          status: 'AWAITING_INPUT',
          expectedType: 'EXECUTION_CONFIRMATION',
          workflowId: activeState.workflowId,
          collectedData: {
            ...(activeState.collectedData || {}),
            receiver: userText,
          },
        });

        await sendTelegramMessage(
          chatId,
          '✅ Address ingested! Workflow updated and ready to execute.',
        );

        await sendTelegramMessageWithMarkup(
          chatId,
          'Do you want to execute this transaction now?',
          {
            inline_keyboard: [[
              { text: '✅ Yes Execute', callback_data: `confirm_execute_${activeState.workflowId}` },
              { text: '❌ No Cancel', callback_data: `cancel_execute_${activeState.workflowId}` },
            ]],
          },
        );
        return res.sendStatus(200);
      }

      if (activeState.expectedType === 'EXECUTION_CONFIRMATION') {
        const normalized = userText.trim().toLowerCase();
        const isYes = ['yes', 'y', 'execute', 'run', 'confirm'].includes(normalized);
        const isNo = ['no', 'n', 'cancel', 'stop'].includes(normalized);

        if (!isYes && !isNo) {
          await sendTelegramMessage(chatId, 'Please reply with YES or NO.');
          return res.sendStatus(200);
        }

        if (isNo) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, '✅ Execution cancelled. Workflow stays saved and ready for later.');
          return res.sendStatus(200);
        }

        const linkedUser = await prisma.user.findUnique({
          where: { telegramId: String(chatId) },
        });

        if (!linkedUser) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, '⚠️ This Telegram is not linked anymore. Please run /start and relink.');
          return res.sendStatus(200);
        }

        const fullWorkflow = await prisma.workflow.findFirst({
          where: {
            id: activeState.workflowId,
            userWallet: linkedUser.walletAddress,
          },
        });

        if (!fullWorkflow) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, '❌ Workflow not found for your account.');
          return res.sendStatus(200);
        }

        await sendExecutionApprovalLink(chatId, fullWorkflow.id, activeState.collectedData || {});
        clearChatState(String(chatId));
        return res.sendStatus(200);
      }
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
        console.log('[WEBHOOK DEBUG] execute workflow bridged', {
          workflowId: fullWorkflow.id,
          name: fullWorkflow.name,
          triggerKeyword: fullWorkflow.triggerKeyword,
          nodesType: typeof fullWorkflow.nodes,
          edgesType: typeof fullWorkflow.edges,
        });
      }

      if (hasMissingOrInvalidSendPaymentReceiver(fullWorkflow.nodes)) {
        setChatState(String(chatId), {
          status: 'AWAITING_INPUT',
          expectedType: 'WALLET_ADDRESS',
          workflowId: fullWorkflow.id,
          collectedData: {},
        });

        await sendTelegramMessage(
          chatId,
          `⚡ Preparing to execute ${fullWorkflow.name}.\n\nPlease reply with the destination Algorand wallet address:`,
        );

        return res.sendStatus(200);
      }

      await sendExecutionApprovalLink(chatId, fullWorkflow.id, {});

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

