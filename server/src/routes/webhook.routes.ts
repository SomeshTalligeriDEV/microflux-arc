import {Router } from 'express';
import { handleTelegramUpdate } from '../controllers/webhook.controller';

const router = Router();


router.post(`/${process.env.TELEGRAM_BOT_TOKEN}`, handleTelegramUpdate);

export default router;