import { Router, Request, Response } from 'express';
import { appendWorkflowSheetRow } from '../core/integrations/googleSheetsWrite';

const router = Router();

// ── Test endpoint — optional ?spreadsheetId=... (must be shared with service account)
router.get('/test', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.spreadsheetId === 'string' ? req.query.spreadsheetId : undefined;
    await appendWorkflowSheetRow({
      spreadsheetId: q,
      walletAddress: 'TEST_WALLET',
      algoAmount: '0.001',
      txId: 'TEST_TX_ID',
      status: 'Test',
    });
    return res.json({
      ok: true,
      message: 'Test row written successfully — check your Google Sheet!',
    });
  } catch (err: any) {
    console.error('[SHEETS TEST ERROR]', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// ── Main write endpoint called by frontend after successful transaction
router.post('/write', async (req: Request, res: Response) => {
  try {
    const { walletAddress, algoAmount, txId, status, spreadsheetId } = req.body;
    console.log('[SHEETS] Write request received:', {
      walletAddress,
      algoAmount,
      txId,
      status,
      spreadsheetId: spreadsheetId ? '[set]' : '[env/default]',
    });

    if (!walletAddress || !txId) {
      return res.status(400).json({ error: 'Missing walletAddress or txId' });
    }

    await appendWorkflowSheetRow({
      spreadsheetId,
      walletAddress,
      algoAmount,
      txId,
      status,
    });

    console.log('[SHEETS] ✅ Transaction logged:', txId);
    return res.status(200).json({ success: true, message: 'Written to Google Spreadsheet' });
  } catch (err: any) {
    console.error('[SHEETS ERROR]', err?.message);
    return res.status(500).json({ error: `Sheets write failed: ${err?.message}` });
  }
});

export default router;
