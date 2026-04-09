import { Router } from 'express';
import { parseIntent } from '../controllers/intent.controller';

const router = Router();

router.post('/parse', parseIntent);

export default router;