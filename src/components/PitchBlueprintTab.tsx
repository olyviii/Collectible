import React from "react";
import { Clock, Cpu, Database, Lock, Mic, ShieldAlert, Zap } from "lucide-react";

export function PitchBlueprintTab() {
  return (
    <div className="space-y-5">
      {/* Cloudflare Stack Architecture */}
      <div className="rounded border border-[#d5dde1] bg-white p-5">
        <div className="font-condensed text-xs font-semibold uppercase text-[#3a6ea5]">
          100% Built on One Platform • Zero External AI API Keys
        </div>
        <h2 className="mt-1 text-xl font-bold text-[#0f2233]">
          How Consigliere Uses Cloudflare Workers + Agents SDK + Workers AI
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-[#d5dde1] bg-[#f9fbfb] p-4">
            <div className="flex items-center gap-2 font-semibold text-[#0f2233]">
              <Database className="h-4 w-4 text-[#3a6ea5]" />
              Per-Debtor Stateful Agents
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#3c4c57]">
              Each overdue B2B account runs in its own isolated{" "}
              <code className="rounded bg-[#ebf1f8] px-1 text-[#26496e]">DebtorAgent</code> Durable
              Object (<code className="text-[#26496e]">this.sql</code>) storing messages, vault PDFs,
              and audit trails with zero cross-tenant leakage.
            </p>
          </div>

          <div className="rounded border border-[#d5dde1] bg-[#f9fbfb] p-4">
            <div className="flex items-center gap-2 font-semibold text-[#0f2233]">
              <Cpu className="h-4 w-4 text-[#2f8a5b]" />
              3-Stage Workers AI Engine
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#3c4c57]">
              Calls <code className="rounded bg-[#e9f5ee] px-1 text-[#1d5e3c]">env.AI.run</code>{" "}
              (<code className="text-[#1d5e3c]">llama-3.3-70b-fp8-fast</code>) for JSON-schema
              intent classification + tone-calibrated drafting—while deterministic CFO guardrails
              compute every dollar figure so discounts never hallucinate.
            </p>
          </div>

          <div className="rounded border border-[#d5dde1] bg-[#f9fbfb] p-4">
            <div className="flex items-center gap-2 font-semibold text-[#0f2233]">
              <Clock className="h-4 w-4 text-[#c98a12]" />
              Proactive Alarms (<code className="text-xs">this.schedule</code>)
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#3c4c57]">
              When a debtor says <em>"Queued for Friday's AP run"</em>, the Agent persists a Durable
              Object timer via <code className="text-[#62420c]">this.schedule()</code>, wakes itself
              up automatically, verifies if ACH cleared, and nudges if unpaid.
            </p>
          </div>

          <div className="rounded border border-[#d5dde1] bg-[#f9fbfb] p-4">
            <div className="flex items-center gap-2 font-semibold text-[#0f2233]">
              <ShieldAlert className="h-4 w-4 text-[#a8392d]" />
              WebSocket Circuit Breaker
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#3c4c57]">
              Real-time <code className="text-[#8a2e25]">useAgent</code> WebSockets stream every
              step to the Command Center. Quality or legal disputes immediately trip the safety
              brake for 1-click CFO credit approval.
            </p>
          </div>
        </div>
      </div>

      {/* 2-Minute CaseHacks Pitch Script */}
      <div className="rounded border border-[#d5dde1] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-condensed text-xs font-semibold uppercase text-[#c98a12]">
              Hard 2:00 Cut-Off Ready
            </div>
            <h3 className="mt-0.5 text-lg font-bold text-[#0f2233]">
              Your 2-Minute Pitch Script & 6-Slide Run-of-Show
            </h3>
          </div>
          <Mic className="h-5 w-5 text-[#0f2233]" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border border-[#e8edef] p-3.5">
            <div className="font-condensed text-xs font-bold uppercase text-[#2f8a5b]">
              0:00 – 0:20 • Slide 1: The Hook & Problem
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#3c4c57]">
              "Don, you gave us $5,000 and 180 days to earn $200,000 in net profit. So we entered
              the Family business: <strong>collecting unpaid debts</strong>—100% legally, politely,
              and at a 96% software profit margin. US small businesses have $3.1 Trillion trapped in
              overdue B2B invoices. Chasing clients is awkward, and collection agencies take 30% and
              burn bridges."
            </p>
          </div>

          <div className="rounded border border-[#e8edef] p-3.5">
            <div className="font-condensed text-xs font-bold uppercase text-[#3a6ea5]">
              0:20 – 1:10 • Live Demo (Agent Arena Tab!)
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#3c4c57]">
              "Meet <strong>Consigliere</strong>, built 100% on Cloudflare Workers, Agents SDK, and
              Workers AI. Left is our CFO Command Center; right is the late customer's inbox. Watch
              what happens when Apex Mechanical demands a <strong>15% haircut</strong>—our Agent
              enforces our 4% CFO ceiling automatically. When they say <em>'Pay Friday'</em>,{" "}
              <code>this.schedule()</code> arms a live Durable Object wake-up alarm. When they claim{" "}
              <em>'cracked housings'</em>, the Circuit Breaker halts outreach. One click settles via
              direct ACH—we never custody funds, so zero banking licenses."
            </p>
          </div>

          <div className="rounded border border-[#e8edef] p-3.5">
            <div className="font-condensed text-xs font-bold uppercase text-[#c98a12]">
              1:10 – 1:40 • Slides 4 & 5: $5K Go-To-Market & $200K Profit Math
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#3c4c57]">
              "How do we turn $5,000 into $200K profit? We spend $1,490 in Month 1 cold-emailing
              wholesalers and subcontractors an offer nobody refuses: <em>'Give us your 10 oldest
              unpaid invoices free for 14 days—pay nothing unless cash hits your bank.'</em> We
              charge $499/mo + 8% of recovered 60+ day invoices—nearly 4x cheaper than collection
              agencies. Because ACH clears in 48 hours, Week 2 profits fund Months 2–6."
            </p>
          </div>

          <div className="rounded border border-[#e8edef] p-3.5">
            <div className="font-condensed text-xs font-bold uppercase text-[#0f2233]">
              1:40 – 2:00 • Slide 6: The Payoff
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#3c4c57]">
              "Switch to <strong>The Don's $200K Ledger</strong> tab: onboarding 52 active SMBs over
              180 days at $160 CAC and $5/mo Cloudflare infrastructure nets{" "}
              <strong>$225,000+ in pure profit after all costs</strong>. The Don gets his $200K, his
              $5K seed stays untouched, and we own a $60K/month cash cow."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
