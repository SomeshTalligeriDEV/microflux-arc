/**
 * Wallet Service — Account data fetching & transaction helpers
 * Uses raw algosdk Algodv2 for direct Testnet connectivity
 * Includes retry logic and debug logging
 */

import algosdk from 'algosdk'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

// ── Types ────────────────────────────────────

export interface AccountBalance {
  address: string
  balanceMicroAlgos: number
  balanceAlgos: number
  minBalance: number
  pendingRewards: number
}

export interface AssetHolding {
  assetId: number
  amount: number
  isFrozen: boolean
  name?: string
  unitName?: string
  decimals?: number
}

export interface TransactionResult {
  txId: string
  confirmedRound?: number
  success: boolean
  error?: string
}

// ── Algod Client (singleton) ─────────────────

let _algodClient: algosdk.Algodv2 | null = null

function getAlgodClient(): algosdk.Algodv2 {
  if (_algodClient) return _algodClient

  const config = getAlgodConfigFromViteEnvironment()

  // Build the full URL
  // For cloud endpoints (algonode.cloud), port is empty string
  const serverUrl = config.port
    ? `${config.server}:${config.port}`
    : config.server

  const token = (typeof config.token === 'string' ? config.token : '') as string

  console.log(`[MICROFLUX Wallet] Algod endpoint: ${serverUrl}`)
  console.log(`[MICROFLUX Wallet] Network: ${config.network}`)

  _algodClient = new algosdk.Algodv2(token, serverUrl, '')
  return _algodClient
}

// ── Retry Helper ─────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
  label = 'operation',
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isLast = attempt === retries
      console.warn(
        `[MICROFLUX] ${label} attempt ${attempt}/${retries} failed:`,
        err instanceof Error ? err.message : err,
      )
      if (isLast) throw err
      await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
  throw new Error(`${label} failed after ${retries} retries`)
}

// ── Account Data ─────────────────────────────

/**
 * Fetch account balance from Algod (with retry)
 */
export async function fetchAccountBalance(address: string): Promise<AccountBalance> {
  try {
    console.log(`[MICROFLUX Wallet] Fetching balance for: ${address.slice(0, 8)}...`)

    const algod = getAlgodClient()
    const accountInfo = await withRetry(
      () => algod.accountInformation(address).do(),
      3,
      500,
      'fetchBalance',
    )

    const balanceMicroAlgos = Number(accountInfo.amount)
    const result = {
      address,
      balanceMicroAlgos,
      balanceAlgos: balanceMicroAlgos / 1_000_000,
      minBalance: Number(accountInfo.minBalance ?? 0) / 1_000_000,
      pendingRewards: Number(accountInfo.pendingRewards ?? 0) / 1_000_000,
    }

    console.log(`[MICROFLUX Wallet] Balance: ${result.balanceAlgos} ALGO`)
    return result
  } catch (err) {
    console.error('[MICROFLUX Wallet] Failed to fetch balance:', err)
    return {
      address,
      balanceMicroAlgos: 0,
      balanceAlgos: 0,
      minBalance: 0,
      pendingRewards: 0,
    }
  }
}

/**
 * Fetch assets held by the account (with retry)
 */
export async function fetchAccountAssets(address: string): Promise<AssetHolding[]> {
  try {
    console.log(`[MICROFLUX Wallet] Fetching assets for: ${address.slice(0, 8)}...`)

    const algod = getAlgodClient()
    const accountInfo = await withRetry(
      () => algod.accountInformation(address).do(),
      3,
      500,
      'fetchAssets',
    )

    const assets = accountInfo.assets ?? accountInfo.createdAssets ?? []

    const holdings = assets.map((asset: any) => ({
      assetId: Number(asset['asset-id'] ?? asset.assetId ?? 0),
      amount: Number(asset.amount ?? 0),
      isFrozen: Boolean(asset['is-frozen'] ?? asset.isFrozen ?? false),
    }))

    console.log(`[MICROFLUX Wallet] Found ${holdings.length} assets`)
    return holdings
  } catch (err) {
    console.error('[MICROFLUX Wallet] Failed to fetch assets:', err)
    return []
  }
}

