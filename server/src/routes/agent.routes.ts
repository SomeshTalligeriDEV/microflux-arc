import { Router } from 'express';
import { getAgentState, toggleAutoMode, triggerManualCycle } from '../controllers/agent.controller';

const router = Router();

router.get('/state', getAgentState);
router.post('/toggle', toggleAutoMode);
router.post('/run', triggerManualCycle);

export default router;
