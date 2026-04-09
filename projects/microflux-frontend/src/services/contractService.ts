/**
 * Contract Service — WorkflowExecutor Smart Contract Integration
 * Connects frontend to the deployed on-chain contract via App Calls
 */

import algosdk from 'algosdk'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

// ── Types ────────────────────────────────────

export interface ContractCallResult {
  txId: string
  appId: number
  success: boolean
  returnValue?: string
  error?: string
}

export interface ContractState {
  appId: number
  totalExecutions: number
  workflowCount: number
  lastExecutionTime: number
  publicExecution: boolean
  creator: string
}

// ── Config ───────────────────────────────────

/** Get the deployed App ID from environment or manual input */
export function getAppId(): number {
  const envAppId = import.meta.env.VITE_APP_ID
  if (envAppId) return Number(envAppId)
  return 0 // Not configured
}

// ── Algod Client ─────────────────────────────

function getAlgodClient(): algosdk.Algodv2 {
  const config = getAlgodConfigFromViteEnvironment()
  const serverUrl = config.port ? `${config.server}:${config.port}` : config.server
  return new algosdk.Algodv2(config.token || '', serverUrl, '')
}

// ── Workflow Hash ────────────────────────────

/**
 * Generate a SHA-256 hash of a workflow JSON for on-chain integrity verification.
 * This hash is stored on the contract and can be verified later.
 */
export async function hashWorkflow(workflowJson: object): Promise<string> {
  const jsonStr = JSON.stringify(workflowJson, Object.keys(workflowJson).sort())
  const encoder = new TextEncoder()
  const data = encoder.encode(jsonStr)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── ABI Method Encoding ──────────────────────

/**
 * Encode an ABI method selector (first 4 bytes of SHA-512/256 hash)
 */
function encodeMethodSelector(methodSignature: string): Uint8Array {
  return algosdk.ABIMethod.fromSignature(methodSignature).getSelector()
}

// ── Contract Calls ───────────────────────────

/**
 * Call execute() on the WorkflowExecutor contract.
 * This records the workflow execution on-chain with its hash.
 */
export async function callExecute(
  senderAddress: string,
  workflowHash: string,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
  appId?: number,
): Promise<ContractCallResult> {
  const targetAppId = appId || getAppId()
  if (!targetAppId) {
    return { txId: '', appId: 0, success: false, error: 'No App ID configured. Set VITE_APP_ID in .env' }
  }

  try {
    console.log(`[MICROFLUX Contract] Calling execute() on App ${targetAppId}`)
    console.log(`[MICROFLUX Contract] Hash: ${workflowHash.slice(0, 16)}...`)

    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    // ABI encode: execute(string)string
    const methodSelector = encodeMethodSelector('execute(string)string')

    // ABI encode the workflow_hash argument
    const abiType = algosdk.ABIType.from('string')
    const encodedHash = abiType.encode(workflowHash)

    // Build app call args: [method_selector, encoded_arg]
    const appArgs = [methodSelector, encodedHash]

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: senderAddress,
      appIndex: targetAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs,
      suggestedParams,
    })

    const signedTxns = await signer([txn], [0])
    const { txId } = await algod.sendRawTransaction(signedTxns[0]).do()
    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Contract] OK: execute() confirmed: ${txId}`)

    return {
      txId,
      appId: targetAppId,
      success: true,
      returnValue: `Executed workflow on App ${targetAppId}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'App call failed'
    console.error('[MICROFLUX Contract] execute() failed:', err)

    if (message.includes('cancelled') || message.includes('rejected') || message.includes('User refused')) {
      return { txId: '', appId: targetAppId, success: false, error: 'Transaction rejected by user' }
    }
    return { txId: '', appId: targetAppId, success: false, error: message }
  }
}

/**
 * Call register_workflow() to store a workflow hash on-chain.
 */
