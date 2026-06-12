"use client";

// Plan many days for one employee at once. The user picks a date range and
// optional weekday filter; the dialog computes the final list of dates and
// applies the same shift to all of them in a single server round-trip.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bulkUpsertScheduleEntries } from "./actions";

type EntryType =
  | "WORK"
  | "FREE"
  | "VACATION"
  | "SICKNESS"
  | "ABSENCE"
  | "COMPENSATION"
  | "OTHER";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Props {
  year: number;
  month: number;
  monthId: string | null;
  employeeId: string;
  employeeName: string;
  defaultFrom: string; // YYYY-MM-DD
  defaultTo: string;
  areas?: { id: string; name: string; colorHex: string }[];
  onClose: () => void;
}

export function BulkRangeEditor({
  year,
  month,
  monthId,
  employeeId,
  employeeName,
  defaultFrom,
  defaultTo,
  areas = [],
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  // Default: Mon..Fri checked, Sat/Sun unchecked.
  const [weekdays, setWeekdays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [type, setType] = useState<EntryType>("WORK");
  const [plannedStart, setPlannedStart] = useState("07:30");
  const [plannedEnd, setPlannedEnd] = useState("16:30");
  const [breakMin, setBreakMin] = useState(30);
  const [workAreaId, setWorkAreaId] = useState<string>("");
  const [note, setNote] = useState("");
  const [overwrite, setOverwrite] = useState(true);

  // Compute the actual list of YYYY-MM-DD dates that will be written.
  const dates = useMemo(() => {
    if (!from || !to || from > to) return [] as string[];
    const result: string[] = [];
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));
    const cursor = new Date(start);
    while (cursor <= end) {
      // Only keep dates within this month
      if (cursor.getUTCFullYear() === year && cursor.getUTCMonth() + 1 === month) {
        const wd = (cursor.getUTCDay() + 6) % 7;
        if (weekdays[wd]) {
          result.push(cursor.toISOString().slice(0, 10));
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }, [from, to, year, month, weekdays]);

  const submit = () => {
    setError(null);
    if (dates.length === 0) {
      setError("Keine Tage ausgewählt.");
      return;
    }
    start(async () => {
      try {
        const res = await bulkUpsertScheduleEntries({
          monthId,
          year,
          month,
          employeeId,
          dates,
          type,
          plannedStart: type === "WORK" ? plannedStart : null,
          plannedEnd: type === "WORK" ? plannedEnd : null,
          plannedBreakMinutes: type === "WORK" ? breakMin : null,
          workAreaId: type === "WORK" && workAreaId ? workAreaId : null,
          note: note || null,
          overwrite,
        });
        const skippedNote =
          res.skipped > 0
            ? ` (${res.skipped} bereits vorhanden, übersprungen)`
            : "";
        alert(`${res.written} Tage geplant${skippedNote}.`);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler");
      }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden
        onClick={onClose}
      />
      <Card className="fixed inset-x-4 top-8 z-50 mx-auto max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Bereich planen</CardTitle>
            <p className="text-sm text-muted-foreground">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-accent rounded"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Von">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Bis">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>

          <div>
            <Label>Wochentage</Label>
            <div className="mt-1 flex gap-1">
              {WEEKDAY_LABELS.map((wd, i) => (
                <button
                  key={wd}
                  type="button"
                  onClick={() => {
                    setWeekdays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
                  }}
                  className={`flex-1 h-9 rounded text-xs font-medium border transition ${
                    weekdays[i]
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  {wd}
                </button>
              ))}
            </div>
          </div>

          <Field label="Typ">
            <Select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
              <option value="WORK">Arbeit</option>
              <option value="FREE">Frei</option>
              <option value="VACATION">Ferien</option>
              <option value="SICKNESS">Krankheit</option>
              <option value="ABSENCE">Abwesenheit</option>
              <option value="COMPENSATION">Kompensation</option>
              <option value="OTHER">Sonstiges</option>
            </Select>
          </Field>

          {type === "WORK" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start">
                  <Input
                    type="time"
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                  />
                </Field>
                <Field label="Ende">
                  <Input
                    type="time"
                    value={plannedEnd}
                    onChange={(e) => setPlannedEnd(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Pause (Min.)">
                <Input
                  type="number"
                  min={0}
                  max={180}
                  step={5}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Number(e.target.value || 0))}
                />
              </Field>
              {areas.length > 0 && (
                <Field label="Bereich">
                  <Select
                    value={workAreaId}
                    onChange={(e) => setWorkAreaId(e.target.value)}
                  >
                    <option value="">— kein Bereich —</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          <Field label="Notiz">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Vorhandene Einträge überschreiben
          </label>

          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            {dates.length === 0 ? (
              <span className="text-muted-foreground">Keine Tage ausgewählt.</span>
            ) : (
              <span>
                <strong>{dates.length}</strong>Day{dates.length === 1 ? "" : "e"} werden
                {overwrite ? " überschrieben oder" : " neu"} gesetzt.
              </span>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={pending || dates.length === 0}>
              {dates.length > 0
                ? `${dates.length} Tag${dates.length === 1 ? "" : "e"} planen`
                : "Planen"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
