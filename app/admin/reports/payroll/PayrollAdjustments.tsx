"use client";

// Manuelle Zeit-Korrekturen (Gleitzeit) pro Mitarbeiter/Monat.
// Liste + Erfassen-Form + Löschen. Nur sichtbar/aktiv mit
// `timeEntries.correct` (canEdit). Fliesst in den kumulierten Saldo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, SlidersHorizontal } from "lucide-react";
import { createTimeAdjustment, deleteTimeAdjustment } from "./actions";

export interface AdjustmentRow {
  id: string;
  date: string; // YYYY-MM-DD
  minutes: number; // signed
  reason: string;
}

interface Props {
  employeeId: string;
  /** Default-Datum für neue Korrekturen (Monatsmitte des gewählten Monats). */
  defaultDate: string;
  adjustments: AdjustmentRow[];
  totalMinutes: number;
  canEdit: boolean;
}

function fmtSignedHm(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${m.toString().padStart(2, "0")} h`;
}

export function PayrollAdjustments({
  employeeId,
  defaultDate,
  adjustments,
  totalMinutes,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [date, setDate] = useState(defaultDate);
  const [direction, setDirection] = useState<"ADD" | "SUBTRACT">("ADD");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const h = Number.parseFloat(hours.replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) {
      setError("Bitte gültige Stunden (> 0) eingeben.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Bitte einen Grund (mind. 3 Zeichen) angeben.");
      return;
    }
    start(async () => {
      const res = await createTimeAdjustment({
        employeeId,
        date,
        direction,
        hours: h,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHours("");
      setReason("");
      setShowForm(false);
      router.refresh();
    });
  };

  const remove = (id: string) => {
    if (!confirm("Diese Korrektur wirklich entfernen?")) return;
    setError(null);
    start(async () => {
      const res = await deleteTimeAdjustment({ id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Manuelle Korrekturen
        </CardTitle>
        {canEdit && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" /> Korrektur erfassen
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-habb-muted">
          Stunden, die zusätzlich zur erfassten Zeit gut- oder abgeschrieben
          werden (z. B. Überzeit-Auszahlung, manuelle Anpassung). Fliesst in den
          kumulierten Saldo ein.
        </p>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {canEdit && showForm && (
          <form
            onSubmit={submit}
            className="grid grid-cols-1 gap-3 rounded-md border border-habb-line bg-habb-paper/50 p-3 sm:grid-cols-[130px_130px_110px_1fr_auto]"
          >
            <div className="space-y-1">
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Richtung</Label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "ADD" | "SUBTRACT")}
                className="h-9 w-full rounded-md border border-habb-line bg-white px-2 text-sm"
              >
                <option value="ADD">Dazurechnen (+)</option>
                <option value="SUBTRACT">Abziehen (−)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stunden</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="z. B. 2.5"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grund</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Überzeit ausbezahlt"
                maxLength={500}
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "…" : "Speichern"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        )}

        {adjustments.length === 0 ? (
          <p className="text-sm text-habb-muted">Keine Korrekturen in diesem Monat.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-habb-line text-left text-xs uppercase tracking-wide text-habb-muted">
                <th className="pb-2">Datum</th>
                <th className="pb-2">Grund</th>
                <th className="pb-2 text-right">Korrektur</th>
                {canEdit && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-habb-line">
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 font-mono text-xs">{a.date}</td>
                  <td className="py-2 text-habb-ink">{a.reason}</td>
                  <td
                    className={`py-2 text-right tabular-nums font-medium ${
                      a.minutes < 0 ? "text-habb-red" : "text-habb-success"
                    }`}
                  >
                    {fmtSignedHm(a.minutes)}
                  </td>
                  {canEdit && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(a.id)}
                        disabled={pending}
                        className="text-habb-muted hover:text-habb-red disabled:opacity-50"
                        title="Korrektur entfernen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t-2 border-habb-line">
                <td className="py-2 font-medium" colSpan={2}>
                  Summe Korrekturen
                </td>
                <td
                  className={`py-2 text-right tabular-nums font-semibold ${
                    totalMinutes < 0 ? "text-habb-red" : "text-habb-success"
                  }`}
                >
                  {fmtSignedHm(totalMinutes)}
                </td>
                {canEdit && <td></td>}
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
