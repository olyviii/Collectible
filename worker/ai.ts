import type {
  DebtorIntent,
  Guardrails,
  InvoiceSummary,
  SettlementOption,
  ThreadMessage,
  VaultDocument
} from "../shared/seedInvoices";

export interface WorkersAIBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<any>;
}

const MODEL_FAST_REASONING = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface ClassificationResult {
  intent: DebtorIntent;
  confidence: number;
  sentiment: "cooperative" | "stressed" | "opportunistic" | "disputing" | "hostile";
  requestedDiscountPct: number | null;
  claimedDefectAmount: number | null;
  needsW9: boolean;
  needsPod: boolean;
  promisedPayLabel: string | null;
  reasoningSummary: string;
  modelBadge: string;
  latencyMs: number;
}

export interface NegotiationPlan {
  classification: ClassificationResult;
  attachedDocs: VaultDocument[];
  offers: SettlementOption[];
  haltForDispute: boolean;
  recommendedDisputeCredit: number;
  scheduleFollowupSeconds: number | null;
  scheduleReason: string | null;
  updatedRecoveryProbability: number;
  replyBody: string;
  guardrailDecisionLog: string;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildStandardOffers(balance: number, guardrails: Guardrails): SettlementOption[] {
  const offers: SettlementOption[] = [
    {
      id: "offer-full",
      label: "Pay Full Balance via Instant ACH",
      kind: "full",
      payNowAmount: roundCents(balance),
      totalSettledAmount: roundCents(balance),
      discountPct: 0,
      installments: 1,
      savingsAmount: 0,
      badge: "Standard Net Settlement"
    }
  ];

  if (guardrails.maxDiscountPct > 0) {
    const pct = guardrails.maxDiscountPct;
    const savings = roundCents(balance * (pct / 100));
    const discounted = roundCents(balance - savings);
    offers.push({
      id: `offer-disc-${pct}`,
      label: `48-Hour Fast-Close (${pct}% Credit)`,
      kind: "early_discount",
      payNowAmount: discounted,
      totalSettledAmount: discounted,
      discountPct: pct,
      installments: 1,
      savingsAmount: savings,
      badge: `Save ${fmtUsd(savings)} Today`
    });
  }

  if (guardrails.maxInstallments >= 2) {
    const k = guardrails.maxInstallments;
    const perInstallment = roundCents(balance / k);
    offers.push({
      id: `offer-split-${k}`,
      label: `${k}-Week Split ACH (${fmtUsd(perInstallment)}/wk)`,
      kind: "installment_plan",
      payNowAmount: perInstallment,
      totalSettledAmount: roundCents(balance),
      discountPct: 0,
      installments: k,
      savingsAmount: 0,
      badge: "0% Interest Schedule"
    });
  }

  return offers;
}

function heuristicClassify(message: string, balance: number): Omit<ClassificationResult, "modelBadge" | "latencyMs"> {
  const lower = message.toLowerCase();

  const pctMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
  const requestedDiscountPct = pctMatch ? parseFloat(pctMatch[1]) : null;

  const dollarMatch = message.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
  const mentionedDollars = dollarMatch ? parseFloat(dollarMatch[1]) : null;

  if (
    lower.includes("lawyer") ||
    lower.includes("attorney") ||
    lower.includes("sue") ||
    lower.includes("cease and desist")
  ) {
    return {
      intent: "hostile_or_legal",
      confidence: 0.96,
      sentiment: "hostile",
      requestedDiscountPct: null,
      claimedDefectAmount: balance,
      needsW9: false,
      needsPod: false,
      promisedPayLabel: null,
      reasoningSummary: "Legal threat / counsel mention detected. Immediate compliance escalation required."
    };
  }

  if (
    lower.includes("cracked") ||
    lower.includes("damaged") ||
    lower.includes("broken") ||
    lower.includes("defective") ||
    lower.includes("wrong spec") ||
    lower.includes("shortage")
  ) {
    return {
      intent: "quality_dispute",
      confidence: 0.95,
      sentiment: "disputing",
      requestedDiscountPct: null,
      claimedDefectAmount: mentionedDollars ?? roundCents(balance * 0.15),
      needsW9: false,
      needsPod: true,
      promisedPayLabel: null,
      reasoningSummary:
        "Debtor raised a physical/quality defect claim on delivered goods. Circuit breaker must halt automated collection."
    };
  }

  if (
    lower.includes("w-9") ||
    lower.includes("w9") ||
    lower.includes("delivery slip") ||
    lower.includes("delivery receipt") ||
    lower.includes("pod") ||
    lower.includes("bol") ||
    lower.includes("proof of delivery") ||
    lower.includes("paperwork")
  ) {
    return {
      intent: "paperwork_blocker",
      confidence: 0.94,
      sentiment: "cooperative",
      requestedDiscountPct: null,
      claimedDefectAmount: null,
      needsW9: lower.includes("w-9") || lower.includes("w9") || lower.includes("tax"),
      needsPod:
        lower.includes("delivery") ||
        lower.includes("pod") ||
        lower.includes("receipt") ||
        lower.includes("slip") ||
        lower.includes("bol"),
      promisedPayLabel: null,
      reasoningSummary: "Administrative AP blocker: debtor needs compliance/delivery documentation to release batch."
    };
  }

  if (
    requestedDiscountPct !== null ||
    lower.includes("knock") ||
    lower.includes("haircut") ||
    lower.includes("discount") ||
    lower.includes("take it or leave it")
  ) {
    return {
      intent: "hard_bargain",
      confidence: 0.93,
      sentiment: "opportunistic",
      requestedDiscountPct: requestedDiscountPct ?? 12,
      claimedDefectAmount: null,
      needsW9: false,
      needsPod: false,
      promisedPayLabel: "Today before 5 PM",
      reasoningSummary: `Debtor attempting opportunistic discount negotiation (${requestedDiscountPct ?? 12}% requested) in exchange for immediate settlement.`
    };
  }

  if (
    lower.includes("friday") ||
    lower.includes("thursday") ||
    lower.includes("next week") ||
    lower.includes("check run") ||
    lower.includes("ap run") ||
    lower.includes("queued")
  ) {
    return {
      intent: "promise_to_pay",
      confidence: 0.92,
      sentiment: "cooperative",
      requestedDiscountPct: null,
      claimedDefectAmount: null,
      needsW9: false,
      needsPod: false,
      promisedPayLabel: "Friday AP Check Run",
      reasoningSummary: "Debtor made an explicit promise-to-pay commitment; requires proactive verification alarm."
    };
  }

  if (
    lower.includes("tight") ||
    lower.includes("cash") ||
    lower.includes("delayed") ||
    lower.includes("draw") ||
    lower.includes("installment") ||
    lower.includes("split") ||
    lower.includes("next month")
  ) {
    return {
      intent: "cashflow_crunch",
      confidence: 0.91,
      sentiment: "stressed",
      requestedDiscountPct: null,
      claimedDefectAmount: null,
      needsW9: false,
      needsPod: false,
      promisedPayLabel: null,
      reasoningSummary: "Temporary liquidity constraint with willingness to pay; ideal candidate for structured split ACH."
    };
  }

  return {
    intent: "general_inquiry",
    confidence: 0.82,
    sentiment: "cooperative",
    requestedDiscountPct: null,
    claimedDefectAmount: null,
    needsW9: false,
    needsPod: false,
    promisedPayLabel: null,
    reasoningSummary: "General debtor inquiry regarding balance options and settlement terms."
  };
}

async function classifyWithWorkersAI(
  ai: WorkersAIBinding | undefined,
  invoice: InvoiceSummary,
  message: string
): Promise<ClassificationResult> {
  const balance = roundCents(invoice.originalAmount - invoice.paidAmount);
  const t0 = Date.now();

  if (ai) {
    try {
      const res = await ai.run(MODEL_FAST_REASONING, {
        messages: [
          {
            role: "system",
            content: `You are an Accounts Receivable Risk & Intent Classifier for B2B overdue invoices.
Analyze the debtor's reply for Invoice ${invoice.invoiceNumber} ($${balance} balance, ${invoice.daysOverdue} days overdue).
Return ONLY valid JSON matching the schema.
Intent rules:
- "quality_dispute": damaged goods, cracked/broken items, wrong specs, missing items.
- "hostile_or_legal": lawyer, legal threat, hostile refusal.
- "paperwork_blocker": requesting W-9, POD, delivery slip, BOL, or invoice copy.
- "hard_bargain": demanding a percentage discount / haircut to pay now.
- "promise_to_pay": stating payment is scheduled in an upcoming AP/check run (e.g. Friday).
- "cashflow_crunch": saying cash is tight, waiting on client draw, cannot pay lump sum right now.
- "general_inquiry": any other question.`
          },
          { role: "user", content: message }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "debtor_classification",
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: [
                  "paperwork_blocker",
                  "cashflow_crunch",
                  "hard_bargain",
                  "promise_to_pay",
                  "quality_dispute",
                  "hostile_or_legal",
                  "general_inquiry"
                ]
              },
              confidence: { type: "number" },
              sentiment: {
                type: "string",
                enum: ["cooperative", "stressed", "opportunistic", "disputing", "hostile"]
              },
              requestedDiscountPct: { type: ["number", "null"] },
              claimedDefectAmount: { type: ["number", "null"] },
              needsW9: { type: "boolean" },
              needsPod: { type: "boolean" },
              promisedPayLabel: { type: ["string", "null"] },
              reasoningSummary: { type: "string" }
            },
            required: [
              "intent",
              "confidence",
              "sentiment",
              "needsW9",
              "needsPod",
              "reasoningSummary"
            ]
          }
        }
      });

