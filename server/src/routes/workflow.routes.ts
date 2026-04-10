import { Router } from 'express';
import { createWorkflow, getWorkflowsByWallet } from '../controllers/workflow.controller';

const router = Router();

router.post('/', createWorkflow);
router.get('/', getWorkflowsByWallet);

export default router;
