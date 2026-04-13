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

// ── Telegram helpers ─────────────────────────────────────────────────────────

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
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      }),
    });

    if (resp.ok) return true;

    // Fallback without Markdown if it fails (underscore/bracket issues)
    const fallback = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      }),
    });

    return fallback.ok;
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

// ── Quick suggestion keyboards ───────────────────────────────────────────────

const MAIN_SUGGESTIONS = {
  inline_keyboard: [
    [
      { text: '📂 My Workflows', callback_data: 'cmd_workflows' },
      { text: '📊 Status', callback_data: 'cmd_status' },
    ],
    [
      { text: '❓ Help', callback_data: 'cmd_help' },
      { text: '🔗 Switch Wallet', callback_data: 'cmd_unlink' },
    ],
  ],
};

const UNLINKED_SUGGESTIONS = {
  inline_keyboard: [
    [{ text: '🔗 How to Link', callback_data: 'cmd_help' }],
  ],
};

// ── Validation helpers ───────────────────────────────────────────────────────

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

const truncateAddress = (addr: string): string =>
  addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

// ── Execution approval ───────────────────────────────────────────────────────

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
    'Workflow ready! Tap below to sign the transaction in your browser.',
    {
      inline_keyboard: [[
        {
          text: 'Sign with Pera Wallet',
          url: approveUrl,
        },
      ]],
    },
  );

  if (!sentWithButton) {
    const sentAsText = await sendTelegramMessage(
      chatId,
      `Workflow ready! Open this approval link in your browser:\n${approveUrl}`,
    );

    if (!sentAsText) {
      throw new Error('Failed to deliver approval link to Telegram chat');
    }
  }

  return token;
};

// ── Link helper (shared by /link and /start deep link) ───────────────────────

const linkWalletToChat = async (
  chatId: string | number,
  linkCode: string,
): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { linkCode } });
  if (!user) {
    await sendTelegramMessage(chatId, 'Invalid or expired link code. Generate a new one from the web app.');
    return false;
  }

  // If this chatId was previously linked to a DIFFERENT wallet, unlink the old one
  const previouslyLinked = await prisma.user.findUnique({
    where: { telegramId: String(chatId) },
  });
  if (previouslyLinked && previouslyLinked.walletAddress !== user.walletAddress) {
    await prisma.user.update({
      where: { walletAddress: previouslyLinked.walletAddress },
      data: { telegramId: null },
    });
  }

  const nfd = await resolveNFD(user.walletAddress);
  await prisma.user.update({
    where: { walletAddress: user.walletAddress },
    data: {
      telegramId: String(chatId),
      linkCode: null,
      nfd: nfd ?? user.nfd,
    },
  });

  const displayName = nfd || truncateAddress(user.walletAddress);

  await sendTelegramMessageWithMarkup(
    chatId,
    `Wallet linked successfully!\n\nConnected to: ${displayName}\n\nYou can now build and run DeFi workflows right here. Try typing a message like "Send 5 ALGO to ..." or use the buttons below.`,
    MAIN_SUGGESTIONS,
  );

  return true;
};

// ── Messages ─────────────────────────────────────────────────────────────────

const HELP_TEXT = [
  'MicroFlux Bot Commands\n',
  '/start — Start or restart the bot',
  '/link CODE — Link your wallet (e.g. /link MFX-A2B3)',
  '/workflows — List and run your saved workflows',
  '/status — Show linked wallet and workflow count',
  '/unlink — Disconnect this Telegram from your wallet',
  '/help — Show this message\n',
  'You can also type or speak natural language:',
  '  "Create a workflow to swap 10 ALGO to USDC"',
  '  "Run my DCA strategy"',
  '  "Send 5 ALGO to ABC...XYZ"',
].join('\n');

const WELCOME_NEW = [
  'Welcome to MicroFlux!\n',
  'I help you build and run DeFi automations on Algorand — no code needed.\n',
  'To get started:',
  '1. Open the MicroFlux web app',
  '2. Connect your wallet',
  '3. Click "Link Telegram" and paste the code here\n',
  'Or if you arrived via deep link, your wallet is being linked automatically!',
].join('\n');

const WELCOME_BACK = (displayName: string) => [
  `Welcome back, ${displayName}!\n`,
  'What would you like to do?',
].join('\n');