      const parsed =
        typeof res?.response === "string"
          ? JSON.parse(res.response)
          : res?.response && typeof res.response === "object"
            ? res.response
            : null;

      if (parsed && parsed.intent) {
        return {
          intent: parsed.intent,
          confidence: Number(parsed.confidence ?? 0.92),
          sentiment: parsed.sentiment ?? "cooperative",
          requestedDiscountPct:
            parsed.requestedDiscountPct !== undefined ? parsed.requestedDiscountPct : null,
          claimedDefectAmount:
            parsed.claimedDefectAmount !== undefined ? parsed.claimedDefectAmount : null,
          needsW9: Boolean(parsed.needsW9),
          needsPod: Boolean(parsed.needsPod),
          promisedPayLabel: parsed.promisedPayLabel ?? null,
          reasoningSummary: String(parsed.reasoningSummary || "Classified debtor message via Workers AI."),
          modelBadge: "Workers AI • llama-3.3-70b-fp8",
          latencyMs: Date.now() - t0
        };
      }
    } catch {
      // Graceful fallback when running offline local dev without remote Cloudflare GPU session
    }
  }

  const fallback = heuristicClassify(message, balance);
  return {
    ...fallback,
    modelBadge: "Edge Guardrail Classifier (Local Mode)",
    latencyMs: Math.max(18, Date.now() - t0)
  };
}

