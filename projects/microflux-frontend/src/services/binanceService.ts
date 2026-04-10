/**
 * Binance Market Data Service
 * Public API only — NO trading, NO API keys, NO real orders
 * Used for paper trading simulation with real-time price data
 */

// ── Types ────────────────────────────────────

export interface BinancePrice {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: string;
}

export interface PricePoint {
  time: string;
  price: number;
  timestamp: number;
}

// ── Cache ────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const priceCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 10_000; // 10 seconds

function getCached<T>(key: string): T | null {
  const entry = priceCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    priceCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  priceCache.set(key, { data, timestamp: Date.now() });
}

// ── Binance Symbol Map ───────────────────────

const BINANCE_SYMBOLS: Record<string, string> = {
  ALGO: 'ALGOUSDT',
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  AVAX: 'AVAXUSDT',
  DOT: 'DOTUSDT',
  MATIC: 'MATICUSDT',
  LINK: 'LINKUSDT',
};

const TOKEN_NAMES: Record<string, string> = {
  ALGO: 'Algorand',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  LINK: 'Chainlink',
};

// ── API Functions ────────────────────────────

/**
 * Fetch current price from Binance Public API
 */
export async function getBinancePrice(token: string): Promise<BinancePrice> {
  const symbol = BINANCE_SYMBOLS[token.toUpperCase()];
  if (!symbol) throw new Error(`Unsupported token: ${token}`);

  const cacheKey = `binance_${symbol}`;
  const cached = getCached<BinancePrice>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
    );

    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);

    const data = await res.json();

    const price: BinancePrice = {
      symbol: token.toUpperCase(),
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChange),
      changePercent24h: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      lastUpdated: new Date().toISOString(),
    };

    setCache(cacheKey, price);
    return price;
  } catch (err) {
    console.warn(`[Binance] Failed to fetch ${token}:`, err);
    // Fallback
    return {
      symbol: token.toUpperCase(),
      price: token === 'BTC' ? 68000 : token === 'ETH' ? 2400 : 0.22,
      change24h: 0,
      changePercent24h: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Fetch multiple token prices
 */
export async function getMultiplePrices(tokens: string[]): Promise<BinancePrice[]> {
  const results = await Promise.allSettled(
    tokens.map((t) => getBinancePrice(t))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<BinancePrice> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * Get token display name
 */
export function getTokenName(symbol: string): string {
  return TOKEN_NAMES[symbol.toUpperCase()] ?? symbol;
}

/**
 * Format price change
 */
export function formatChange(percent: number): { text: string; direction: 'up' | 'down' | 'neutral' } {
  const direction = percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral';
  const sign = percent > 0 ? '+' : '';
  return {
    text: `${sign}${percent.toFixed(2)}%`,
    direction,
  };
}

// ── Klines / Candlestick Data ────────────────

export interface Kline {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Fetch historical klines (candlestick) data from Binance
 * interval: 1m, 5m, 15m, 1h, 4h, 1d
 */
export async function getKlines(
  token: string,
  interval: string = '1h',
  limit: number = 100
): Promise<Kline[]> {
  const symbol = BINANCE_SYMBOLS[token.toUpperCase()];
  if (!symbol) return [];

  const cacheKey = `klines_${symbol}_${interval}_${limit}`;
  const cached = getCached<Kline[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Klines API error: ${res.status}`);

    const data = await res.json();

    const klines: Kline[] = data.map((k: any[]) => {
      const openTime = new Date(k[0]);
      return {
        time: openTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
          ' ' + openTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        timestamp: k[0],
      };
    });

    setCache(cacheKey, klines as any);
    return klines;
  } catch (err) {
    console.warn('[Binance] Klines fetch failed:', err);
    return [];
  }
}

// ── Order Book (Top of Book) ─────────────────

export interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

export async function getOrderBook(
  token: string,
  limit: number = 10
): Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }> {
  const symbol = BINANCE_SYMBOLS[token.toUpperCase()];
  if (!symbol) return { bids: [], asks: [] };

  const cacheKey = `orderbook_${symbol}`;
  const cached = getCached<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Depth API error: ${res.status}`);

    const data = await res.json();

    const mapEntries = (entries: string[][]): OrderBookEntry[] => {
      let cumTotal = 0;
      return entries.map((e: string[]) => {
        const size = parseFloat(e[1]);
        cumTotal += size;
        return {
          price: parseFloat(e[0]),
          size,
          total: cumTotal,
        };
      });
    };

    const book = {
      bids: mapEntries(data.bids),
      asks: mapEntries(data.asks),
    };

    setCache(cacheKey, book as any);
    return book;
  } catch (err) {
    console.warn('[Binance] Order book fetch failed:', err);
    return { bids: [], asks: [] };
  }
}
