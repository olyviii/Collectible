import React, { useState } from "react";
import { FileText, Sparkles, X } from "lucide-react";
import type { InvoiceSummary } from "../../shared/seedInvoices";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: InvoiceSummary) => void;
}

const SAMPLE_PASTES = [
  {
    label: "Messy Forwarded Invoice Email",
    text: `Forwarded from billing:
Client: Northstar Commercial Roofing
Contact: Greg Halvorsen (ghalvorsen@northstarroof-demo.com)
Invoice INV-2026-5092 — $21,600.00 — 78 days overdue!
PO: PO-NR-4419
Items: 18 pallets TPO Membrane Rolls & Insulated Fastener Plates delivered to Bensenville yard.`
  },
  {
    label: "Raw Aging ERP CSV Row",
    text: `Beacon Precision Machining, Sandra Lin, slin@beaconcnc-demo.com, INV-2026-5144, $15,750, 66 days past due, PO-8820-BC, 5-Axis Coolant Filtration Units & Carbide Inserts`
  }
];

export function ExtractInvoiceModal({ open, onClose, onCreated }: Props) {
  const [rawText, setRawText] = useState(SAMPLE_PASTES[0].text);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText })
      });
      if (!res.ok) throw new Error(`Extraction failed (${res.status})`);
      const data = (await res.json()) as { summary: InvoiceSummary };
      onCreated(data.summary);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to extract invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2233]/60 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-xl rounded border border-[#b4c1c8] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#d5dde1] bg-[#0f2233] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#fbbf24]" />
            <span className="font-condensed text-sm font-semibold uppercase">
              Workers AI Unstructured Invoice Ingestion
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleExtract} className="p-5 space-y-4">
          <p className="text-sm text-[#3c4c57]">
            Paste any raw overdue invoice text, forwarded billing email, or ERP aging row.{" "}
            <strong className="text-[#0f2233]">Workers AI (`llama-3.3-70b-instruct-fp8-fast`)</strong>{" "}
            extracts structured JSON via schema mode and spawns a dedicated stateful{" "}
            <code className="rounded bg-[#ebf1f8] px-1.5 py-0.5 text-xs text-[#26496e]">DebtorAgent</code>{" "}
            Durable Object.
          </p>

          <div className="flex flex-wrap gap-2">
            {SAMPLE_PASTES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setRawText(s.text)}
                className="inline-flex items-center gap-1.5 rounded border border-[#b4c1c8] bg-[#f4f6f7] px-2.5 py-1 text-xs font-medium text-[#0f2233] hover:bg-[#ebf1f8]"
              >
                <FileText className="h-3.5 w-3.5 text-[#3a6ea5]" />
                Load Sample: {s.label}
              </button>
            ))}
          </div>

          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full rounded border border-[#b4c1c8] bg-[#f9fbfb] p-3 font-mono-num text-xs text-[#0f2233] focus:border-[#3a6ea5] focus:outline-none"
            placeholder="Paste invoice details, debtor company, amount, days overdue..."
          />

          {error && (
            <div className="rounded border border-[#a8392d] bg-[#fbeeec] px-3 py-2 text-xs text-[#8a2e25]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#b4c1c8] px-4 py-2 text-sm font-medium text-[#3c4c57] hover:bg-[#f4f6f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded bg-[#2f8a5b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5e3c] disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Extracting & Spawning Agent..." : "Extract & Spawn DebtorAgent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
