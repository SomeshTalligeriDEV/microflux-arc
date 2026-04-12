/**
 * Tinyman V2 Swap Service — Optional DeFi Integration
 * Uses the official @tinymanorg/tinyman-js-sdk for Algorand DEX swaps.
 *
 * This service is OPTIONAL and does NOT replace any existing execution paths.
 * If Tinyman is unreachable or a pool doesn't exist, the workflow gracefully
 * skips the swap node with a warning.
 */

import { Swap, poolUtils } from '@tinymanorg/tinyman-js-sdk'
import type { SignerTransaction } from '@tinymanorg/tinyman-js-sdk'
import algosdk from 'algosdk'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

// ── Types ────────────────────────────────────

export interface TinymanSwapQuote {
  assetInId: number
  assetOutId: number
  amountIn: number | bigint
  expectedAmountOut: number | bigint
  minimumAmountOut: number | bigint
  priceImpact: number
  swapFee: number
  poolAddress: string
}

export interface TinymanSwapResult {
  success: boolean
  txId?: string
  quote?: TinymanSwapQuote
  error?: string
}

export interface TinymanSwapConfig {
  fromAssetId: number    // 0 = ALGO
  toAssetId: number      // ASA ID
  amount: number         // In base units (microAlgos for ALGO, smallest unit for ASA)
  slippage: number       // Percentage, e.g. 1 = 1%
}

// ── Constants ────────────────────────────────

// Tinyman V2 Validator App IDs
const TINYMAN_APP_ID_TESTNET = 148607000
const TINYMAN_APP_ID_MAINNET = 1002541853

// Well-known assets for display
export const TINYMAN_KNOWN_ASSETS: Record<number, { name: string; unitName: string; decimals: number }> = {
  0:        { name: 'Algorand', unitName: 'ALGO', decimals: 6 },
  31566704: { name: 'USDC', unitName: 'USDC', decimals: 6 },
  312769:   { name: 'Tether USDt', unitName: 'USDt', decimals: 6 },
  // Testnet commonly used
  10458941: { name: 'USDC (Testnet)', unitName: 'USDC', decimals: 6 },
}

// ── Helpers ──────────────────────────────────

function getAlgodClient(): algosdk.Algodv2 {
  const config = getAlgodConfigFromViteEnvironment()
  const serverUrl = config.port ? `${config.server}:${config.port}` : config.server
  const token = (typeof config.token === 'string' ? config.token : '') as string
  return new algosdk.Algodv2(token, serverUrl, '')
}

function getNetwork(): 'testnet' | 'mainnet' {
  const config = getAlgodConfigFromViteEnvironment()
  return config.network === 'mainnet' ? 'mainnet' : 'testnet'
}

function getTinymanAppId(): number {
  const network = getNetwork()
  return network === 'mainnet' ? TINYMAN_APP_ID_MAINNET : TINYMAN_APP_ID_TESTNET
}

function makeAssetObj(assetId: number) {
  return { id: assetId, decimals: TINYMAN_KNOWN_ASSETS[assetId]?.decimals ?? 6 }
}

// ── Core Functions ───────────────────────────

/**
 * Get a swap quote from Tinyman V2 without executing.
 * Returns estimated output amount and price impact.
 */
