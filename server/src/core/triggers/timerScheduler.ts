import { executeWorkflow } from '../engine/runner';
import { findActiveWorkflows, dbNodesToRunnerNodes } from './workflowTriggerUtils';

const lastFire = new Map<string, number>();
let warnedNoMnemonic = false;

/**
 * Polls active workflows for `timer_loop` nodes and runs the graph on each interval.
 * Uses in-memory last-fire times (resets on server restart).
 */
export function startWorkflowTimerScheduler(): void {
  const tickMs = Number(process.env.MICROFLUX_TIMER_TICK_MS ?? 30_000);
  if (tickMs < 10_000) {
    console.warn('[TIMER] MICROFLUX_TIMER_TICK_MS too low; using 10000');
  }
  const interval = Math.max(10_000, tickMs);

  setInterval(async () => {
    try {
      const workflows = await findActiveWorkflows();
      const now = Date.now();

      for (const wf of workflows) {
        const raw = wf.nodes as unknown[];
        if (!Array.isArray(raw)) continue;
        const timerNode = raw.find((n) => (n as { type?: string }).type === 'timer_loop') as
          | { type?: string; config?: { interval?: number } }
          | undefined;
        if (!timerNode) continue;

        const period = Math.max(60_000, Number(timerNode.config?.interval ?? 60_000));

        let prev = lastFire.get(wf.id);
        if (prev === undefined) {
          lastFire.set(wf.id, now);
          continue;
        }

        if (now - prev < period) continue;

        lastFire.set(wf.id, now);

        const nodes = dbNodesToRunnerNodes(raw);
        const edges = Array.isArray(wf.edges) ? wf.edges : [];
        console.log(`[TIMER] Firing workflow ${wf.id} (${wf.name})`);
        const result = await executeWorkflow({ nodes, edges }, {});
        console.log(`[TIMER] Done ${wf.id}: ${result.steps.length} steps, ${result.txIds.length} tx(s)`);
      }
    } catch (e) {
      console.error('[TIMER] tick error', e);
    }
  }, interval);

  console.log(`[TIMER] Scheduler started (check every ${interval}ms)`);

  if (!process.env.ALGORAND_SENDER_MNEMONIC && !process.env.ALGO_MNEMONIC && !process.env.WALLET_MNEMONIC) {
    if (!warnedNoMnemonic) {
      warnedNoMnemonic = true;
      console.warn(
        '[TIMER] No server mnemonic — send_payment nodes in timer workflows will throw until ALGORAND_SENDER_MNEMONIC is set.',
      );
    }
  }
}
