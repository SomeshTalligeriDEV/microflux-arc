import algosdk from 'algosdk';
import { Swap, SwapType, poolUtils, type SignerTransaction, type SupportedNetwork } from '@tinymanorg/tinyman-js-sdk';
import { algoClient, normalizeAlgorandAddressInput } from './algorand';
import { accountFromServerMnemonic, executePriceFeed as runPriceFeedCore } from './deterministicPayroll';

/** Minimal node shape for deterministic handlers (avoids circular imports with `runner.ts`). */
export type DeFiWorkflowNode = {
  id: string;
  type: string;
  config?: Record<string, unknown>;
};

function toConfig(node: DeFiWorkflowNode): Record<string, unknown> {
  if (node.config && typeof node.config === 'object') return node.config;
  return {};
}

const getServerMnemonic = (): string | null =>
  process.env.ALGORAND_SENDER_MNEMONIC || process.env.ALGO_MNEMONIC || process.env.WALLET_MNEMONIC || null;

/** CoinGecko-backed; writes `price`, `algoUsdPrice`, `priceToken`, `priceVs`. */
export async function executePriceFeed(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): Promise<void> {
  await runPriceFeedCore(toConfig(node) as Record<string, unknown>, sharedContext);
}

export function evaluateCondition(
  condition: string,
  actualValue: unknown,
  expectedValue: unknown,
): boolean {
  const actual = String(actualValue ?? '');
  const expected = String(expectedValue ?? '');
  const numActual = Number(actualValue);
  const numExpected = Number(expectedValue);
  switch (condition) {
    case '==':
    case 'eq':
      return actual === expected;
    case '!=':
    case 'neq':
      return actual !== expected;
    case '>':
    case 'gt':
      return numActual > numExpected;
    case '>=':
    case 'gte':
      return numActual >= numExpected;
    case '<':
    case 'lt':
      return numActual < numExpected;
    case '<=':
    case 'lte':
      return numActual <= numExpected;
    default:
      return false;
  }
}

/**
 * Deterministic filter: reads `config.field`, `config.condition`, `config.value` from sharedContext.
 * `payment_status` maps to `sharedContext.status` for legacy templates.
 */
export function executeFilterCondition(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): boolean {
  const config = toConfig(node);
  const fieldName = String(config.field || 'payment_status');
  const condition = String(config.condition || '==');
  const expectedValue = config.value;
  const actualValue =
    fieldName === 'payment_status' ? sharedContext.status : sharedContext[fieldName];
  return evaluateCondition(condition, actualValue, expectedValue);
}

const ASSET_DECIMALS: Record<number, number> = {
  0: 6,
  10458941: 6,
  31566704: 6,
};

function makeAssetObj(assetId: number) {
  return { id: assetId, decimals: ASSET_DECIMALS[assetId] ?? 6 };
}

