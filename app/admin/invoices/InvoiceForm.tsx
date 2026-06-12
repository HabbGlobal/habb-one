"use client";

// Form for manual invoice creation / editing.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice, updateDraftInvoice } from "./actions";

interface CustomerOption {
  id: string;
  label: string;
  customerNumber: string;
}

interface ItemDraft {
  cid: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCHF: number;
  discountPct: number;
}

export interface InvoiceFormInitial {
  invoiceId: string;
  core: {
    customerId: string;
    issuedAtIso: string;
    dueAtIso: string;
    vatRate: number;
    notes?: string;
  };
  items: ItemDraft[];
}

interface Props {
  mode: "create" | "edit";
  customers: CustomerOption[];
  defaults: { vatRate: number; paymentTerms: number };
  initial?: InvoiceFormInitial;
}

function makeEmptyItem(position: number): ItemDraft {
  return {
    cid: `c${Math.random().toString(36).slice(2, 9)}`,
    position,
    description: "",
    quantity: 1,
    unit: "Stk",
    unitPriceCHF: 0,
    discountPct: 0,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

export function InvoiceForm({ mode, customers, defaults, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initial?.core.customerId ?? "");
  const [issuedAt, setIssuedAt] = useState(initial?.core.issuedAtIso ?? todayIso());
  const [dueAt, setDueAt] = useState(
    initial?.core.dueAtIso ?? plusDaysIso(defaults.paymentTerms),
  );
  const [vatRate, setVatRate] = useState(initial?.core.vatRate ?? defaults.vatRate);
  const [notes, setNotes] = useState(initial?.core.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items?.length ? initial.items : [makeEmptyItem(10)],
  );

  const totals = useMemo(() => {
    const totalNet = items.reduce(
      (s, it) => s + it.quantity * it.unitPriceCHF * (1 - it.discountPct / 100),
      0,
    );
    const vatCHF = (totalNet * vatRate) / 100;
    const totalGross = totalNet + vatCHF;
    return {
      totalNet: Math.round(totalNet * 100) / 100,
      vatCHF: Math.round(vatCHF * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
    };
  }, [items, vatRate]);

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => {
    const nextPos = items.length === 0 ? 10 : Math.max(...items.map((i) => i.position)) + 10;
    setItems((prev) => [...prev, makeEmptyItem(nextPos)]);
  };
  const removeItem = (idx: number) => {
    if (items.length <= 1) {
      alert("At least one line item is required.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    setError(null);
    const payload = {
      core: {
        customerId,
        issuedAt: new Date(issuedAt),
        dueAt: new Date(dueAt),
        vatRate,
        notes: notes || undefined,
      },
      items: items.map((it) => ({
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPriceCHF: it.unitPriceCHF,
        discountPct: it.discountPct,
      })),
    };
    start(async () => {
      try {
        if (mode === "create") {
          const r = await createInvoice(payload);
          if (r?.error) throw new Error(r.error);
          router.push(`/admin/invoices/${r?.id}`);
        } else if (mode === "edit" && initial) {
          const r = await updateDraftInvoice(initial.invoiceId, payload);
          if (r?.error) throw new Error(r.error);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Header data */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1 md:col-span-4">
          <Label>Customer *</Label>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customerNumber} · {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Invoice date *</Label>
          <Input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Due date *</Label>
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>VAT rate (%)</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={30}
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Notes / remarks</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Payment within 30 days net"
        />
      </div>

      {/* Line items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Position
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => (
            <div
              key={it.cid}
              className="grid grid-cols-12 gap-2 items-end bg-muted/30 rounded p-2 border"
            >
              <div className="col-span-1">
                <Label className="text-xs">Pos.</Label>
                <Input
                  type="number"
                  value={it.position}
                  min={1}
                  onChange={(e) => updateItem(idx, { position: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
              <div className="col-span-5">
                <Label className="text-xs">Description *</Label>
                <Input
                  value={it.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  placeholder="e.g. Powder coating railing"
                  className="text-sm"
                />
              </div>
              <div className="col-span-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  step={0.01}
                  min={0.001}
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
              <div className="col-span-1">
                <Label className="text-xs">Unit</Label>
                <Input
                  value={it.unit}
                  onChange={(e) => updateItem(idx, { unit: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Unit price CHF</Label>
                <Input
                  type="number"
                  step={0.01}
                  min={0}
                  value={it.unitPriceCHF}
                  onChange={(e) =>
                    updateItem(idx, {
                      unitPriceCHF: Number(e.target.value.replace(",", ".")),
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="col-span-1">
                <Label className="text-xs">Discount %</Label>
                <Input
                  type="number"
                  step={0.5}
                  min={0}
                  max={100}
                  value={it.discountPct}
                  onChange={(e) => updateItem(idx, { discountPct: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 rounded hover:bg-destructive/10 text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="col-span-12 text-xs text-right text-muted-foreground tabular-nums">
                Line total:{" "}
                <span className="font-medium">
                  {fmtCHF(it.quantity * it.unitPriceCHF * (1 - it.discountPct / 100))}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total net</div>
              <div className="text-lg font-semibold tabular-nums">
                {fmtCHF(totals.totalNet)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">+ MwSt {vatRate}%</div>
              <div className="text-lg tabular-nums">{fmtCHF(totals.vatCHF)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total gross</div>
              <div className="text-xl font-semibold tabular-nums text-emerald-700">
                {fmtCHF(totals.totalGross)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !customerId}>
          {pending ? "Saving..." : mode === "create" ? "Create invoice" : "Save"}
        </Button>
      </div>
    </div>
  );
}