export async function analyzeAndNegotiateWithAI(
  ai: WorkersAIBinding | undefined,
  invoice: InvoiceSummary,
  guardrails: Guardrails,
  vaultDocs: VaultDocument[],
  history: ThreadMessage[],
  debtorMessage: string
): Promise<NegotiationPlan> {
  const balance = roundCents(invoice.originalAmount - invoice.paidAmount);
  const classification = await classifyWithWorkersAI(ai, invoice, debtorMessage);

  // Stage 2: Deterministic CFO Policy & Guardrail Engine (Zero LLM Math Hallucinations!)
  let attachedDocs: VaultDocument[] = [];
  let offers: SettlementOption[] = buildStandardOffers(balance, guardrails);
  let haltForDispute = false;
  let recommendedDisputeCredit = 0;
  let scheduleFollowupSeconds: number | null = null;
  let scheduleReason: string | null = null;
  let updatedRecoveryProbability = invoice.recoveryProbability;
  let guardrailDecisionLog = "";

  if (classification.intent === "quality_dispute" || classification.intent === "hostile_or_legal") {
    haltForDispute = true;
    const claimed = classification.claimedDefectAmount ?? roundCents(balance * 0.12);
    recommendedDisputeCredit = roundCents(Math.min(claimed, balance * 0.25));
    offers = [];
    updatedRecoveryProbability = Math.max(35, invoice.recoveryProbability - 20);
    guardrailDecisionLog = `SAFETY CIRCUIT BREAKER TRIPPED (${classification.intent}). Automated outreach frozen to protect customer relationship. Flagged claimed issue (~${fmtUsd(claimed)}) for 1-click CFO credit review.`;
  } else if (classification.intent === "paperwork_blocker") {
    if (guardrails.autoAttachVaultDocs) {
      attachedDocs = vaultDocs.filter((d) => {
        if (classification.needsW9 && d.kind === "w9") return true;
        if (classification.needsPod && d.kind === "pod") return true;
        if (!classification.needsW9 && !classification.needsPod) return true;
        return d.kind === "invoice_pdf";
      });
      if (attachedDocs.length === 0) attachedDocs = vaultDocs;
    }
    scheduleFollowupSeconds = guardrails.demoTimerSeconds;
    scheduleReason = "Verify AP batch queued after vault docs delivered";
    updatedRecoveryProbability = Math.min(96, invoice.recoveryProbability + 16);
    guardrailDecisionLog = `Auto-retrieved ${attachedDocs.map((d) => d.filename).join(", ")} from Vault. Armed ${guardrails.demoTimerSeconds}s Durable Object verification timer.`;
  } else if (classification.intent === "hard_bargain") {
    const asked = classification.requestedDiscountPct ?? 15;
    const allowed = guardrails.maxDiscountPct;
    const effectivePct = Math.min(asked, allowed);
    const savings = roundCents(balance * (effectivePct / 100));
    const settled = roundCents(balance - savings);

    offers = [
      {
        id: `offer-counter-${effectivePct}`,
        label:
          effectivePct > 0
            ? `Authorized Max Fast-Close (${effectivePct}% Off — ${fmtUsd(settled)})`
            : `Full Balance Instant ACH (${fmtUsd(balance)})`,
        kind: effectivePct > 0 ? "early_discount" : "full",
        payNowAmount: settled,
        totalSettledAmount: settled,
        discountPct: effectivePct,
        installments: 1,
        savingsAmount: savings,
        badge:
          asked > allowed
            ? `Held Firm at ${allowed}% CFO Ceiling`
            : `Approved ${effectivePct}% Fast-Close`
      }
    ];

    if (guardrails.maxInstallments >= 2) {
      const k = guardrails.maxInstallments;
      const per = roundCents(balance / k);
      offers.push({
        id: `offer-split-${k}`,
        label: `Alternative: ${k}x Weekly Split (${fmtUsd(per)}/wk, 0% Fee)`,
        kind: "installment_plan",
        payNowAmount: per,
        totalSettledAmount: balance,
        discountPct: 0,
        installments: k,
        savingsAmount: 0,
        badge: "Preserves Full Principal"
      });
    }

    updatedRecoveryProbability = Math.min(94, invoice.recoveryProbability + 12);
    guardrailDecisionLog =
      asked > allowed
        ? `Debtor demanded ${asked}% haircut (${fmtUsd(roundCents(balance * (asked / 100)))} loss). Guardrail blocked excess discount and countered at strict ${allowed}% ceiling (${fmtUsd(settled)} net, saving client ${fmtUsd(roundCents(balance * ((asked - allowed) / 100)))} vs debtor demand).`
        : `Debtor requested ${asked}%, within ${allowed}% CFO ceiling. Approved instant settlement link for ${fmtUsd(settled)}.`;
  } else if (classification.intent === "cashflow_crunch") {
    const k = Math.max(2, guardrails.maxInstallments);
    const per = roundCents(balance / k);
    offers = [
      {
        id: `offer-split-${k}`,
        label: `Lock ${k}-Part Weekly Plan (${fmtUsd(per)} Today)`,
        kind: "installment_plan",
        payNowAmount: per,
        totalSettledAmount: balance,
        discountPct: 0,
        installments: k,
        savingsAmount: 0,
        badge: "Recommended Cash-Flow Plan"
      }
    ];
    if (guardrails.maxDiscountPct > 0) {
      const pct = guardrails.maxDiscountPct;
      const sav = roundCents(balance * (pct / 100));
      offers.push({
        id: `offer-disc-${pct}`,
        label: `Or Clear in Full w/ ${pct}% Credit (${fmtUsd(roundCents(balance - sav))})`,
        kind: "early_discount",
        payNowAmount: roundCents(balance - sav),
        totalSettledAmount: roundCents(balance - sav),
        discountPct: pct,
        installments: 1,
        savingsAmount: sav,
        badge: `Save ${fmtUsd(sav)}`
      });
    }
    scheduleFollowupSeconds = guardrails.demoTimerSeconds;
    scheduleReason = "Check installment #1 activation";
    updatedRecoveryProbability = Math.min(91, invoice.recoveryProbability + 14);
    guardrailDecisionLog = `Structured ${k}-installment plan (${fmtUsd(per)}/wk) within ${guardrails.maxInstallments}-week CFO limit to overcome temporary cash crunch while protecting 100% of principal.`;
  } else if (classification.intent === "promise_to_pay") {
    scheduleFollowupSeconds = guardrails.demoTimerSeconds;
    scheduleReason = `Verify promised payment (${classification.promisedPayLabel ?? "Upcoming AP Run"})`;
    updatedRecoveryProbability = Math.min(93, invoice.recoveryProbability + 15);
    guardrailDecisionLog = `Logged promise-to-pay commitment. Scheduled autonomous Durable Object wake-up (${guardrails.demoTimerSeconds}s live demo timer) to verify settlement and auto-nudge if unpaid.`;
  } else {
    guardrailDecisionLog = `Presented standard guardrailed settlement options (max ${guardrails.maxDiscountPct}% fast-pay credit / ${guardrails.maxInstallments}x split).`;
  }

  // Stage 3: Draft Tone-Calibrated Response via Cloudflare Workers AI
  let replyBody = "";
  if (haltForDispute) {
    replyBody = `Hi ${invoice.debtorContact.split(" ")[0]} — Thank you for flagging the condition issue on ${invoice.invoiceNumber}. I have immediately paused automated reminders on your account and routed your note regarding the damaged units directly to our Finance Controller along with ${invoice.poNumber} so they can review a credit adjustment personally today.`;
  } else {
    const toneInstruction =
      guardrails.tone === "warm_relationship"
        ? "Warm, collaborative, relationship-first B2B finance partner."
        : guardrails.tone === "final_pre_collections"
          ? "Crisp, urgent, professional pre-collections notice (100% legal and polite, emphasizing avoiding external agency escalation)."
          : "Concise, executive, confident B2B controller.";

    const offerSummaryText = offers
      .map((o) => `- ${o.label}: Pay now ${fmtUsd(o.payNowAmount)} (Total settled: ${fmtUsd(o.totalSettledAmount)})`)
      .join("\n");

    const docsText =
      attachedDocs.length > 0
        ? `Attached files included in this reply: ${attachedDocs.map((d) => d.filename).join(", ")}.`
        : "No file attachments needed.";

    if (ai) {
      try {
        const res = await ai.run(MODEL_FAST_REASONING, {
          messages: [
            {
              role: "system",
              content: `You are an autonomous B2B Accounts Receivable specialist negotiating Invoice ${invoice.invoiceNumber} (${fmtUsd(balance)} balance, ${invoice.daysOverdue} days past due) with ${invoice.debtorContact} at ${invoice.debtorCompany}.
Tone: ${toneInstruction}
Strict Rules:
1. Keep the email reply concise (2 to 4 sentences max, plain text, no subject line, no markdown bullets).
2. NEVER invent numbers outside these exact authorized offers:
${offerSummaryText}
3. ${docsText}
4. Policy decision to enforce: ${guardrailDecisionLog}
5. Invite them to click the authorized settlement option directly below.`
            },
            ...history.slice(-3).map((m) => ({
              role: (m.sender === "debtor" ? "user" : "assistant") as "user" | "assistant",
              content: m.body
            })),
            { role: "user", content: debtorMessage }
          ]
        });

        const draft = typeof res?.response === "string" ? res.response.trim() : "";
        if (draft.length > 20) {
          replyBody = draft;
        }
      } catch {
        // Fallback below
      }
    }

    if (!replyBody) {
      const firstName = invoice.debtorContact.split(" ")[0];
      if (classification.intent === "paperwork_blocker") {
        replyBody = `Hi ${firstName} — Attached are ${attachedDocs.map((d) => d.filename).join(" and ")} for ${invoice.poNumber} so your AP team has everything needed to clear ${invoice.invoiceNumber} (${fmtUsd(balance)}). You can release the ACH right below, or grab the ${guardrails.maxDiscountPct}% 48-hour fast-close credit if queued today.`;
      } else if (classification.intent === "hard_bargain") {
        const topOffer = offers[0];
        replyBody =
          guardrails.maxDiscountPct > 0
            ? `Hi ${firstName} — I appreciate the offer to wire today, though our finance guardrails cap early-settlement credits at ${guardrails.maxDiscountPct}% rather than ${classification.requestedDiscountPct ?? 15}%. I've unlocked our maximum authorized fast-close at ${fmtUsd(topOffer.totalSettledAmount)} (saving you ${fmtUsd(topOffer.savingsAmount)}) if completed below today, or we can split the full ${fmtUsd(balance)} across ${guardrails.maxInstallments} weekly payments.`
            : `Hi ${firstName} — Our controller policy holds principal firm at ${fmtUsd(balance)} without percentage haircuts, though I can split the balance across ${guardrails.maxInstallments} interest-free weekly ACH installments right below if that makes today's approval easier.`;
      } else if (classification.intent === "cashflow_crunch") {
        const splitOffer = offers[0];
        replyBody = `Hi ${firstName} — Completely understand waiting on an upstream draw. To keep ${invoice.debtorCompany} in good standing without straining this week's cash flow, I've authorized a ${splitOffer.installments}-week split plan starting at ${fmtUsd(splitOffer.payNowAmount)} today (0% interest), or a ${guardrails.maxDiscountPct}% credit if cleared in one shot. Select whichever works best below.`;
      } else if (classification.intent === "promise_to_pay") {
        replyBody = `Thanks ${firstName} — I've noted ${invoice.invoiceNumber} (${fmtUsd(balance)}) as scheduled for ${classification.promisedPayLabel ?? "your upcoming AP run"} and set an automatic verification check so you won't get unnecessary nudges beforehand. For convenience, the direct ACH remittance link is right below.`;
      } else {
        replyBody = `Hi ${firstName} — Happy to help wrap up ${invoice.invoiceNumber} (${fmtUsd(balance)}). I've included our authorized settlement options right below, including instant ACH${guardrails.maxDiscountPct > 0 ? `, a ${guardrails.maxDiscountPct}% fast-close credit,` : ""} and a ${guardrails.maxInstallments}-part weekly schedule.`;
      }
    }
  }

  return {
    classification,
    attachedDocs,
    offers,
    haltForDispute,
    recommendedDisputeCredit,
    scheduleFollowupSeconds,
    scheduleReason,
    updatedRecoveryProbability,
    replyBody,
    guardrailDecisionLog
  };
}

