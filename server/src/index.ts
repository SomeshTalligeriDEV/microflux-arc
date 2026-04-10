import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import intentRoutes from './routes/intent.routes';
import { handleTelegramUpdate } from './controllers/webhook.controller';
import userRoutes from './routes/user.routes';
import workflowRoutes from './routes/workflow.routes';


dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'active', message: 'MicroFlux Engine is running.' });
});

//intent parsing route
app.use('/api/intent', intentRoutes);

//telegram 
const pollTelegram = async () => {
  let lastUpdateId = 0;
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
        console.error('[POLL ERROR] Telegram getUpdates returned not ok', {
          errorCode: data.error_code,
          description: data.description,
        });
        continue;
      }

      if (data.result.length > 0) {
        if (debug) {
          console.log('[POLL DEBUG] updates received', {
            count: data.result.length,
            firstUpdateId: data.result[0]?.update_id,
            nextOffset: lastUpdateId + 1,
          });
        }

        for (const update of data.result) {
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


pollTelegram();

app.listen(port, () => {
  console.log(`[server]: MicroFlux Engine is running at http://localhost:${port}`);
});