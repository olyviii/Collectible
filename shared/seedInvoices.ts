export type DebtorIntent =
  | "initial_outreach"
  | "paperwork_blocker"
  | "cashflow_crunch"
  | "hard_bargain"
  | "promise_to_pay"
  | "quality_dispute"
  | "hostile_or_legal"
  | "general_inquiry";

export type ToneProfile = "warm_relationship" | "executive_firm" | "final_pre_collections";

export interface Guardrails {
  maxDiscountPct: number; // e.g. 4 means max 4% early settlement discount
  maxInstallments: number; // e.g. 3 weekly payments
  autoAttachVaultDocs: boolean;
  tone: ToneProfile;
  demoTimerSeconds: number; // e.g. 12 seconds on stage so judges see `this.schedule` fire live!
}

export interface VaultDocument {
  id: string;
  filename: string;
  kind: "w9" | "pod" | "invoice_pdf" | "po";
  summary: string;
}

export interface SettlementOption {
  id: string;
  label: string;
  kind: "full" | "early_discount" | "installment_plan" | "dispute_adjusted";
  payNowAmount: number;
  totalSettledAmount: number;
  discountPct: number;
  installments: number;
  savingsAmount: number;
  badge: string;
}

export interface ThreadMessage {
  id: string;
  sender: "agent" | "debtor" | "system";
  authorName: string;
  body: string;
  createdAt: number;
  intentDetected?: DebtorIntent;
  attachments?: VaultDocument[];
  settlementOptions?: SettlementOption[];
  aiModelUsed?: string;
  latencyMs?: number;
}

export interface AuditTraceStep {
  id: string;
  createdAt: number;
  stage: "ingest" | "classify" | "guardrail_math" | "vault_tool" | "scheduler" | "circuit_breaker" | "settled";
  title: string;
  detail: string;
  badge?: string;
  severity: "info" | "success" | "warn" | "danger";
}

export interface InvoiceSummary {
  id: string; // doubles as DebtorAgent instance name
  invoiceNumber: string;
  debtorCompany: string;
  debtorContact: string;
  debtorRole: string;
  debtorEmail: string;
  industry: string;
  originalAmount: number;
  paidAmount: number;
  settledTotalAmount: number | null;
  daysOverdue: number;
  poNumber: string;
  lineItemsSummary: string;
  status: "active_negotiation" | "scheduled_followup" | "dispute_halted" | "settled";
  recoveryProbability: number;
  relationshipTier: "VIP Repeat Buyer" | "Standard Net-30" | "Chronic Late Payer";
  lastActivityAt: number;
  scheduledWakeupAt: number | null;
  scheduledReason: string | null;
}

export interface DebtorAgentState {
  initialized: boolean;
  thinking: boolean;
  invoice: InvoiceSummary;
  guardrails: Guardrails;
  vaultDocs: VaultDocument[];
  messages: ThreadMessage[];
  auditTrace: AuditTraceStep[];
  activeOffers: SettlementOption[];
  disputeSummary: {
    haltedAt: number;
    reason: string;
    claimedDefectAmount: number;
    recommendedCredit: number;
  } | null;
}

export interface PortfolioState {
  creditorName: string;
  creditorBankLabel: string;
  platformMonthlyFee: number;
  contingencyFeePct: number;
  invoices: InvoiceSummary[];
  totalOverduePool: number;
  totalRecoveredForClient: number;
  consigliereRevenueEarned: number;
  lastUpdatedAt: number;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxDiscountPct: 4,
  maxInstallments: 3,
  autoAttachVaultDocs: true,
  tone: "executive_firm",
  demoTimerSeconds: 12
};

