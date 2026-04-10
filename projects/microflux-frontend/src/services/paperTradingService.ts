/**
 * Paper Trading Engine — Simulation Only
 * NO real trades. NO real orders. NO financial risk.
 * All portfolio data is stored in-memory (browser session).
 */

// ── Types ────────────────────────────────────

export interface Trade {
  id: string;
  time: string;
  timestamp: number;
  action: 'BUY' | 'SELL';
  token: string;
  price: number;
  amount: number;
  total: number;
  source: 'manual' | 'ai';
}

export interface Portfolio {
  cash: number;
  algo: number;
  pnl: number;
  pnlPercent: number;
  totalValue: number;
  initialValue: number;
  trades: Trade[];
}

export interface AIDecision {
  action: 'buy' | 'sell' | 'hold';
  amount: number;
  reason: string;
  confidence?: number;
}

export interface PaymentLog {
  txId: string;
  time: string;
  status: 'confirmed' | 'pending' | 'failed';
  fee: string;
}

// ── State ────────────────────────────────────

const INITIAL_CASH = 10_000;

let portfolio: Portfolio = {
  cash: INITIAL_CASH,
  algo: 0,
  pnl: 0,
  pnlPercent: 0,
  totalValue: INITIAL_CASH,
  initialValue: INITIAL_CASH,
  trades: [],
};

let paymentLogs: PaymentLog[] = [];

// ── Portfolio Functions ──────────────────────

/**
 * Get current portfolio state
 */
export function getPortfolio(): Portfolio {
  return { ...portfolio, trades: [...portfolio.trades] };
}

/**
 * Update portfolio value based on current price
 */
export function updatePortfolioValue(currentPrice: number): Portfolio {
  portfolio.totalValue = portfolio.cash + (portfolio.algo * currentPrice);
  portfolio.pnl = portfolio.totalValue - portfolio.initialValue;
  portfolio.pnlPercent = (portfolio.pnl / portfolio.initialValue) * 100;
  return getPortfolio();
}

/**
 * Execute a BUY trade (paper)
 */
export function executeBuy(
  price: number,
  amountUsd: number,
  source: 'manual' | 'ai' = 'manual'
): { success: boolean; trade?: Trade; error?: string } {
  if (amountUsd <= 0) return { success: false, error: 'Invalid amount' };
  if (amountUsd > portfolio.cash) return { success: false, error: 'Insufficient cash balance' };

  const algoAmount = amountUsd / price;
  portfolio.cash -= amountUsd;
  portfolio.algo += algoAmount;

  const trade: Trade = {
    id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    action: 'BUY',
    token: 'ALGO',
    price,
    amount: algoAmount,
    total: amountUsd,
    source,
  };

  portfolio.trades.unshift(trade);
  if (portfolio.trades.length > 50) portfolio.trades.pop();

  // Simulate MicroFlux payment
  logPayment();

  return { success: true, trade };
}

/**
 * Execute a SELL trade (paper)
 */
export function executeSell(
  price: number,
  algoAmount: number,
  source: 'manual' | 'ai' = 'manual'
): { success: boolean; trade?: Trade; error?: string } {
  if (algoAmount <= 0) return { success: false, error: 'Invalid amount' };
  if (algoAmount > portfolio.algo) return { success: false, error: 'Insufficient ALGO holdings' };

  const usdValue = algoAmount * price;
  portfolio.algo -= algoAmount;
  portfolio.cash += usdValue;

  const trade: Trade = {
    id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    action: 'SELL',
    token: 'ALGO',
    price,
    amount: algoAmount,
    total: usdValue,
    source,
  };

  portfolio.trades.unshift(trade);
  if (portfolio.trades.length > 50) portfolio.trades.pop();

  logPayment();

  return { success: true, trade };
}

/**
 * Reset portfolio to initial state
 */
export function resetPortfolio(): Portfolio {
  portfolio = {
    cash: INITIAL_CASH,
    algo: 0,
    pnl: 0,
    pnlPercent: 0,
    totalValue: INITIAL_CASH,
    initialValue: INITIAL_CASH,
    trades: [],
  };
  paymentLogs = [];
  return getPortfolio();
}