function getNetwork(): SupportedNetwork {
  const raw = (process.env.ALGORAND_NETWORK || process.env.VITE_ALGOD_NETWORK || 'testnet').toLowerCase();
  return raw === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Tinyman V2 fixed-input swap signed with `ALGORAND_SENDER_MNEMONIC`.
 * Sets `swapStatus`, `swapTxId`, `swapAmountOut` (micro units of output asset), `swapAssetOutId`.
 * With `simulate: true` (or `DEFI_SIMULATE_SWAPS=1`), skips chain and marks success for testing.
 */
export async function executeTinymanSwap(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): Promise<void> {
  const config = toConfig(node);
  const fromAssetId = Number(config.fromAssetId ?? 0);
  const toAssetId = Number(config.toAssetId ?? 10458941);
  const amount = Number(config.amount ?? 0);
  const slippagePct = Number(config.slippage ?? 1);
  const simulate = Boolean(config.simulate) || process.env.DEFI_SIMULATE_SWAPS === '1';

  if (!Number.isFinite(amount) || amount <= 0) {
    sharedContext.swapStatus = 'failed';
    sharedContext.swapError = 'tinyman_swap: amount must be a positive number (micro units)';
    return;
  }

  if (simulate) {
    const px = Number(sharedContext.price ?? sharedContext.algoUsdPrice ?? 0.25);
    const roughUsdcMicro = Math.max(1, Math.floor(amount * px * 0.99));
    sharedContext.swapStatus = 'success';
    sharedContext.swapTxId = 'SIMULATED';
    sharedContext.swapAmountOut = roughUsdcMicro;
    sharedContext.swapAssetOutId = toAssetId;
    sharedContext.swap_simulated = true;
    return;
  }

  const mnemonic = getServerMnemonic();
  if (!mnemonic) {
    sharedContext.swapStatus = 'failed';
    sharedContext.swapError = 'Missing ALGORAND_SENDER_MNEMONIC for server-side Tinyman swap';
    return;
  }

  const sender = accountFromServerMnemonic(mnemonic);
  const senderAddr = sender.addr.toString();
  const network = getNetwork();

  try {
    const asset1 = fromAssetId > toAssetId ? makeAssetObj(fromAssetId) : makeAssetObj(toAssetId);
    const asset2 = fromAssetId > toAssetId ? makeAssetObj(toAssetId) : makeAssetObj(fromAssetId);

    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algoClient as any,
      network,
      asset1ID: asset1.id,
      asset2ID: asset2.id,
    });

    if (!poolInfo) {
      throw new Error(`No Tinyman pool for asset ${fromAssetId} ↔ ${toAssetId}`);
    }

    const quote = await Swap.v2.getQuote({
      type: SwapType.FixedInput,
      amount: BigInt(Math.trunc(amount)),
      assetIn: makeAssetObj(fromAssetId) as any,
      assetOut: makeAssetObj(toAssetId) as any,
      pool: poolInfo,
      network,
      slippage: slippagePct / 100,
    });

    const txGroup: SignerTransaction[] = await Swap.v2.generateTxns({
      client: algoClient as any,
      network,
      quote,
      swapType: SwapType.FixedInput,
      slippage: slippagePct / 100,
      initiatorAddr: senderAddr,
    });

    const signedTxns = await Swap.v2.signTxns({
      txGroup,
      initiatorSigner: async (txnGroups: SignerTransaction[][]) => {
        const blobs: Uint8Array[] = [];
        for (const group of txnGroups) {
          for (const st of group) {
            blobs.push(st.txn.signTxn(sender.sk));
          }
        }
        return blobs;
      },
    });

    const execution = await Swap.v2.execute({
      client: algoClient as any,
      quote,
      txGroup,
      signedTxns,
    });

    const outAmt = execution.assetOut?.amount;
    const outNum =
      typeof outAmt === 'bigint' ? Number(outAmt) : Number(outAmt ?? 0);

    sharedContext.swapStatus = 'success';
    sharedContext.swapTxId = execution.txnID;
    sharedContext.swapAmountOut = outNum;
    sharedContext.swapAssetOutId = toAssetId;
    sharedContext.swap_simulated = false;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sharedContext.swapStatus = 'failed';
    sharedContext.swapError = msg;
  }
}

/** ASA transfer signed with server mnemonic. */
export async function executeASATransfer(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): Promise<void> {
  const config = toConfig(node);
  const fromCtx = String(config.receiverFromContext ?? '').trim();
  let receiver =
    fromCtx === 'contributorWallet'
      ? normalizeAlgorandAddressInput(sharedContext.contributorWallet)
      : normalizeAlgorandAddressInput(config.receiver);
  const assetId = Number(config.asset_id ?? 0);

  let amount = Number(config.amount ?? 0);
  if (Boolean(config.useLastSwapOutput)) {
    amount = Number(sharedContext.swapAmountOut ?? 0);
  }

  if (!receiver) {
    throw new Error(`asa_transfer ${node.id}: receiver is empty`);
  }
  if (!algosdk.isValidAddress(receiver)) {
    throw new Error(`asa_transfer ${node.id}: invalid receiver address`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`asa_transfer ${node.id}: amount must be positive (set amount or complete a swap with useLastSwapOutput)`);
  }

  const mnemonic = getServerMnemonic();
  if (!mnemonic) {
    throw new Error('Missing ALGORAND_SENDER_MNEMONIC for server-side ASA transfer');
  }

  const sender = accountFromServerMnemonic(mnemonic);
  const suggestedParams = await algoClient.getTransactionParams().do();

  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: sender.addr,
    receiver,
    amount: Math.max(1, Math.trunc(amount)),
    assetIndex: assetId,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(sender.sk);
  const sendResult = await algoClient.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(algoClient, sendResult.txid, 4);

  sharedContext.asaTxId = sendResult.txid;
  sharedContext.asaAmount = Math.trunc(amount);
  sharedContext.status = 'success';
}