// ── Transaction Helpers ──────────────────────

/**
 * Send a payment transaction using the connected wallet signer
 */
export async function sendPayment(
  senderAddress: string,
  receiverAddress: string,
  amountMicroAlgos: number,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<TransactionResult> {
  try {
    console.log(`[MICROFLUX Wallet] Sending payment: ${amountMicroAlgos / 1_000_000} ALGO`)
    console.log(`[MICROFLUX Wallet] From: ${senderAddress.slice(0, 8)}... To: ${receiverAddress.slice(0, 8)}...`)

    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: senderAddress,
      receiver: receiverAddress,
      amount: amountMicroAlgos,
      suggestedParams,
    })

    // Sign using wallet provider
    const signedTxns = await signer([txn], [0])
    await algod.sendRawTransaction(signedTxns[0]).do()
    const txId = txn.txID()

    // Wait for confirmation
    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Wallet] Payment confirmed: ${txId}`)
    return { txId, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction failed'
    console.error('[MICROFLUX Wallet] Payment failed:', err)

    // Handle user rejection
    if (
      message.includes('cancelled') ||
      message.includes('rejected') ||
      message.includes('User refused') ||
      message.includes('user rejected') ||
      message.includes('Operation cancelled')
    ) {
      return { txId: '', success: false, error: 'Transaction rejected by user' }
    }

    if (message.includes('overspend') || message.includes('below min')) {
      return { txId: '', success: false, error: 'Insufficient balance' }
    }

    return { txId: '', success: false, error: message }
  }
}

/**
 * Send an ASA transfer using the connected wallet signer
 */
export async function sendAsaTransfer(
  senderAddress: string,
  receiverAddress: string,
  assetId: number,
  amount: number,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<TransactionResult> {
  try {
    console.log(`[MICROFLUX Wallet] ASA transfer: ${amount} of ASA #${assetId}`)

    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: senderAddress,
      receiver: receiverAddress,
      assetIndex: assetId,
      amount: amount,
      suggestedParams,
    })

    const signedTxns = await signer([txn], [0])
    await algod.sendRawTransaction(signedTxns[0]).do()
    const txId = txn.txID()

    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Wallet] ASA transfer confirmed: ${txId}`)
    return { txId, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ASA transfer failed'
    console.error('[MICROFLUX Wallet] ASA transfer failed:', err)

    if (
      message.includes('cancelled') ||
      message.includes('rejected') ||
      message.includes('User refused') ||
      message.includes('Operation cancelled')
    ) {
      return { txId: '', success: false, error: 'Transaction rejected by user' }
    }

    return { txId: '', success: false, error: message }
  }
}

/**
 * Check if Algod endpoint is reachable
 */
export async function checkAlgodHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const algod = getAlgodClient()
    const status = await algod.status().do()
    const round = status.lastRound ?? 0
    return {
      ok: true,
      message: `Connected to Algorand (round ${round})`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[MICROFLUX Wallet] Algod health check failed:', err)

    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return {
        ok: false,
        message: 'Unable to reach Algorand Testnet. Check your network connection.',
      }
    }

    return { ok: false, message: `Algod error: ${message}` }
  }
}

// ── Formatters ───────────────────────────────

/**
 * Format microAlgos to human-readable ALGO amount
 */
export function formatAlgos(microAlgos: number): string {
  return (microAlgos / 1_000_000).toFixed(6)
}

/**
 * Format address for display (truncated)
 */
export function truncateAddress(address: string, chars = 6): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(txId: string, network: string): string {
  const base = network === 'mainnet'
    ? 'https://lora.algokit.io/mainnet'
    : network === 'testnet'
      ? 'https://lora.algokit.io/testnet'
      : 'https://lora.algokit.io/localnet'
  return `${base}/transaction/${txId}`
}

/**
 * Get explorer URL for an account
 */
export function getExplorerAccountUrl(address: string, network: string): string {
  const base = network === 'mainnet'
    ? 'https://lora.algokit.io/mainnet'
    : network === 'testnet'
      ? 'https://lora.algokit.io/testnet'
      : 'https://lora.algokit.io/localnet'
  return `${base}/account/${address}`
}