export async function callRegisterWorkflow(
  senderAddress: string,
  workflowHash: string,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
  appId?: number,
): Promise<ContractCallResult> {
  const targetAppId = appId || getAppId()
  if (!targetAppId) {
    return { txId: '', appId: 0, success: false, error: 'No App ID configured' }
  }

  try {
    console.log(`[MICROFLUX Contract] Registering workflow on App ${targetAppId}`)

    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    const methodSelector = encodeMethodSelector('register_workflow(string)string')
    const abiType = algosdk.ABIType.from('string')
    const encodedHash = abiType.encode(workflowHash)

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: senderAddress,
      appIndex: targetAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, encodedHash],
      suggestedParams,
    })

    const signedTxns = await signer([txn], [0])
    const { txId } = await algod.sendRawTransaction(signedTxns[0]).do()
    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Contract] OK: register_workflow() confirmed: ${txId}`)
    return { txId, appId: targetAppId, success: true, returnValue: 'Workflow registered' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed'
    console.error('[MICROFLUX Contract] register_workflow() failed:', err)
    return { txId: '', appId: targetAppId, success: false, error: message }
  }
}

/**
 * Build an atomic transaction group combining payments, ASA transfers, and an app call.
 * This is the key differentiator: grouping L1 txns + contract call atomically.
 */
export async function executeAtomicGroup(
  senderAddress: string,
  transactions: {
    payments?: Array<{ receiver: string; amountMicroAlgos: number }>
    asaTransfers?: Array<{ receiver: string; assetId: number; amount: number }>
    appCall?: { workflowHash: string; appId?: number }
  },
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<ContractCallResult> {
  try {
    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()
    const txns: algosdk.Transaction[] = []

    // Add payment transactions
    if (transactions.payments) {
      for (const pay of transactions.payments) {
        txns.push(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: senderAddress,
            to: pay.receiver,
            amount: pay.amountMicroAlgos,
            suggestedParams,
          }),
        )
      }
    }

    // Add ASA transfer transactions
    if (transactions.asaTransfers) {
      for (const asa of transactions.asaTransfers) {
        txns.push(
          algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: senderAddress,
            to: asa.receiver,
            assetIndex: asa.assetId,
            amount: asa.amount,
            suggestedParams,
          }),
        )
      }
    }

    // Add app call transaction
    if (transactions.appCall) {
      const targetAppId = transactions.appCall.appId || getAppId()
      if (targetAppId) {
        const methodSelector = encodeMethodSelector('execute(string)string')
        const abiType = algosdk.ABIType.from('string')
        const encodedHash = abiType.encode(transactions.appCall.workflowHash)

        txns.push(
          algosdk.makeApplicationCallTxnFromObject({
            from: senderAddress,
            appIndex: targetAppId,
            onComplete: algosdk.OnApplicationComplete.NoOpOC,
            appArgs: [methodSelector, encodedHash],
            suggestedParams,
          }),
        )
      }
    }

    if (txns.length === 0) {
      return { txId: '', appId: 0, success: false, error: 'No transactions to execute' }
    }

    // Assign group ID for atomic execution
    if (txns.length > 1) {
      algosdk.assignGroupID(txns)
    }

    console.log(`[MICROFLUX Contract] Atomic group: ${txns.length} transactions`)

    // Sign all transactions
    const indexesToSign = txns.map((_, i) => i)
    const signedTxns = await signer(txns, indexesToSign)

    // Submit entire group
    const { txId } = await algod.sendRawTransaction(signedTxns).do()
    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Contract] OK: Atomic group confirmed: ${txId}`)

    const appId = transactions.appCall ? (transactions.appCall.appId || getAppId()) : 0
    return { txId, appId, success: true, returnValue: `Atomic group: ${txns.length} txns` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Atomic execution failed'
    console.error('[MICROFLUX Contract] Atomic group failed:', err)

    if (message.includes('cancelled') || message.includes('rejected')) {
      return { txId: '', appId: 0, success: false, error: 'Transaction rejected by user' }
    }
    return { txId: '', appId: 0, success: false, error: message }
  }
}

// ── Read Contract State ──────────────────────

/**
 * Read global state from the WorkflowExecutor contract.
 */
export async function getContractState(appId?: number): Promise<ContractState | null> {
  const targetAppId = appId || getAppId()
  if (!targetAppId) return null

  try {
    const algod = getAlgodClient()
    const appInfo = await algod.getApplicationByID(targetAppId).do()

    const globalState = appInfo.params?.['global-state'] ?? []
    const state: ContractState = {
      appId: targetAppId,
      totalExecutions: 0,
      workflowCount: 0,
      lastExecutionTime: 0,
      publicExecution: false,
      creator: appInfo.params?.creator ?? '',
    }

    for (const kv of globalState) {
      const key = atob(kv.key)
      const value = kv.value

      switch (key) {
        case 'total_executions':
          state.totalExecutions = value.uint ?? 0
          break
        case 'workflow_count':
          state.workflowCount = value.uint ?? 0
          break
        case 'last_execution_time':
          state.lastExecutionTime = value.uint ?? 0
          break
        case 'public_execution':
          state.publicExecution = (value.uint ?? 0) === 1
          break
      }
    }

    console.log(`[MICROFLUX Contract] State:`, state)
    return state
  } catch (err) {
    console.error('[MICROFLUX Contract] Failed to read state:', err)
    return null
  }
}

// ── Generic App Call ─────────────────────────

/**
 * Generic app call for any method on any App ID.
 * Used by the "App Call" node type in the workflow builder.
 */
