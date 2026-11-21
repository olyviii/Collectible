import { Agent, routeAgentRequest, type Connection, type WSMessage } from "agents";
import {
  DEFAULT_GUARDRAILS,
  SEED_INVOICES,
  type AuditTraceStep,
  type DebtorAgentState,
  type Guardrails,
  type InvoiceSummary,
  type PortfolioState,
  type SettlementOption,
  type ThreadMessage,
  type VaultDocument
} from "../shared/seedInvoices";
import {
  analyzeAndNegotiateWithAI,
  buildStandardOffers,
  draftScheduledFollowupWithAI,
  extractInvoiceFromRawText,
  type WorkersAIBinding
} from "./ai";

export interface Env {
  AI: WorkersAIBinding;
  DebtorAgent: DurableObjectNamespace<DebtorAgent>;
  PortfolioHub: DurableObjectNamespace<PortfolioHub>;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function syncInvoiceToPortfolio(env: Env, invoice: InvoiceSummary): Promise<void> {
  try {
    const hubId = env.PortfolioHub.idFromName("main");
    const hub = env.PortfolioHub.get(hubId);
    await hub.fetch("https://internal/upsert-invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoice })
    });
  } catch {
    // Non-blocking sync
  }
}

/**
 * Per-Debtor Autonomous Cloudflare Agent.
 * Each overdue B2B customer runs in its own isolated SQLite-backed Durable Object
 * with real-time WebSocket sync (`this.setState`) and proactive wake-up timers (`this.schedule`).
 */
export class DebtorAgent extends Agent<Env, DebtorAgentState> {
  async onStart(): Promise<void> {
    this.sql`
      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      )
    `;

    if (!this.state?.initialized) {
      this.ensureSeeded(this.name);
    }
  }

  private ensureSeeded(candidateName?: string): void {
    if (this.state?.initialized) return;
    const key = candidateName || this.name;
    const match = SEED_INVOICES.find((s) => s.summary.id === key);
    if (match) {
      this.seedFromRecord(match.summary, match.vaultDocs, match.initialAgentEmail, "Seeded Account");
    }
  }

  async onConnect(_connection: Connection): Promise<void> {
    this.ensureSeeded(this.name);
  }

  private insertMessage(msg: ThreadMessage): void {
    const payload = JSON.stringify(msg);
    this.sql`
      INSERT OR REPLACE INTO thread_messages (id, created_at, payload_json)
      VALUES (${msg.id}, ${msg.createdAt}, ${payload})
    `;
  }

  private insertAudit(step: AuditTraceStep): void {
    const payload = JSON.stringify(step);
    this.sql`
      INSERT OR REPLACE INTO audit_events (id, created_at, payload_json)
      VALUES (${step.id}, ${step.createdAt}, ${payload})
    `;
  }

  private loadMessages(): ThreadMessage[] {
    const rows = this.sql<{ payload_json: string }>`
      SELECT payload_json FROM thread_messages ORDER BY created_at ASC
    `;
    return rows.map((r) => JSON.parse(r.payload_json) as ThreadMessage);
  }

  private loadAudit(): AuditTraceStep[] {
    const rows = this.sql<{ payload_json: string }>`
      SELECT payload_json FROM audit_events ORDER BY created_at DESC LIMIT 40
    `;
    return rows.map((r) => JSON.parse(r.payload_json) as AuditTraceStep);
  }