export async function getSwapQuote(config: TinymanSwapConfig): Promise<TinymanSwapQuote> {
  const { fromAssetId, toAssetId, amount, slippage } = config

  if (fromAssetId === toAssetId) {
    throw new Error('Cannot swap an asset for itself')
  }

  if (amount <= 0) {
    throw new Error('Swap amount must be greater than 0')
  }

  const algod = getAlgodClient()
  const network = getNetwork()

  try {
    console.log(`[TINYMAN] Fetching quote: ${amount} Asset#${fromAssetId} → Asset#${toAssetId}`)

    // Determine asset 1 and asset 2 (Tinyman requires asset1 > asset2 or ALGO=0 as asset2)
    const asset1 = fromAssetId > toAssetId
      ? makeAssetObj(fromAssetId)
      : makeAssetObj(toAssetId)
    const asset2 = fromAssetId > toAssetId
      ? makeAssetObj(toAssetId)
      : makeAssetObj(fromAssetId)

    // Look up the pool
    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network,
      asset1ID: asset1.id,
      asset2ID: asset2.id,
    })

    if (!poolInfo) {
      throw new Error(`No liquidity pool found for Asset#${fromAssetId} ↔ Asset#${toAssetId}`)
    }

    // Get the swap quote
    const quoteResponse = await Swap.v2.getQuote({
      type: 'fixed-input' as any,
      amount: BigInt(amount),
      assetIn: makeAssetObj(fromAssetId) as any,
      assetOut: makeAssetObj(toAssetId) as any,
      pool: poolInfo,
      network,
      slippage: slippage / 100,
    })

    const slippageMultiplier = 1 - (slippage / 100)
    const quoteData = (quoteResponse as any).data?.quote ?? (quoteResponse as any).quote ?? {}
    const expectedOut = Number(quoteData.assetOutAmount ?? quoteData.outputAmount ?? 0)
    const minOut = Math.floor(expectedOut * slippageMultiplier)

    return {
      assetInId: fromAssetId,
      assetOutId: toAssetId,
      amountIn: amount,
      expectedAmountOut: expectedOut,
      minimumAmountOut: minOut,
      priceImpact: Number(quoteData.priceImpact ?? 0),
      swapFee: Number(quoteData.swapFee ?? quoteData.fee ?? 0),
      poolAddress: String((poolInfo as any).account?.address ?? (poolInfo as any).poolAddress ?? (poolInfo as any).poolAccountAddress ?? ''),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get Tinyman quote'
    console.error('[TINYMAN] Quote error:', err)
    throw new Error(message)
  }
}

/**
 * Build swap transactions for Tinyman V2 using the official SDK.
 * Returns SignerTransaction groups ready to be signed by the wallet.
 */
export async function buildSwapTransactions(
  senderAddress: string,
  config: TinymanSwapConfig,
  preFetchedQuote?: any
): Promise<SignerTransaction[]> {
  const { fromAssetId, toAssetId, amount, slippage } = config

  const algod = getAlgodClient()
  const network = getNetwork()

  console.log(`[TINYMAN] Building swap txns: ${amount} Asset#${fromAssetId} → Asset#${toAssetId}`)

  let quote = preFetchedQuote;
  
  if (!quote) {
    // Determine asset ordering for pool lookup
    const asset1 = fromAssetId > toAssetId
      ? makeAssetObj(fromAssetId)
      : makeAssetObj(toAssetId)
    const asset2 = fromAssetId > toAssetId
      ? makeAssetObj(toAssetId)
      : makeAssetObj(fromAssetId)

    // Fetch pool info
    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network,
      asset1ID: asset1.id,
      asset2ID: asset2.id,
    })

    if (!poolInfo) {
      throw new Error(`No active Tinyman pool for Asset#${fromAssetId} ↔ Asset#${toAssetId}`)
    }

    // Get quote for slippage calculation
    quote = await Swap.v2.getQuote({
      type: 'fixed-input' as any,
      amount: BigInt(amount),
      assetIn: makeAssetObj(fromAssetId) as any,
      assetOut: makeAssetObj(toAssetId) as any,
      pool: poolInfo,
      network,
      slippage: slippage / 100,
    })
  }

  // Generate the transaction group
  const txnGroup = await Swap.v2.generateTxns({
    client: algod as any,
    network,
    quote: quote as any,
    swapType: 'fixed-input' as any,
    slippage: slippage / 100,
    initiatorAddr: senderAddress,
  })

  console.log(`[TINYMAN] Generated transaction group with ${txnGroup.length} txns`)

  return txnGroup
}

/**
 * Execute a full Tinyman V2 swap: quote → build txns → sign → submit.
 * Uses the connected wallet's transaction signer (Pera/Defly/Lute).
 */
