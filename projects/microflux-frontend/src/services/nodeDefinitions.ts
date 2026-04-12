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
    description: 'Trigger at set intervals',
    category: 'trigger',
    icon: '◷',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { interval: 60000 },
  },
  {
    type: 'wallet_event',
    label: 'Wallet Event',
    description: 'Triggered by wallet activity',
    category: 'trigger',
    icon: '◇',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { event: 'manual_trigger' },
  },
  {
    type: 'webhook_trigger',
    label: 'Webhook Trigger',
    description: 'HTTP endpoint trigger',
    category: 'trigger',
    icon: '↗',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { path: '/api/trigger', method: 'POST' },
  },
  {
    type: 'telegram_command',
    label: 'Telegram Command',
    description: 'Trigger workflow from Telegram message',
    category: 'trigger',
    icon: '✉',
    isReal: false,
    color: CATEGORY_COLORS.trigger,
    defaultConfig: { command: '/start', chatId: '' },
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
    description: 'Make external API call',
    category: 'action',
    icon: '⬡',
    isReal: false,
    color: CATEGORY_COLORS.action,
    defaultConfig: { url: '', method: 'GET', headers: {} },
  },
  {
    type: 'write_to_spreadsheet',
    label: 'Write to Spreadsheet',
    description: 'Log data directly to an Excel/CSV file',
    category: 'action',
    icon: '▤',
    isReal: true,
    color: CATEGORY_COLORS.action,
    defaultConfig: { mapToColumns: true },
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
    isReal: true,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { title: '', body: '' },
  },
  {
    type: 'telegram_notify',
    label: 'Telegram Notify',
    description: 'Send Telegram message',
    category: 'notification',
    icon: '▶',
    isReal: false,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { chatId: '', message: '' },
  },
  {
    type: 'discord_notify',
    label: 'Discord Notify',
    description: 'Send to Discord channel',
    category: 'notification',
    icon: '#',
    isReal: false,
    color: CATEGORY_COLORS.notification,
    defaultConfig: { channel: '', message: '' },
  },
];

// ── Helpers ──────────────────────────────────

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_DEFINITIONS.filter((n) => n.category === category);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((n) => n.type === type);
}

export function getAllCategories(): NodeCategory[] {
  return ['trigger', 'action', 'logic', 'defi', 'notification'];
}