  private seedFromRecord(
    summary: InvoiceSummary,
    vaultDocs: VaultDocument[],
    initialAgentEmail: string,
    badge: string
  ): DebtorAgentState {
    this.sql`DELETE FROM thread_messages`;
    this.sql`DELETE FROM audit_events`;

    const guardrails: Guardrails = { ...DEFAULT_GUARDRAILS };
    const offers = buildStandardOffers(summary.originalAmount - summary.paidAmount, guardrails);
    const now = Date.now();

    const firstMsg: ThreadMessage = {
      id: uid("msg"),
      sender: "agent",
      authorName: "Consigliere AR Agent",
      body: initialAgentEmail,
      createdAt: now,
      intentDetected: "initial_outreach",
      settlementOptions: offers,
      aiModelUsed: badge
    };

    const firstAudit: AuditTraceStep = {
      id: uid("aud"),
      createdAt: now,
      stage: "ingest",
      title: `Spawned Dedicated DebtorAgent (${summary.invoiceNumber})`,
      detail: `Isolated SQLite ledger initialized for ${summary.debtorCompany} (${fmtUsd(summary.originalAmount)}, ${summary.daysOverdue}d overdue). Loaded ${vaultDocs.length} vault compliance docs & CFO guardrails (max ${guardrails.maxDiscountPct}% discount / ${guardrails.maxInstallments}x split).`,
      badge,
      severity: "info"
    };

    this.insertMessage(firstMsg);
    this.insertAudit(firstAudit);

    const freshState: DebtorAgentState = {
      initialized: true,
      thinking: false,
      invoice: { ...summary, scheduledWakeupAt: null, scheduledReason: null },
      guardrails,
      vaultDocs,
      messages: [firstMsg],
      auditTrace: [firstAudit],
      activeOffers: offers,
      disputeSummary: null
    };

    this.setState(freshState);
    return freshState;
  }

  async onMessage(_connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message !== "string") return;
    try {
      const data = JSON.parse(message);
      if (data.type === "debtor_reply" && data.text) {
        await this.processDebtorReply(String(data.text));
      } else if (data.type === "update_guardrails" && data.guardrails) {
        await this.applyGuardrails(data.guardrails);
      } else if (data.type === "arm_demo_timer") {
        await this.armProactiveTimer(
          Number(data.seconds) || 10,
          String(data.reason || "Live Demo Scheduled Promise-to-Pay Verification")
        );
      }
    } catch {
      // Ignore malformed WS frames
    }
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    this.ensureSeeded(url.searchParams.get("id") || this.name);

    if (request.method === "GET" && path.endsWith("/state")) {
      return Response.json(this.state);
    }

    if (request.method === "POST" && path.endsWith("/init")) {
      const body = (await request.json()) as {
        summary: InvoiceSummary;
        vaultDocs: VaultDocument[];
        initialAgentEmail: string;
        modelBadge?: string;
      };
      const st = this.seedFromRecord(
        body.summary,
        body.vaultDocs,
        body.initialAgentEmail,
        body.modelBadge || "Workers AI Ingest"
      );
      return Response.json(st);
    }

    if (request.method === "POST" && path.endsWith("/reset")) {
      const match = SEED_INVOICES.find((s) => s.summary.id === this.name);
      if (match) {
        const st = this.seedFromRecord(match.summary, match.vaultDocs, match.initialAgentEmail, "Reset Clean");
        await syncInvoiceToPortfolio(this.env, st.invoice);
        return Response.json(st);
      }
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && path.endsWith("/guardrails")) {
      const body = (await request.json()) as Partial<Guardrails>;
      const st = await this.applyGuardrails(body);
      return Response.json(st);
    }

    if (request.method === "POST" && path.endsWith("/reply")) {
      const body = (await request.json()) as { message: string };
      const st = await this.processDebtorReply(body.message);
      return Response.json(st);
    }

    if (request.method === "POST" && path.endsWith("/arm-timer")) {
      const body = (await request.json()) as { seconds?: number; reason?: string };
      const st = await this.armProactiveTimer(
        body.seconds ?? this.state.guardrails.demoTimerSeconds,
        body.reason ?? "Friday AP Check Run Verification"
      );
      return Response.json(st);
    }

    if (request.method === "POST" && path.endsWith("/resolve-dispute")) {
      const body = (await request.json()) as { creditAmount: number; cfoNote?: string };
      const st = await this.resolveDisputeWithCredit(body.creditAmount, body.cfoNote);
      return Response.json(st);
    }

    if (request.method === "POST" && path.endsWith("/pay")) {
      const body = (await request.json()) as { offerId: string };
      const st = await this.settleInvoice(body.offerId);
      return Response.json(st);
    }

