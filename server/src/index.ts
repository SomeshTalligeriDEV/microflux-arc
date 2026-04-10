import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import intentRoutes from './routes/intent.routes';
import { handleTelegramUpdate } from './controllers/webhook.controller';


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
  if (!token) {
    console.warn("⚠️ No TELEGRAM_BOT_TOKEN found, skipping polling.");
    return;
  }

  console.log("📥 Telegram Long Polling started...");

  while (true) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
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

//telegram webhook route 


pollTelegram();

app.listen(port, () => {
  console.log(`[server]: MicroFlux Engine is running at http://localhost:${port}`);
});