# Workflow testing for product video (AI-assisted)

This guide helps you **plan, test, and rehearse** MicroFlux for **screen recordings, demos, and hackathon pitches**. It complements [`workflow-tests.md`](workflow-tests.md) (deep integration checks for server-heavy templates) and [`.cursor/rules/test-plan.mdc`](../.cursor/rules/test-plan.mdc) (node regression). Use this doc when you need **the full surface area of the app** plus a **story that wins on video**.

---

## How the application works (end-to-end)

| Layer | What it does |
|--------|----------------|
| **Frontend** (`microflux-frontend`) | Visual workflow builder (React Flow), **Marketplace** templates, **AI Copilot** (natural language → graph), wallet connect (Pera / Defly / Lute), **Simulate** (dry-run log, no chain), **Execute** with an execution mode. |
| **Execution modes** (builder sidebar) | **Direct** — sequential steps; your wallet signs on-chain steps. **Atomic** — batches compatible steps into one atomic group (payments + optional app call). **Contract** — records execution via the **WorkflowExecutor** smart contract (`execute(string)`), combined with direct/atomic semantics as implemented in the builder. Pick the mode that matches your template (e.g. treasury distribution → Atomic for one group). |
| **Server** (`server`) | Persists workflows (Prisma + Neon), runs **server-side execution** when triggers fire: **webhook** (`POST /api/triggers/webhook` with `body.path` matching `webhook_trigger`), **run by id** (`POST /api/triggers/run/:workflowId`), GitHub delivery to `/api/webhooks/github/:workflowId`, **timer** scheduler for `timer_loop` workflows, Telegram bot, optional Google Sheets / proxy for `http_request`. Requires `MICROFLUX_TRIGGER_SECRET` when set. |
| **Algorand** | **TestNet** by default: payments, ASA transfers, Tinyman V2 swaps, optional app calls. Amounts in **micro-units** where applicable. |

**Typical flows**

1. **Design** — Drag nodes, or load a Marketplace template, or generate from AI → **Save** (requires wallet address).
2. **Validate logic** — **Simulate** → read step log (price feeds, filters, `debug_log`, mock Telegram lines).
3. **Validate chain** — **Execute** in Direct / Atomic / Contract → wallet prompts → tx ids in log.
4. **Validate automation** — Save workflow as **active** where needed → call trigger API (curl or GitHub webhook) → check JSON response `steps` / `txIds` and side effects (Telegram, sheet, Discord).

---

## Ways to test (pick what matches your template)

| Method | Best for | Where |
|--------|-----------|--------|
| **Simulate** | Logic, filters, prices, Telegram *simulation* lines, no funds at risk | Builder → Simulate |
| **Execute — Direct** | Single payments, ASA, Tinyman, delays, sequential behavior | Builder → Execution mode **direct** → Execute |
| **Execute — Atomic** | Multiple `send_payment` in one group, treasury templates | Execution mode **atomic** |
| **Execute — Contract** | Demo “on-chain proof” of workflow hash via WorkflowExecutor app | Execution mode **contract** (needs `VITE_APP_ID` / deployed app) |
| **Webhook trigger** | `webhook_trigger` paths, DAO payroll, Webhook → Action | `POST /api/triggers/webhook` with JSON `{ "path": "<path from node>" }` + secret header if configured |
| **Run by workflow id** | Timer workflows, cron, “run this graph now” without path matching | `POST /api/triggers/run/:workflowId` |
| **GitHub webhook** | Bounty gate template | GitHub → `POST {API}/api/webhooks/github/{WORKFLOW_ID}` with payload (see [`workflow-tests.md`](workflow-tests.md)) |
| **Telegram** | Nodes that notify or command triggers | Link wallet via bot `/link`; set `chatId` on nodes if needed |

---

## Marketplace templates — how to test each one

Templates are defined in `projects/microflux-frontend/src/services/templateService.ts` (plus embedded JSON for stop-loss and GitHub). Use **TestNet** unless you have a deliberate reason not to.

Legend: **Sim** = Simulate in UI · **Ex** = Execute (set Direct/Atomic/Contract as noted) · **Srv** = server trigger (saved workflow + API).

