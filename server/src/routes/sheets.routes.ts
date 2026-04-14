import { Router, Request, Response } from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const router = Router();

const HEADERS = ['Timestamp', 'Wallet Address', 'ALGO Amount', 'Transaction Hash', 'Status'];

/** Google Sheet IDs are opaque strings from the /d/<id>/ URL; avoid path traversal. */
function normalizeSpreadsheetId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s.length < 20 || s.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

function resolveDocId(explicit?: string | null): string {
  const fromRequest = normalizeSpreadsheetId(explicit);
  const fromEnv = (process.env.GOOGLE_SHEET_ID || '').trim();
  const docId = fromRequest || fromEnv;
  if (!docId) {
    throw new Error(
      'No spreadsheet ID: paste Spreadsheet ID on the Write to Spreadsheet node, or set GOOGLE_SHEET_ID in server .env',
    );
  }
  return docId;
}

// Shared helper: same service account JWT; target doc from node or env.
async function getSheet(spreadsheetId?: string | null) {
  const docId = resolveDocId(spreadsheetId);
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!serviceEmail || !privateKey) {
    throw new Error(
      `Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY (service account auth)`,
    );
  }

  const auth = new JWT({
    email: serviceEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(docId, auth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  // Always ensure headers exist in row 1 — set them if missing or empty
  try {
    await sheet.loadHeaderRow();
    if (!sheet.headerValues || !sheet.headerValues[0]) {
      await sheet.setHeaderRow(HEADERS);
    }
  } catch {
    // loadHeaderRow throws if row 1 is completely empty
    await sheet.setHeaderRow(HEADERS);
  }

  return { doc, sheet };
}

// ── Test endpoint — optional ?spreadsheetId=... (must be shared with service account)
router.get('/test', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.spreadsheetId === 'string' ? req.query.spreadsheetId : undefined;
    const { doc, sheet } = await getSheet(q);
    await sheet.addRow({
      'Timestamp': new Date().toISOString(),
      'Wallet Address': 'TEST_WALLET',
      'ALGO Amount': '0.001',
      'Transaction Hash': 'TEST_TX_ID',
      'Status': 'Test',
    });
    return res.json({ ok: true, spreadsheet: doc.title, message: 'Test row written successfully — check your Google Sheet!' });
  } catch (err: any) {
    console.error('[SHEETS TEST ERROR]', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// ── Main write endpoint called by frontend after successful transaction
router.post('/write', async (req: Request, res: Response) => {
  try {
    const { walletAddress, algoAmount, txId, status, spreadsheetId } = req.body;
    console.log('[SHEETS] Write request received:', { walletAddress, algoAmount, txId, status, spreadsheetId: spreadsheetId ? '[set]' : '[env/default]' });

    if (!walletAddress || !txId) {
      return res.status(400).json({ error: 'Missing walletAddress or txId' });
    }

    const { sheet } = await getSheet(spreadsheetId);

    await sheet.addRow({
      'Timestamp': new Date().toISOString(),
      'Wallet Address': walletAddress,
      'ALGO Amount': String(algoAmount ?? 0),
      'Transaction Hash': txId,
      'Status': status || 'Success',
    });

    console.log('[SHEETS] ✅ Transaction logged:', txId);
    return res.status(200).json({ success: true, message: 'Written to Google Spreadsheet' });
  } catch (err: any) {
    console.error('[SHEETS ERROR]', err?.message);
    return res.status(500).json({ error: `Sheets write failed: ${err?.message}` });
  }
});

export default router;
