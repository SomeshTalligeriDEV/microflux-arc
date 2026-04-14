# Workflow test documentation

Manual and integration checks for three marketplace/server templates that rely on server-side execution. Run against **TestNet** unless noted. No LLM is involved in execution.

---

## 1. Atomic DAO Payroll & Compliance (`tpl_dao_atomic_payroll`)

**Purpose:** Webhook-triggered fiat-weighted ALGO payouts, atomic batch, spreadsheet row, Telegram summary.

**Prerequisites**

- Server: `DATABASE_URL`, `ALGORAND_SENDER_MNEMONIC` (25-word Algorand passphrase), `TELEGRAM_BOT_TOKEN`, optional Google Sheets env (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` or per-node `spreadsheetId`).
- `MICROFLUX_TRIGGER_SECRET` set in production; client sends `X-Microflux-Trigger-Secret`.
- Treasury account funded on **TestNet** for total payout + fees.

**Load template**

- Marketplace → **Atomic DAO Payroll & Compliance** (or import `server/templates/dao_payroll_template.json`).

**Configure**

1. Each `send_payment`: set **receiver** (58-char addresses), **fiatPayoutUsd** as needed; **useFiatConversion** stays true.
2. `webhook_trigger`: set **path** (e.g. `/dao/payroll-run`); trigger POST body must be `{ "path": "<that path>" }`.
3. `write_to_spreadsheet`: **spreadsheetId** if not using env default; share sheet with service account (Editor).
4. `telegram_notify`: **chatId** or rely on wallet-linked Telegram via `/link`.

**Tests**

| Step | Action | Expected |
|------|--------|----------|
| T1.1 | Save workflow; POST `/api/triggers/webhook` with matching `path` and secret | `200`, steps include `price_feed`, `atomic_group`, `write_to_spreadsheet`, `telegram_notify` where configured |
| T1.2 | Intentionally truncate a receiver to &lt;58 chars, save, run webhook | Error mentioning receiver length / validation (no silent partial pay) |
| T1.3 | Missing mnemonic | Clear error about `ALGORAND_SENDER_MNEMONIC` |

**Success criteria:** One atomic group tx id in response; sheet row appended if Google configured; Telegram message when chatId/link present.

---

## 2. DeFi Stop-Loss & Cold Vault Sweeper (`tpl_defi_stoploss_vault`)

**Purpose:** Timer → ALGO/USD price → stop-loss filter (&lt; threshold) → Tinyman ALGO→USDC → success filter → ASA sweep to cold wallet → Telegram.

**Prerequisites**

- `ALGORAND_SENDER_MNEMONIC`; TestNet ALGO on treasury; opt-in to TestNet USDC ASA `10458941` when doing real swaps/transfers.
- Optional: `DEFI_SIMULATE_SWAPS=1` or node `simulate: true` for swap without chain (template ships with **simulate true** for safer demos).

**Load template**

- Marketplace → **DeFi Stop-Loss & Cold Vault Sweeper** (`defi_stoploss_template.json`).

**Configure**

1. **Cold vault:** `asa_transfer` **receiver** = full 58-char address.
2. **tinyman_swap:** set `simulate: false` only when testing real Tinyman; ensure **amount** (microAlgos) and **slippage** suit TestNet liquidity.
3. Filters: first uses **price** vs **0.15** (USD-style threshold from CoinGecko); second checks **swapStatus** === `success`.
4. `telegram_notify`: optional **chatId**.

**Tests**

| Step | Action | Expected |
|------|--------|----------|
| T2.1 | Simulate workflow in UI (no server) | Steps/logs for trigger, price, filters; swap line reflects simulate or quote |
| T2.2 | Server `POST /api/triggers/run/:workflowId` with secret | Full run; if price ≥ threshold, `[HALT]` on first filter, no swap |
| T2.3 | `simulate: true` | `swapTxId` may be `SIMULATED`; `swapStatus` success; ASA uses `swapAmountOut` when **useLastSwapOutput** |
| T2.4 | `simulate: false`, funded account | Real Tinyman + ASA tx ids in `txIds` (subject to pool liquidity) |

**Success criteria:** On dip (&lt; threshold), execution reaches vault + Telegram; otherwise clean halt after first filter without throwing.

---

## 3. Agentic Commerce / GitHub Bounty Gate (`tpl_github_bounty_gate`)

**Purpose:** GitHub `pull_request` webhook → merged + **bounty** label gate → parse Algorand address from PR body → app NoOp → USDC payout → Discord.

**Prerequisites**

- `ALGORAND_SENDER_MNEMONIC`; treasury holds TestNet ALGO + enough **USDC (10458941)** for bounty amount.
- Contributor addresses must be valid; app **app_id** must be a deployed app on TestNet (replace placeholder `0`).
- GitHub webhook URL: `POST https://<api-host>/api/webhooks/github/<WORKFLOW_ID>` with JSON body = GitHub delivery payload. Same trigger secret as other secured routes if `MICROFLUX_TRIGGER_SECRET` is set.
- Discord: **discord_notify** `webhookUrl` = Discord incoming webhook (`https://discord.com/api/webhooks/...`).
- Optional: **json_parser** `errorDiscordWebhookUrl` for parse-failure alerts.

**Load template**

- Marketplace → **Agentic Commerce / GitHub Bounty Gate** (`github_bounty_template.json`).

**Configure**

1. Save workflow; copy **workflow id** from URL or API.
2. Set **app_call** `app_id` to your registry app (non-zero).
3. **asa_transfer:** `receiverFromContext` = `contributorWallet`; **amount** = 50 USDC in base units (`50000000` for 6 decimals).
4. **discord_notify** `webhookUrl` + message with `{{pr_number}}`, etc.

**Tests**

| Step | Action | Expected |
|------|--------|----------|
| T3.1 | POST sample GitHub payload (action `closed`, `pull_request.merged` true, label `bounty`, body contains 58-char address) | `200`; steps show filter pass, json_parser ok, app_call / asa / discord as configured |
| T3.2 | Same but **without** bounty label | `[HALT]` on filter; no payout |
| T3.3 | Merged PR but **no** address in body | `[HALT]` json_parser; optional error Discord webhook fires |
| T3.4 | Wrong secret header | `401` |

**Sample JSON body (minimal)**

```json
{
  "action": "closed",
  "pull_request": {
    "number": 42,
    "merged": true,
    "body": "Claim bounty\n\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
    "labels": [{ "name": "bounty" }]
  }
}
```

(Replace the address with a valid TestNet address you control for payout.)

**Success criteria:** On happy path, `contributorWallet` set, on-chain txs recorded, Discord message contains PR number; on failure paths, halt without uncaught exceptions.

---

## Regression checklist (all three)

- [ ] CORS: frontend origin allowed (see server `CORS_ORIGINS`, `CORS_ALLOW_RENDER`, localhost defaults).
- [ ] Triggers: `MICROFLUX_TRIGGER_SECRET` documented for operators when set.
- [ ] Workflows saved with `isActive: true` where triggers enumerate active workflows.