| ID | Name | Primary test method | Quick setup / success signal |
|----|------|---------------------|------------------------------|
| `tpl_send_algo` | Send ALGO | Sim · Ex (Direct) | Set **receiver** (58 chars). Simulation skips payment if empty; execute sends microALGO from connected wallet. |
| `tpl_asa_transfer` | ASA Transfer | Sim · Ex (Direct) | TestNet USDC `10458941`; receiver opted in; match **amount** to balance. |
| `tpl_dao_atomic_payroll` | Atomic DAO Payroll & Compliance | **Srv** (required for full story) · Sim partial | Fill receivers, **fiatPayoutUsd**, webhook **path**; server needs `ALGORAND_SENDER_MNEMONIC`, optional Sheets/Telegram. See [§1 in `workflow-tests.md`](workflow-tests.md). |
| `tpl_treasury_dist` | Treasury Distribution | Sim · Ex (**Atomic** preferred) | Three receivers; 40k/35k/25k microALGO demo; `get_quote` runs first. |
| `tpl_defi_stoploss_vault` | DeFi Stop-Loss & Cold Vault Sweeper | Sim · Ex · **Srv** | `timer_loop` + price + Tinyman + vault; use **`simulate: true`** for safe demos. Full server run: [`workflow-tests.md` §2](workflow-tests.md). |
| `tpl_github_bounty_gate` | Agentic Commerce / GitHub Bounty Gate | **Srv** (GitHub POST) | Registry **app_id**, USDC amount, Discord webhook; sample payload in [`workflow-tests.md` §3](workflow-tests.md). |
| `tpl_price_alert` | Price Alert Workflow | Sim · Ex | Filter vs threshold; browser notification on pass. |
| `tpl_ai_trading_agent` | Autonomous AI Trading Agent | Sim · Ex | `get_quote` → filter → paper-trade `debug_log`; no real exchange. |
| `tpl_tinyman_swap` | DeFi Swap (Tinyman) | Sim · Ex (Direct) | Pool liquidity on TestNet; small **amount**; optional Simulate first. |
| `tpl_tinyman_swap_receiver` | Tinyman Swap & Routing | Sim · Ex | Swap then `asa_transfer` USDC; filter on swap status; align amounts. |
| `tpl_ai_defi_arbitrage` | AI Copilot: Adaptive Arbitrage & Yield | Sim · Ex · Srv | `ai_trigger` + price + swap + **write_to_spreadsheet** + **telegram_notify** — configure Sheets/Telegram or expect partial success in log. |
| `tpl_scheduled_payment` | Scheduled Payment | Sim · Ex | Branch: filter true → payment + Telegram; false → debug branch. “Schedule” is manual/cron TBD server-side. |
| `tpl_webhook_action` | Webhook → Action | **Srv** | Webhook **path** must match saved workflow; filter → payment → `http_request` (e.g. httpbin). |

**Server JSON mirrors** (import or reference): `server/templates/dao_payroll_template.json`, `defi_stoploss_template.json`, `github_bounty_template.json` — useful if frontend and server templates must stay aligned.

---

## Application areas to hit for a “full product” rehearsal

1. **Marketplace** — Open 2–3 categories; load one beginner + one advanced template.
2. **AI Copilot** — One prompt → graph → tweak one node → Save.
3. **Simulate** — Show log lines for `price_feed` / `filter` / `debug_log`.
4. **Wallet** — Connect TestNet wallet; show address in UI.
5. **Execute** — At least one real tx (payment or swap) or Atomic group.
6. **Triggers** — One `curl` to `/api/triggers/webhook` or `/api/triggers/run/:id` with secret; read JSON response (optional: show server log tail in split screen).
7. **Optional integrations** — Only if configured: Telegram message, sheet row, Discord, GitHub sample POST.

---

## Copy-paste prompts for your AI assistant

**Plan a single take**

```text
I'm recording a [N]-minute demo of MicroFlux (Algorand workflow builder + server triggers). Audience: [who]. I want to show: [intent / builder / simulate / TestNet execute / webhook / template name]. Constraints: [TestNet only, no mainnet, no real Telegram, etc.]. Using docs/workflow-tests.md and docs/WorkflowTest.md, give me: (1) ordered steps, (2) what should appear on screen at each step, (3) one fallback if something fails.
```

**Shorten or lengthen the run**

```text
My MicroFlux demo script is too long. Here are the flows I want: [list]. Compress to a [N]-minute narrative with only essential clicks; call out what to skip if time is tight.
```

**Rehearsal checklist**

