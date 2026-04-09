/**
 * Market Data Service — CoinGecko API Integration
 * Provides real-time token price data for ALGO and ASA tokens
 */

// ── Types ────────────────────────────────────

export interface TokenPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  last_updated: string;
}

interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  last_updated: string;
}

// ── Cache ────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 45000; // 45 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Constants ────────────────────────────────

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Supported tokens (mapped to CoinGecko IDs)
export const SUPPORTED_TOKENS: Record<string, string> = {
  ALGO: 'algorand',
  USDC: 'usd-coin',
  USDT: 'tether',
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

// ── API Calls ────────────────────────────────

/**
 * Fetch price for ALGO (primary token)
 */
export async function getAlgoPrice(): Promise<TokenPrice> {
  const cacheKey = 'algo_price';
  const cached = getCached<TokenPrice>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=algorand&order=market_cap_desc`
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data: CoinGeckoPrice[] = await res.json();
    if (!data.length) {
      throw new Error('No price data returned');
    }

    const price: TokenPrice = {
      id: data[0].id,
      symbol: data[0].symbol.toUpperCase(),
      name: data[0].name,
      current_price: data[0].current_price,
      price_change_24h: data[0].price_change_24h,
      price_change_percentage_24h: data[0].price_change_percentage_24h,
      last_updated: data[0].last_updated,
    };

    setCache(cacheKey, price);
    return price;
  } catch (err) {
    // Return fallback data if API fails
    console.warn('CoinGecko API unavailable, using fallback price:', err);
    return {
      id: 'algorand',
      symbol: 'ALGO',
      name: 'Algorand',
      current_price: 0.24,
      price_change_24h: 0.005,
      price_change_percentage_24h: 2.1,
      last_updated: new Date().toISOString(),
    };
  }
}

/**
 * Fetch prices for multiple tokens
 */
export async function getTokenPrices(symbols: string[]): Promise<TokenPrice[]> {
  const ids = symbols
    .map((s) => SUPPORTED_TOKENS[s.toUpperCase()])
    .filter(Boolean);

  if (!ids.length) return [];

  const cacheKey = `prices_${ids.join(',')}`;
  const cached = getCached<TokenPrice[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc`
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data: CoinGeckoPrice[] = await res.json();
    const prices: TokenPrice[] = data.map((d) => ({
      id: d.id,
      symbol: d.symbol.toUpperCase(),
      name: d.name,
      current_price: d.current_price,
      price_change_24h: d.price_change_24h,
      price_change_percentage_24h: d.price_change_percentage_24h,
      last_updated: d.last_updated,
    }));

    setCache(cacheKey, prices);
    return prices;
  } catch (err) {
    console.warn('Failed to fetch token prices:', err);
    return [];
  }
}

/**
 * Convert ALGO amount to USD equivalent
 */
export async function algoToUsd(algoAmount: number): Promise<{
  usd: number;
  price: number;
  formatted: string;
}> {
  const price = await getAlgoPrice();
  const usd = algoAmount * price.current_price;
  return {
    usd,
    price: price.current_price,
    formatted: `$${usd.toFixed(2)}`,
  };
}

/**
 * Format price with change indicator
 */
export function formatPriceChange(change: number): {
  text: string;
  direction: 'up' | 'down' | 'neutral';
} {
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
  const sign = change > 0 ? '+' : '';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    direction,
  };
}

/**
 * Get price for a specific token by symbol
 */
export async function getTokenPrice(symbol: string): Promise<TokenPrice | null> {
  const prices = await getTokenPrices([symbol]);
  return prices[0] ?? null;
}