export const SEED_INVOICES: Array<{
  summary: InvoiceSummary;
  vaultDocs: VaultDocument[];
  initialAgentEmail: string;
}> = [
  {
    summary: {
      id: "apex-mechanical",
      invoiceNumber: "INV-2026-4819",
      debtorCompany: "Apex Mechanical Contractors",
      debtorContact: "Dana Kowalski",
      debtorRole: "AP Controller",
      debtorEmail: "ap@apexmechanical-demo.com",
      industry: "Commercial Plumbing & HVAC",
      originalAmount: 18500,
      paidAmount: 0,
      settledTotalAmount: null,
      daysOverdue: 74,
      poNumber: "PO-99214-B",
      lineItemsSummary: "42x Press-Fit Copper Manifold Kits, 6x Commercial Backflow Preventers",
      status: "active_negotiation",
      recoveryProbability: 76,
      relationshipTier: "VIP Repeat Buyer",
      lastActivityAt: Date.now() - 1000 * 60 * 18,
      scheduledWakeupAt: null,
      scheduledReason: null
    },
    vaultDocs: [
      {
        id: "doc-inv-4819",
        filename: "INV-2026-4819_Itemized.pdf",
        kind: "invoice_pdf",
        summary: "Itemized Net-30 invoice ($18,500.00) referencing PO-99214-B"
      },
      {
        id: "doc-pod-4819",
        filename: "POD_Signed_Dock4_Kowalski.pdf",
        kind: "pod",
        summary: "Signed proof-of-delivery manifest (Dock 4, 48 cartons received intact)"
      },
      {
        id: "doc-w9",
        filename: "Vendor_2026_Signed_W9.pdf",
        kind: "w9",
        summary: "Signed IRS Form W-9 & ACH Remittance Verification"
      }
    ],
    initialAgentEmail:
      "Hi Dana — Reaching out regarding Invoice #INV-2026-4819 ($18,500.00, PO-99214-B) for the copper manifold kits & backflow preventers delivered 74 days ago. Since Apex is a valued repeat account, we want to close this cleanly before quarter-end audit. You can clear the balance via instant ACH below, or reply directly if AP needs any backup paperwork or a short payment schedule."
  },
  {
    summary: {
      id: "harborline-freight",
      invoiceNumber: "INV-2026-4602",
      debtorCompany: "Harborline Cold Logistics",
      debtorContact: "Marcus Vance",
      debtorRole: "VP Operations",
      debtorEmail: "mvance@harborline-demo.com",
      industry: "Refrigerated Freight & Warehousing",
      originalAmount: 24200,
      paidAmount: 0,
      settledTotalAmount: null,
      daysOverdue: 89,
      poNumber: "PO-77410-HL",
      lineItemsSummary: "Dock Door Thermal Seals & 14x Reefer Evaporator Fan Assemblies",
      status: "active_negotiation",
      recoveryProbability: 64,
      relationshipTier: "Standard Net-30",
      lastActivityAt: Date.now() - 1000 * 60 * 52,
      scheduledWakeupAt: null,
      scheduledReason: null
    },
    vaultDocs: [
      {
        id: "doc-inv-4602",
        filename: "INV-2026-4602_Harborline.pdf",
        kind: "invoice_pdf",
        summary: "Invoice #INV-2026-4602 ($24,200.00) — Net 30 terms"
      },
      {
        id: "doc-pod-4602",
        filename: "BOL_Signed_Newark_Terminal.pdf",
        kind: "pod",
        summary: "Signed Bill of Lading & installation sign-off at Newark Terminal"
      },
      {
        id: "doc-w9-hl",
        filename: "Vendor_2026_Signed_W9.pdf",
        kind: "w9",
        summary: "Signed IRS Form W-9 & ACH Remittance Verification"
      }
    ],
    initialAgentEmail:
      "Hi Marcus — Following up on Invoice #INV-2026-4602 ($24,200.00, PO-77410-HL), now 89 days past due. Before our finance system escalates 90+ day balances to third-party collections, I have authorization to offer a clean settlement schedule or fast-pay credit if we wrap this up this week. Let me know what works best for Harborline."
  },
  {
    summary: {
      id: "crestview-hospitality",
      invoiceNumber: "INV-2026-4711",
      debtorCompany: "Crestview Boutique Hotels",
      debtorContact: "Priya Nair",
      debtorRole: "Director of Finance",
      debtorEmail: "pnair@crestviewhotels-demo.com",
      industry: "Hospitality Group (4 Properties)",
      originalAmount: 14800,
      paidAmount: 0,
      settledTotalAmount: null,
      daysOverdue: 63,
      poNumber: "PO-CV-3308",
      lineItemsSummary: "Commercial Laundry Boiler Parts & Preventive Maintenance Contract",
      status: "active_negotiation",
      recoveryProbability: 82,
      relationshipTier: "VIP Repeat Buyer",
      lastActivityAt: Date.now() - 1000 * 60 * 95,
      scheduledWakeupAt: null,
      scheduledReason: null
    },
    vaultDocs: [
      {
        id: "doc-inv-4711",
        filename: "INV-2026-4711_Crestview.pdf",
        kind: "invoice_pdf",
        summary: "Invoice #INV-2026-4711 ($14,800.00) — Commercial boiler parts"
      },
      {
        id: "doc-pod-4711",
        filename: "Service_Ticket_Signed_ChiefEng.pdf",
        kind: "pod",
        summary: "Work order signed by Chief Engineer confirming boiler pressure test"
      },
      {
        id: "doc-w9-cv",
        filename: "Vendor_2026_Signed_W9.pdf",
        kind: "w9",
        summary: "Signed IRS Form W-9 & ACH Remittance Verification"
      }
    ],
    initialAgentEmail:
      "Hi Priya — Quick note on Invoice #INV-2026-4711 ($14,800.00, PO-CV-3308), currently 63 days past due. Let me know if you need the signed chief engineer service ticket or W-9 re-sent for your AP batch, or use the direct ACH link below."
  },
  {
    summary: {
      id: "ironclad-staffing",
      invoiceNumber: "INV-2026-4550",
      debtorCompany: "Ironclad Event Production",
      debtorContact: "Trevor Hale",
      debtorRole: "Managing Partner",
      debtorEmail: "thale@ironcladevents-demo.com",
      industry: "Live Staging & Rigging",
      originalAmount: 11900,
      paidAmount: 0,
      settledTotalAmount: null,
      daysOverdue: 96,
      poNumber: "PO-8812-IE",
      lineItemsSummary: "Modular Aluminum Truss Rigging & Power Distro Units",
      status: "active_negotiation",
      recoveryProbability: 54,
      relationshipTier: "Chronic Late Payer",
      lastActivityAt: Date.now() - 1000 * 60 * 140,
      scheduledWakeupAt: null,
      scheduledReason: null
    },
    vaultDocs: [
      {
        id: "doc-inv-4550",
        filename: "INV-2026-4550_Ironclad.pdf",
        kind: "invoice_pdf",
        summary: "Invoice #INV-2026-4550 ($11,900.00) — 96 days past due"
      },
      {
        id: "doc-pod-4550",
        filename: "Warehouse_Pickup_Signature_Hale.pdf",
        kind: "pod",
        summary: "Signed Will-Call Warehouse Release"
      }
    ],
    initialAgentEmail:
      "Trevor — Invoice #INV-2026-4550 ($11,900.00) is now 96 days past due. We prefer resolving this directly with you rather than handing the file to external collections (which adds statutory fees and credit reporting). We can still structure an immediate settlement or split ACH today—reply here or select an option below."
  }
];

