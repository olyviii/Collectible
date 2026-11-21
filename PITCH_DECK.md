# TeamName_PitchDeck — Consigliere (6 Slides Max for CaseHacks)

---

## Slide 1: The Offer You Can't Refuse
- **Headline:** The Family Knows Debt Collection. We Made It 100% Legal, Polite, and 96% Profit Margin.
- **The Problem:**
  - **$3.1 Trillion** sits trapped in unpaid US B2B invoices (wholesalers, subcontractors, staffing, freight).
  - Owners hate awkward collection calls; **collection agencies take 30%** and destroy repeat client relationships.
- **The Solution:** **Consigliere** — an autonomous pre-collections AI negotiator that recovers 60–120 day overdue B2B invoices in **48 hours** for **8% + $499/mo** (nearly 4x cheaper than agencies) while keeping relationships intact.

---

## Slide 2: Real Agentic AI on Cloudflare (Not a Chatbot Wrapper)
- **100% Single-Platform Cloudflare Architecture:**
  - **Cloudflare Workers:** Serves React Command Center + REST/WebSocket API globally.
  - **Cloudflare Agents SDK (`DebtorAgent` Durable Objects):** Every overdue customer runs in its own isolated micro-server with built-in **SQLite (`this.sql`)** and real-time **WebSockets (`useAgent`)**.
  - **Workers AI (`llama-3.3-70b-instruct-fp8-fast`, Zero API Keys):**
    1. *JSON-Schema Intent Classifier* (paperwork blocker vs. cash crunch vs. hardball haircut vs. defect dispute).
    2. *Deterministic CFO Guardrail Engine* (blocks unauthorized >4% discounts, auto-attaches signed W-9/POD, computes exact weekly ACH splits).
    3. *Proactive Alarms (`this.schedule`)* (wakes autonomously on promised AP check-run dates to verify settlement).
    4. *Safety Circuit Breaker* (instantly freezes outreach on damaged-goods disputes for 1-click human review).

---

## Slide 3: Live Split-Screen Product Demo (45 Seconds on Stage)
- **Left Screen (CFO Command Center)** ↔ **Right Screen (Debtor's Live Inbox)**
- **4 Live Actions Shown:**
  1. Debtor demands **15% haircut** → Agent enforces **4% CFO ceiling** automatically.
  2. Debtor asks for **W-9 & Delivery Slip** → Agent auto-attaches verified Vault PDFs.
  3. Debtor says **"Check goes out Friday"** → `this.schedule()` arms a live Durable Object countdown & auto-nudges when unpaid.
  4. Debtor clicks **Direct ACH Settlement** → Cash routes straight to client's bank (**zero money-transmitter license**); recovered counter ticks up live!

---

## Slide 4: Go-To-Market Starting with the Don's $5,000
- **Zero-Friction Wedge Offer ("We Eat What We Kill"):**
  - *"Upload your 10 oldest 60+ day unpaid invoices for a 14-day pilot. Pay $0 unless cash hits your bank account."*
- **How We Spend the Starting $5,000 (Month 1 Outlay: Only $1,490):**
  - **$650:** Targeted B2B lead lists + cold email infra (construction supply, HVAC wholesalers, staffing, regional freight).
  - **$640:** Founder outreach / LinkedIn Sales Navigator + domain warmups ($160 CAC).
  - **$25–$50:** Cloudflare Workers Paid + Workers AI + Durable Objects SQLite.
  - **$3,510 Reserve Untouched:** Because ACH links clear in **48 hours**, Week 2 pilot fees self-fund Months 2–6!

---

## Slide 5: Path to $200,000+ Net Profit in 180 Days (Mandatory Financials)
- **Price:** **$499/mo platform retainer** + **8% recovery fee** on 60+ day overdue invoices.
- **Avg Client Economics:** $120K overdue uploaded → 35% ($42,000) recovered in first 45 days = **$3,360 recovery fee + $499/mo**.
- **Cost per Customer:** **$160 one-time CAC** + **$5/mo Cloudflare infra** (+ 11% SDR commission in Months 3–6) = **~84% Net Profit Margin**.

| Month | Start Cash | New Clients | Active Clients | Gross Revenue | All Costs (CAC + Infra + SDR) | Monthly Net Profit | Cumulative Net Profit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **M1** | $5,000 | 4 *(pilots)* | 4 | $8,392 | $1,315 | **+$7,077** | **$7,077** |
| **M2** | $12,077 | 7 | 11 | $31,729 | $1,825 | **+$29,904** | **$36,981** |
| **M3** | $41,981 | 10 | 20 | $50,380 | $7,892 | **+$42,488** | **$79,469** |
| **M4** | $84,469 | 12 | 31 | $68,009 | $10,201 | **+$57,808** | **$137,277** |
| **M5** | $142,277 | 13 | 43 | $81,697 | $11,932 | **+$69,765** | **$207,042** |
| **M6** | $212,042 | 14 | 56 | $95,384 | $13,662 | **+$81,722** | **$288,764** |

*(Even under a 25% conservative stress test, cumulative net profit exceeds **$210,000** by Day 180.)*

---

## Slide 6: Why the Family Wins (Defensibility & Devpost Summary)
- **48-Hour Cash Velocity:** No 90-day enterprise procurement cycles, no physical inventory, no fintech custody licenses.
- **3.7x Cheaper Than Collection Agencies** while preserving repeat B2B buyer relationships.
- **Compounding Data Moat:** Every negotiation trains industry-specific recovery curves across thousands of B2B debtors.

---

### Devpost Short Description (Copy-Paste Ready)
> **Consigliere** is an autonomous, pre-collections B2B Accounts Receivable negotiator built to turn $5,000 into $200,000+ net profit within 180 days. Built 100% on **Cloudflare Workers**, **Cloudflare Agents SDK** (isolated SQLite-backed `DebtorAgent` Durable Objects with real-time `useAgent` WebSockets and proactive `this.schedule()` promise-to-pay alarms), and **Cloudflare Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` for JSON-schema excuse classification, unstructured invoice ingestion, and CFO-guardrailed settlement drafting with safety circuit breakers).
