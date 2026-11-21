import React, { useMemo, useState } from "react";
import { CheckCircle2, DollarSign, ShieldCheck, TrendingUp } from "lucide-react";

interface Props {
  liveSessionRevenue: number;
}

const MONTHLY_NEW_CLIENTS = [4, 7, 10, 12, 13, 14]; // Total 60 onboarded, ~52 active after churn

export function ProfitModelTab({ liveSessionRevenue }: Props) {
  const [monthlyRetainer, setMonthlyRetainer] = useState(499);
  const [contingencyPct, setContingencyPct] = useState(8);
  const [avgRecoveredFirstBatch, setAvgRecoveredFirstBatch] = useState(42000);
  const [cacPerClient, setCacPerClient] = useState(160);

  const rows = useMemo(() => {
    let cashOnHand = 5000; // The Don's $5,000 seed loan!
    let activeClients = 0;
    let cumulativeProfit = 0;

    return MONTHLY_NEW_CLIENTS.map((newClients, idx) => {
      const month = idx + 1;
      const startCash = cashOnHand;
      // Modest churn starting month 3
      const churned = month >= 3 ? 1 : 0;
      activeClients = activeClients + newClients - churned;

      // Month 1 waives retainer on 2 early case-study pilots; full fees afterward
      const billableRetainerClients = month === 1 ? Math.max(1, activeClients - 2) : activeClients;
      const retainerRev = billableRetainerClients * monthlyRetainer;

      // New clients recover initial 60-120d overdue batch + existing clients recover smaller ongoing aging ($8k/mo)
      const firstBatchRecovered =
        newClients * avgRecoveredFirstBatch * (month === 1 ? 0.55 : 1);
      const ongoingRecovered = Math.max(0, activeClients - newClients) * 8500;
      const contingencyRev = Math.round(
        (firstBatchRecovered + ongoingRecovered) * (contingencyPct / 100)
      );

      const grossRevenue = retainerRev + contingencyRev;

      // Costs: Cold outreach infra ($650 base) + CAC + Cloudflare Workers/AI ($4/client) + Commission SDR from M3+
      const baseTools = 650;
      const acquisitionSpend = newClients * cacPerClient;
      const cloudflareInfra = Math.max(25, activeClients * 5);
      const sdrCommission = month >= 3 ? Math.round(grossRevenue * 0.11) : 0;

      const totalCosts = baseTools + acquisitionSpend + cloudflareInfra + sdrCommission;
      const netProfit = grossRevenue - totalCosts;
      cumulativeProfit += netProfit;
      cashOnHand = startCash + netProfit;

      return {
        month: `Month ${month}`,
        startCash,
        newClients,
        activeClients,
        grossRevenue,
        totalCosts,
        costPerCustomer: Math.round(totalCosts / Math.max(1, activeClients)),
        netProfit,
        cumulativeProfit,
        endingCash: cashOnHand
      };
    });
  }, [monthlyRetainer, contingencyPct, avgRecoveredFirstBatch, cacPerClient]);

  const day180Profit = rows[rows.length - 1].cumulativeProfit;
  const beatsMafiaTarget = day180Profit >= 200000;
  const maxMonthProfit = Math.max(...rows.map((r) => r.cumulativeProfit), 220000);

  return (
    <div className="space-y-5">
      {/* Top Banner: The Don's $200K Mandate */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded border border-[#b4c1c8] bg-[#0f2233] p-4 text-white lg:col-span-2">
          <div className="font-condensed text-xs font-semibold uppercase text-[#fbbf24]">
            CaseHacks 180-Day Mandate • Starting Cash: $5,000
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            Path to $200,000 Net Profit (After All Costs)
          </h2>
          <p className="mt-1.5 text-sm text-slate-300">
            Zero banking licenses (funds settle direct to client ACH). Zero upfront buyer friction
            (14-day pilot on dead 60+ day invoices).{" "}
            <strong className="text-white">96% software gross margin</strong> on Cloudflare Workers +
            Workers AI.
          </p>
        </div>

        <div
          className={`rounded border p-4 ${
            beatsMafiaTarget
              ? "border-[#2f8a5b] bg-[#e9f5ee]"
              : "border-[#c98a12] bg-[#fbf4e4]"
          }`}
        >
          <div className="font-condensed text-xs font-semibold uppercase text-[#4e5f6a]">
            180-Day Cumulative Net Profit
          </div>
          <div
            className={`mt-1 font-mono-num text-3xl font-bold ${
              beatsMafiaTarget ? "text-[#1d5e3c]" : "text-[#62420c]"
            }`}
          >
            ${day180Profit.toLocaleString()}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#1d5e3c]">
            <CheckCircle2 className="h-4 w-4" />
            {beatsMafiaTarget
              ? `Pays the Don $200K + $${(day180Profit - 200000).toLocaleString()} surplus!`
              : `$${(200000 - day180Profit).toLocaleString()} short — adjust pricing levers`}
          </div>
        </div>

        <div className="rounded border border-[#d5dde1] bg-white p-4">
          <div className="font-condensed text-xs font-semibold uppercase text-[#4e5f6a]">
            Unit Economics Snapshot
          </div>
          <div className="mt-2 space-y-1 text-xs text-[#3c4c57]">
            <div className="flex justify-between">
              <span>Price / Client:</span>
              <span className="font-mono-num font-semibold text-[#0f2233]">
                ${monthlyRetainer}/mo + {contingencyPct}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>45-Day LTV (Initial Batch):</span>
              <span className="font-mono-num font-semibold text-[#1d5e3c]">
                ${Math.round(monthlyRetainer + avgRecoveredFirstBatch * (contingencyPct / 100)).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CAC + Cloudflare COGS:</span>
              <span className="font-mono-num font-semibold text-[#0f2233]">
                ${cacPerClient} CAC • $5/mo infra
              </span>
            </div>
            <div className="flex justify-between">
              <span>Live Demo Fee Earned Now:</span>
              <span className="font-mono-num font-semibold text-[#2f8a5b]">
                ${liveSessionRevenue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Stress-Test Sliders (for Judge Q&A!) */}
      <div className="rounded border border-[#d5dde1] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-condensed text-xs font-semibold uppercase text-[#26496e]">
              Live Judge Q&A Sensitivity Controls
            </span>
            <p className="text-xs text-[#4e5f6a]">
              Drag any assumption below to stress-test our 180-day profit model live on stage.
            </p>
          </div>
          <span className="rounded bg-[#ebf1f8] px-2.5 py-1 font-mono-num text-xs font-medium text-[#26496e]">
            vs. Traditional Collection Agencies: 30% Fee (3.7x More Expensive)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block rounded border border-[#e8edef] bg-[#f9fbfb] p-3">
            <div className="flex justify-between text-xs font-medium text-[#0f2233]">
              <span>Platform Retainer</span>
              <span className="font-mono-num font-bold">${monthlyRetainer}/mo</span>
            </div>
            <input
              type="range"
              min={199}
              max={999}
              step={50}
              value={monthlyRetainer}
              onChange={(e) => setMonthlyRetainer(Number(e.target.value))}
              className="mt-2 w-full accent-[#0f2233]"
            />
          </label>

          <label className="block rounded border border-[#e8edef] bg-[#f9fbfb] p-3">
            <div className="flex justify-between text-xs font-medium text-[#0f2233]">
              <span>Recovery Fee (60d+ AR)</span>
              <span className="font-mono-num font-bold">{contingencyPct}%</span>
            </div>
            <input
              type="range"
              min={4}
              max={15}
              step={1}
              value={contingencyPct}
              onChange={(e) => setContingencyPct(Number(e.target.value))}
              className="mt-2 w-full accent-[#2f8a5b]"
            />
          </label>

          <label className="block rounded border border-[#e8edef] bg-[#f9fbfb] p-3">
            <div className="flex justify-between text-xs font-medium text-[#0f2233]">
              <span>Avg Batch Recovered / SMB</span>
              <span className="font-mono-num font-bold">
                ${(avgRecoveredFirstBatch / 1000).toFixed(0)}k
              </span>
            </div>
            <input
              type="range"
              min={20000}
              max={75000}
              step={2000}
              value={avgRecoveredFirstBatch}
              onChange={(e) => setAvgRecoveredFirstBatch(Number(e.target.value))}
              className="mt-2 w-full accent-[#3a6ea5]"
            />
          </label>

          <label className="block rounded border border-[#e8edef] bg-[#f9fbfb] p-3">
            <div className="flex justify-between text-xs font-medium text-[#0f2233]">
              <span>Cold Outreach CAC</span>
              <span className="font-mono-num font-bold">${cacPerClient}</span>
            </div>
            <input
              type="range"
              min={80}
              max={450}
              step={20}
              value={cacPerClient}
              onChange={(e) => setCacPerClient(Number(e.target.value))}
              className="mt-2 w-full accent-[#c98a12]"
            />
          </label>
        </div>
      </div>

      {/* Mandatory CaseHacks Slide Table + Visual Progression */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="overflow-x-auto rounded border border-[#d5dde1] bg-white lg:col-span-2">
          <div className="border-b border-[#d5dde1] bg-[#f4f6f7] px-4 py-3">
            <h3 className="font-condensed text-xs font-semibold uppercase text-[#0f2233]">
              Month-by-Month Ledger ($5,000 Starting Seed → Day 180 Net Profit)
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#d5dde1] bg-[#f9fbfb] font-condensed uppercase text-[#4e5f6a]">
                <th className="px-3.5 py-2.5">Month</th>
                <th className="px-3.5 py-2.5">Start Cash</th>
                <th className="px-3.5 py-2.5">Active SMBs</th>
                <th className="px-3.5 py-2.5">Gross Rev</th>
                <th className="px-3.5 py-2.5">All Costs</th>
                <th className="px-3.5 py-2.5">Cost/Cust</th>
                <th className="px-3.5 py-2.5">Monthly Profit</th>
                <th className="px-3.5 py-2.5">Cumul. Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8edef] font-mono-num">
              {rows.map((r) => (
                <tr key={r.month} className="hover:bg-[#f4f6f7]">
                  <td className="px-3.5 py-2.5 font-sans font-semibold text-[#0f2233]">{r.month}</td>
                  <td className="px-3.5 py-2.5 text-[#3c4c57]">${r.startCash.toLocaleString()}</td>
                  <td className="px-3.5 py-2.5 text-[#0f2233]">
                    {r.activeClients}{" "}
                    <span className="text-[11px] text-[#5f717d]">(+{r.newClients})</span>
                  </td>
                  <td className="px-3.5 py-2.5 font-medium text-[#0f2233]">
                    ${r.grossRevenue.toLocaleString()}
                  </td>
                  <td className="px-3.5 py-2.5 text-[#8a2e25]">-${r.totalCosts.toLocaleString()}</td>
                  <td className="px-3.5 py-2.5 text-[#4e5f6a]">${r.costPerCustomer}/mo</td>
                  <td className="px-3.5 py-2.5 font-semibold text-[#1d5e3c]">
                    +${r.netProfit.toLocaleString()}
                  </td>
                  <td className="px-3.5 py-2.5 font-bold text-[#0f2233]">
                    ${r.cumulativeProfit.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cumulative Profit Bar Chart vs $200K Mafia Line */}
        <div className="flex flex-col justify-between rounded border border-[#d5dde1] bg-white p-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-condensed text-xs font-semibold uppercase text-[#0f2233]">
                Cumulative Profit vs. $200K Debt
              </span>
              <TrendingUp className="h-4 w-4 text-[#2f8a5b]" />
            </div>
            <div className="mt-4 space-y-3">
              {rows.map((r) => {
                const pct = Math.max(3, Math.min(100, Math.round((r.cumulativeProfit / maxMonthProfit) * 100)));
                const cleared = r.cumulativeProfit >= 200000;
                return (
                  <div key={r.month}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-[#0f2233]">{r.month}</span>
                      <span
                        className={`font-mono-num font-semibold ${
                          cleared ? "text-[#1d5e3c]" : "text-[#3c4c57]"
                        }`}
                      >
                        ${r.cumulativeProfit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-sm bg-[#e8edef]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          cleared ? "bg-[#2f8a5b]" : "bg-[#3a6ea5]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded border border-[#d5dde1] bg-[#f4f6f7] p-3 text-xs text-[#3c4c57]">
            <div className="flex items-center gap-1.5 font-semibold text-[#0f2233]">
              <ShieldCheck className="h-4 w-4 text-[#2f8a5b]" />
              Why $5,000 Never Runs Out:
            </div>
            <p className="mt-1">
              Month 1 outlays only <strong>$1,490</strong> (Apollo + Instantly outreach + Cloudflare
              Workers Paid). Because ACH links settle in <strong>48 hours</strong>, Week 2 pilot
              recoveries self-fund Months 2–6.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