export async function genericAppCall(
  senderAddress: string,
  appId: number,
  methodSignature: string,
  args: string[],
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<ContractCallResult> {
  try {
    console.log(`[MICROFLUX Contract] Generic call: ${methodSignature} on App ${appId}`)

    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    const methodSelector = encodeMethodSelector(methodSignature)
    const appArgs: Uint8Array[] = [methodSelector]

    // Parse method signature to determine arg types
    const method = algosdk.ABIMethod.fromSignature(methodSignature)
    for (let i = 0; i < method.args.length && i < args.length; i++) {
      const abiType = algosdk.ABIType.from(method.args[i].type.toString())
      appArgs.push(abiType.encode(args[i]))
    }

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: senderAddress,
      appIndex: appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs,
      suggestedParams,
    })

    const signedTxns = await signer([txn], [0])
    const { txId } = await algod.sendRawTransaction(signedTxns[0]).do()
    await algosdk.waitForConfirmation(algod, txId, 4)

    console.log(`[MICROFLUX Contract] OK: Generic call confirmed: ${txId}`)
    return { txId, appId, success: true, returnValue: `Called ${methodSignature}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'App call failed'
    console.error('[MICROFLUX Contract] Generic call failed:', err)
    return { txId: '', appId, success: false, error: message }
  }
}

// ── Deploy Contract ──────────────────────────

export interface DeployResult {
  appId: number
  txId: string
  appAddress: string
  success: boolean
  error?: string
}

/**
 * Deploy WorkflowExecutor from the browser using wallet signing.
 * Fetches compiled TEAL from /contracts/, compiles with algod, signs with wallet.
 */
export async function deployContract(
  senderAddress: string,
  signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>,
): Promise<DeployResult> {
  try {
    console.log('[MICROFLUX Deploy] Starting deployment...')
    console.log(`[MICROFLUX Deploy] Sender: ${senderAddress}`)

    const algod = getAlgodClient()

    // 1. Fetch TEAL source from public directory
    const [approvalResp, clearResp] = await Promise.all([
      fetch('/contracts/WorkflowExecutor.approval.teal'),
      fetch('/contracts/WorkflowExecutor.clear.teal'),
    ])

    if (!approvalResp.ok || !clearResp.ok) {
      return { appId: 0, txId: '', appAddress: '', success: false, error: 'TEAL files not found. Run build first.' }
    }

    const approvalSource = await approvalResp.text()
    const clearSource = await clearResp.text()

    console.log('[MICROFLUX Deploy] TEAL loaded. Compiling...')

    // 2. Compile TEAL via algod
    const approvalCompiled = await algod.compile(approvalSource).do()
    const clearCompiled = await algod.compile(clearSource).do()

    const approvalProgram = new Uint8Array(Buffer.from(approvalCompiled.result, 'base64'))
    const clearProgram = new Uint8Array(Buffer.from(clearCompiled.result, 'base64'))

    console.log('[MICROFLUX Deploy] Compiled. Building create transaction...')

    // 3. Build application create transaction
    const suggestedParams = await algod.getTransactionParams().do()

    // Global state schema: 6 uints, 1 byte-slice
    const globalInts = 5   // workflow_count, total_executions, last_execution_time, public_execution + creator
    const globalBytes = 1  // last_workflow_hash
    const localInts = 0
    const localBytes = 0

    const txn = algosdk.makeApplicationCreateTxnFromObject({
      from: senderAddress,
      approvalProgram,
      clearProgram,
      numGlobalByteSlices: globalBytes,
      numGlobalInts: globalInts,
      numLocalByteSlices: localBytes,
      numLocalInts: localInts,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      suggestedParams,
    })

    console.log('[MICROFLUX Deploy] Requesting wallet signature...')

    // 4. Sign with wallet
    const signedTxns = await signer([txn], [0])

    // 5. Submit
    const { txId } = await algod.sendRawTransaction(signedTxns[0]).do()
    console.log(`[MICROFLUX Deploy] Submitted. TX: ${txId}`)

    // 6. Wait for confirmation
    const result = await algosdk.waitForConfirmation(algod, txId, 4)
    const appId = result['application-index'] as number
    const appAddress = algosdk.getApplicationAddress(appId)

    console.log(`[MICROFLUX Deploy] Deployed. App ID: ${appId}`)
    console.log(`[MICROFLUX Deploy] App Address: ${appAddress}`)

    return { appId, txId, appAddress, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deployment failed'
    console.error('[MICROFLUX Deploy] Failed:', err)

    if (message.includes('cancelled') || message.includes('rejected') || message.includes('User refused')) {
      return { appId: 0, txId: '', appAddress: '', success: false, error: 'Deployment rejected by user' }
    }
    return { appId: 0, txId: '', appAddress: '', success: false, error: message }
  }
}

// ── Explorer URLs ────────────────────────────

export function getAppExplorerUrl(appId: number, network: string): string {
  const base = network === 'mainnet'
    ? 'https://lora.algokit.io/mainnet'
    : network === 'testnet'
      ? 'https://lora.algokit.io/testnet'
      : 'https://lora.algokit.io/localnet'
  return `${base}/application/${appId}`
}