export const EXCUSE_PRESETS: Array<{
  id: string;
  label: string;
  tag: string;
  message: string;
}> = [
  {
    id: "missing_docs",
    label: "Missing W-9 & Delivery Slip",
    tag: "Vault Auto-Attach",
    message:
      "Hey, our accounting system blocked this batch because we're missing your current signed W-9 and the signed dock delivery receipt for PO-99214-B. Send those over first."
  },
  {
    id: "cash_tight",
    label: "Cash Tight Until Next Month",
    tag: "Installments + Discount",
    message:
      "Honestly our GC delayed paying our draw this month so cash is super tight right now. We want to make good on this, we just can't wire the full lump sum this week."
  },
  {
    id: "hardball_15",
    label: "Demand 15% Haircut Today",
    tag: "Tests CFO Guardrail!",
    message:
      "Look, knock 15% off the invoice right now and I'll approve an ACH wire before 5 PM today. Take it or leave it."
  },
  {
    id: "pay_friday",
    label: "\"Check Goes Out Friday\"",
    tag: "Arms Durable Object Timer",
    message:
      "All set on our end — this invoice is queued in our Friday AP check run, so you'll see payment hit right after that."
  },
  {
    id: "damaged_dispute",
    label: "\"Items Arrived Cracked!\"",
    tag: "Trips Circuit Breaker",
    message:
      "Hold on — two of the backflow preventers arrived with cracked cast-iron housings (~$2,400 value). Our foreman flagged it and we aren't paying full price for damaged gear."
  }
];
