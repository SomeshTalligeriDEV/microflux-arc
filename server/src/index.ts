import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import intentRoutes from './routes/intent.routes';
import { handleTelegramUpdate } from './controllers/webhook.controller';
import userRoutes from './routes/user.routes';
import workflowRoutes from './routes/workflow.routes';
import sheetsRoutes from './routes/sheets.routes';
import executionRoutes from './routes/execution.routes';
import { parseIntent as parseIntentFromAi } from './core/ai/intentParser';

import path from 'path';
import fs from 'fs';

// Force dotenv to re-load .env even after tsx's failed attempt
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.error('[ENV] Failed to load .env:', result.error.message);
} else {
  console.log('[ENV] Loaded', Object.keys(result.parsed || {}).length, 'variables from', envPath);
}


const app: Express = express();
const port = process.env.PORT || 8080;

app.use(cors({
  origin: ['http://localhost:5173', 'https://microflux-frontend.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'active', message: 'MicroFlux Engine is running.' });
});

//intent parsing route
app.use('/api/intent', intentRoutes);

// AI processing route for web UI
app.post('/api/ai/process', async (req: Request, res: Response) => {
  try {
    const { walletAddress, prompt } = req.body;

    if (!walletAddress || !prompt) {
      return res.status(400).json({ error: 'walletAddress and prompt are required' });
    }

    const result = await parseIntentFromAi(String(prompt), String(walletAddress), 'web');
    return res.status(200).json(result);
  } catch (error) {
    console.error('AI process route error:', error);
    return res.status(500).json({ error: 'Failed to process AI intent' });
  }
});

//telegram 
const pollTelegram = async () => {
  let lastUpdateId = 0;
  let conflictSuppressed = false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const debug = process.env.MFX_DEBUG_AI === '1' || process.env.MFX_DEBUG_AI === 'true';
  if (!token) {
    console.warn("⚠️ No TELEGRAM_BOT_TOKEN found, skipping polling.");
    return;
  }

  console.log("📥 Telegram Long Polling started...");
  if (debug) {
    console.log('[POLL DEBUG] MFX_DEBUG_AI is enabled for Telegram polling');
  }

  while (true) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data = await response.json();

      if (!data.ok) {
        if (data.error_code === 409) {
          if (!conflictSuppressed) {
            console.warn('[POLL WARN] Telegram 409 conflict: another getUpdates consumer is active for this bot token. Stop other bot instances/webhook workers using the same token.');
          }
          conflictSuppressed = true;
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        conflictSuppressed = false;
        console.error('[POLL ERROR] Telegram getUpdates returned not ok', {
          errorCode: data.error_code,
          description: data.description,
        });
        continue;
      }

      conflictSuppressed = false;

      if (data.result.length > 0) {
        console.log(`[POLL] Received ${data.result.length} Telegram update(s)`);
        if (debug) {
          console.log('[POLL DEBUG] updates received', {
            count: data.result.length,
            firstUpdateId: data.result[0]?.update_id,
            nextOffset: lastUpdateId + 1,
          });
        }

        for (const update of data.result) {
          const hasText = Boolean(update.message?.text);
          const hasVoice = Boolean(update.message?.voice?.file_id);
          console.log('[POLL] Dispatching update', {
            updateId: update.update_id,
            chatId: update.message?.chat?.id,
            hasText,
            hasVoice,
          });

          if (debug) {
            console.log('[POLL DEBUG] dispatching update', {
              updateId: update.update_id,
              hasMessage: Boolean(update.message),
              text: update.message?.text,
              chatId: update.message?.chat?.id,
            });
          }

          // Manually call your controller logic
          await handleTelegramUpdate({ body: update } as any, { sendStatus: () => {} } as any);
          lastUpdateId = update.update_id;
        }
      }
    } catch (err) {
      console.error("Polling error:", err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

//user routes
app.use('/api/user', userRoutes);

//workflow routes
app.use('/api/workflows', workflowRoutes);

//sheets routes
app.use('/api/sheets', sheetsRoutes);

//execution routes
app.use('/api/execution', executionRoutes);

pollTelegram();

app.listen(port, () => {
  console.log(`[server]: MicroFlux Engine is running at http://localhost:${port}`);
});