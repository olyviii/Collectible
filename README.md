# Consigliere — Autonomous B2B Overdue Invoice Collector & AI Negotiator

Built 100% on **Cloudflare Workers**, **Cloudflare Agents SDK (`agents`)**, and **Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)** for **CaseHacks: The $200K Deadline**.

---

## What It Does
US small & mid-sized B2B businesses have **$3.1 Trillion** trapped in 30–120 day overdue invoices. Chasing customers manually is awkward, and traditional debt collection agencies take **25%–35%** while destroying customer relationships.

**Consigliere** steps in *before* debt collectors as an autonomous, guardrailed Accounts Receivable closer:
1. **Dedicated Per-Debtor Stateful Agents (`DebtorAgent` Durable Objects):** Every overdue account gets its own isolated SQLite database (`this.sql`), persistent audit log, and real-time WebSocket stream (`useAgent`).
2. **3-Stage Workers AI Negotiation Engine (`env.AI.run`):**
   - **JSON-Schema Intent & Leverage Classifier:** Detects paperwork blockers, cash-flow crunches, opportunistic haircut demands, promises-to-pay, or quality disputes.
   - **Deterministic CFO Guardrail Math:** Enforces strict controller ceilings (e.g., max `4%` fast-close discount, max `3x` weekly split, auto-attaching verified `W-9` & signed `POD` PDFs) so the LLM **never hallucinates numbers**.
   - **Tone-Calibrated Drafting:** Generates relationship-preserving B2B replies with zero external AI API keys.
3. **Proactive Durable Object Alarms (`this.schedule`):** When a debtor says *"Queued for Friday's AP run"*, the Agent sets an autonomous wake-up timer, checks if ACH settled, and follows up automatically if unpaid.
4. **Safety Circuit Breaker:** Quality or legal disputes immediately freeze automated emails and trigger a live WebSocket escalation card for 1-click CFO credit memo resolution.
5. **Non-Custodial Direct ACH:** Funds flow directly from debtor to the client's operating bank account (zero money-transmitter licenses required). Consigliere bills **$499/mo + 8% contingency** on recovered 60+ day invoices.

---

## Quick Start (Local Development)

```bash
cd consigliere-ar
npm install
npm run dev
```

Open **http://localhost:8787** to launch the full app (React SPA + Cloudflare Worker + Stateful Durable Object Agents).

> **Want live Cloudflare GPU inference during local dev?** Run `npx wrangler login` once, then run `npx wrangler dev --remote`.

---

## Deploy Live to Cloudflare (`*.workers.dev` URL in Seconds)

```bash
cd consigliere-ar
npx wrangler login
npm run deploy
```

Wrangler builds `./dist`, provisions your SQLite-backed `DebtorAgent` and `PortfolioHub` Durable Objects, binds **Workers AI (`env.AI`)** automatically with **no API keys**, and outputs your public live prototype URL!