// ── Main handler ─────────────────────────────────────────────────────────────

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
        // Quick-reply suggestion buttons
        if (callbackData === 'cmd_workflows') {
          await answerTelegramCallbackQuery(callbackQueryId);
          await handleWorkflowsCommand(callbackChatId);
          return res.sendStatus(200);
        }

        if (callbackData === 'cmd_status') {
          await answerTelegramCallbackQuery(callbackQueryId);
          await handleStatusCommand(callbackChatId);
          return res.sendStatus(200);
        }

        if (callbackData === 'cmd_help') {
          await answerTelegramCallbackQuery(callbackQueryId);
          await sendTelegramMessage(callbackChatId, HELP_TEXT);
          return res.sendStatus(200);
        }

        if (callbackData === 'cmd_unlink') {
          await answerTelegramCallbackQuery(callbackQueryId);
          await handleUnlinkCommand(callbackChatId);
          return res.sendStatus(200);
        }

        if (callbackData.startsWith('confirm_execute_')) {
          const workflowId = callbackData.slice('confirm_execute_'.length).trim();
          const activeState = getChatState(String(callbackChatId));

          const linkedUser = await prisma.user.findUnique({
            where: { telegramId: String(callbackChatId) },
          });

          if (!linkedUser) {
            clearChatState(String(callbackChatId));
            await sendTelegramMessage(callbackChatId, 'Your Telegram is no longer linked to a wallet. Use /link CODE to reconnect.');
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
            await sendTelegramMessage(callbackChatId, 'Workflow not found. It may have been deleted.');
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

          await sendTelegramMessage(callbackChatId, 'Execution cancelled. Your workflow is still saved for later.');
          await answerTelegramCallbackQuery(callbackQueryId, { text: 'Cancelled' });
          return res.sendStatus(200);
        }

        if (callbackData.startsWith('execute_')) {
          const workflowId = callbackData.slice('execute_'.length).trim();
          const linkedUser = await prisma.user.findUnique({
            where: { telegramId: String(callbackChatId) },
          });

          if (!linkedUser) {
            await sendTelegramMessage(callbackChatId, 'Your Telegram is not linked yet. Use /link CODE to connect your wallet.');
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
            await sendTelegramMessage(callbackChatId, 'Workflow not found. It may have been deleted.');
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
              `Preparing "${workflow.name}".\n\nPlease reply with the destination Algorand wallet address:`,
            );

            await answerTelegramCallbackQuery(callbackQueryId, { text: 'Waiting for address' });
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
        const callbackMessage = callbackError instanceof Error ? callbackError.message : 'Unknown error';
        await sendTelegramMessage(callbackChatId, `Could not process that action: ${callbackMessage}`);
        await answerTelegramCallbackQuery(callbackQueryId, {
          text: 'Failed',
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
        await sendTelegramMessage(chatId, 'Voice processing is not available right now.');
        return res.sendStatus(200);
      }

      try {
        const fileId = String(message.voice.file_id);
        console.log('[VOICE] Received voice note', { chatId: String(chatId), fileId });
        const filePath = await getTelegramFilePath(token, fileId);
        const audioBuffer = await downloadTelegramFile(token, filePath);
        userText = await transcribeAudio(audioBuffer, 'voice.ogg');
        console.log('[VOICE] Transcription:', userText);
      } catch (voiceError) {
        console.error('Voice transcription error:', voiceError);
        await sendTelegramMessage(chatId, 'Could not process your voice message. Try typing instead.');
        return res.sendStatus(200);
      }
    }

    if (!userText) {
      await sendTelegramMessage(chatId, 'Could not understand that. Try typing your request.');
      return res.sendStatus(200);
    }

    // ── Conversational state interception (slot filling) ──────────────
    const activeState = getChatState(String(chatId));
    if (activeState && activeState.status === 'AWAITING_INPUT') {
      if (activeState.expectedType === 'WALLET_ADDRESS') {
        if (!hasText || !isLikelyAlgorandAddress(userText)) {
          await sendTelegramMessage(
            chatId,
            "That doesn't look like a valid Algorand address (58 characters, A-Z and 2-7). Please try again.",
          );
          return res.sendStatus(200);
        }

        const workflow = await prisma.workflow.findUnique({
          where: { id: activeState.workflowId },
          select: { id: true, nodes: true },
        });

        if (!workflow) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, 'Workflow not found. Use /workflows to pick another one.');
          return res.sendStatus(200);
        }

        const rawNodes = Array.isArray(workflow.nodes) ? [...(workflow.nodes as any[])] : [];
        const sendPaymentIndex = rawNodes.findIndex((node) => {
          const type = String((node as any)?.type ?? '').toLowerCase();
          return type === 'send_payment' || type.includes('payment');
        });

        if (sendPaymentIndex === -1) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, 'No payment node found in this workflow. Edit it in the web builder.');
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

        await sendTelegramMessageWithMarkup(
          chatId,
          `Address set to ${truncateAddress(userText)}. Ready to execute?`,
          {
            inline_keyboard: [[
              { text: 'Execute Now', callback_data: `confirm_execute_${activeState.workflowId}` },
              { text: 'Cancel', callback_data: `cancel_execute_${activeState.workflowId}` },
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
          await sendTelegramMessageWithMarkup(
            chatId,
            'Execute this workflow?',
            {
              inline_keyboard: [[
                { text: 'Execute Now', callback_data: `confirm_execute_${activeState.workflowId}` },
                { text: 'Cancel', callback_data: `cancel_execute_${activeState.workflowId}` },
              ]],
            },
          );
          return res.sendStatus(200);
        }

        if (isNo) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, 'Execution cancelled. Workflow is still saved.');
          return res.sendStatus(200);
        }

        const linkedUser = await prisma.user.findUnique({
          where: { telegramId: String(chatId) },
        });

        if (!linkedUser) {
          clearChatState(String(chatId));
          await sendTelegramMessage(chatId, 'Your Telegram is no longer linked. Use /link CODE to reconnect.');
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
          await sendTelegramMessage(chatId, 'Workflow not found. It may have been deleted.');
          return res.sendStatus(200);
        }

        await sendExecutionApprovalLink(chatId, fullWorkflow.id, activeState.collectedData || {});
        clearChatState(String(chatId));
        return res.sendStatus(200);
      }
    }

    console.log(`[BOT] ${chatId}: ${userText}`);

    // ── /start — with optional deep link payload ─────────────────────
    if (userText === '/start' || userText.toLowerCase().startsWith('/start ')) {
      const payload = userText.slice(6).trim().toUpperCase();

      // Deep link: /start MFX-XXXX — auto-link
      if (payload && payload.startsWith('MFX-')) {
        const linked = await linkWalletToChat(chatId, payload);
        if (!linked) {
          await sendTelegramMessageWithMarkup(
            chatId,
            WELCOME_NEW,
            UNLINKED_SUGGESTIONS,
          );
        }
        return res.sendStatus(200);
      }

      const linkedUser = await prisma.user.findUnique({
        where: { telegramId: String(chatId) },
      });

      if (!linkedUser) {
        await sendTelegramMessageWithMarkup(
          chatId,
          WELCOME_NEW,
          UNLINKED_SUGGESTIONS,
        );
        return res.sendStatus(200);
      }

      const displayName = linkedUser.nfd || truncateAddress(linkedUser.walletAddress);
      await sendTelegramMessageWithMarkup(
        chatId,
        WELCOME_BACK(displayName),
        MAIN_SUGGESTIONS,
      );
      return res.sendStatus(200);
    }

    // ── /link CODE ─────────────────────
    if (userText.toLowerCase().startsWith('/link ')) {
      const linkCode = userText.slice(6).trim().toUpperCase();
      if (!linkCode) {
        await sendTelegramMessage(chatId, 'Usage: /link MFX-XXXX\n\nGet a code from the web app > Link Telegram.');
        return res.sendStatus(200);
      }

      await linkWalletToChat(chatId, linkCode);
      return res.sendStatus(200);
    }

    // ── /help ─────────────────────
    if (userText.toLowerCase() === '/help') {
      await sendTelegramMessage(chatId, HELP_TEXT);
      return res.sendStatus(200);
    }

    // ── /unlink ─────────────────────
    if (userText.toLowerCase() === '/unlink') {
      await handleUnlinkCommand(chatId);
      return res.sendStatus(200);
    }

    // ── Require linked wallet for everything below ───────────────────
    const linkedUser = await prisma.user.findUnique({
      where: { telegramId: String(chatId) },
    });

    if (debug) {
      console.log('[WEBHOOK DEBUG] chat->user lookup', {
        chatId: String(chatId),
        linked: Boolean(linkedUser),
        walletAddress: linkedUser?.walletAddress,
      });
    }

    if (!linkedUser) {
      await sendTelegramMessageWithMarkup(
        chatId,
        'Your Telegram is not linked to a wallet yet.\n\nGenerate a link code in the web app and send: /link YOUR_CODE',
        UNLINKED_SUGGESTIONS,
      );
      return res.sendStatus(200);
    }

    // ── /workflows ─────────────────────
    if (userText.toLowerCase() === '/workflows') {
      await handleWorkflowsCommand(chatId);
      return res.sendStatus(200);
    }

    // ── /status ─────────────────────
    if (userText.toLowerCase() === '/status') {
      await handleStatusCommand(chatId);
      return res.sendStatus(200);
    }

    // ── Unknown slash command ─────────────────────
    if (userText.startsWith('/')) {
      await sendTelegramMessage(
        chatId,
        'Unknown command. Type /help to see available commands.',
      );
      return res.sendStatus(200);
    }

    // ── Natural language → AI intent ─────────────────────
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
        await sendTelegramMessage(chatId, 'Could not find that workflow in your account.');
        return res.sendStatus(200);
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
          `Preparing "${fullWorkflow.name}".\n\nPlease reply with the destination Algorand wallet address:`,
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

      await sendTelegramMessageWithMarkup(
        chatId,
        `Workflow "${created.name}" created and saved!\n\nYou can run it anytime by saying "${created.triggerKeyword}" or using /workflows.`,
        {
          inline_keyboard: [[
            { text: 'Run Now', callback_data: `execute_${created.id}` },
            { text: 'View All Workflows', callback_data: 'cmd_workflows' },
          ]],
        },
      );

      return res.sendStatus(200);
    }

    await sendTelegramMessageWithMarkup(
      chatId,
      `${intent.reason || 'No action was taken.'}`,
      MAIN_SUGGESTIONS,
    );

    res.sendStatus(200);
  } catch (error) {
    const err = error as Error;
    console.error('Webhook Error:', {
      message: err?.message || String(error),
      stack: err?.stack,
      updateType: req.body?.callback_query ? 'callback_query' : req.body?.message ? 'message' : 'unknown',
      text: req.body?.message?.text,
      callbackData: req.body?.callback_query?.data,
      chatId: req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id,
    });
    const chatId = req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id;
    if (chatId) {
      const msg = err?.message || String(error);
      if (msg.includes('Invalid receiver address')) {
        await sendTelegramMessage(chatId, 'Invalid wallet address. Please send a valid 58-character Algorand address.');
      } else if (msg.includes('ALGORAND_SENDER_MNEMONIC') || msg.includes('mnemonic')) {
        await sendTelegramMessage(chatId, 'Server signer not configured. Contact admin.');
      } else {
        await sendTelegramMessage(chatId, 'Something went wrong. Try /help or /workflows.');
      }
    }
    res.sendStatus(200);
  }
};