export async function draftScheduledFollowupWithAI(
  ai: WorkersAIBinding | undefined,
  invoice: InvoiceSummary,
  reason: string
): Promise<{ body: string; modelBadge: string }> {
  const balance = roundCents(invoice.originalAmount - invoice.paidAmount);
  const firstName = invoice.debtorContact.split(" ")[0];

  if (ai) {
    try {
      const res = await ai.run(MODEL_FAST_REASONING, {
        messages: [
          {
            role: "system",
            content:
              "Write a polite, crisp 2-sentence B2B Accounts Receivable follow-up triggered automatically when a scheduled promise-to-pay verification timer fired and the invoice is still unpaid. Plain text only, no subject line."
          },
          {
            role: "user",
            content: `Contact: ${firstName} at ${invoice.debtorCompany}. Invoice: ${invoice.invoiceNumber}, Remaining Balance: ${fmtUsd(balance)}. Trigger reason: ${reason}. Invite them to complete the settlement option below or confirm remittance trace #.`
          }
        ]
      });
      const text = typeof res?.response === "string" ? res.response.trim() : "";
      if (text.length > 20) {
        return { body: text, modelBadge: "Workers AI • Scheduled Wake-Up" };
      }
    } catch {
      // Fallback below
    }
  }

  return {
    body: `Hi ${firstName} — Quick automated check-in on ${invoice.invoiceNumber} (${fmtUsd(balance)}) following "${reason}". We haven't seen the ACH settlement post yet—please click below to complete remittance or reply with your bank trace number so we can mark your account clear.`,
    modelBadge: "Proactive Durable Object Alarm"
  };
}

