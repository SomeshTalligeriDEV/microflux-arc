import { Router } from 'express';
import { createWorkflow, deleteWorkflow, getWorkflowsByWallet, updateWorkflow } from '../controllers/workflow.controller';

const router = Router();

router.post('/', createWorkflow);
router.get('/', getWorkflowsByWallet);
router.get('/:walletAddress', getWorkflowsByWallet);
router.put('/:id', updateWorkflow);
router.delete('/:id', deleteWorkflow);

export default router;
