import algosdk from 'algosdk';
import { getAssetPrice } from '../integrations/coingecko';
import { appendWorkflowSheetRow } from '../integrations/googleSheetsWrite';
import { algoClient, normalizeAlgorandAddressInput } from './algorand';
import type { WorkflowNode } from './runner';

const getServerMnemonic = (): string | null =>
  process.env.ALGORAND_SENDER_MNEMONIC || process.env.ALGO_MNEMONIC || process.env.WALLET_MNEMONIC || null;

/**
 * algosdk only accepts Algorand's 25-word mnemonic (24 data words + checksum word).
 * Pera "Universal" 24-word phrases are BIP39 and fail with "failed to decode mnemonic".
 */
export function accountFromServerMnemonic(mnemonic: string): algosdk.Account {
  try {
    return algosdk.mnemonicToSecretKey(mnemonic.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('decode mnemonic') || msg.includes('wordlist')) {
      throw new Error(
        'Algorand server signing requires a 25-word Algorand recovery passphrase (not Pera Universal 24-word BIP39). ' +
          'Create or import a Legacy Algo25 account in Pera (25 words), or generate a TestNet account with algosdk/AlgoKit and put that 25-word phrase in ALGORAND_SENDER_MNEMONIC (double-quoted in .env).',
      );
    }
    throw e;
  }
}

export type SharedExecutionContext = Record<string, unknown>;

export async function executePriceFeed(
  config: Record<string, unknown>,
  sharedContext: SharedExecutionContext,
): Promise<void> {
  const token = String(config.token ?? 'ALGO');
  const vs = String(config.vs ?? 'usd').toLowerCase();
  const price = await getAssetPrice(token, vs);
  sharedContext.algoUsdPrice = price;
  sharedContext.price = price;
  sharedContext.priceToken = token;
  sharedContext.priceVs = vs;
}

/** microAlgos from either raw `amount` or fiat USD ÷ ALGO/USD price. */
export function resolvePaymentMicroAlgos(
  config: Record<string, unknown>,
  sharedContext: SharedExecutionContext,
): number {
  const useFiat = Boolean(config.useFiatConversion);
  if (useFiat) {
    const fiat = Number(config.fiatPayoutUsd ?? 0);
    const price = Number(sharedContext.algoUsdPrice ?? sharedContext.price ?? 0);
    if (!Number.isFinite(fiat) || fiat <= 0) {
      throw new Error('send_payment: fiatPayoutUsd must be a positive number when useFiatConversion is true');
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Run price_feed before fiat send_payment nodes (missing algoUsdPrice)');
    }
    const algo = fiat / price;
    return Math.max(1, Math.floor(algo * 1_000_000));
  }
  const amount = Number(config.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('send_payment: amount must be a positive number (microAlgos) when not using fiat conversion');
  }
  return Math.trunc(amount);
}

/**
 * Build, group-sign, and submit an atomic payment group. Sets sharedContext.txId, groupId, lastAtomicTxIds.
 */
export async function executeAtomicPayments(
  allNodes: WorkflowNode[],
  paymentNodeIds: string[],
  sharedContext: SharedExecutionContext,
): Promise<{ txIds: string[]; groupId: string }> {
  const mnemonic = getServerMnemonic();
  if (!mnemonic) {
    throw new Error('Missing ALGORAND_SENDER_MNEMONIC for atomic payments');
  }

  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const paymentNodes: WorkflowNode[] = [];
  for (const id of paymentNodeIds) {
    const n = nodeById.get(id);
    if (!n) throw new Error(`atomic_group: unknown payment node id ${id}`);
    paymentNodes.push(n);
  }

  const sender = accountFromServerMnemonic(mnemonic);
  sharedContext.senderAddress = String(sender.addr);
  const suggestedParams = await algoClient.getTransactionParams().do();
  const txns: algosdk.Transaction[] = [];
  let totalMicro = 0;

  for (const node of paymentNodes) {
    const config = node.config && typeof node.config === 'object' ? node.config : {};
    const receiver = normalizeAlgorandAddressInput(config.receiver);
    if (!receiver) {
      throw new Error(
        `send_payment ${node.id}: receiver is empty — open the workflow in the builder, set Receiver on each payment node, Save, then retry. If you have two workflows with the same webhook path, only one may be updated.`,
      );
    }
    if (!algosdk.isValidAddress(receiver)) {
      const hint =
        receiver.length < 58
          ? ` After removing spaces/invisible characters, only ${receiver.length} characters remain — Algorand addresses need exactly 58 (A–Z, 2–7). Re-copy from your wallet, or paste into a plain-text editor first to strip hidden Unicode from PDF/chat.`
          : ` Check for wrong characters (only A–Z and 2–7).`;
      throw new Error(
        `send_payment ${node.id}: receiver failed validation (length ${receiver.length}, need 58).${hint}`,
      );
    }
    const amount = resolvePaymentMicroAlgos(config as Record<string, unknown>, sharedContext);
    totalMicro += amount;
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: sender.addr,
      receiver,
      amount,
      suggestedParams,
    });
    txns.push(txn);
  }

  algosdk.assignGroupID(txns);
  const signedTxns = txns.map((txn) => txn.signTxn(sender.sk));
  const sendResult = await algoClient.sendRawTransaction(signedTxns).do();
  const firstTxId = sendResult.txid;
  await algosdk.waitForConfirmation(algoClient, firstTxId, 4);

  const groupField = txns[0]?.group;
  const groupId =
    groupField && groupField.byteLength > 0 ? Buffer.from(groupField).toString('base64') : firstTxId;
  const txIdsList = txns.map((t) => t.txID());

  sharedContext.txId = firstTxId;
  sharedContext.groupTxId = firstTxId;
  sharedContext.groupId = groupId;
  sharedContext.lastAtomicTxIds = txIdsList;
  sharedContext.atomicTotalMicroAlgos = totalMicro;
  sharedContext.totalAlgoForAudit = totalMicro / 1_000_000;
  sharedContext.status = 'success';

  return { txIds: txIdsList, groupId };
}

export async function executeWriteToSpreadsheet(
  config: Record<string, unknown>,
  sharedContext: SharedExecutionContext,
): Promise<void> {
  const spreadsheetId =
    typeof config.spreadsheetId === 'string' && config.spreadsheetId.trim()
      ? config.spreadsheetId.trim()
      : undefined;
  const txId = String(sharedContext.groupTxId ?? sharedContext.txId ?? '');
  const walletAddress = String(
    config.auditWalletAddress ?? sharedContext.treasuryWallet ?? sharedContext.senderAddress ?? 'dao_payroll',
  );
  const algoAmount =
    sharedContext.totalAlgoForAudit != null
      ? String(sharedContext.totalAlgoForAudit)
      : String(sharedContext.atomicTotalMicroAlgos ?? '');

  await appendWorkflowSheetRow({
    spreadsheetId,
    walletAddress,
    algoAmount,
    txId,
    status: 'Atomic payroll batch',
  });
}

/** Replace `{{txId}}` / `{{groupId}}` in notification copy after on-chain steps. */
export function expandWorkflowMessageTemplate(
  raw: string,
  sharedContext: SharedExecutionContext,
): string {
  const tx = String(sharedContext.groupTxId ?? sharedContext.txId ?? '');
  const gid = String(sharedContext.groupId ?? '');
  return String(raw).replace(/\{\{txId\}\}/g, tx).replace(/\{\{groupId\}\}/g, gid);
}
