import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const HEADERS = ['Timestamp', 'Wallet Address', 'ALGO Amount', 'Transaction Hash', 'Status'];

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
      'No spreadsheet ID: set spreadsheetId on the node or GOOGLE_SHEET_ID in server .env',
    );
  }
  return docId;
}

async function getSheet(spreadsheetId?: string | null) {
  const docId = resolveDocId(spreadsheetId);
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!serviceEmail || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }

  const auth = new JWT({
    email: serviceEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(docId, auth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  try {
    await sheet.loadHeaderRow();
    if (!sheet.headerValues || !sheet.headerValues[0]) {
      await sheet.setHeaderRow(HEADERS);
    }
  } catch {
    await sheet.setHeaderRow(HEADERS);
  }

  return { doc, sheet };
}

export type AppendSheetRowParams = {
  spreadsheetId?: string | null;
  walletAddress: string;
  algoAmount: string | number;
  txId: string;
  status?: string;
};

/** Used by HTTP routes and deterministic workflow runner. */
export async function appendWorkflowSheetRow(params: AppendSheetRowParams): Promise<void> {
  const { spreadsheetId, walletAddress, algoAmount, txId, status } = params;
  const { sheet } = await getSheet(spreadsheetId);
  await sheet.addRow({
    Timestamp: new Date().toISOString(),
    'Wallet Address': walletAddress,
    'ALGO Amount': String(algoAmount ?? 0),
    'Transaction Hash': txId,
    Status: status || 'Success',
  });
}
