import { Router } from 'express';
import { confirmExecution, getExecutionByToken } from '../controllers/execution.controller';

const router = Router();

router.get('/:token', getExecutionByToken);
router.post('/confirm', confirmExecution);

export default router;