export async function extractInvoiceFromRawText(
  ai: WorkersAIBinding | undefined,
  rawText: string
): Promise<{ summary: InvoiceSummary; vaultDocs: VaultDocument[]; initialAgentEmail: string; modelBadge: string }> {
  let company = "Summit Industrial Supply";
  let contact = " Rachel Cho";
  let email = "ap@summitindustrial-demo.com";
  let invoiceNumber = `INV-2026-${Math.floor(5100 + Math.random() * 800)}`;
  let amount = 16400;
  let daysOverdue = 68;
  let poNumber = "PO-55201-SI";
  let industry = "Industrial Supply & Fabrication";
  let lineItems = "Custom CNC Machined Flanges & Hydraulic Hose Assemblies";
  let modelBadge = "Edge Parser (Local Mode)";

  if (ai) {
    try {
      const res = await ai.run(MODEL_FAST_REASONING, {
        messages: [
          {
            role: "system",
            content:
              "Extract structured overdue B2B invoice details from messy user text, pasted email, or CSV row. Fill sensible B2B defaults for any missing fields."
          },
          { role: "user", content: rawText }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "extracted_invoice",
            type: "object",
            properties: {
              debtorCompany: { type: "string" },
              debtorContact: { type: "string" },
              debtorEmail: { type: "string" },
              invoiceNumber: { type: "string" },
              amount: { type: "number" },
              daysOverdue: { type: "number" },
              poNumber: { type: "string" },
              industry: { type: "string" },
              lineItemsSummary: { type: "string" }
            },
            required: ["debtorCompany", "debtorContact", "invoiceNumber", "amount", "daysOverdue", "lineItemsSummary"]
          }
        }
      });

      const parsed =
        typeof res?.response === "string"
          ? JSON.parse(res.response)
          : res?.response && typeof res.response === "object"
            ? res.response
            : null;

      if (parsed && parsed.debtorCompany) {
        company = parsed.debtorCompany;
        contact = parsed.debtorContact || "Jordan Patel";
        email = parsed.debtorEmail || "ap@extracted-client-demo.com";
        invoiceNumber = parsed.invoiceNumber || invoiceNumber;
        amount = Math.max(500, Number(parsed.amount) || 16400);
        daysOverdue = Math.max(15, Number(parsed.daysOverdue) || 65);
        poNumber = parsed.poNumber || poNumber;
        industry = parsed.industry || industry;
        lineItems = parsed.lineItemsSummary || lineItems;
        modelBadge = "Workers AI • llama-3.3-70b Extraction";
      }
    } catch {
      // Heuristic extraction below
    }
  }

  if (modelBadge.includes("Local")) {
    const dollar = rawText.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
    if (dollar) amount = parseFloat(dollar[1]);
    const days = rawText.match(/(\d+)\s*days/i);
    if (days) daysOverdue = parseInt(days[1], 10);
    const inv = rawText.match(/(INV[-\w]+)/i);
    if (inv) invoiceNumber = inv[1].toUpperCase();
    const firstLine = rawText.split(/\n|,/)[0]?.trim();
    if (firstLine && firstLine.length > 3 && firstLine.length < 45) {
      company = firstLine.replace(/^(company|client|debtor)\s*:\s*/i, "");
    }
  }

  return buildInvoiceRecord(
    {
      debtorCompany: company,
      debtorContact: contact,
      debtorEmail: email,
      invoiceNumber,
      amount,
      daysOverdue,
      poNumber,
      industry,
      lineItemsSummary: lineItems
    },
    modelBadge
  );
}