// ── Command handlers (reused by both text commands and callback buttons) ─────

async function handleWorkflowsCommand(chatId: string | number): Promise<void> {
  const linkedUser = await prisma.user.findUnique({
    where: { telegramId: String(chatId) },
  });

  if (!linkedUser) {
    await sendTelegramMessageWithMarkup(
      chatId,
      'Your Telegram is not linked to a wallet. Use /link CODE first.',
      UNLINKED_SUGGESTIONS,
    );
    return;
  }

  const workflows = await prisma.workflow.findMany({
    where: { userWallet: linkedUser.walletAddress },
    select: { id: true, name: true },
    orderBy: { id: 'desc' },
  });

  if (workflows.length === 0) {
    await sendTelegramMessage(
      chatId,
      'No saved workflows yet.\n\nTry typing something like "Create a workflow to swap 10 ALGO to USDC" to build one.',
    );
    return;
  }

  const keyboard = {
    inline_keyboard: workflows.map((w: { id: string; name: string }) => ([
      {
        text: w.name,
        callback_data: `execute_${w.id}`,
      },
    ])),
  };

  await sendTelegramMessageWithMarkup(
    chatId,
    `You have ${workflows.length} workflow(s). Tap one to run it:`,
    keyboard,
  );
}

async function handleStatusCommand(chatId: string | number): Promise<void> {
  const linkedUser = await prisma.user.findUnique({
    where: { telegramId: String(chatId) },
  });

  if (!linkedUser) {
    await sendTelegramMessageWithMarkup(
      chatId,
      'No wallet linked to this Telegram account.',
      UNLINKED_SUGGESTIONS,
    );
    return;
  }

  const workflows = await prisma.workflow.findMany({
    where: { userWallet: linkedUser.walletAddress },
    select: { name: true },
  });

  const displayName = linkedUser.nfd || truncateAddress(linkedUser.walletAddress);
  const wfList = workflows.length > 0
    ? workflows.map((w: { name: string }) => `  - ${w.name}`).join('\n')
    : '  None yet';

  await sendTelegramMessageWithMarkup(
    chatId,
    `Account: ${displayName}\nWallet: ${truncateAddress(linkedUser.walletAddress)}\nWorkflows: ${workflows.length}\n\n${wfList}`,
    MAIN_SUGGESTIONS,
  );
}

async function handleUnlinkCommand(chatId: string | number): Promise<void> {
  const linkedUser = await prisma.user.findUnique({
    where: { telegramId: String(chatId) },
  });

  if (!linkedUser) {
    await sendTelegramMessage(chatId, 'This Telegram is not linked to any wallet.');
    return;
  }

  await prisma.user.update({
    where: { walletAddress: linkedUser.walletAddress },
    data: { telegramId: null },
  });

  clearChatState(String(chatId));

  await sendTelegramMessageWithMarkup(
    chatId,
    `Wallet ${truncateAddress(linkedUser.walletAddress)} has been unlinked.\n\nTo connect a different wallet, generate a new link code in the web app and send /link CODE.`,
    UNLINKED_SUGGESTIONS,
  );
}
