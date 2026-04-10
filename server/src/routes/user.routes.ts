import { Router } from 'express';
import { generateTelegramLink } from '../controllers/user.controller';

const router = Router();

router.post('/generate-link', generateTelegramLink);

export default router;