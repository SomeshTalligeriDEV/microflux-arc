import algosdk from 'algosdk';
import { algoClient } from './algorand';
import { accountFromServerMnemonic } from './deterministicPayroll';
import type { DeFiWorkflowNode } from './defiExecution';

function toConfig(node: DeFiWorkflowNode): Record<string, unknown> {
  if (node.config && typeof node.config === 'object') return node.config;
  return {};
}

/** Base32 Algorand public address (58 chars, A–Z and 2–7). */
const ALGO_ADDR_RE = /\b([A-Z2-7]{58})\b/gi;

/**
 * Extract the first syntactically valid 58-character Algorand address from markdown/plain text.
 */
export function extractFirstAlgorandAddress(text: string): string | null {
  const s = String(text ?? '');
  let m: RegExpExecArray | null;
  const re = new RegExp(ALGO_ADDR_RE.source, ALGO_ADDR_RE.flags);
  while ((m = re.exec(s)) !== null) {
    const candidate = normalizeAddr(m[1]);
    if (candidate && algosdk.isValidAddress(candidate)) return candidate;
  }
  return null;
}

function normalizeAddr(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\p{Cf}/gu, '');
}

/** Normalize GitHub webhook POST body into sharedContext fields used by filters and parsers. */
export function buildGitHubWebhookSharedContext(body: unknown): Record<string, unknown> {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const prRaw = b.pull_request;
  const pr = prRaw && typeof prRaw === 'object' ? (prRaw as Record<string, unknown>) : {};
  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  const labelNames = labels.map((l: { name?: string }) => String(l?.name ?? ''));
  const prNum = pr.number != null ? Number(pr.number) : NaN;

  return {
    webhookBody: b,
    githubAction: b.action,
    pull_request: pr,
    pr_number: Number.isFinite(prNum) ? prNum : undefined,
    prLabels: labelNames,
    pr_merged: pr.merged === true,
    pr_body: String(pr.body ?? ''),
  };
}

/** PR closed + merged + label "bounty" (case-insensitive). */
export function evaluateGithubBountyGate(sharedContext: Record<string, unknown>): boolean {
  const body = sharedContext.webhookBody as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') return false;
  if (String(body.action) !== 'closed') return false;
  const pr = body.pull_request as Record<string, unknown> | undefined;
  if (!pr || typeof pr !== 'object') return false;
  if (pr.merged !== true) return false;
  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  return labels.some((l: { name?: string }) => String(l?.name ?? '').toLowerCase() === 'bounty');
}

export type JsonParserResult = { ok: boolean };

function isAllowedDiscordWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'discord.com' || h === 'discordapp.com';
  } catch {
    return false;
  }
}

async function postDiscordWebhook(webhookUrl: string, payload: { content: string }): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Discord webhook HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * Reads PR body from `sourceField` (default pulls from `pr_body`), extracts contributor wallet.
 * On failure: sets flags, optionally POSTs `errorDiscordWebhookUrl`, returns ok: false.
 */
export async function executeJsonParser(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): Promise<JsonParserResult> {
  const config = toConfig(node);
  const sourceField = String(config.sourceField ?? 'pr_body');
  const text = String(sharedContext[sourceField] ?? sharedContext.pr_body ?? '');
  const addr = extractFirstAlgorandAddress(text);

  if (!addr) {
    sharedContext.jsonParserOk = false;
    sharedContext.contributorWallet = '';
    sharedContext.status = 'json_parse_failed';

    const errUrl = String(config.errorDiscordWebhookUrl ?? '').trim();
    const errMsg = String(
      config.errorMessageTemplate ??
        '⚠️ Bounty workflow halted: no valid 58-character Algorand address found in the PR description.',
    );
    const expanded = expandGithubTemplate(errMsg, sharedContext);

    if (errUrl && isAllowedDiscordWebhookUrl(errUrl)) {
      try {
        await postDiscordWebhook(errUrl, { content: expanded.slice(0, 2000) });
      } catch (e) {
        sharedContext.jsonParserDiscordError = e instanceof Error ? e.message : String(e);
      }
    }
    return { ok: false };
  }

  sharedContext.contributorWallet = addr;
  sharedContext.jsonParserOk = true;
  return { ok: true };
}

export function expandGithubTemplate(raw: string, sharedContext: Record<string, unknown>): string {
  let s = String(raw);
  const pr = sharedContext.pr_number != null ? String(sharedContext.pr_number) : '';
  const w = String(sharedContext.contributorWallet ?? '');
  const tx = String(sharedContext.asaTxId ?? sharedContext.txId ?? sharedContext.appCallTxId ?? '');
  s = s.replace(/\{\{pr_number\}\}/g, pr);
  s = s.replace(/\{\{contributorWallet\}\}/g, w);
  s = s.replace(/\{\{txId\}\}/g, tx);
  return s;
}

/**
 * NoOp application call logging PR# and contributor address. Requires `app_id` and mnemonic.
 * Sets `appCallTxId`, `status`.
 */
export async function executeAppCall(node: DeFiWorkflowNode, sharedContext: Record<string, unknown>): Promise<void> {
  const config = toConfig(node);
  const appId = Number(config.app_id ?? 0);
  if (!Number.isFinite(appId) || appId <= 0) {
    throw new Error(`app_call ${node.id}: app_id must be a positive application id`);
  }

  const mnemonic =
    process.env.ALGORAND_SENDER_MNEMONIC || process.env.ALGO_MNEMONIC || process.env.WALLET_MNEMONIC || null;
  if (!mnemonic) {
    throw new Error('Missing ALGORAND_SENDER_MNEMONIC for app_call');
  }

  const prNum = Number(sharedContext.pr_number ?? 0);
  const wallet = String(sharedContext.contributorWallet ?? '').trim();
  if (!wallet || !algosdk.isValidAddress(wallet)) {
    throw new Error(`app_call ${node.id}: contributorWallet missing or invalid — run json_parser first`);
  }

  const method = String(config.method ?? 'noop');
  const sender = accountFromServerMnemonic(mnemonic);
  const suggestedParams = await algoClient.getTransactionParams().do();

  const te = new TextEncoder();
  const appArgs: Uint8Array[] = [te.encode(method), te.encode(`pr:${prNum}`), te.encode(wallet)];

  const txn = algosdk.makeApplicationNoOpTxnFromObject({
    sender: sender.addr,
    suggestedParams,
    appIndex: appId,
    appArgs,
    accounts: [wallet],
  });

  const signed = txn.signTxn(sender.sk);
  const sendResult = await algoClient.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algoClient, sendResult.txid, 4);

  sharedContext.appCallTxId = sendResult.txid;
  sharedContext.txId = sendResult.txid;
  sharedContext.status = 'success';
}

/** Discord incoming webhook; uses `config.webhookUrl` and `config.message`. */
export async function executeDiscordNotify(
  node: DeFiWorkflowNode,
  sharedContext: Record<string, unknown>,
): Promise<void> {
  const config = toConfig(node);
  const webhookUrl = String(config.webhookUrl ?? config.url ?? '').trim();
  const raw = String(config.message ?? 'Workflow notification');
  const content = expandGithubTemplate(raw, sharedContext).slice(0, 2000);

  if (!webhookUrl || !isAllowedDiscordWebhookUrl(webhookUrl)) {
    sharedContext.discordSkipped = true;
    return;
  }

  await postDiscordWebhook(webhookUrl, { content });
  sharedContext.discordNotified = true;
}
