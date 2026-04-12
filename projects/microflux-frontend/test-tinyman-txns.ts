import { Swap, poolUtils } from '@tinymanorg/tinyman-js-sdk';
import algosdk from 'algosdk';

async function testGenerate() {
  const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
  try {
    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network: 'testnet',
      asset1ID: 0,
      asset2ID: 10458941,
    });
    
    const quote = await Swap.v2.getQuote({
      type: 'fixed-input' as any,
      amount: BigInt(1_000_000), // 1 ALGO
      assetIn: { id: 0, decimals: 6 } as any,
      assetOut: { id: 10458941, decimals: 6 } as any,
      pool: poolInfo,
      network: 'testnet',
      slippage: 0.01,
    });
    
    console.log("Generating grouped txns...");
    const txnGroup = await Swap.v2.generateTxns({
      client: algod as any,
      network: 'testnet',
      quote: quote as any,
      swapType: 'fixed-input' as any,
      slippage: 0.01,
      initiatorAddr: 'YQNNX7A2FZYVIMBYYYY2YFVXZZTRXPM2T2D7YVYK2JHV7V7XJ4X7V4U2M4', // random dummy
    });
    
    console.log(`Generated ${txnGroup.length} txns.`);
    for (let i = 0; i < txnGroup.length; i++) {
        console.log(`Txn ${i}: Signers =`, txnGroup[i].signers);
    }
  } catch (err) {
    console.error("Failed:", err);
  }
}
testGenerate();
