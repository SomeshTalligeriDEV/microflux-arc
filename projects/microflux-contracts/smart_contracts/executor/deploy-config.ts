import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { WorkflowExecutorFactory } from '../artifacts/executor/WorkflowExecutorClient'

/**
 * Deploy WorkflowExecutor to Algorand Testnet.
 *
 * After deployment, copy the App ID to your frontend .env:
 *   VITE_APP_ID=<app_id>
 */
export async function deploy() {
  console.log('=== Deploying WorkflowExecutor ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  console.log(`Deployer: ${deployer.addr}`)

  const factory = algorand.client.getTypedAppFactory(WorkflowExecutorFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  const appId = appClient.appClient.appId
  const appAddress = appClient.appAddress

  console.log(`✅ WorkflowExecutor deployed!`)
  console.log(`   App ID:      ${appId}`)
  console.log(`   App Address: ${appAddress}`)
  console.log(`   TX ID:       ${result.transaction.txID()}`)
  console.log(``)
  console.log(`📋 Add to your frontend .env:`)
  console.log(`   VITE_APP_ID=${appId}`)

  // If app was just created, fund the app account with MBR
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appAddress,
    })
    console.log(`💰 Funded app with 1 ALGO for MBR`)
  }

  // Verify deployment with a test call
  const testResponse = await appClient.send.getAppInfo({})
  console.log(`🔍 Verification: ${testResponse.return}`)

  // Call hello to ensure backward compat
  const helloResponse = await appClient.send.hello({
    args: { name: 'MICROFLUX' },
  })
  console.log(`🔍 Hello test: ${helloResponse.return}`)

  return { appId, appAddress }
}
