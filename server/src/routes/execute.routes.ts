import { Router } from 'express';
import { runWorkflow } from '../controllers/execute.controller';

const router = Router();

router.post('/run', runWorkflow);

export default router;