// ── MicroFlux Payment Simulation ─────────────

function logPayment(): void {
  paymentLogs.unshift({
    txId: 'mfx_' + Math.random().toString(36).substr(2, 12),
    time: new Date().toLocaleTimeString(),
    status: 'confirmed',
    fee: '0.001 ALGO',
  });
  if (paymentLogs.length > 30) paymentLogs.pop();
}

export function getPaymentLogs(): PaymentLog[] {
  return [...paymentLogs];
}

// ── AI Decision Execution ────────────────────

/**
 * Execute an AI-generated trading decision
 */
export function executeAIDecision(
  decision: AIDecision,
  currentPrice: number
): { success: boolean; message: string; trade?: Trade } {
  if (decision.action === 'hold') {
    return { success: true, message: decision.reason };
  }

  if (decision.action === 'buy') {
    const maxCash = portfolio.cash * 0.3; // Max 30% of cash per AI rule
    const buyAmount = Math.min(decision.amount, maxCash);
    if (buyAmount < 1) return { success: false, message: 'Insufficient balance for AI trade' };
    
    const result = executeBuy(currentPrice, buyAmount, 'ai');
    return {
      success: result.success,
      message: result.success
        ? `AI: Bought ${result.trade!.amount.toFixed(2)} ALGO at $${currentPrice.toFixed(4)}`
        : result.error ?? 'Buy failed',
      trade: result.trade,
    };
  }

  if (decision.action === 'sell') {
    const maxSell = portfolio.algo * 0.5; // Max 50% sell at a time
    const sellAmount = Math.min(decision.amount, maxSell);
    if (sellAmount < 0.1) return { success: false, message: 'Insufficient ALGO for AI sell' };

    const result = executeSell(currentPrice, sellAmount, 'ai');
    return {
      success: result.success,
      message: result.success
        ? `AI: Sold ${result.trade!.amount.toFixed(2)} ALGO at $${currentPrice.toFixed(4)}`
        : result.error ?? 'Sell failed',
      trade: result.trade,
    };
  }

  return { success: false, message: 'Invalid AI action' };
}

// ── Groq AI Strategy Call ────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function getAIStrategy(
  currentPrice: number,
  groqApiKey: string
): Promise<AIDecision> {
  if (!groqApiKey) {
    throw new Error('Groq API key is required. Set it in the AI Copilot tab.');
  }

  const prompt = `You are a conservative crypto trading assistant for ALGO (Algorand).

Current market data from Binance:
- ALGO/USDT Price: $${currentPrice.toFixed(4)}
- Portfolio Cash: $${portfolio.cash.toFixed(2)}
- Portfolio ALGO: ${portfolio.algo.toFixed(2)} ALGO
- Total Value: $${portfolio.totalValue.toFixed(2)}
- P&L: ${portfolio.pnl >= 0 ? '+' : ''}$${portfolio.pnl.toFixed(2)} (${portfolio.pnlPercent.toFixed(2)}%)
- Total Trades: ${portfolio.trades.length}

Rules:
- Never use more than 30% of available cash in a single buy
- Avoid frequent trades (check last trade time)
- Prefer "hold" if market is uncertain
- Consider recent price momentum
- Output STRICT JSON only, no commentary

Respond with exactly this JSON structure:
{"action": "buy" | "sell" | "hold", "amount": number, "reason": "string", "confidence": number}

Where amount is in USD for buy, or in ALGO for sell.`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a crypto trading AI that only outputs valid JSON. No markdown, no explanation, just the JSON object.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();

  if (!raw) throw new Error('Empty response from Groq');

  // Extract JSON from response (handle markdown wrapping)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');

  const decision: AIDecision = JSON.parse(jsonMatch[0]);

  // Validate
  if (!['buy', 'sell', 'hold'].includes(decision.action)) {
    throw new Error(`Invalid action: ${decision.action}`);
  }

  return decision;
}
