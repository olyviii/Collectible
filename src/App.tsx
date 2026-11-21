import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck2,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Wallet
} from "lucide-react";
import {
  DEFAULT_GUARDRAILS,
  EXCUSE_PRESETS,
  SEED_INVOICES,
  type DebtorAgentState,
  type Guardrails,
  type InvoiceSummary,
  type PortfolioState,
  type ToneProfile
} from "../shared/seedInvoices";
import { ExtractInvoiceModal } from "./components/ExtractInvoiceModal";
import { ProfitModelTab } from "./components/ProfitModelTab";
import { PitchBlueprintTab } from "./components/PitchBlueprintTab";

type ActiveTab = "arena" | "profit_model" | "blueprint";

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusPill(status: InvoiceSummary["status"]) {
  switch (status) {
    case "settled":
      return {
        label: "SETTLED • ACH CLEARED",
        cls: "bg-[#e9f5ee] text-[#1d5e3c] border-[#2f8a5b]/40"
      };
    case "dispute_halted":
      return {
        label: "CIRCUIT BREAKER • PAUSED",
        cls: "bg-[#fbeeec] text-[#8a2e25] border-[#a8392d]/40"
      };
    case "scheduled_followup":
      return {
        label: "ALARM ARMED • SCHEDULED",
        cls: "bg-[#fbf4e4] text-[#62420c] border-[#c98a12]/40"
      };
    default:
      return {
        label: "ACTIVE NEGOTIATION",
        cls: "bg-[#ebf1f8] text-[#26496e] border-[#3a6ea5]/40"
      };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("arena");
  const [selectedId, setSelectedId] = useState<string>(SEED_INVOICES[0].summary.id);
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [debtorState, setDebtorState] = useState<DebtorAgentState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const [customReply, setCustomReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [settlingOfferId, setSettlingOfferId] = useState<string | null>(null);
  const [creditInput, setCreditInput] = useState<string>("1800");
  const [extractModalOpen, setExtractModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Live 250ms clock tick so `this.schedule()` Durable Object countdown animates smoothly
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Connect live WebSocket to PortfolioHub Durable Object Agent
  useAgent<PortfolioState>({
    agent: "portfolio-hub",
    name: "main",
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
    onStateUpdate: (nextState) => {
      if (nextState?.invoices) setPortfolio(nextState);
    }
  });

  // Connect live WebSocket to the active DebtorAgent Durable Object
  useAgent<DebtorAgentState>({
    agent: "debtor-agent",
    name: selectedId,
    onOpen: () => setWsConnected(true),
    onStateUpdate: (nextState) => {
      if (nextState?.initialized) {
        setDebtorState(nextState);
        if (nextState.disputeSummary) {
          setCreditInput(String(nextState.disputeSummary.recommendedCredit));
        }
      }
    }
  });

  // Immediate HTTP bootstrap on load / account switch
  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json() as Promise<PortfolioState>)
      .then((d) => {
        if (d?.invoices) setPortfolio(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/debtors/${encodeURIComponent(selectedId)}/state`)
      .then((r) => r.json() as Promise<DebtorAgentState>)
      .then((d) => {
        if (d?.initialized) {
          setDebtorState(d);
          if (d.disputeSummary) {
            setCreditInput(String(d.disputeSummary.recommendedCredit));
          }
        }
      })
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debtorState?.messages?.length, debtorState?.thinking]);

  const invoices = useMemo(
    () => portfolio?.invoices ?? SEED_INVOICES.map((s) => s.summary),
    [portfolio]
  );

  const countdownSeconds = useMemo(() => {
    const wake = debtorState?.invoice?.scheduledWakeupAt;
    if (!wake) return null;
    const diff = Math.ceil((wake - nowTick) / 1000);
    return diff > 0 ? diff : 0;
  }, [debtorState?.invoice?.scheduledWakeupAt, nowTick]);

  async function sendDebtorMessage(text: string) {
    if (!text.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/debtors/${encodeURIComponent(selectedId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const updated = (await res.json()) as DebtorAgentState;
      if (updated?.initialized) setDebtorState(updated);
      setCustomReply("");
    } finally {
      setSendingReply(false);
    }
  }

  async function updateGuardrails(patch: Partial<Guardrails>) {
    if (!debtorState) return;
    const optimistic: DebtorAgentState = {
      ...debtorState,
      guardrails: { ...debtorState.guardrails, ...patch }
    };
    setDebtorState(optimistic);
    const res = await fetch(`/api/debtors/${encodeURIComponent(selectedId)}/guardrails`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    const updated = (await res.json()) as DebtorAgentState;
    if (updated?.initialized) setDebtorState(updated);
  }

  async function armLiveTimer(seconds = 10) {
    const res = await fetch(`/api/debtors/${encodeURIComponent(selectedId)}/arm-timer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seconds,
        reason: "Live Stage Demo: Friday AP Promise-to-Pay Check"
      })
    });
    const updated = (await res.json()) as DebtorAgentState;
    if (updated?.initialized) setDebtorState(updated);
  }

  async function handleApproveDisputeCredit() {
    const amount = Number(creditInput) || 1500;
    const res = await fetch(`/api/debtors/${encodeURIComponent(selectedId)}/resolve-dispute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creditAmount: amount })
    });
    const updated = (await res.json()) as DebtorAgentState;
    if (updated?.initialized) setDebtorState(updated);
  }

  async function handlePayOffer(offerId: string) {
    setSettlingOfferId(offerId);
    try {
      const res = await fetch(`/api/debtors/${encodeURIComponent(selectedId)}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId })
      });
      const updated = (await res.json()) as DebtorAgentState;
      if (updated?.initialized) setDebtorState(updated);
      const pRes = await fetch("/api/portfolio");
      const pData = (await pRes.json()) as PortfolioState;
      if (pData?.invoices) setPortfolio(pData);
    } finally {
      setSettlingOfferId(null);
    }
  }

  async function handleResetDemo() {
    setResetting(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const pData = (await res.json()) as PortfolioState;
      if (pData?.invoices) setPortfolio(pData);
      const firstId = SEED_INVOICES[0].summary.id;
      setSelectedId(firstId);
      const dRes = await fetch(`/api/debtors/${encodeURIComponent(firstId)}/state`);
      const dData = (await dRes.json()) as DebtorAgentState;
      if (dData?.initialized) setDebtorState(dData);
    } finally {
      setResetting(false);
    }
  }

  const guardrails = debtorState?.guardrails ?? DEFAULT_GUARDRAILS;
  const activeInv = debtorState?.invoice ?? invoices[0];

  return (
    <div className="min-h-screen bg-[#f4f6f5] text-[#0f2233]">
      {/* Top Command Header */}
      <header className="border-b border-[#b4c1c8] bg-[#0f2233] text-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-[#2f8a5b] font-condensed text-lg font-bold tracking-wider text-white">
              C§
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">CONSIGLIERE</span>
                <span className="rounded bg-white/10 px-2 py-0.5 font-condensed text-[11px] font-semibold uppercase text-[#fbbf24]">
                  Autonomous B2B AR Negotiator
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Legal Pre-Collections AI • Cloudflare Workers + Stateful Agents SDK + Workers AI
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex items-center gap-1 rounded bg-white/10 p-1">
            <button
              onClick={() => setActiveTab("arena")}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "arena"
                  ? "bg-white text-[#0f2233] shadow-xs"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              1. Live Agent Arena (Split-Screen Demo)
            </button>
            <button
              onClick={() => setActiveTab("profit_model")}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "profit_model"
                  ? "bg-[#fbbf24] text-[#0f2233] shadow-xs"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              2. The Don's $200K Profit Ledger
            </button>
            <button
              onClick={() => setActiveTab("blueprint")}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "blueprint"
                  ? "bg-white text-[#0f2233] shadow-xs"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              3. Cloudflare Stack & 2-Min Pitch
            </button>
          </nav>

          {/* Status & Reset */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1 font-mono-num text-[11px] text-emerald-300">
              <Radio className={`h-3 w-3 ${wsConnected ? "animate-pulse text-emerald-400" : "text-amber-300"}`} />
              {wsConnected ? "Agents WS Live" : "HTTP Sync Active"}
            </span>
            <button
              onClick={() => setExtractModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded bg-[#2f8a5b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d5e3c]"
            >
              <Plus className="h-3.5 w-3.5" />
              AI Ingest Invoice
            </button>
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              title="Reset all invoices & agents clean before your 2-minute pitch"
              className="inline-flex items-center gap-1 rounded border border-white/20 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Top Financial Telemetry Bar */}
      <div className="border-b border-[#d5dde1] bg-white">
        <div className="mx-auto grid max-w-[1480px] grid-cols-2 gap-4 px-4 py-3 md:grid-cols-4">
          <div>
            <div className="font-condensed text-[11px] font-semibold uppercase text-[#4e5f6a]">
              Active Client Overdue Pool (60–100d)
            </div>
            <div className="font-mono-num text-xl font-bold text-[#0f2233]">
              {fmtUsd(portfolio?.totalOverduePool ?? 69400)}
            </div>
          </div>

          <div>
            <div className="font-condensed text-[11px] font-semibold uppercase text-[#1d5e3c]">
              Cash Recovered Direct to Client ACH
            </div>
            <div className="font-mono-num text-xl font-bold text-[#2f8a5b]">
              {fmtUsd(portfolio?.totalRecoveredForClient ?? 0)}
            </div>
          </div>

          <div>
            <div className="font-condensed text-[11px] font-semibold uppercase text-[#62420c]">
              Consigliere Fee Earned ($499 + 8%)
            </div>
            <div className="font-mono-num text-xl font-bold text-[#c98a12]">
              {fmtUsd(portfolio?.consigliereRevenueEarned ?? 499)}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="font-condensed text-[11px] font-semibold uppercase text-[#4e5f6a]">
              Non-Custodial Payout Rail
            </div>
            <div className="truncate text-xs font-medium text-[#26496e]">
              {portfolio?.creditorBankLabel ?? "Chase Commercial Operating ••4810 (Zero MTL License)"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1480px] p-4">
        {activeTab === "profit_model" && (
          <ProfitModelTab liveSessionRevenue={portfolio?.consigliereRevenueEarned ?? 499} />
        )}

        {activeTab === "blueprint" && <PitchBlueprintTab />}

        {activeTab === "arena" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* COLUMN 1 (3 cols): Overdue Accounts Queue + Live CFO Guardrails */}
            <section className="space-y-4 lg:col-span-3">
              <div className="rounded border border-[#d5dde1] bg-white">
                <div className="flex items-center justify-between border-b border-[#d5dde1] bg-[#f4f6f7] px-3.5 py-2.5">
                  <span className="font-condensed text-xs font-semibold uppercase text-[#0f2233]">
                    Dedicated DebtorAgents ({invoices.length})
                  </span>
                  <span className="font-mono-num text-[11px] text-[#4e5f6a]">1 SQLite DO / Acct</span>
                </div>

                <div className="divide-y divide-[#e8edef]">
                  {invoices.map((inv) => {
                    const isSelected = inv.id === selectedId;
                    const badge = statusPill(inv.status);
                    return (
                      <button
                        key={inv.id}
                        onClick={() => setSelectedId(inv.id)}
                        className={`w-full px-3.5 py-3 text-left transition ${
                          isSelected
                            ? "border-l-4 border-l-[#0f2233] bg-[#ebf1f8]/65"
                            : "hover:bg-[#f9fbfb]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm text-[#0f2233] leading-tight">
                            {inv.debtorCompany}
                          </div>
                          <span className="font-mono-num text-sm font-bold text-[#0f2233]">
                            {fmtUsd(inv.settledTotalAmount ?? inv.originalAmount)}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-xs text-[#4e5f6a]">
                          <span>
                            {inv.invoiceNumber} • {inv.daysOverdue}d late
                          </span>
                          <span className="font-mono-num font-medium">
                            {inv.recoveryProbability}% prob
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-condensed text-[10px] font-semibold uppercase ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[11px] text-[#5f717d]">{inv.relationshipTier}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CFO Negotiation Guardrails */}
              <div className="rounded border border-[#d5dde1] bg-white p-3.5">
                <div className="flex items-center gap-2 border-b border-[#e8edef] pb-2.5">
                  <Sliders className="h-4 w-4 text-[#3a6ea5]" />
                  <div>
                    <div className="font-condensed text-xs font-semibold uppercase text-[#0f2233]">
                      CFO Negotiation Guardrails
                    </div>
                    <div className="text-[11px] text-[#4e5f6a]">
                      Enforced deterministically before Workers AI drafts
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between font-medium text-[#0f2233]">
                      <span>Max Fast-Close Discount</span>
                      <span className="font-mono-num font-bold text-[#2f8a5b]">
                        {guardrails.maxDiscountPct}% ceiling
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={guardrails.maxDiscountPct}
                      onChange={(e) =>
                        updateGuardrails({ maxDiscountPct: Number(e.target.value) })
                      }
                      className="mt-1 w-full accent-[#2f8a5b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-medium text-[#0f2233]">
                      <span>Max Split Installments</span>
                      <span className="font-mono-num font-bold text-[#3a6ea5]">
                        {guardrails.maxInstallments}x weekly ACH
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={1}
                      value={guardrails.maxInstallments}
                      onChange={(e) =>
                        updateGuardrails({ maxInstallments: Number(e.target.value) })
                      }
                      className="mt-1 w-full accent-[#3a6ea5]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-medium text-[#0f2233]">Agent Tone</label>
                    <select
                      value={guardrails.tone}
                      onChange={(e) =>
                        updateGuardrails({ tone: e.target.value as ToneProfile })
                      }
                      className="w-full rounded border border-[#b4c1c8] bg-[#f9fbfb] px-2.5 py-1.5 text-xs font-medium text-[#0f2233]"
                    >
                      <option value="warm_relationship">Warm Relationship Partner</option>
                      <option value="executive_firm">Executive Controller (Firm & Polite)</option>
                      <option value="final_pre_collections">Final Pre-Collections Notice</option>
                    </select>
                  </div>

                  <label className="flex items-center justify-between rounded border border-[#e8edef] bg-[#f9fbfb] px-2.5 py-2">
                    <span className="font-medium text-[#0f2233]">
                      Auto-Attach W-9 & Signed POD
                    </span>
                    <input
                      type="checkbox"
                      checked={guardrails.autoAttachVaultDocs}
                      onChange={(e) =>
                        updateGuardrails({ autoAttachVaultDocs: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#2f8a5b]"
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* COLUMN 2 (4 cols): Cloudflare Agent Brain, Scheduler & SQLite Trace */}
            <section className="flex flex-col gap-4 lg:col-span-4">
              {/* Active Account Telemetry Card */}
              <div className="rounded border border-[#d5dde1] bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-condensed text-xs font-semibold uppercase text-[#3a6ea5]">
                    Cloudflare Agent Brain • {activeInv?.invoiceNumber}
                  </span>
                  <span className="rounded bg-[#ebf1f8] px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[#26496e]">
                    Prob: {activeInv?.recoveryProbability ?? 75}%
                  </span>
                </div>

                <h2 className="mt-1 text-base font-bold text-[#0f2233]">
                  {activeInv?.debtorCompany}
                </h2>
                <p className="text-xs text-[#4e5f6a]">
                  {activeInv?.lineItemsSummary} ({activeInv?.poNumber})
                </p>

                {/* Proactive Durable Object Alarm Strip (`this.schedule`) */}
                <div className="mt-3 rounded border border-[#d5dde1] bg-[#f9fbfb] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0f2233]">
                      <Clock className="h-3.5 w-3.5 text-[#c98a12]" />
                      <span>
                        Durable Object <code className="text-[#62420c]">this.schedule()</code>
                      </span>
                    </div>

                    {countdownSeconds !== null ? (
                      <span className="animate-pulse rounded bg-[#fbf4e4] px-2 py-0.5 font-mono-num text-xs font-bold text-[#62420c]">
                        Waking up in {countdownSeconds}s...
                      </span>
                    ) : (
                      <button
                        onClick={() => armLiveTimer(10)}
                        disabled={activeInv?.status === "settled"}
                        className="rounded border border-[#c98a12] bg-[#fbf4e4] px-2 py-0.5 text-[11px] font-semibold text-[#62420c] hover:bg-[#f6e8c8] disabled:opacity-40"
                      >
                        Test 10s Autonomous Wake-Up
                      </button>
                    )}
                  </div>
                  {activeInv?.scheduledReason && (
                    <p className="mt-1 text-[11px] text-[#62420c]">
                      Scheduled check: <strong>{activeInv.scheduledReason}</strong>
                    </p>
                  )}
                </div>

                {/* Circuit Breaker Human-in-the-Loop Escalation Card */}
                {debtorState?.disputeSummary && (
                  <div className="mt-3 rounded border-2 border-[#a8392d] bg-[#fbeeec] p-3">
                    <div className="flex items-center gap-1.5 font-condensed text-xs font-bold uppercase text-[#8a2e25]">
                      <AlertOctagon className="h-4 w-4" />
                      Safety Circuit Breaker Tripped — Outreach Paused
                    </div>
                    <p className="mt-1 text-xs text-[#8a2e25]">
                      {debtorState.disputeSummary.reason}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex items-center rounded border border-[#a8392d]/40 bg-white px-2 py-1 text-xs">
                        <span className="text-[#4e5f6a] mr-1">Credit $:</span>
                        <input
                          type="number"
                          value={creditInput}
                          onChange={(e) => setCreditInput(e.target.value)}
                          className="w-20 font-mono-num font-bold text-[#0f2233] focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleApproveDisputeCredit}
                        className="flex-1 rounded bg-[#a8392d] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#8a2e25]"
                      >
                        Issue CFO Credit Memo & Resume
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Persistent SQLite Audit Log */}
              <div className="flex flex-1 flex-col rounded border border-[#d5dde1] bg-white">
                <div className="flex items-center justify-between border-b border-[#d5dde1] bg-[#f4f6f7] px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-[#0f2233]" />
                    <span className="font-condensed text-xs font-semibold uppercase text-[#0f2233]">
                      Agent Reasoning & SQLite Trace
                    </span>
                  </div>
                  <span className="font-mono-num text-[11px] text-[#4e5f6a]">this.sql</span>
                </div>

                <div className="max-h-[500px] space-y-2.5 overflow-y-auto p-3">
                  {debtorState?.thinking && (
                    <div className="animate-pulse rounded border border-[#3a6ea5] bg-[#ebf1f8] p-2.5 text-xs text-[#26496e]">
                      <strong>Workers AI Executing:</strong> Running JSON-Schema intent classifier →
                      checking CFO guardrails → drafting calibrated response...
                    </div>
                  )}

                  {(debtorState?.auditTrace ?? []).map((step) => {
                    const borderCls =
                      step.severity === "danger"
                        ? "border-l-[#a8392d] bg-[#fbeeec]/50"
                        : step.severity === "warn"
                          ? "border-l-[#c98a12] bg-[#fbf4e4]/50"
                          : step.severity === "success"
                            ? "border-l-[#2f8a5b] bg-[#e9f5ee]/45"
                            : "border-l-[#3a6ea5] bg-[#f9fbfb]";

                    return (
                      <div
                        key={step.id}
                        className={`rounded border border-[#e8edef] border-l-4 p-2.5 text-xs ${borderCls}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-[#0f2233]">{step.title}</span>
                          {step.badge && (
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono-num text-[10px] font-medium text-[#3c4c57] border border-[#d5dde1]">
                              {step.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 leading-relaxed text-[#3c4c57]">{step.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* COLUMN 3 (5 cols): Simulated Debtor Inbox & Instant ACH Portal */}
            <section className="flex flex-col rounded border border-[#b4c1c8] bg-white lg:col-span-5">
              {/* Inbox Header */}
              <div className="flex items-center justify-between border-b border-[#d5dde1] bg-[#0f2233] px-4 py-2.5 text-white">
                <div>
                  <div className="font-condensed text-[11px] font-semibold uppercase text-[#fbbf24]">
                    Live Split-Screen View • Late Customer's Inbox
                  </div>
                  <div className="text-sm font-semibold">
                    {activeInv?.debtorContact} — {activeInv?.debtorEmail}
                  </div>
                </div>
                <Shield className="h-4 w-4 text-emerald-400" />
              </div>

              {/* Email / Negotiation Thread */}
              <div className="max-h-[430px] flex-1 space-y-3 overflow-y-auto bg-[#f4f6f7] p-3.5">
                {(debtorState?.messages ?? []).map((msg) => {
                  if (msg.sender === "system") {
                    return (
                      <div
                        key={msg.id}
                        className="rounded border border-[#2f8a5b] bg-[#e9f5ee] p-3 text-xs font-medium text-[#1d5e3c]"
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          <CheckCircle2 className="h-4 w-4" />
                          Direct Bank-to-Bank ACH Settlement Complete
                        </div>
                        <p className="mt-1">{msg.body}</p>
                      </div>
                    );
                  }

                  const isAgent = msg.sender === "agent";
                  return (
                    <div
                      key={msg.id}
                      className={`rounded border p-3 text-xs shadow-2xs ${
                        isAgent
                          ? "mr-4 border-[#d5dde1] bg-white"
                          : "ml-6 border-[#3a6ea5]/40 bg-[#ebf1f8]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-[#e8edef] pb-1.5">
                        <span className="font-semibold text-[#0f2233]">{msg.authorName}</span>
                        {msg.aiModelUsed && (
                          <span className="font-mono-num text-[10px] text-[#4e5f6a]">
                            {msg.aiModelUsed}
                          </span>
                        )}
                      </div>

                      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#0f2233]">
                        {msg.body}
                      </p>

                      {/* Attached Vault Compliance PDFs */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {msg.attachments.map((doc) => (
                            <span
                              key={doc.id}
                              title={doc.summary}
                              className="inline-flex items-center gap-1 rounded border border-[#2f8a5b]/40 bg-[#e9f5ee] px-2 py-1 font-mono-num text-[11px] font-medium text-[#1d5e3c]"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              {doc.filename}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Authorized One-Click ACH Settlement Cards */}
                      {isAgent &&
                        msg.settlementOptions &&
                        msg.settlementOptions.length > 0 &&
                        activeInv?.status !== "settled" && (
                          <div className="mt-3 space-y-1.5 border-t border-[#e8edef] pt-2.5">
                            <div className="font-condensed text-[10px] font-semibold uppercase text-[#4e5f6a]">
                              Authorized Direct-ACH Settlement Options:
                            </div>
                            {msg.settlementOptions.map((opt) => (
                              <div
                                key={opt.id}
                                className="flex items-center justify-between gap-2 rounded border border-[#d5dde1] bg-[#f9fbfb] px-2.5 py-2"
                              >
                                <div>
                                  <div className="font-semibold text-[#0f2233]">{opt.label}</div>
                                  <div className="text-[11px] text-[#2f8a5b] font-medium">
                                    {opt.badge}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handlePayOffer(opt.id)}
                                  disabled={settlingOfferId !== null}
                                  className="inline-flex shrink-0 items-center gap-1 rounded bg-[#2f8a5b] px-2.5 py-1.5 font-mono-num text-xs font-semibold text-white hover:bg-[#1d5e3c] disabled:opacity-50"
                                >
                                  <Wallet className="h-3.5 w-3.5" />
                                  Pay {fmtUsd(opt.payNowAmount)}
                                  <ArrowUpRight className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Excuse Simulator Pills + Free-Text Debtor Reply */}
              <div className="border-t border-[#d5dde1] bg-white p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-condensed text-[11px] font-semibold uppercase text-[#0f2233]">
                    Throw a Real-World Debtor Excuse at the Agent:
                  </span>
                  <span className="text-[11px] text-[#4e5f6a]">1-Click Stage Triggers</span>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {EXCUSE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={sendingReply || activeInv?.status === "settled"}
                      onClick={() => sendDebtorMessage(preset.message)}
                      className="rounded border border-[#b4c1c8] bg-[#f4f6f7] px-2 py-1 text-left text-[11px] font-medium text-[#0f2233] hover:border-[#3a6ea5] hover:bg-[#ebf1f8] disabled:opacity-40"
                    >
                      <span className="font-semibold">{preset.label}</span>{" "}
                      <span className="text-[#3a6ea5]">({preset.tag})</span>
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendDebtorMessage(customReply);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={customReply}
                    onChange={(e) => setCustomReply(e.target.value)}
                    disabled={sendingReply || activeInv?.status === "settled"}
                    placeholder={
                      activeInv?.status === "settled"
                        ? "Invoice settled! Select another overdue account or click Reset."
                        : "Or type any custom debtor excuse / negotiation offer live..."
                    }
                    className="flex-1 rounded border border-[#b4c1c8] bg-[#f9fbfb] px-3 py-2 text-xs text-[#0f2233] focus:border-[#3a6ea5] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !customReply.trim() || activeInv?.status === "settled"}
                    className="inline-flex items-center gap-1.5 rounded bg-[#0f2233] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b2b37] disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingReply ? "Negotiating..." : "Reply as Debtor"}
                  </button>
                </form>
              </div>
            </section>
          </div>
        )}
      </main>

      <ExtractInvoiceModal
        open={extractModalOpen}
        onClose={() => setExtractModalOpen(false)}
        onCreated={(inv) => {
          setSelectedId(inv.id);
          fetch("/api/portfolio")
            .then((r) => r.json() as Promise<PortfolioState>)
            .then((d) => {
              if (d?.invoices) setPortfolio(d);
            })
            .catch(() => {});
        }}
      />
    </div>
  );
}
