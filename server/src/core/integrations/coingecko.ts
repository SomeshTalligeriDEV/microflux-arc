// src/core/integrations/coingecko.ts

export const getAssetPrice = async (asset: string, currency: string = 'usd'): Promise<number> => {
  try {
    // Standardizing asset names for CoinGecko (ALGO -> algorand)
    const coinId = asset.toLowerCase() === 'algo' ? 'algorand' : asset.toLowerCase();
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${currency}`
    );

    if (!response.ok) throw new Error("CoinGecko API unreachable");

    const data = await response.json();
    return data[coinId][currency];
  } catch (error) {
    console.error("Price Fetch Error:", error);
    throw error;
  }
};