```text
Before I hit record on MicroFlux, list a 15-item checklist: env, wallet, API URL, which templates, Simulate vs Direct vs server trigger, execution mode, and what success looks like on screen for each step.
```

**Failure recovery**

```text
During my MicroFlux recording, [describe failure: CORS / 401 on webhook / empty log / wallet rejected / timeout]. What should I try in order, without rebuilding the whole demo? Assume TestNet and server at [URL].
```

**Hackathon storyboard**

```text
I'm pitching MicroFlux at a hackathon ([time limit] minutes). Judges care about [problem fit / technical depth / Algorand use / wow moment]. Using WorkflowTest.md template table, propose: hook (first 15s), 3-act structure, which 2 templates to show live vs screenshot, and a closing line. TestNet only.
```

---

## Hackathon-winning video ideas (structure + differentiation)

Judges usually reward **clarity**, **a memorable problem**, **live proof**, and **honest scope** (what works today vs roadmap). Algorand-specific credit comes from **real TestNet transactions** or **clear automation** (webhooks, atomic groups), not from buzzwords.

### What tends to score

- **Hook (first 10–15 s)** — One sentence problem (“Treasury and DeFi actions are fragmented across scripts and wallets”) + one visual (canvas or intent box).
- **Show the loop** — **English → workflow → run → outcome** (tx id, notification, or webhook response). This is MicroFlux’s core story.
- **One “wow”** — Pick **one**: atomic payroll batch, GitHub→payout, stop-loss graph with Simulate then optional live swap, or AI-generated graph edited live.
- **Credibility** — Mention TestNet, show explorer link or log line; if an integration is off, say “Simulate / dry-run” instead of faking mainnet.

### Suggested arcs (pick one)

| Arc | Narrative | Live demo emphasis |
|-----|-----------|---------------------|
| **Intent-first** | “Describe policy in chat → graph appears → save → execute one payment.” | AI Copilot + `tpl_send_algo` or `tpl_treasury_dist` Atomic. |
| **Automation-first** | “Events drive execution without opening the app.” | `tpl_webhook_action` or `tpl_dao_atomic_payroll` + curl; cut to log/`txIds`. |
| **DeFi-first** | “Price-aware automation on Algorand.” | `tpl_price_alert` Simulate, then `tpl_tinyman_swap` small amount OR stop-loss template with `simulate: true`. |
| **Developer economy** | “Ship merged PR → bounty pays out.” | `tpl_github_bounty_gate` with sample JSON (Discord optional). |

### Timing templates

- **~3 minutes** — Hook (15s) → problem (30s) → intent→graph (45s) → Simulate (30s) → one Execute or one webhook (45s) → outcome + team (15s).
- **~5 minutes** — Add a second proof path (e.g. Simulate + server trigger) or show Marketplace breadth without loading every template.

### Production tips

- **Record Simulate and Execute separately** if needed; edit together so a failed tx does not ruin the hook.
- **Pre-fill** addresses and template names in a visible note so you do not hunt mid-take.
- **End on the outcome** — tx id, Telegram screenshot, or `200` JSON — not on an empty canvas.

---

## Fallbacks if the demo stumbles

| Symptom | Practical move |
|--------|------------------|
| CORS or network to API | Confirm `VITE_API_BASE_URL` and server `CORS_*`; same browser origin as local dev. |
| Webhook 401 | `X-Microflux-Trigger-Secret` must match `MICROFLUX_TRIGGER_SECRET`. |
| Timer / “nothing runs” | Use `POST /api/triggers/run/:workflowId` for a one-shot; confirm workflow **isActive** and server logs. |
| On-chain step fails | **Simulate** first; for swaps use **`simulate: true`** or env from [`workflow-tests.md`](workflow-tests.md). |
| Sheets / Telegram / Discord | Fall back to execution **steps** in API JSON or **Simulate** log lines. |

---

## Where to go deeper

- **Template integration tables (DAO payroll, stop-loss, GitHub)** — [`workflow-tests.md`](workflow-tests.md)
- **Node-by-node regression** — [`.cursor/rules/test-plan.mdc`](../.cursor/rules/test-plan.mdc)
- **Trigger routes** — `server/src/routes/trigger.routes.ts` (`/api/triggers/webhook`, `/api/triggers/run/:workflowId`)

---

## Versioning

When you add Marketplace templates or change trigger URLs, update the **template table** and any **video-facing** env vars here. Keep detailed step tables in `workflow-tests.md` and `test-plan.mdc`.
