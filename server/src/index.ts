import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import intentRoutes from './routes/intent.routes';
import { handleTelegramUpdate } from './controllers/webhook.controller';
import userRoutes from './routes/user.routes';
import workflowRoutes from './routes/workflow.routes';
import sheetsRoutes from './routes/sheets.routes';
import executionRoutes from './routes/execution.routes';
import agentRoutes from './routes/agent.routes';
import executeRoutes from './routes/execute.routes';
import notifyRoutes from './routes/notify.routes';
import proxyRoutes from './routes/proxy.routes';
import triggerRoutes from './routes/trigger.routes';
import githubWebhooksRoutes from './routes/githubWebhooks.routes';
import { startWorkflowTimerScheduler } from './core/triggers/timerScheduler';
import { parseIntent as parseIntentFromAi } from './core/ai/intentParser';

import path from 'path';
import fs from 'fs';

// Force dotenv to re-load .env even after tsx's failed attempt
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
  if (missing) {
    // No file is normal on Render/Fly/etc. — secrets come from the host env.
    console.log('[ENV] No .env file — using process.env only');
  } else {
    console.error('[ENV] Failed to load .env:', result.error.message);
  }
} else {
  console.log('[ENV] Loaded', Object.keys(result.parsed || {}).length, 'variables from', envPath);
}

const rawSenderMn = process.env.ALGORAND_SENDER_MNEMONIC?.trim();
if (rawSenderMn) {
  const wc = rawSenderMn.split(/\s+/).filter(Boolean).length;
  if (wc === 24) {
    console.warn(
      '[ENV] ALGORAND_SENDER_MNEMONIC has 24 words — algosdk server signing needs Algorand\'s 25-word passphrase. ' +
        'Pera Universal 24-word phrases will not work. Use Pera Legacy Algo25 (25 words) or a wallet generated with algosdk/AlgoKit.',
    );
  } else if (wc !== 25) {
    console.warn(
      `[ENV] ALGORAND_SENDER_MNEMONIC parsed as ${wc} word(s) (expected 25 for Algorand). Unquoted lines break at spaces — use double quotes around all words.`,
    );
  }
}

/** Merge CORS_ORIGINS (comma-separated) with defaults for local dev + known production frontends. */
function getCorsOrigins(): string[] {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://microflux.vercel.app',
    'https://microflux-frontend.vercel.app',
  ];
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...extra])];
}

/** Any http port on localhost / 127.0.0.1 (Vite, preview, alternate dev servers). */
function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Allow https://*.onrender.com when CORS_ALLOW_RENDER is not "0" (static site + API on Render). */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (isLocalDevOrigin(origin)) return true;
  if (getCorsOrigins().includes(origin)) return true;
  if (process.env.CORS_ALLOW_RENDER === '0') return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && u.hostname.endsWith('.onrender.com');
  } catch {
    return false;
  }
}

const app: Express = express();
const port = process.env.PORT || 8080;

const corsOrigins = getCorsOrigins();
console.log('[CORS] Explicit allowlist:', corsOrigins.join(', ') || '(none beyond dynamic Render rule)');

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (isOriginAllowed(origin)) {
      // Reflect exact Origin string (required when Access-Control-Allow-Credentials is true).
      callback(null, origin);
      return;
    }
    console.warn('[CORS] Blocked origin:', origin);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Microflux-Trigger-Secret'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/** Ensure ACAO is always echoed for allowed origins (some proxies / cors edge cases omit it). */
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && typeof o === 'string' && isOriginAllowed(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'active', message: 'MicroFlux Engine is running.' });
});

/** Minimal response for uptime monitors (Render, UptimeRobot, cron-job.org). Same process as /health. */
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).type('text/plain').send('ok');
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

// Discord webhook + HTTPS proxy (workflow nodes)
app.use('/api/notify', notifyRoutes);
app.use('/api/proxy', proxyRoutes);

// Server-side workflow triggers (webhook path, timer, secured run-by-id)
app.use('/api/triggers', triggerRoutes);

// GitHub repository webhooks → workflow execution (sharedContext from JSON body)
app.use('/api/webhooks', githubWebhooksRoutes);

//agent routes
app.use('/api/agent', agentRoutes);

//execute routes
app.use('/api/execute', executeRoutes);

if (!process.env.MICROFLUX_TRIGGER_SECRET) {
  console.warn(
    '[TRIGGERS] MICROFLUX_TRIGGER_SECRET is unset — /api/triggers/* accepts requests without auth (set secret in production).',
  );
}

pollTelegram();
startWorkflowTimerScheduler();

app.listen(port, () => {
  console.log(`[server]: MicroFlux Engine is running on port ${port}`);
});