export interface InvoiceFields {
  debtorCompany: string;
  debtorContact: string;
  debtorEmail: string;
  invoiceNumber: string;
  amount: number;
  daysOverdue: number;
  poNumber: string;
  industry?: string;
  lineItemsSummary: string;
}

/** Turns invoice fields into a full DebtorAgent seed record (summary, vault docs, first email). */
export function buildInvoiceRecord(
  fields: InvoiceFields,
  modelBadge: string
): { summary: InvoiceSummary; vaultDocs: VaultDocument[]; initialAgentEmail: string; modelBadge: string } {
  const company = fields.debtorCompany.trim();
  const contact = fields.debtorContact;
  const email = fields.debtorEmail.trim();
  const invoiceNumber = fields.invoiceNumber.trim();
  const amount = fields.amount;
  const daysOverdue = fields.daysOverdue;
  const poNumber = fields.poNumber.trim() || "N/A";
  const industry = fields.industry?.trim() || "General B2B";
  const lineItems = fields.lineItemsSummary.trim() || "goods and services delivered";

  const slug =
    company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.floor(100 + Math.random() * 900);

  const cleanContact = contact.trim();
  const prob = Math.max(48, Math.min(88, Math.round(92 - daysOverdue * 0.28)));

  const summary: InvoiceSummary = {
    id: slug,
    invoiceNumber,
    debtorCompany: company,
    debtorContact: cleanContact,
    debtorRole: "Accounts Payable",
    debtorEmail: email,
    industry,
    originalAmount: roundCents(amount),
    paidAmount: 0,
    settledTotalAmount: null,
    daysOverdue,
    poNumber,
    lineItemsSummary: lineItems,
    status: "active_negotiation",
    recoveryProbability: prob,
    relationshipTier: "Standard Net-30",
    lastActivityAt: Date.now(),
    scheduledWakeupAt: null,
    scheduledReason: null
  };

  const vaultDocs: VaultDocument[] = [
    {
      id: `doc-inv-${slug}`,
      filename: `${invoiceNumber}_Itemized.pdf`,
      kind: "invoice_pdf",
      summary: `Extracted Invoice ${invoiceNumber} (${fmtUsd(amount)})`
    },
    {
      id: `doc-pod-${slug}`,
      filename: `Signed_POD_${poNumber}.pdf`,
      kind: "pod",
      summary: `Verified Delivery Receipt for ${poNumber}`
    },
    {
      id: `doc-w9-${slug}`,
      filename: "Vendor_2026_Signed_W9.pdf",
      kind: "w9",
      summary: "Signed IRS Form W-9 & ACH Remittance Sheet"
    }
  ];

  const initialAgentEmail = `Hi ${cleanContact.split(" ")[0]} — Reaching out regarding overdue Invoice #${invoiceNumber} (${fmtUsd(amount)}, ${poNumber}) for ${lineItems}, currently ${daysOverdue} days past due. To help close this out cleanly without collections escalation, I've attached instant ACH settlement and flexible split options below.`;

  return { summary, vaultDocs, initialAgentEmail, modelBadge };
}
