import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  TrendingUp,
  Wallet
} from "lucide-react";
import {
  EXCUSE_PRESETS,
  SEED_INVOICES,
  type AuditTraceStep,
  type DebtorAgentState,
  type InvoiceSummary,
  type PortfolioState
} from "../shared/seedInvoices";
import { ExtractInvoiceModal } from "./components/ExtractInvoiceModal";

type ActiveTab = "overview" | "receivables";

// When the site is hosted somewhere other than the Worker (e.g. Vercel), live agent
// WebSockets connect straight to the Cloudflare Worker. /api calls go through rewrites.
const AGENT_HOST: string | undefined = import.meta.env.VITE_AGENT_HOST || undefined;

/* ---------- helpers ---------- */

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS: Record<
  InvoiceSummary["status"],
  { label: string; chip: string; dot: string }
> = {
  active_negotiation: {
    label: "In progress",
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500"
  },
  scheduled_followup: {
    label: "Follow-up scheduled",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500"
  },
  dispute_halted: {
    label: "Needs your review",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500"
  },
  settled: {
    label: "Paid",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500"
  }
};

function StatusChip({ status }: { status: InvoiceSummary["status"] }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const STAGE_LABEL: Record<AuditTraceStep["stage"], string> = {
  ingest: "Account opened",
  classify: "Read customer reply",
  vault_tool: "Sent documents",
  guardrail_math: "Applied your policy",
  scheduler: "Follow-up",
  circuit_breaker: "Escalated to you",
  settled: "Payment received"
};

const SEVERITY_DOT: Record<AuditTraceStep["severity"], string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500"
};

