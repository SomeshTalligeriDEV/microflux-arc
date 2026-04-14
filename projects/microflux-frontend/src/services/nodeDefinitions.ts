/**
 * Node Palette Definitions
 * Categorized nodes for the MICROFLUX-X1 workflow builder
 */

// ── Types ────────────────────────────────────

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'defi' | 'notification';

export interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  icon: string;
  isReal: boolean; // true = on-chain, false = UI/mock only
  color: string;
  defaultConfig: Record<string, unknown>;
}

// ── Category Colors ──────────────────────────

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  trigger: '#8b5cf6',
  action: '#3b82f6',
  logic: '#f59e0b',
  defi: '#10b981',
  notification: '#ec4899',
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: 'Triggers',
  action: 'Actions',
  logic: 'Logic',
  defi: 'DeFi / Data',
  notification: 'Notifications',
};

// ── Node Definitions ─────────────────────────

export const NODE_DEFINITIONS: NodeDefinition[] = [
  // ── TRIGGERS ────────────────────────────────
  {
    type: 'timer_loop',
    label: 'Timer Loop',
    description:
      'Server runs saved workflows on this interval (ms). Requires workflow saved to DB + active. Uses MICROFLUX_TIMER_TICK_MS poll (default 30s).',
    category: 'trigger',
    icon: '◷',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { interval: 60000 },
  },
  {
    type: 'wallet_event',
    label: 'Wallet Event',
    description:
      'Manual / external signal: POST /api/triggers/wallet-event/:workflowId with MICROFLUX_TRIGGER_SECRET (same as /run). On-chain monitoring not included.',
    category: 'trigger',
    icon: '◇',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { event: 'manual_trigger' },
  },
  {
    type: 'webhook_trigger',
    label: 'Webhook Trigger',
    description:
      'POST /api/triggers/webhook with JSON { path } matching this path (e.g. /api/trigger). Optional header X-Microflux-Trigger-Secret if MICROFLUX_TRIGGER_SECRET is set.',
    category: 'trigger',
    icon: '↗',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { path: '/api/trigger', method: 'POST' },
  },
  {
    type: 'telegram_command',
    label: 'Telegram Command',
    description:
      'Custom command (e.g. /myflow) after /link — must not collide with /start /link /help /workflows /status. Sends workflow result to Telegram.',
    category: 'trigger',
    icon: '✉',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { command: '/myflow', chatId: '' },
  },
  {
    type: 'ai_trigger',
    label: 'AI Copilot Trigger',
    description:
      'External hook: POST /api/triggers/ai/:workflowId (secured). LLM gating can be added later; today runs the saved graph.',
    category: 'trigger',
    icon: '✦',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { provider: 'Groq', apiKey: '', prompt: 'Detect user intent to execute execution flow...' },
  },

  // ── ACTIONS ─────────────────────────────────
  {
    type: 'send_payment',
    label: 'Send Payment',
    description: 'Send ALGO to an address',
    category: 'action',
    icon: '▸',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { amount: 1000000, receiver: '' },
  },
  {
    type: 'asa_transfer',
    label: 'ASA Transfer',
    description: 'Transfer Algorand Standard Asset',
    category: 'action',
    icon: '○',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { asset_id: 0, amount: 0, receiver: '' },
  },
  {
    type: 'app_call',
    label: 'App Call',
    description: 'Call smart contract method',
    category: 'action',
    icon: '■',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { app_id: 0, method: '', args: [] },
  },
  {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'HTTPS request via MicroFlux server (avoids browser CORS)',
    category: 'action',
    icon: '⬡',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { url: '', method: 'GET', headers: {} },
  },
  {
    type: 'write_to_spreadsheet',
    label: 'Write to Spreadsheet',
    description:
      'Append a row via Google Sheets API. Paste your spreadsheet ID (from the URL). Share that sheet with the server service account email (Editor) — no Google login in MicroFlux required.',
    category: 'action',
    icon: '▤',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { spreadsheetId: '', mapToColumns: true },
  },

  // ── LOGIC ───────────────────────────────────
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before next step',
    category: 'logic',
    icon: '—',
    isReal: false,
    color: CATEGORY_COLORS.logic,
    defaultConfig: { duration: 5000 },
  },
  {
    type: 'filter',
    label: 'Filter / Condition',
    description: 'Branch based on conditions',
    category: 'logic',
    icon: '⎇',
    isReal: false,
    color: CATEGORY_COLORS.logic,
    defaultConfig: { condition: '==', field: 'payment_status', value: 'success' },
  },
  {
    type: 'debug_log',
    label: 'Debug Log',
    description: 'Log data to console',
    category: 'logic',
    icon: '>',
    isReal: false,
    color: CATEGORY_COLORS.logic,
    defaultConfig: { message: '' },
  },

  // ── DEFI / DATA ─────────────────────────────
  {
    type: 'get_quote',
    label: 'Get Quote',
    description: 'Fetch token price from CoinGecko',
    category: 'defi',
    icon: '$',
    isReal: false,
    color: CATEGORY_COLORS.defi,
    defaultConfig: { token: 'ALGO', vs: 'USD' },
  },
  {
    type: 'price_feed',
    label: 'Price Feed',
    description: 'Continuous price monitoring',
    category: 'defi',
    icon: '≡',
    isReal: false,
    color: CATEGORY_COLORS.defi,
    defaultConfig: { token: 'ALGO', interval: 30000 },
  },
  {
    type: 'tinyman_swap',
    label: 'Swap (Tinyman - Beta)',
    description: 'DEX swap via Tinyman V2',
    category: 'defi',
    icon: '⇄',
    isReal: true,
    color: CATEGORY_COLORS.defi,
    defaultConfig: { fromAssetId: 0, toAssetId: 31566704, amount: 1000000, slippage: 1 },
  },

  // ── NOTIFICATIONS ───────────────────────────
  {
    type: 'browser_notification',
    label: 'Browser Notification',
    description: 'Show browser notification',
    category: 'notification',
    icon: '•',
    isReal: false,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { title: '', body: '' },
  },
  {
    type: 'telegram_notify',
    label: 'Telegram Notify',
    description:
      'Send a Telegram message via the MicroFlux bot. Leave chatId empty to use the wallet linked with /link in Telegram, or paste a numeric chat id.',
    category: 'notification',
    icon: '▶',
    isReal: true,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { chatId: '', message: '' },
  },
  {
    type: 'discord_notify',
    label: 'Discord Notify',
    description: 'Placeholder / simulation only — real notifications use Telegram Notify',
    category: 'notification',
    icon: '#',
    isReal: false,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { channel: '', message: '' },
  },
];

// ── Helpers ──────────────────────────────────

const NODE_TYPE_TO_CATEGORY: Record<string, NodeCategory> = Object.fromEntries(
  NODE_DEFINITIONS.map((def) => [def.type, def.category]),
);
NODE_TYPE_TO_CATEGORY['filter_condition'] = 'logic';

export function inferCategory(type: string): NodeCategory {
  return NODE_TYPE_TO_CATEGORY[type] ?? 'logic';
}

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_DEFINITIONS.filter((n) => n.category === category);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((n) => n.type === type);
}

export function getAllCategories(): NodeCategory[] {
  return ['trigger', 'action', 'logic', 'defi', 'notification'];
}
