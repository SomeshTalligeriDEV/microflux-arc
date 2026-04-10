import { Request, Response } from 'express';
import axios from 'axios';

// ── In-Memory State ──────────────────────────
let agentState = {
  balance: 10000,      // USD
  holdings: 0,         // BTC
  lastAction: 'IDLE',
  reason: 'Agent initialized. Waiting for trigger.',
  lastUpdate: new Date().toISOString(),
  autoMode: false,
  priceHistory: [] as { time: string; price: number }[],
  tradeHistory: [] as any[],
  paymentLogs: [] as any[],
};

// ── Helpers ──────────────────────────────────
const checkPayment = () => ({
  success: true,
  txId: 'mfx_pay_' + Math.random().toString(36).substr(2, 9),
  amount: '0.001 ALGO',
  status: 'confirmed',
  time: new Date().toLocaleTimeString(),
});

/**
 * AI Agent Logic Cycle
 */
const runAgentCycle = async () => {
  try {
    // 1. Payment Check
    const payment = checkPayment();
    agentState.paymentLogs.unshift(payment);
    if (agentState.paymentLogs.length > 20) agentState.paymentLogs.pop();

    // 2. Fetch Price
    const resp = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const price = parseFloat(resp.data.price);
    const time = new Date().toLocaleTimeString();

    agentState.priceHistory.push({ time, price });
    if (agentState.priceHistory.length > 50) agentState.priceHistory.shift();
    agentState.lastUpdate = new Date().toISOString();

    if (!agentState.autoMode) return { price, action: 'MANUAL_WAIT' };

    // 3. Trading Logic
    let action = 'HOLD';
    let reason = 'Price within stability range.';

    if (price < 60000 && agentState.balance >= 1000) {
      action = 'BUY';
      const amount = 1000 / price;
      agentState.balance -= 1000;
      agentState.holdings += amount;
      reason = `Price $${price.toLocaleString()} dropped below $60k threshold.`;
      
      agentState.tradeHistory.unshift({
        time,
        action: 'BUY',
        price: price.toFixed(2),
        amount: amount.toFixed(6),
        total: '$1,000.00',
      });
    } 
    else if (price > 65000 && agentState.holdings > 0) {
      action = 'SELL';
      const total = agentState.holdings * price;
      reason = `Price $${price.toLocaleString()} exceeded $65k profit target.`;
      
      agentState.tradeHistory.unshift({
        time,
        action: 'SELL',
        price: price.toFixed(2),
        amount: agentState.holdings.toFixed(6),
        total: `$${total.toLocaleString()}`,
      });

      agentState.balance += total;
      agentState.holdings = 0;
    }

    agentState.lastAction = action;
    agentState.reason = reason;

    return { price, action };
  } catch (err) {
    console.error('Agent Cycle Error:', err);
    return null;
  }
};

// ── Controller Methods ───────────────────────

export const getAgentState = (req: Request, res: Response) => {
  res.json(agentState);
};

export const toggleAutoMode = (req: Request, res: Response) => {
  agentState.autoMode = req.body.enabled;
  res.json({ success: true, autoMode: agentState.autoMode });
};

export const triggerManualCycle = async (req: Request, res: Response) => {
  const result = await runAgentCycle();
  res.json({ success: true, result });
};

// Auto-run cycle every 5 seconds
setInterval(() => {
  runAgentCycle();
}, 5000);