function Card({
  title,
  icon,
  action,
  children,
  className = ""
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111111]">
            {icon}
            {title}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------- app ---------- */

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
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

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Live connection to the company-wide PortfolioHub agent
  useAgent<PortfolioState>({
    agent: "portfolio-hub",
    name: "main",
    host: AGENT_HOST,
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
    onStateUpdate: (nextState) => {
      if (nextState?.invoices) setPortfolio(nextState);
    }
  });

  // Live connection to the selected customer's DebtorAgent
  useAgent<DebtorAgentState>({
    agent: "debtor-agent",
    name: selectedId,
    host: AGENT_HOST,
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
          if (d.disputeSummary) setCreditInput(String(d.disputeSummary.recommendedCredit));
        }
      })
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return (await res.json()) as T;
  }

  const debtorPath = (action: string) => `/api/debtors/${encodeURIComponent(selectedId)}/${action}`;

  async function sendCustomerMessage(text: string) {
    if (!text.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const updated = await postJson<DebtorAgentState>(debtorPath("reply"), { message: text });
      if (updated?.initialized) setDebtorState(updated);
      setCustomReply("");
    } finally {
      setSendingReply(false);
    }
  }

  async function scheduleFollowUp(seconds = 10) {
    const updated = await postJson<DebtorAgentState>(debtorPath("arm-timer"), {
      seconds,
      reason: "Check whether the promised payment arrived"
    });
    if (updated?.initialized) setDebtorState(updated);
  }

  async function approveCredit() {
    const amount = Number(creditInput) || 1500;
    const updated = await postJson<DebtorAgentState>(debtorPath("resolve-dispute"), {
      creditAmount: amount
    });
    if (updated?.initialized) setDebtorState(updated);
  }

  async function simulatePayment(offerId: string) {
    setSettlingOfferId(offerId);
    try {
      const updated = await postJson<DebtorAgentState>(debtorPath("pay"), { offerId });
      if (updated?.initialized) setDebtorState(updated);
      const pData = (await (await fetch("/api/portfolio")).json()) as PortfolioState;
      if (pData?.invoices) setPortfolio(pData);
    } finally {
      setSettlingOfferId(null);
    }
  }

  async function handleResetDemo() {
    setResetting(true);
    try {
      const pData = await postJson<PortfolioState>("/api/demo/reset");
      if (pData?.invoices) setPortfolio(pData);
      const firstId = SEED_INVOICES[0].summary.id;
      setSelectedId(firstId);
      const dData = (await (await fetch(`/api/debtors/${encodeURIComponent(firstId)}/state`)).json()) as DebtorAgentState;
      if (dData?.initialized) setDebtorState(dData);
    } finally {
      setResetting(false);
    }
  }

  function openAccount(id: string) {
    setSelectedId(id);
    setActiveTab("receivables");
  }

  const activeInv =
    debtorState?.invoice?.id === selectedId
      ? debtorState.invoice
      : invoices.find((i) => i.id === selectedId) ?? invoices[0];
  const isSettled = activeInv?.status === "settled";
  const latestOfferMsgId = [...(debtorState?.messages ?? [])]
    .reverse()
    .find((m) => m.sender === "agent" && m.settlementOptions?.length)?.id;

  const businessName = portfolio?.creditorName ?? "Midwest Industrial & Plumbing Supply Co.";
  const bankLabel = portfolio?.creditorBankLabel?.split(" (")[0] ?? "Chase Commercial Operating ••4810";
  const outstanding = portfolio?.totalOverduePool ?? 69400;
  const recovered = portfolio?.totalRecoveredForClient ?? 0;
  const fees = portfolio?.platformFeesEarned ?? 499;
  const openCount = invoices.filter((i) => i.status !== "settled").length;
  const attention = invoices.filter(
    (i) => i.status === "dispute_halted" || i.status === "scheduled_followup"
  );

  const tabs: Array<{ id: ActiveTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "receivables", label: "Receivables" }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f4] text-[#111111]">
      {/* Main nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5 py-3.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111111] text-sm font-bold text-white">
                C
              </div>
              <span className="font-display text-xl font-semibold text-[#111111]">Collectible</span>
            </div>
            <nav className="flex h-full items-stretch gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative px-3 py-5 text-sm font-medium transition ${
                    activeTab === t.id ? "text-[#111111]" : "text-slate-500 hover:text-[#111111]"
                  }`}
                >
                  {t.label}
                  {activeTab === t.id && (
                    <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-[#111111]" />
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              title="Reset demo data"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <RotateCcw className={`h-4 w-4 ${resetting ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setExtractModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3f3f46]"
            >
              <Plus className="h-4 w-4" />
              Add invoice
            </button>
            <div
              title={`${businessName} · ${wsConnected ? "Connected" : "Connecting…"}`}
              className="relative ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-[#111111]"
            >
              MI
              <span
                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white ${wsConnected ? "bg-emerald-500" : "bg-slate-300"}`}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Hero band */}
      <section className="bg-[#111111] pb-24 pt-8 text-white">
        <div className="mx-auto max-w-[1320px] px-6">
          <p className="text-sm text-white/60">{greeting()},</p>
          <h1 className="font-display mt-1 text-3xl font-medium md:text-[36px]">{businessName}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            Collectible is following up on{" "}
            <span className="font-semibold text-white">{openCount} overdue invoices</span> for you.
            Payments go straight to your {bankLabel} account.
          </p>
        </div>
      </section>

      {/* Summary cards (overlap hero) */}
      <div className="mx-auto -mt-16 w-full max-w-[1320px] px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Outstanding",
              value: fmtUsd(outstanding),
              sub: `${openCount} open invoices`,
              icon: <Wallet className="h-4 w-4" />,
              accent: "text-[#111111]",
              iconBg: "bg-sky-50 text-sky-700"
            },
            {
              label: "Recovered",
              value: fmtUsd(recovered),
              sub: "Deposited to your account",
              icon: <TrendingUp className="h-4 w-4" />,
              accent: "text-emerald-700",
              iconBg: "bg-emerald-50 text-emerald-700"
            },
            {
              label: "Needs attention",
              value: String(attention.length),
              sub: "Reviews & scheduled follow-ups",
              icon: <AlertTriangle className="h-4 w-4" />,
              accent: "text-amber-700",
              iconBg: "bg-amber-50 text-amber-700"
            },
            {
              label: "Collectible fees",
              value: fmtUsd(fees),
              sub: "$499/mo + 8% of recovered",
              icon: <Banknote className="h-4 w-4" />,
              accent: "text-[#111111]",
              iconBg: "bg-slate-100 text-slate-600"
            }
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{c.label}</span>
                <span className={`rounded-lg p-1.5 ${c.iconBg}`}>{c.icon}</span>
              </div>
              <div className={`font-display mt-2 text-[30px] font-medium tabular-nums leading-tight ${c.accent}`}>
                {c.value}
              </div>
              <div className="mt-1 text-xs text-slate-400">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-6 py-8">
        {/* ---------------- OVERVIEW ---------------- */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card
              title="Your overdue invoices"
              icon={<FileText className="h-4 w-4 text-[#111111]" />}
              action={
                <button
                  onClick={() => setActiveTab("receivables")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#111111] hover:underline"
                >
                  View all <ChevronRight className="h-4 w-4" />
                </button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 font-medium">Invoice</th>
                      <th className="px-3 py-3 text-right font-medium">Amount</th>
                      <th className="px-3 py-3 text-right font-medium">Overdue</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => openAccount(inv.id)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-[#111111]">{inv.debtorCompany}</div>
                          <div className="text-xs text-slate-400">{inv.debtorContact}</div>
                        </td>
                        <td className="font-mono-num whitespace-nowrap px-3 py-3.5 text-xs text-slate-500">{inv.invoiceNumber}</td>
                        <td className="px-3 py-3.5 text-right font-medium tabular-nums">
                          {fmtUsd(inv.settledTotalAmount ?? inv.originalAmount)}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums text-slate-500">
                          {inv.daysOverdue} days
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusChip status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-6">
              <Card
                title="Needs your attention"
                icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              >
                {attention.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    You're all caught up.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {attention.map((inv) => (
                      <li key={inv.id}>
                        <button
                          onClick={() => openAccount(inv.id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50"
                        >
                          <div>
                            <div className="text-sm font-medium">{inv.debtorCompany}</div>
                            <div className="text-xs text-slate-500">
                              {inv.status === "dispute_halted"
                                ? "Customer raised an issue. Approve a credit to continue."
                                : inv.scheduledReason ?? "Follow-up scheduled"}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ---------------- RECEIVABLES ---------------- */}
        {activeTab === "receivables" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            {/* Account list */}
            <Card title="Customers" className="h-fit overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const selected = inv.id === selectedId;
                  return (
                    <li key={inv.id}>
                      <button
                        onClick={() => setSelectedId(inv.id)}
                        className={`relative w-full px-5 py-3.5 text-left transition ${
                          selected ? "bg-neutral-100" : "hover:bg-slate-50"
                        }`}
                      >
                        {selected && (
                          <span className="absolute inset-y-0 left-0 w-[3px] bg-[#111111]" />
                        )}
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{inv.debtorCompany}</span>
                          <span className="text-sm tabular-nums text-slate-600">
                            {fmtUsd(inv.settledTotalAmount ?? inv.originalAmount)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <StatusChip status={inv.status} />
                          <span className="text-xs text-slate-400">{inv.daysOverdue}d</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Conversation */}
            <div className="space-y-4">
              <Card className="flex flex-col overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-[#111111]">
                      Conversation
                    </div>
                    <h2 className="font-display mt-0.5 text-2xl font-medium">{activeInv?.debtorCompany}</h2>
                    <p className="text-sm text-slate-500">
                      Collectible is talking with {activeInv?.debtorContact} on your behalf
                    </p>
                  </div>
                  {activeInv && <StatusChip status={activeInv.status} />}
                </div>

                {debtorState?.disputeSummary && (
                  <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                      <AlertTriangle className="h-4 w-4" />
                      Your approval is needed
                    </div>
                    <p className="mt-1 text-sm text-rose-700/80">{debtorState.disputeSummary.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm">
                        <span className="mr-1 text-slate-400">Credit $</span>
                        <input
                          type="number"
                          value={creditInput}
                          onChange={(e) => setCreditInput(e.target.value)}
                          className="w-24 tabular-nums focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={approveCredit}
                        className="rounded-lg bg-[#111111] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                      >
                        Approve credit & resume
                      </button>
                    </div>
                  </div>
                )}

                <div className="max-h-[520px] min-h-[360px] space-y-5 overflow-y-auto bg-[#f8fafc] px-5 py-5">
                  {(debtorState?.messages ?? []).map((msg) => {
                    if (msg.sender === "system") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="font-semibold">Payment received</div>
                            <div className="mt-0.5 text-emerald-700/90">
                              {msg.body.replace(/^SETTLED:\s*/, "")}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const fromUs = msg.sender === "agent";
                    return (
                      <div key={msg.id} className={`flex ${fromUs ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[85%]">
                          <div
                            className={`mb-1 text-xs ${fromUs ? "text-right text-[#111111]" : "text-slate-500"}`}
                          >
                            {fromUs ? msg.authorName : msg.authorName.split(" (")[0]}
                          </div>
                          <div
                            className={`rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm ${
                              fromUs
                                ? "rounded-tr-sm bg-[#111111] text-white"
                                : "rounded-tl-sm border border-slate-200 bg-white"
                            }`}
                          >
                            <p className="whitespace-pre-line">{msg.body}</p>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {msg.attachments.map((doc) => (
                                  <span
                                    key={doc.id}
                                    title={doc.summary}
                                    className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-xs"
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    {doc.filename}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {fromUs &&
                            msg.id === latestOfferMsgId &&
                            msg.settlementOptions &&
                            msg.settlementOptions.length > 0 &&
                            !isSettled && (
                              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500">
                                  Payment options offered to the customer
                                </div>
                                {msg.settlementOptions.map((opt) => (
                                  <div
                                    key={opt.id}
                                    className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0"
                                  >
                                    <div>
                                      <div className="text-sm text-[#111111]">{opt.label}</div>
                                      <div className="text-xs text-slate-400">
                                        You receive {fmtUsd(opt.totalSettledAmount)}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => simulatePayment(opt.id)}
                                      disabled={settlingOfferId !== null}
                                      title="Demo: pretend the customer accepted this option"
                                      className="shrink-0 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-[#111111] hover:text-[#111111] disabled:opacity-40"
                                    >
                                      Simulate payment
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  {debtorState?.thinking && (
                    <div className="flex justify-end">
                      <div className="animate-pulse rounded-2xl bg-neutral-200 px-4 py-2 text-sm text-[#111111]">
                        Collectible is writing a reply…
                      </div>
                    </div>
                  )}
                  <div ref={threadEndRef} />
                </div>
              </Card>

              {/* Demo: customer simulator */}
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-4">
                <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Demo · reply as the customer
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {EXCUSE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.message}
                      disabled={sendingReply || isSettled}
                      onClick={() => sendCustomerMessage(preset.message)}
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40"
                    >
                      {preset.label.replace(/"/g, "")}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendCustomerMessage(customReply);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={customReply}
                    onChange={(e) => setCustomReply(e.target.value)}
                    disabled={sendingReply || isSettled}
                    placeholder={isSettled ? "This invoice is paid" : "Type what the customer says…"}
                    className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !customReply.trim() || isSettled}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingReply ? "Sending…" : "Send"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <Card title="Invoice details" icon={<FileText className="h-4 w-4 text-[#111111]" />}>
                <dl className="space-y-2.5 px-5 py-4 text-sm">
                  {[
                    ["Invoice", activeInv?.invoiceNumber],
                    ["PO", activeInv?.poNumber],
                    ["Amount", activeInv ? fmtUsd(activeInv.originalAmount) : ""],
                    ["Overdue", activeInv ? `${activeInv.daysOverdue} days` : ""],
                    ["Contact", activeInv?.debtorEmail],
                    ["Likely to pay", activeInv ? `${activeInv.recoveryProbability}%` : ""]
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-slate-500">{k}</dt>
                      <dd
                        className={`truncate text-right font-medium ${k === "Invoice" || k === "PO" ? "font-mono-num text-xs leading-5" : ""}`}
                      >
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                {activeInv?.lineItemsSummary && (
                  <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                    {activeInv.lineItemsSummary}
                  </p>
                )}
              </Card>

              <Card title="Next follow-up" icon={<CalendarClock className="h-4 w-4 text-amber-500" />}>
                <div className="px-5 py-4 text-sm">
                  {countdownSeconds !== null ? (
                    <>
                      <div className="font-display text-3xl font-medium tabular-nums text-amber-600">
                        {countdownSeconds}s
                      </div>
                      <p className="mt-1 text-slate-500">{activeInv?.scheduledReason}</p>
                    </>
                  ) : isSettled ? (
                    <p className="text-slate-500">None, this invoice is paid.</p>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-slate-500">Nothing scheduled.</p>
                      <button
                        onClick={() => scheduleFollowUp(10)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium hover:border-[#111111] hover:text-[#111111]"
                      >
                        Check in 10s
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Activity">
                <ol className="max-h-[360px] space-y-4 overflow-y-auto px-5 py-4">
                  {(debtorState?.auditTrace ?? []).map((step) => (
                    <li key={step.id} className="flex gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[step.severity]}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{STAGE_LABEL[step.stage]}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {new Date(step.createdAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-slate-400">
          <span>© Collectible. Demo data only, no real payments are made.</span>
          <span>Payments settle directly to your bank account.</span>
        </div>
      </footer>

      <ExtractInvoiceModal
        open={extractModalOpen}
        onClose={() => setExtractModalOpen(false)}
        onCreated={(inv) => {
          openAccount(inv.id);
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
