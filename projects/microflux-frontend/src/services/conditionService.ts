/**
 * Condition Engine — Market-Aware Workflow Triggers
 * Evaluates user-defined price conditions against live Binance data.
 * NEVER auto-executes. Always requires explicit user approval + wallet signing.
 */

// ── Types ────────────────────────────────────

export type ConditionOperator = 'lt' | 'gt';
export type ConditionAction = 'send_payment' | 'sell_algo' | 'buy_algo' | 'app_call';
export type ConditionStatus = 'monitoring' | 'met' | 'executed' | 'expired' | 'cancelled';

export interface MarketCondition {
  id: string;
  asset: string;
  operator: ConditionOperator;
  targetPrice: number;
  action: ConditionAction;
  amount: number;          // in ALGO or microAlgos depending on action
  receiverAddress?: string;
  status: ConditionStatus;
  createdAt: string;
  triggeredAt?: string;
  executedTxId?: string;
}

export interface AgentState {
  status: 'idle' | 'monitoring' | 'condition_met' | 'executing';
  activeConditions: number;
  metConditions: number;
  lastCheck: string;
  message: string;
}

// ── In-Memory Store ──────────────────────────

let conditions: MarketCondition[] = [];

let agentState: AgentState = {
  status: 'idle',
  activeConditions: 0,
  metConditions: 0,
  lastCheck: '',
  message: 'Agent standing by. Create a condition to begin monitoring.',
};

// ── Condition CRUD ───────────────────────────

export function createCondition(
  operator: ConditionOperator,
  targetPrice: number,
  action: ConditionAction,
  amount: number,
  receiverAddress?: string
): MarketCondition {
  const condition: MarketCondition = {
    id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    asset: 'ALGO',
    operator,
    targetPrice,
    action,
    amount,
    receiverAddress,
    status: 'monitoring',
    createdAt: new Date().toLocaleTimeString(),
  };

  conditions.unshift(condition);
  updateAgentState();
  return condition;
}

export function cancelCondition(id: string): void {
  const cond = conditions.find(c => c.id === id);
  if (cond && cond.status === 'monitoring') {
    cond.status = 'cancelled';
  }
  updateAgentState();
}

export function markExecuted(id: string, txId: string): void {
  const cond = conditions.find(c => c.id === id);
  if (cond) {
    cond.status = 'executed';
    cond.executedTxId = txId;
  }
  updateAgentState();
}

export function getConditions(): MarketCondition[] {
  return [...conditions];
}

export function getActiveConditions(): MarketCondition[] {
  return conditions.filter(c => c.status === 'monitoring' || c.status === 'met');
}

export function getMetConditions(): MarketCondition[] {
  return conditions.filter(c => c.status === 'met');
}

export function clearAllConditions(): void {
  conditions = [];
  updateAgentState();
}

// ── Evaluation Engine ────────────────────────

/**
 * Evaluate all active conditions against the current price.
 * Returns list of newly-met conditions (status changed from monitoring → met).
 */
export function evaluateConditions(currentPrice: number): MarketCondition[] {
  const newlyMet: MarketCondition[] = [];

  for (const cond of conditions) {
    if (cond.status !== 'monitoring') continue;

    let isMet = false;

    if (cond.operator === 'lt' && currentPrice < cond.targetPrice) {
      isMet = true;
    } else if (cond.operator === 'gt' && currentPrice > cond.targetPrice) {
      isMet = true;
    }

    if (isMet) {
      cond.status = 'met';
      cond.triggeredAt = new Date().toLocaleTimeString();
      newlyMet.push(cond);
    }
  }

  agentState.lastCheck = new Date().toLocaleTimeString();
  updateAgentState();

  return newlyMet;
}

// ── Agent State Management ───────────────────

function updateAgentState(): void {
  const active = conditions.filter(c => c.status === 'monitoring');
  const met = conditions.filter(c => c.status === 'met');

  agentState.activeConditions = active.length;
  agentState.metConditions = met.length;

  if (met.length > 0) {
    agentState.status = 'condition_met';
    agentState.message = `${met.length} condition(s) triggered. Awaiting your approval to execute.`;
  } else if (active.length > 0) {
    agentState.status = 'monitoring';
    agentState.message = `Monitoring ${active.length} condition(s) against live market data.`;
  } else {
    agentState.status = 'idle';
    agentState.message = 'Agent standing by. Create a condition to begin monitoring.';
  }
}

export function getAgentState(): AgentState {
  return { ...agentState };
}

// ── Display Helpers ──────────────────────────

export function formatCondition(cond: MarketCondition): string {
  const op = cond.operator === 'lt' ? '<' : '>';
  const actionLabel =
    cond.action === 'send_payment' ? 'Send' :
    cond.action === 'sell_algo' ? 'Sell' :
    cond.action === 'buy_algo' ? 'Buy' :
    'Execute';
  return `${actionLabel} ${cond.amount} ALGO when price ${op} $${cond.targetPrice.toFixed(4)}`;
}

export function getActionLabel(action: ConditionAction): string {
  switch (action) {
    case 'send_payment': return 'Send Payment';
    case 'sell_algo': return 'Sell ALGO';
    case 'buy_algo': return 'Buy ALGO';
    case 'app_call': return 'Execute Workflow';
  }
}

export function getStatusColor(status: ConditionStatus): string {
  switch (status) {
    case 'monitoring': return 'var(--color-info)';
    case 'met': return 'var(--color-warning)';
    case 'executed': return 'var(--color-success)';
    case 'cancelled': return 'var(--color-text-tertiary)';
    case 'expired': return 'var(--color-text-muted)';
  }
}
