/**
 * Template Marketplace — Pre-built Workflow Definitions
 * Local JSON templates for common Algorand workflows
 */

import type { AINode, AIEdge } from './aiService';

// ── Types ────────────────────────────────────

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  nodes: AINode[];
  edges: AIEdge[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedGas: string;
  author: string;
}

export type TemplateCategory = 'payments' | 'treasury' | 'trading' | 'automation';

// ── Template Definitions ─────────────────────

export const TEMPLATES: WorkflowTemplate[] = [
  // ── PAYMENTS ────────────────────────────────
  {
    id: 'tpl_send_algo',
    name: 'Send ALGO',
    description: 'Simple payment workflow: send ALGO from one wallet to another with confirmation.',
    category: 'payments',
    tags: ['payment', 'algo', 'transfer', 'real'],
    difficulty: 'beginner',
    estimatedGas: '0.001 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'wallet_event',
        label: 'Trigger: Manual',
        category: 'trigger',
        config: { event: 'manual_trigger' },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'send_payment',
        label: 'Send 0.01 ALGO',
        category: 'action',
        config: { amount: 10000, receiver: '' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'debug_log',
        label: 'Log Result',
        category: 'logic',
        config: { message: 'Payment sent successfully' },
        position: { x: 620, y: 200 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },

  {
    id: 'tpl_asa_transfer',
    name: 'ASA Transfer',
    description: 'Transfer Algorand Standard Assets with opt-in check and confirmation notification.',
    category: 'payments',
    tags: ['asa', 'transfer', 'token', 'real'],
    difficulty: 'intermediate',
    estimatedGas: '0.002 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'wallet_event',
        label: 'Trigger: Manual',
        category: 'trigger',
        config: { event: 'manual_trigger' },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'filter',
        label: 'Check Opt-In',
        category: 'logic',
        config: { condition: '==', field: 'status', value: 'opted_in' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'asa_transfer',
        label: 'Transfer ASA',
        category: 'action',
        config: { asset_id: 0, amount: 100, receiver: '' },
        position: { x: 620, y: 150 },
      },
      {
        id: 'n4',
        type: 'browser_notification',
        label: 'Notify: Success',
        category: 'notification',
        config: { title: 'ASA Transfer Complete', body: 'Tokens sent successfully' },
        position: { x: 890, y: 150 },
      },
      {
        id: 'n5',
        type: 'debug_log',
        label: 'Log: Not Opted In',
        category: 'logic',
        config: { message: 'Receiver has not opted in to asset' },
        position: { x: 620, y: 300 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n5' },
      { id: 'e4', source: 'n3', target: 'n4' },
    ],
  },

  // ── TREASURY ────────────────────────────────
  {
    id: 'tpl_treasury_dist',
    name: 'Treasury Distribution',
    description: 'Distribute funds from a treasury wallet to multiple recipients in a single workflow.',
    category: 'treasury',
    tags: ['treasury', 'distribution', 'multi-send', 'real'],
    difficulty: 'advanced',
    estimatedGas: '0.005 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'wallet_event',
        label: 'Trigger: Manual',
        category: 'trigger',
        config: { event: 'manual_trigger' },
        position: { x: 80, y: 250 },
      },
      {
        id: 'n2',
        type: 'get_quote',
        label: 'Get ALGO Price',
        category: 'defi',
        config: { token: 'ALGO' },
        position: { x: 350, y: 250 },
      },
      {
        id: 'n3',
        type: 'send_payment',
        label: 'Pay Team Lead (40%)',
        category: 'action',
        config: { amount: 4000000, receiver: '' },
        position: { x: 650, y: 100 },
      },
      {
        id: 'n4',
        type: 'send_payment',
        label: 'Pay Dev Fund (35%)',
        category: 'action',
        config: { amount: 3500000, receiver: '' },
        position: { x: 650, y: 250 },
      },
      {
        id: 'n5',
        type: 'send_payment',
        label: 'Pay Reserve (25%)',
        category: 'action',
        config: { amount: 2500000, receiver: '' },
        position: { x: 650, y: 400 },
      },
      {
        id: 'n6',
        type: 'browser_notification',
        label: 'Distribution Complete',
        category: 'notification',
        config: { title: 'Treasury', body: 'All payments distributed' },
        position: { x: 950, y: 250 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n4' },
      { id: 'e4', source: 'n2', target: 'n5' },
      { id: 'e5', source: 'n3', target: 'n6' },
      { id: 'e6', source: 'n4', target: 'n6' },
      { id: 'e7', source: 'n5', target: 'n6' },
    ],
  },

  // ── TRADING ─────────────────────────────────
  {
    id: 'tpl_price_alert',
    name: 'Price Alert Workflow',
    description: 'Monitor ALGO price and trigger a notification when it crosses a threshold.',
    category: 'trading',
    tags: ['trading', 'alert', 'price', 'mock'],
    difficulty: 'beginner',
    estimatedGas: '0 ALGO (off-chain)',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'timer_loop',
        label: 'Check Every 60s',
        category: 'trigger',
        config: { interval: 60000 },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'price_feed',
        label: 'Get ALGO/USD',
        category: 'defi',
        config: { token: 'ALGO', vs: 'USD' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'filter',
        label: 'Price > $0.30?',
        category: 'logic',
        config: { condition: '>', field: 'price', value: 0.30 },
        position: { x: 620, y: 200 },
      },
      {
        id: 'n4',
        type: 'browser_notification',
        label: 'Alert: Price Up!',
        category: 'notification',
        config: { title: 'ALGO Price Alert', body: 'ALGO crossed $0.30!' },
        position: { x: 890, y: 200 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },

  {
    id: 'tpl_ai_trading_agent',
    name: 'Autonomous AI Trading Agent',
    description: 'Autonomous paper trading agent with Binance API integration and MicroFlux payment gating. Runs continuous loops with buy/sell logic based on price action.',
    category: 'trading',
    tags: ['ai', 'agent', 'binance', 'paper-trading', 'automation'],
    difficulty: 'advanced',
    estimatedGas: '0.001 ALGO (per payment)',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'timer_loop',
        label: 'Agent Loop: 10s',
        category: 'trigger',
        config: { interval: 10000 },
        position: { x: 50, y: 250 },
      },
      {
        id: 'n2',
        type: 'app_call',
        label: 'Verify MicroFlux Payment',
        category: 'action',
        config: { app_id: 758592157, method: 'execute' },
        position: { x: 300, y: 250 },
      },
      {
        id: 'n3',
        type: 'http_request',
        label: 'Fetch BTC/USDT (Binance)',
        category: 'action',
        config: { url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', method: 'GET' },
        position: { x: 550, y: 250 },
      },
      {
        id: 'n4',
        type: 'filter',
        label: 'Trade Logic Check',
        category: 'logic',
        config: { condition: '>', field: 'price', value: 65000 },
        position: { x: 800, y: 250 },
      },
      {
        id: 'n5',
        type: 'debug_log',
        label: 'Execute Paper Trade',
        category: 'logic',
        config: { message: 'Agent action: BUY/SELL executed via Paper Engine' },
        position: { x: 1050, y: 250 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },

  {
    id: 'tpl_tinyman_swap',
    name: 'DeFi Swap (Tinyman)',
    description: 'Swap ALGO for USDC on Tinyman V2 DEX with price check and confirmation notification. Real on-chain transactions.',
    category: 'trading',
    tags: ['defi', 'swap', 'tinyman', 'dex', 'real', 'usdc'],
    difficulty: 'intermediate',
    estimatedGas: '0.004 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'wallet_event',
        label: 'Trigger: Manual',
        category: 'trigger',
        config: { event: 'manual_trigger' },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'price_feed',
        label: 'Check ALGO Price',
        category: 'defi',
        config: { token: 'ALGO', vs: 'USD' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'tinyman_swap',
        label: 'Swap ALGO → USDC',
        category: 'defi',
        config: { fromAssetId: 0, toAssetId: 31566704, amount: 1000000, slippage: 1 },
        position: { x: 620, y: 200 },
      },
      {
        id: 'n4',
        type: 'browser_notification',
        label: 'Swap Complete',
        category: 'notification',
        config: { title: 'Tinyman Swap', body: 'ALGO → USDC swap executed on-chain' },
        position: { x: 890, y: 200 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },

  {
    id: 'tpl_tinyman_swap_receiver',
    name: 'Tinyman Swap & Routing',
    description: 'Provide an external wallet address. The AI agent will auto-swap ALGO for USDC on Tinyman and immediately route it to the provided destination wallet address.',
    category: 'trading',
    tags: ['defi', 'swap', 'tinyman', 'transfer', 'agent'],
    difficulty: 'advanced',
    estimatedGas: '0.005 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'wallet_event',
        label: 'Trigger: Manual',
        category: 'trigger',
        config: { event: 'manual_trigger' },
        position: { x: 50, y: 200 },
      },
      {
        id: 'n2',
        type: 'tinyman_swap',
        label: 'Swap ALGO → USDC',
        category: 'defi',
        config: { fromAssetId: 0, toAssetId: 31566704, amount: 1000000, slippage: 1 },
        position: { x: 300, y: 200 },
      },
      {
        id: 'n3',
        type: 'filter',
        label: 'Check Swap Tx Success',
        category: 'logic',
        config: { condition: '==', field: 'status', value: 'success' },
        position: { x: 550, y: 200 },
      },
      {
        id: 'n4',
        type: 'asa_transfer',
        label: 'Route USDC to Wallet',
        category: 'action',
        config: { asset_id: 31566704, amount: 1000000, receiver: '' },
        position: { x: 800, y: 200 },
      },
      {
        id: 'n5',
        type: 'browser_notification',
        label: 'Routing Complete',
        category: 'notification',
        config: { title: 'Swap & Route', body: 'USDC successfully routed.' },
        position: { x: 1050, y: 200 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },

  {
    id: 'tpl_ai_defi_arbitrage',
    name: '🧠 AI Copilot: Adaptive Arbitrage & Yield',
    description: '[HACKATHON GOLD] A next-gen workflow triggered by an autonomous AI agent reading market sentiment via an LLM. When sentiment flashes green, the AI commands MicroFlux to instantly execute a complex DeFi strategy: querying Oracle prices, swapping ALGO for Yield-Tokens, executing App Calls to vault, and persisting the logic state onto Google Sheets!',
    category: 'automation',
    tags: ['ai', 'defi', 'arbitrage', 'llm', 'oracle', 'yield'],
    difficulty: 'advanced',
    estimatedGas: '0.012 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'ai_trigger',
        label: 'A.I. Market Sentiment Sentinel',
        category: 'trigger',
        config: { provider: 'Groq', apiKey: '', prompt: 'If ALGO price volatility spikes > 5% and social sentiment is bullish, trigger yield deployment execution.' },
        position: { x: 50, y: 300 },
      },
      {
        id: 'n2',
        type: 'price_feed',
        label: 'Query Pyth Oracle',
        category: 'defi',
        config: { asset_id: 0 },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'tinyman_swap',
        label: 'Flash Swap ALGO → USDC',
        category: 'defi',
        config: { fromAssetId: 0, toAssetId: 31566704, amount: 50000000, slippage: 0.5 },
        position: { x: 350, y: 400 },
      },
      {
        id: 'n4',
        type: 'app_call',
        label: 'Deposit into Vault SC',
        category: 'action',
        config: { app_id: 758592157, method: 'deposit', args: ['amount', '31566704'] },
        position: { x: 650, y: 400 },
      },
      {
        id: 'n5',
        type: 'write_to_spreadsheet',
        label: 'Log Execution to GS',
        category: 'action',
        config: { mapToColumns: true },
        position: { x: 950, y: 300 },
      },
      {
        id: 'n6',
        type: 'telegram_notify',
        label: 'Ping Mobile: Yield Deployed',
        category: 'notification',
        config: { message: 'AI Agent just deployed 50 ALGO to the USDC Vault on Tinyman. Oracle Price verified.' },
        position: { x: 1250, y: 300 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n2', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n5' },
      { id: 'e6', source: 'n5', target: 'n6' },
    ],
  },

  // ── AUTOMATION ──────────────────────────────
  {
    id: 'tpl_scheduled_payment',
    name: 'Scheduled Payment',
    description: 'Simulate scheduled recurring payments with timer triggers and payment actions.',
    category: 'automation',
    tags: ['automation', 'schedule', 'payment', 'mock'],
    difficulty: 'intermediate',
    estimatedGas: '0.001 ALGO per execution',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'timer_loop',
        label: 'Every 24h (Simulated)',
        category: 'trigger',
        config: { interval: 86400000 },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'get_quote',
        label: 'Check Balance',
        category: 'defi',
        config: { token: 'ALGO', action: 'balance_check' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'filter',
        label: 'Balance >= 10 ALGO?',
        category: 'logic',
        config: { condition: '>=', field: 'balance', value: 10000000 },
        position: { x: 620, y: 200 },
      },
      {
        id: 'n4',
        type: 'send_payment',
        label: 'Send Scheduled Payment',
        category: 'action',
        config: { amount: 5000000, receiver: '' },
        position: { x: 890, y: 150 },
      },
      {
        id: 'n5',
        type: 'discord_notify',
        label: 'Notify Discord',
        category: 'notification',
        config: { channel: 'payments', message: 'Scheduled payment sent' },
        position: { x: 1160, y: 150 },
      },
      {
        id: 'n6',
        type: 'debug_log',
        label: 'Log: Insufficient',
        category: 'logic',
        config: { message: 'Insufficient balance for payment' },
        position: { x: 890, y: 320 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n3', target: 'n6' },
      { id: 'e5', source: 'n4', target: 'n5' },
    ],
  },

  {
    id: 'tpl_webhook_action',
    name: 'Webhook → Action',
    description: 'Listen for a webhook trigger, process the data, and execute an on-chain action.',
    category: 'automation',
    tags: ['webhook', 'automation', 'mock'],
    difficulty: 'intermediate',
    estimatedGas: '0.001 ALGO',
    author: 'MICROFLUX-X1',
    nodes: [
      {
        id: 'n1',
        type: 'webhook_trigger',
        label: 'Webhook: /api/trigger',
        category: 'trigger',
        config: { path: '/api/trigger', method: 'POST' },
        position: { x: 80, y: 200 },
      },
      {
        id: 'n2',
        type: 'filter',
        label: 'Validate Payload',
        category: 'logic',
        config: { condition: '!=', field: 'status', value: '' },
        position: { x: 350, y: 200 },
      },
      {
        id: 'n3',
        type: 'send_payment',
        label: 'Execute Payment',
        category: 'action',
        config: { amount: 1000000, receiver: '' },
        position: { x: 620, y: 200 },
      },
      {
        id: 'n4',
        type: 'http_request',
        label: 'Callback: Confirm',
        category: 'action',
        config: { url: 'payload.callback_url', method: 'POST' },
        position: { x: 890, y: 200 },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },
];

// ── Helpers ──────────────────────────────────

export function getTemplatesByCategory(category: TemplateCategory): WorkflowTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return TEMPLATES;
  return TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q))
  );
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export const CATEGORIES: { id: TemplateCategory; label: string; icon: string }[] = [
  { id: 'payments', label: 'Payments', icon: '💸' },
  { id: 'treasury', label: 'Treasury', icon: '🏦' },
  { id: 'trading', label: 'Trading', icon: '📈' },
  { id: 'automation', label: 'Automation', icon: '⚙️' },
];
