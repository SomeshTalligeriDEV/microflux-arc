import { Router } from 'express';
import { executeWebhookTrigger } from '../controllers/githubWebhook.controller';

const router = Router();

router.post('/github/:workflowId', executeWebhookTrigger);

export default router;
