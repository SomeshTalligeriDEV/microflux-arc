// src/core/engine/folksRouter.ts
import algosdk from 'algosdk';
import { algoClient } from './algorand';

const FOLKS_ROUTER_API = "https://api.folks.finance/v1/router"; // Replace with actual endpoint if changed

export const executeSwap = async (
  sender: string,
  fromAsset: string,
  toAsset: string,
  amount: number
) => {
  try {
    // 1. Map symbols to Asset IDs (ASA IDs) [cite: 46]
    // In a real app, fetch these dynamically. For hackathon, hardcode common ones.
    const assetMap: Record<string, number> = {
      "ALGO": 0,
      "USDC": 31566704, // Mainnet. Use TestNet IDs for the demo!
      "USDT": 312769
    };

    const fromAssetId = assetMap[fromAsset.toUpperCase()];
    const toAssetId = assetMap[toAsset.toUpperCase()];

    console.log(`[QUOTE] Fetching quote: ${amount} ${fromAsset} -> ${toAsset}...`);

    // 2. Get Swap Quote from Folks Router 
    const quoteResponse = await fetch(
      `${FOLKS_ROUTER_API}/quote?fromAsset=${fromAssetId}&toAsset=${toAssetId}&amount=${amount}&type=fixed-input`
    );

    if (!quoteResponse.ok) throw new Error("Failed to get quote from Folks Router");
    const quoteData = await quoteResponse.json();

    // 3. Construct the Transaction [cite: 31, 48]
    // Note: On the backend, we prepare the transaction for the user to sign via Pera Wallet [cite: 105]
    console.log(`[OK] Quote received. Best path found via Folks Router.`);
    
    // In a hackathon context, the backend usually returns the transaction 
    // bytes for the frontend to sign with the user's wallet.
    return {
      quote: quoteData,
      fromAssetId,
      toAssetId,
      amount
    };
  } catch (error) {
    console.error("Folks Router Error:", error);
    throw error;
  }
};