    return Response.json(this.state ?? { initialized: false });
  }

  private async applyGuardrails(patch: Partial<Guardrails>): Promise<DebtorAgentState> {
    const nextGuardrails: Guardrails = {
      ...this.state.guardrails,
      ...patch
    };
    const balance = roundCents(this.state.invoice.originalAmount - this.state.invoice.paidAmount);
    const nextOffers =
      this.state.invoice.status === "settled" || this.state.invoice.status === "dispute_halted"
        ? this.state.activeOffers
        : buildStandardOffers(balance, nextGuardrails);

    const step: AuditTraceStep = {
      id: uid("aud"),
      createdAt: Date.now(),
      stage: "guardrail_math",
      title: "CFO Updated Negotiation Guardrails",
      detail: `Max Fast-Close Credit: ${nextGuardrails.maxDiscountPct}% • Max Split: ${nextGuardrails.maxInstallments}x wks • Auto-Vault Docs: ${nextGuardrails.autoAttachVaultDocs ? "ON" : "OFF"} • Tone: ${nextGuardrails.tone}.`,
      badge: "Live Policy Sync",
      severity: "info"
    };
    this.insertAudit(step);

    const updated: DebtorAgentState = {
      ...this.state,
      guardrails: nextGuardrails,
      activeOffers: nextOffers,
      auditTrace: this.loadAudit()
    };
    this.setState(updated);
    return updated;
  }

  private async armProactiveTimer(seconds: number, reason: string): Promise<DebtorAgentState> {
    if (this.state.invoice.status === "settled") return this.state;

    const clampedSec = Math.max(5, Math.min(300, Math.round(seconds)));
    const wakeupAt = Date.now() + clampedSec * 1000;

    await this.schedule(clampedSec, "runProactiveFollowUp", { reason, scheduledAt: Date.now() });

    const step: AuditTraceStep = {
      id: uid("aud"),
      createdAt: Date.now(),
      stage: "scheduler",
      title: `Armed Durable Object Alarm (${clampedSec}s)`,
      detail: `this.schedule(${clampedSec}, "runProactiveFollowUp") persisted to SQLite. Agent will wake autonomously to verify "${reason}" even if all browsers close.`,
      badge: `T-${clampedSec}s Alarm`,
      severity: "warn"
    };
    this.insertAudit(step);

    const updatedInvoice: InvoiceSummary = {
      ...this.state.invoice,
      status: "scheduled_followup",
      scheduledWakeupAt: wakeupAt,
      scheduledReason: reason,
      lastActivityAt: Date.now()
    };

    const updated: DebtorAgentState = {
      ...this.state,
      invoice: updatedInvoice,
      auditTrace: this.loadAudit()
    };
    this.setState(updated);
    await syncInvoiceToPortfolio(this.env, updatedInvoice);
    return updated;
  }

  /**
   * Invoked autonomously by the Cloudflare Agents SDK scheduler (`this.schedule`)
   * when the promise-to-pay or follow-up countdown expires!
   */
  async runProactiveFollowUp(payload: { reason: string; scheduledAt: number }): Promise<void> {
    if (!this.state?.initialized) return;
    if (this.state.invoice.status === "settled" || this.state.invoice.status === "dispute_halted") {
      return;
    }

    const { body, modelBadge } = await draftScheduledFollowupWithAI(
      this.env.AI,
      this.state.invoice,
      payload.reason
    );

    const balance = roundCents(this.state.invoice.originalAmount - this.state.invoice.paidAmount);
    const offers = buildStandardOffers(balance, this.state.guardrails);
    const now = Date.now();

    const followupMsg: ThreadMessage = {
      id: uid("msg"),
      sender: "agent",
      authorName: "Consigliere AR Agent (Autonomous Wake-Up)",
      body,
      createdAt: now,
      settlementOptions: offers,
      aiModelUsed: modelBadge
    };
    this.insertMessage(followupMsg);

    const auditStep: AuditTraceStep = {
      id: uid("aud"),
      createdAt: now,
      stage: "scheduler",
      title: "Autonomous Alarm Fired — Payment Still Unsettled",
      detail: `Durable Object woke up on schedule ("${payload.reason}"), verified $0 posted against ${this.state.invoice.invoiceNumber}, and dispatched proactive follow-up via ${modelBadge}.`,
      badge: "Autonomous Action",
      severity: "success"
    };
    this.insertAudit(auditStep);

    const nextInvoice: InvoiceSummary = {
      ...this.state.invoice,
      status: "active_negotiation",
      scheduledWakeupAt: null,
      scheduledReason: null,
      lastActivityAt: now
    };

    this.setState({
      ...this.state,
      invoice: nextInvoice,
      messages: this.loadMessages(),
      auditTrace: this.loadAudit(),
      activeOffers: offers
    });

    await syncInvoiceToPortfolio(this.env, nextInvoice);
  }

  private async processDebtorReply(rawMessage: string): Promise<DebtorAgentState> {
    const text = rawMessage.trim();
    if (!text || this.state.invoice.status === "settled") return this.state;

    const now = Date.now();
    const debtorMsg: ThreadMessage = {
      id: uid("msg"),
      sender: "debtor",
      authorName: `${this.state.invoice.debtorContact} (${this.state.invoice.debtorCompany})`,
      body: text,
      createdAt: now
    };
    this.insertMessage(debtorMsg);

    // Broadcast immediate "thinking" state to all WebSocket peers
    this.setState({
      ...this.state,
      thinking: true,
      messages: this.loadMessages()
    });

    const plan = await analyzeAndNegotiateWithAI(
      this.env.AI,
      this.state.invoice,
      this.state.guardrails,
      this.state.vaultDocs,
      this.state.messages,
      text
    );

    const t1 = Date.now();

    // 1. Log Classification Trace
    this.insertAudit({
      id: uid("aud"),
      createdAt: t1,
      stage: "classify",
      title: `Intent Classified: ${plan.classification.intent.toUpperCase()} (${Math.round(plan.classification.confidence * 100)}%)`,
      detail: `${plan.classification.reasoningSummary} [Sentiment: ${plan.classification.sentiment}]`,
      badge: `${plan.classification.modelBadge} • ${plan.classification.latencyMs}ms`,
      severity: plan.haltForDispute ? "danger" : "info"
    });

    // 2. Log Vault Attachment Tool if triggered
    if (plan.attachedDocs.length > 0) {
      this.insertAudit({
        id: uid("aud"),
        createdAt: t1 + 1,
        stage: "vault_tool",
        title: `Auto-Attached ${plan.attachedDocs.length} Verified Compliance Doc(s)`,
        detail: `Retrieved ${plan.attachedDocs.map((d) => d.filename).join(", ")} and bundled into remittance reply.`,
        badge: "Document Vault Tool",
        severity: "success"
      });
    }

    // 3. Log Guardrail Math or Circuit Breaker
    this.insertAudit({
      id: uid("aud"),
      createdAt: t1 + 2,
      stage: plan.haltForDispute ? "circuit_breaker" : "guardrail_math",
      title: plan.haltForDispute
        ? "Circuit Breaker Tripped — Human Controller Escalated"
        : "CFO Guardrail Policy Applied",
      detail: plan.guardrailDecisionLog,
      badge: plan.haltForDispute ? "AUTOMATION PAUSED" : `Max ${this.state.guardrails.maxDiscountPct}% Cap`,
      severity: plan.haltForDispute ? "danger" : "success"
    });

    // 4. Schedule Autonomous Durable Object Wake-Up if needed
    let scheduledWakeupAt: number | null = null;
    let scheduledReason: string | null = null;

    if (!plan.haltForDispute && plan.scheduleFollowupSeconds) {
      scheduledWakeupAt = Date.now() + plan.scheduleFollowupSeconds * 1000;
      scheduledReason = plan.scheduleReason ?? "Scheduled Payment Check";
      await this.schedule(plan.scheduleFollowupSeconds, "runProactiveFollowUp", {
        reason: scheduledReason,
        scheduledAt: Date.now()
      });

      this.insertAudit({
        id: uid("aud"),
        createdAt: t1 + 3,
        stage: "scheduler",
        title: `Scheduled Proactive Verification (${plan.scheduleFollowupSeconds}s)`,
        detail: `Agent armed Durable Object timer for "${scheduledReason}".`,
        badge: `this.schedule(${plan.scheduleFollowupSeconds}s)`,
        severity: "warn"
      });
    }

    const agentReply: ThreadMessage = {
      id: uid("msg"),
      sender: "agent",
      authorName: plan.haltForDispute
        ? "Consigliere Safety Escalation"
        : "Consigliere AR Agent",
      body: plan.replyBody,
      createdAt: t1 + 4,
      intentDetected: plan.classification.intent,
      attachments: plan.attachedDocs.length > 0 ? plan.attachedDocs : undefined,
      settlementOptions: plan.offers.length > 0 ? plan.offers : undefined,
      aiModelUsed: plan.classification.modelBadge,
      latencyMs: plan.classification.latencyMs
    };
    this.insertMessage(agentReply);

    const nextInvoice: InvoiceSummary = {
      ...this.state.invoice,
      status: plan.haltForDispute
        ? "dispute_halted"
        : scheduledWakeupAt
          ? "scheduled_followup"
          : "active_negotiation",
      recoveryProbability: plan.updatedRecoveryProbability,
      lastActivityAt: Date.now(),
      scheduledWakeupAt,
      scheduledReason
    };

    const nextState: DebtorAgentState = {
      ...this.state,
      thinking: false,
      invoice: nextInvoice,
      messages: this.loadMessages(),
      auditTrace: this.loadAudit(),
      activeOffers: plan.offers,
      disputeSummary: plan.haltForDispute
        ? {
            haltedAt: Date.now(),
            reason: plan.classification.reasoningSummary,
            claimedDefectAmount:
              plan.classification.claimedDefectAmount ??
              roundCents(this.state.invoice.originalAmount * 0.12),
            recommendedCredit: plan.recommendedDisputeCredit
          }
        : null
    };

    this.setState(nextState);
    await syncInvoiceToPortfolio(this.env, nextInvoice);
    return nextState;
  }

  private async resolveDisputeWithCredit(
    creditAmount: number,
    cfoNote?: string
  ): Promise<DebtorAgentState> {
    const cleanCredit = Math.max(0, Math.min(this.state.invoice.originalAmount * 0.5, roundCents(creditAmount)));
    const adjustedBalance = roundCents(this.state.invoice.originalAmount - cleanCredit);
    const now = Date.now();

    const disputeOffer: SettlementOption = {
      id: "offer-dispute-resolved",
      label: `Pay Adjusted Net Balance (${fmtUsd(adjustedBalance)} after ${fmtUsd(cleanCredit)} Credit Memo)`,
      kind: "dispute_adjusted",
      payNowAmount: adjustedBalance,
      totalSettledAmount: adjustedBalance,
      discountPct: roundCents((cleanCredit / this.state.invoice.originalAmount) * 100),
      installments: 1,
      savingsAmount: cleanCredit,
      badge: "CFO Approved Credit Memo"
    };

    const msg: ThreadMessage = {
      id: uid("msg"),
      sender: "agent",
      authorName: "Finance Controller + Consigliere Agent",
      body:
        cfoNote?.trim() ||
        `Hi ${this.state.invoice.debtorContact.split(" ")[0]} — Our Finance Controller reviewed the inspection note and approved a ${fmtUsd(cleanCredit)} credit memo against ${this.state.invoice.invoiceNumber}. You can close the adjusted ${fmtUsd(adjustedBalance)} balance in full right below.`,
      createdAt: now,
      settlementOptions: [disputeOffer],
      aiModelUsed: "Human-in-the-Loop Override"
    };
    this.insertMessage(msg);

    this.insertAudit({
      id: uid("aud"),
      createdAt: now,
      stage: "circuit_breaker",
      title: `CFO Issued ${fmtUsd(cleanCredit)} Credit Memo & Unfroze Agent`,
      detail: `Adjusted collectible balance to ${fmtUsd(adjustedBalance)} and dispatched final settlement link.`,
      badge: "Human Approved",
      severity: "success"
    });

    const nextInvoice: InvoiceSummary = {
      ...this.state.invoice,
      status: "active_negotiation",
      recoveryProbability: 92,
      lastActivityAt: now
    };

    const nextState: DebtorAgentState = {
      ...this.state,
      invoice: nextInvoice,
      messages: this.loadMessages(),
      auditTrace: this.loadAudit(),
      activeOffers: [disputeOffer],
      disputeSummary: null
    };

    this.setState(nextState);
    await syncInvoiceToPortfolio(this.env, nextInvoice);
    return nextState;
  }

  private async settleInvoice(offerId: string): Promise<DebtorAgentState> {
    if (this.state.invoice.status === "settled") return this.state;

    const chosen =
      this.state.activeOffers.find((o) => o.id === offerId) ??
      this.state.activeOffers[0] ?? {
        id: "fallback-full",
        label: "Full Balance ACH",
        kind: "full" as const,
        payNowAmount: this.state.invoice.originalAmount,
        totalSettledAmount: this.state.invoice.originalAmount,
        discountPct: 0,
        installments: 1,
        savingsAmount: 0,
        badge: "Settled"
      };

    const now = Date.now();
    const traceNum = `ACH-${Math.floor(100000 + Math.random() * 900000)}`;

    const sysMsg: ThreadMessage = {
      id: uid("msg"),
      sender: "system",
      authorName: "Direct ACH Remittance Gateway",
      body: `SETTLED: ${this.state.invoice.debtorCompany} authorized "${chosen.label}" — ${fmtUsd(chosen.totalSettledAmount)} routed directly to client operating account (Trace #${traceNum}). Zero funds custodied by Consigliere.`,
      createdAt: now
    };
    this.insertMessage(sysMsg);

    const feeEarned = roundCents(chosen.totalSettledAmount * 0.08);
    this.insertAudit({
      id: uid("aud"),
      createdAt: now,
      stage: "settled",
      title: `Invoice Settled (${fmtUsd(chosen.totalSettledAmount)}) — Trace #${traceNum}`,
      detail: `Client recovered ${fmtUsd(chosen.totalSettledAmount)} (saved ${fmtUsd(roundCents(chosen.totalSettledAmount * 0.22))} vs 30% collection agency). Consigliere auto-billed 8% contingency fee (${fmtUsd(feeEarned)}).`,
      badge: `+${fmtUsd(feeEarned)} Profit`,
      severity: "success"
    });

    const nextInvoice: InvoiceSummary = {
      ...this.state.invoice,
      paidAmount: chosen.payNowAmount,
      settledTotalAmount: chosen.totalSettledAmount,
      status: "settled",
      recoveryProbability: 100,
      scheduledWakeupAt: null,
      scheduledReason: null,
      lastActivityAt: now
    };

    const nextState: DebtorAgentState = {
      ...this.state,
      invoice: nextInvoice,
      messages: this.loadMessages(),
      auditTrace: this.loadAudit(),
      activeOffers: [],
      disputeSummary: null
    };

    this.setState(nextState);
    await syncInvoiceToPortfolio(this.env, nextInvoice);
    return nextState;
  }
}

