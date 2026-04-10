import { Router } from 'express';
import { generateTelegramLink, getUserStatus } from '../controllers/user.controller';

const router = Router();

router.post('/generate-link', generateTelegramLink);
router.get('/:walletAddress', getUserStatus);

export default router;