export async function executeSwap(
  senderAddress: string,
  config: TinymanSwapConfig,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<TinymanSwapResult> {
  try {
    console.log(`[TINYMAN] Executing swap: ${config.amount} Asset#${config.fromAssetId} → Asset#${config.toAssetId}`)

    // 1. Get quote first for display and to reuse
    const algod = getAlgodClient()
    const network = getNetwork()
    const asset1 = config.fromAssetId > config.toAssetId ? makeAssetObj(config.fromAssetId) : makeAssetObj(config.toAssetId)
    const asset2 = config.fromAssetId > config.toAssetId ? makeAssetObj(config.toAssetId) : makeAssetObj(config.fromAssetId)
    
    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network,
      asset1ID: asset1.id,
      asset2ID: asset2.id,
    })
    
    const quoteResponse = await Swap.v2.getQuote({
      type: 'fixed-input' as any,
      amount: BigInt(config.amount),
      assetIn: makeAssetObj(config.fromAssetId) as any,
      assetOut: makeAssetObj(config.toAssetId) as any,
      pool: poolInfo,
      network,
      slippage: config.slippage / 100,
    })

    const quoteData = (quoteResponse as any).data?.quote ?? (quoteResponse as any).quote ?? {}
    
    const displayQuote: TinymanSwapQuote = {
      assetInId: config.fromAssetId,
      assetOutId: config.toAssetId,
      amountIn: config.amount,
      expectedAmountOut: Number(quoteData.assetOutAmount ?? quoteData.outputAmount ?? 0),
      minimumAmountOut: Math.floor(Number(quoteData.assetOutAmount ?? quoteData.outputAmount ?? 0) * (1 - (config.slippage / 100))),
      priceImpact: Number(quoteData.priceImpact ?? 0),
      swapFee: Number(quoteData.swapFee ?? quoteData.fee ?? 0),
      poolAddress: '',
    }
    
    console.log(`[TINYMAN] Quote: expected output = ${displayQuote.expectedAmountOut}, min = ${displayQuote.minimumAmountOut}`)

    // 2. Build transactions
    const txnGroup = await buildSwapTransactions(senderAddress, config, quoteResponse)

    // 3. Sign using the connected wallet — adapt SDK's SignerTransaction format
    //    to the wallet provider's signer interface
    const signedTxns: Uint8Array[] = []

    const txns: algosdk.Transaction[] = []
    const indexesToSign: number[] = []

    for (let i = 0; i < txnGroup.length; i++) {
      const signerTxn = txnGroup[i]
      txns.push(signerTxn.txn)
      // If signers array is defined and includes our address, we need to sign it
      if (signerTxn.signers && signerTxn.signers.length > 0) {
        indexesToSign.push(i)
      }
    }

    if (indexesToSign.length > 0) {
      const signed = await signer(txns, indexesToSign)
      signedTxns.push(...signed)
    }

    // 4. Submit to network
    if (signedTxns.length === 0) {
      throw new Error('No transactions were signed')
    }

    const result = await algod.sendRawTransaction(signedTxns).do()
    const txId = (result as any).txid ?? (result as any).txId ?? ''

    if (txId) {
      await algosdk.waitForConfirmation(algod, txId, 4)
    }

    console.log(`[TINYMAN] Swap confirmed: ${txId}`)

    return {
      success: true,
      txId,
      quote: displayQuote,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tinyman swap failed'
    console.error('[TINYMAN] Swap execution error:', err)

    if (
      message.includes('cancelled') ||
      message.includes('rejected') ||
      message.includes('User refused') ||
      message.includes('Operation cancelled')
    ) {
      return { success: false, error: 'Swap rejected by user' }
    }

    return { success: false, error: message }
  }
}

/**
 * Check if Tinyman V2 is available on the current network.
 * Returns the validator app ID if reachable, null otherwise.
 */
export async function checkTinymanAvailability(): Promise<{ available: boolean; appId: number; network: string }> {
  try {
    const algod = getAlgodClient()
    const appId = getTinymanAppId()
    const network = getNetwork()

    // Try to read the app info to verify it exists
    await algod.getApplicationByID(appId).do()

    console.log(`[TINYMAN] V2 available on ${network} (App ID: ${appId})`)
    return { available: true, appId, network }
  } catch {
    console.warn('[TINYMAN] V2 not reachable on current network')
    return { available: false, appId: 0, network: getNetwork() }
  }
}

/**
 * Format asset amount based on decimals for display.
 */
export function formatAssetAmount(amount: number | bigint, assetId: number): string {
  const info = TINYMAN_KNOWN_ASSETS[assetId]
  const decimals = info?.decimals ?? 6
  const unitName = info?.unitName ?? `ASA#${assetId}`
  const formatted = (Number(amount) / Math.pow(10, decimals)).toFixed(decimals > 2 ? 4 : 2)
  return `${formatted} ${unitName}`
}