/**
 * Company-wide Portfolio Coordinator Agent.
 * Tracks all overdue invoices in SQLite, computes live recovered cash & Consigliere net fees,
 * and pushes live updates to all connected dashboard clients over WebSockets.
 */
export class PortfolioHub extends Agent<Env, PortfolioState> {
  async onStart(): Promise<void> {
    this.sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        created_order INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      )
    `;

    const existing = this.sql<{ id: string }>`SELECT id FROM invoices LIMIT 1`;
    if (existing.length === 0) {
      this.seedInitialPortfolio();
    } else if (!this.state?.invoices) {
      this.recomputeAndBroadcast();
    }
  }

  private seedInitialPortfolio(): PortfolioState {
    this.sql`DELETE FROM invoices`;
    SEED_INVOICES.forEach((item, idx) => {
      this.sql`
        INSERT INTO invoices (id, created_order, payload_json)
        VALUES (${item.summary.id}, ${idx}, ${JSON.stringify(item.summary)})
      `;
    });
    return this.recomputeAndBroadcast();
  }

  private recomputeAndBroadcast(): PortfolioState {
    const rows = this.sql<{ payload_json: string }>`
      SELECT payload_json FROM invoices ORDER BY created_order ASC
    `;
    const invoices = rows.map((r) => JSON.parse(r.payload_json) as InvoiceSummary);

    const totalOverduePool = roundCents(
      invoices.reduce((acc, inv) => acc + (inv.status === "settled" ? 0 : inv.originalAmount), 0)
    );
    const totalRecoveredForClient = roundCents(
      invoices.reduce((acc, inv) => acc + (inv.settledTotalAmount ?? 0), 0)
    );
    const platformMonthlyFee = 499;
    const contingencyFeePct = 8;
    const consigliereRevenueEarned = roundCents(
      platformMonthlyFee + totalRecoveredForClient * (contingencyFeePct / 100)
    );

    const next: PortfolioState = {
      creditorName: "Midwest Industrial & Plumbing Supply Co.",
      creditorBankLabel: "Chase Commercial Operating ••4810 (Direct Stripe/ACH Link)",
      platformMonthlyFee,
      contingencyFeePct,
      invoices,
      totalOverduePool,
      totalRecoveredForClient,
      consigliereRevenueEarned,
      lastUpdatedAt: Date.now()
    };

    this.setState(next);
    return next;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      return Response.json(this.state ?? this.recomputeAndBroadcast());
    }

    if (request.method === "POST" && url.pathname.endsWith("/upsert-invoice")) {
      const { invoice } = (await request.json()) as { invoice: InvoiceSummary };
      const existing = this.sql<{ created_order: number }>`
        SELECT created_order FROM invoices WHERE id = ${invoice.id}
      `;
      const order = existing.length > 0 ? existing[0].created_order : -Date.now();
      this.sql`
        INSERT OR REPLACE INTO invoices (id, created_order, payload_json)
        VALUES (${invoice.id}, ${order}, ${JSON.stringify(invoice)})
      `;
      return Response.json(this.recomputeAndBroadcast());
    }

    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      const next = this.seedInitialPortfolio();
      return Response.json(next);
    }

    return Response.json(this.state);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Native Cloudflare Agents SDK WebSocket & HTTP router (/agents/debtor-agent/:name, /agents/portfolio-hub/main)
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    // 2. REST convenience endpoints under /api/*
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        platform: "Cloudflare Workers + Agents SDK + Workers AI",
        model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
      });
    }

    if (url.pathname === "/api/portfolio" && request.method === "GET") {
      const hub = env.PortfolioHub.get(env.PortfolioHub.idFromName("main"));
      return hub.fetch("https://internal/state");
    }

    if (url.pathname === "/api/invoices/extract" && request.method === "POST") {
      const { rawText } = (await request.json()) as { rawText: string };
      const extracted = await extractInvoiceFromRawText(env.AI, rawText || "");

      // Spawn and initialize the new DebtorAgent Durable Object
      const agentStub = env.DebtorAgent.get(env.DebtorAgent.idFromName(extracted.summary.id));
      await agentStub.fetch("https://internal/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(extracted)
      });

      // Register in PortfolioHub
      const hub = env.PortfolioHub.get(env.PortfolioHub.idFromName("main"));
      await hub.fetch("https://internal/upsert-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice: extracted.summary })
      });

      return Response.json(extracted, { status: 201 });
    }

    if (url.pathname === "/api/demo/reset" && request.method === "POST") {
      await Promise.all(
        SEED_INVOICES.map((item) => {
          const stub = env.DebtorAgent.get(env.DebtorAgent.idFromName(item.summary.id));
          return stub.fetch("https://internal/reset", { method: "POST" });
        })
      );
      const hub = env.PortfolioHub.get(env.PortfolioHub.idFromName("main"));
      return hub.fetch("https://internal/reset", { method: "POST" });
    }

    // Proxy direct actions to a specific DebtorAgent (/api/debtors/:id/:action)
    const debtorMatch = url.pathname.match(/^\/api\/debtors\/([^/]+)\/([^/]+)$/);
    if (debtorMatch) {
      const [, debtorId, action] = debtorMatch;
      const stub = env.DebtorAgent.get(env.DebtorAgent.idFromName(debtorId));
      return stub.fetch(`https://internal/${action}?id=${encodeURIComponent(debtorId)}`, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : request.body
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
