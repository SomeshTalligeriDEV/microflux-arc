import { Swap, poolUtils } from '@tinymanorg/tinyman-js-sdk';
import algosdk from 'algosdk';

async function testQuote() {
  const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
  console.log("Checking Tinyman Testnet Pool");
  try {
    const poolInfo = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network: 'testnet',
      asset1ID: 0,
      asset2ID: 10458941,
    });
    console.log("Pool Info:", poolInfo ? "EXISTS" : "MISSING");
    
    if (poolInfo) {
      const quote = await Swap.v2.getQuote({
        type: 'fixed-input' as any,
        amount: BigInt(1_000_000), // 1 ALGO
        assetIn: { id: 0, decimals: 6 } as any,
        assetOut: { id: 10458941, decimals: 6 } as any,
        pool: poolInfo,
        network: 'testnet',
        slippage: 0.01,
      });
      console.log("Quote data:", quote.data || quote);
    }
  } catch (err) {
    console.error("Quote failed:", err);
  }
}
testQuote();
