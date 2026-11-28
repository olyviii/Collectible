import React, { useState } from "react";
import { X } from "lucide-react";
import type { InvoiceSummary } from "../../shared/seedInvoices";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: InvoiceSummary) => void;
}

type FormState = {
  debtorCompany: string;
  debtorContact: string;
  debtorEmail: string;
  invoiceNumber: string;
  poNumber: string;
  amount: string;
  daysOverdue: string;
  lineItemsSummary: string;
};

const EMPTY: FormState = {
  debtorCompany: "",
  debtorContact: "",
  debtorEmail: "",
  invoiceNumber: "",
  poNumber: "",
  amount: "",
  daysOverdue: "",
  lineItemsSummary: ""
};

const SAMPLE: FormState = {
  debtorCompany: "Northstar Commercial Roofing",
  debtorContact: "Greg Halvorsen",
  debtorEmail: "ghalvorsen@northstarroof-demo.com",
  invoiceNumber: "INV-2026-5092",
  poNumber: "PO-NR-4419",
  amount: "21600",
  daysOverdue: "78",
  lineItemsSummary: "18 pallets of TPO membrane rolls and insulated fastener plates"
};

function Field({
  label,
  hint,
  children,
  className = ""
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-neutral-800">
        {label}
        {hint && <span className="ml-1 font-normal text-neutral-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function ExtractInvoiceModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function close() {
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          daysOverdue: Number(form.daysOverdue)
        })
      });
      const data = (await res.json()) as { summary?: InvoiceSummary; error?: string };
      if (!res.ok || !data.summary) throw new Error(data.error || `Could not add invoice (${res.status})`);
      onCreated(data.summary);
      setForm(EMPTY);
      close();
    } catch (err: any) {
      setError(err?.message || "Could not add invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#111111] px-6 py-4 text-white">
          <div>
            <div className="font-display text-xl font-medium">Add an overdue invoice</div>
            <div className="mt-0.5 text-sm text-white/60">
              Collectible will email the customer and follow up for you.
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Customer</h3>
              <button
                type="button"
                onClick={() => setForm(SAMPLE)}
                className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
              >
                Fill with sample
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company name" className="sm:col-span-2">
                <input required value={form.debtorCompany} onChange={set("debtorCompany")} placeholder="Acme Builders Inc." className={inputCls} />
              </Field>
              <Field label="Contact name">
                <input required value={form.debtorContact} onChange={set("debtorContact")} placeholder="Jordan Lee" className={inputCls} />
              </Field>
              <Field label="Contact email">
                <input required type="email" value={form.debtorEmail} onChange={set("debtorEmail")} placeholder="ap@acmebuilders.com" className={inputCls} />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Invoice</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Invoice number">
                <input required value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="INV-2026-0001" className={`${inputCls} font-mono-num`} />
              </Field>
              <Field label="PO number" hint="(optional)">
                <input value={form.poNumber} onChange={set("poNumber")} placeholder="PO-1234" className={`${inputCls} font-mono-num`} />
              </Field>
              <Field label="Amount owed">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
                  <input required type="number" min="1" step="0.01" value={form.amount} onChange={set("amount")} placeholder="12,500.00" className={`${inputCls} pl-7 tabular-nums`} />
                </div>
              </Field>
              <Field label="Days overdue">
                <input required type="number" min="1" step="1" value={form.daysOverdue} onChange={set("daysOverdue")} placeholder="45" className={`${inputCls} tabular-nums`} />
              </Field>
              <Field label="What was delivered" hint="(optional)" className="sm:col-span-2">
                <textarea rows={2} value={form.lineItemsSummary} onChange={set("lineItemsSummary")} placeholder="e.g. 40 steel beams delivered to the Oak St. site" className={inputCls} />
              </Field>
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-5">
            <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {loading ? "Adding…" : "Add invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
