"use client";

// Voll-Bearbeitung eines Tages: mehrere Arbeits- und Pausen-Blöcke
// mit Beginn/Ende. Speichern überschreibt ALLE Punches+Breaks dieses
// Tages mit den Werten aus dem Formular (replaceTimeEntryDay).
// Pflicht-Grund — wandert ins Audit-Log.

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Briefcase, Coffee, Plane, Info, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { replaceTimeEntryDay } from "./actions";
import { validateDayBlocks } from "@/lib/time/day-blocks";
import type { DayPayload } from "./SheetClient";

export interface AbsenceTypeOption {
  id: string;
  labelDe: string;
  colorHex: string;
  requiresApproval: boolean;
}

interface BlockState {
  uid: string; // nur fürs UI-Keying
  type: "WORK" | "HOME_OFFICE" | "BREAK";
  start: string; // HH:MM
  end: string; // HH:MM
  note: string;
}

interface Props {
  employeeId: string;
  day: DayPayload;
  absenceTypes: AbsenceTypeOption[];
  open: boolean;
  onClose: () => void;
}

let uidCounter = 0;
const nextUid = () => `b${++uidCounter}`;

/** Aus den geladenen Punches + Breaks die Initial-Blöcke ableiten,
 *  damit der Editor mit dem aktuellen Stand startet. */
function deriveInitialBlocks(day: DayPayload): BlockState[] {
  const out: BlockState[] = [];

  // Arbeitsblöcke aus CLOCK_IN/CLOCK_OUT-Paaren. Home Office wird am
  // CLOCK_IN-Flag erkannt.
  let currentIn: { start: string; homeOffice: boolean } | null = null;
  for (const p of day.punches) {
    if (p.type === "CLOCK_IN") {
      currentIn = { start: p.occurredAtLocal, homeOffice: p.isHomeOffice };
    } else if (p.type === "CLOCK_OUT" && currentIn) {
      out.push({
        uid: nextUid(),
        type: currentIn.homeOffice ? "HOME_OFFICE" : "WORK",
        start: currentIn.start,
        end: p.occurredAtLocal,
        note: "",
      });
      currentIn = null;
    }
  }
  if (currentIn) {
    // Offener Arbeits-Block (sollte hier nicht vorkommen — Editor blockt
    // wenn live aktiv ist — aber defensiv)
    out.push({
      uid: nextUid(),
      type: currentIn.homeOffice ? "HOME_OFFICE" : "WORK",
      start: currentIn.start,
      end: "",
      note: "",
    });
  }

  // Pausen-Blöcke
  for (const b of day.breaks) {
    out.push({
      uid: nextUid(),
      type: "BREAK",
      start: b.startedAtLocal,
      end: b.endedAtLocal ?? "",
      note: "",
    });
  }

  // Sortierung nach Start-Zeit
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function DayEditor({ employeeId, day, absenceTypes, open, onClose }: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockState[]>(() => deriveInitialBlocks(day));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Absence-State: "" = keine. Mehrtages-Absences sind read-only (über
  // /admin/absences zu pflegen) → dann sind die Felder gesperrt.
  const multiDayAbsence = day.absence?.isMultiDay ? day.absence : null;
  const editableAbsence = day.absence && !day.absence.isMultiDay ? day.absence : null;
  const [absenceTypeId, setAbsenceTypeId] = useState<string>(
    editableAbsence?.typeId ?? "",
  );
  const [absenceHalfDay, setAbsenceHalfDay] = useState<boolean>(
    editableAbsence?.halfDay ?? false,
  );

  useEffect(() => {
    if (!open) return;
    setBlocks(deriveInitialBlocks(day));
    setReason("");
    setError(null);
    const ed = day.absence && !day.absence.isMultiDay ? day.absence : null;
    setAbsenceTypeId(ed?.typeId ?? "");
    setAbsenceHalfDay(ed?.halfDay ?? false);
  }, [open, day]);

  if (!open) return null;

  const addBlock = (type: BlockState["type"]) => {
    // Suggested default times
    const lastEnd = blocks
      .map((b) => b.end)
      .filter(Boolean)
      .sort()
      .at(-1);
    const isBreak = type === "BREAK";
    const defaultStart = lastEnd || (isBreak ? "12:00" : "08:00");
    const defaultEnd = isBreak ? "12:30" : "12:00";
    setBlocks([
      ...blocks,
      { uid: nextUid(), type, start: defaultStart, end: defaultEnd, note: "" },
    ]);
  };

  const removeBlock = (uid: string) => {
    setBlocks(blocks.filter((b) => b.uid !== uid));
  };

  const updateBlock = (uid: string, patch: Partial<BlockState>) => {
    setBlocks(blocks.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  };

  const validate = (): string | null => {
    // Gleiche Regeln wie serverseitig (geteilter Validator): Pausen
    // dürfen INNERHALB der Arbeitszeit liegen; nur Arbeit∩Arbeit,
    // Pause∩Pause und Pause-ausserhalb-Arbeit sind unzulässig.
    const blockError = validateDayBlocks(
      blocks.map((b) => ({ type: b.type, start: b.start, end: b.end })),
    );
    if (blockError) return blockError;
    if (reason.trim().length < 5) {
      return "Grund (mind. 5 Zeichen) erforderlich.";
    }
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errMsg = validate();
    if (errMsg) {
      setError(errMsg);
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await replaceTimeEntryDay({
          employeeId,
          workDate: day.date,
          reason,
          blocks: blocks.map((b) => ({
            type: b.type,
            start: b.start,
            end: b.end,
            note: b.note || undefined,
          })),
          // Mehrtages-Absences NICHT vom Sheet aus anfassen (undefined =
          // "nicht ändern"). Sonst: gewählter Typ oder null (= entfernen).
          absence: multiDayAbsence
            ? undefined
            : absenceTypeId
              ? { absenceTypeId, halfDay: absenceHalfDay }
              : null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <Card className="fixed inset-x-4 top-8 z-50 mx-auto max-w-2xl max-h-[88vh] overflow-y-auto border-habb-line shadow-lg">
        <CardHeader>
          <CardTitle>Tag bearbeiten — {formatDateDe(day.date)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="rounded-md border border-habb-line bg-habb-paper px-3 py-2 text-xs text-habb-muted">
              <strong className="text-habb-ink">So erfassen:</strong>{" "}
              <em>Arbeit</em> / <em>Home Office</em> = gesamte Anwesenheit
              (z. B. 08:00–17:15) — Home Office zählt gleich wie Arbeit.{" "}
              <em>Pause</em> liegt INNERHALB der Arbeitszeit (z. B. Mittag
              12:00–12:30) und wird als unbezahlte Pause abgezogen. Arbeitszeit
              = Anwesenheit − Pausen.
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Zeit-Blöcke</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addBlock("WORK")}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    <Briefcase className="mr-1 h-3.5 w-3.5" /> Arbeit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addBlock("HOME_OFFICE")}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    <Home className="mr-1 h-3.5 w-3.5" /> Home Office
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addBlock("BREAK")}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    <Coffee className="mr-1 h-3.5 w-3.5" /> Pause
                  </Button>
                </div>
              </div>

              {blocks.length === 0 ? (
                <p className="rounded border border-dashed border-habb-line p-3 text-center text-xs text-habb-muted">
                  Keine Blöcke. Klick auf {`„Arbeit"`}, {`„Home Office"`} oder{" "}
                  {`„Pause"`} um anzulegen.
                </p>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((b) => (
                    <li
                      key={b.uid}
                      className="grid grid-cols-1 items-center gap-2 rounded border border-habb-line p-2 md:grid-cols-[110px_100px_100px_1fr_36px]"
                    >
                      <select
                        value={b.type}
                        onChange={(e) =>
                          updateBlock(b.uid, {
                            type: e.target.value as BlockState["type"],
                          })
                        }
                        className="h-9 rounded-md border border-habb-line bg-white px-2 text-sm"
                      >
                        <option value="WORK">Arbeit</option>
                        <option value="HOME_OFFICE">Home Office</option>
                        <option value="BREAK">Pause</option>
                      </select>
                      <Input
                        type="time"
                        value={b.start}
                        onChange={(e) => updateBlock(b.uid, { start: e.target.value })}
                        required
                      />
                      <Input
                        type="time"
                        value={b.end}
                        onChange={(e) => updateBlock(b.uid, { end: e.target.value })}
                        required
                      />
                      <Input
                        type="text"
                        value={b.note}
                        onChange={(e) => updateBlock(b.uid, { note: e.target.value })}
                        placeholder="Kommentar (optional)"
                        maxLength={200}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBlock(b.uid)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Abwesenheit ──────────────────────────────────── */}
            <div className="space-y-2 rounded-md border border-habb-line p-3">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-habb-muted" />
                <Label>Abwesenheit</Label>
              </div>

              {multiDayAbsence ? (
                <div className="flex items-start gap-2 rounded-md bg-habb-paper p-3 text-xs text-habb-muted">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Dieser Tag ist Teil einer <strong>mehrtägigen Abwesenheit</strong>
                    {" "}
                    <span
                      className="inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: multiDayAbsence.colorHex }}
                    />{" "}
                    <strong>{multiDayAbsence.labelDe}</strong>. Sie kann hier nicht
                    geändert werden — bitte über{" "}
                    <Link href="/admin/absences" className="underline">
                      Ferien &amp; Absenzen
                    </Link>{" "}
                    bearbeiten. Arbeitszeiten oben kannst du trotzdem erfassen.
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                    <select
                      value={absenceTypeId}
                      onChange={(e) => setAbsenceTypeId(e.target.value)}
                      className="h-9 rounded-md border border-habb-line bg-white px-2 text-sm"
                    >
                      <option value="">— keine Abwesenheit —</option>
                      {absenceTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.labelDe}
                        </option>
                      ))}
                    </select>

                    {absenceTypeId && (
                      <div className="inline-flex overflow-hidden rounded-md border border-habb-line">
                        <button
                          type="button"
                          onClick={() => setAbsenceHalfDay(false)}
                          className={`px-3 py-1.5 text-xs ${
                            !absenceHalfDay
                              ? "bg-habb-ink text-white"
                              : "bg-white text-habb-muted hover:bg-habb-paper"
                          }`}
                        >
                          Ganzer Tag
                        </button>
                        <button
                          type="button"
                          onClick={() => setAbsenceHalfDay(true)}
                          className={`border-l border-habb-line px-3 py-1.5 text-xs ${
                            absenceHalfDay
                              ? "bg-habb-ink text-white"
                              : "bg-white text-habb-muted hover:bg-habb-paper"
                          }`}
                        >
                          Halber Tag
                        </button>
                      </div>
                    )}
                  </div>
                  {absenceTypeId && (
                    <p className="text-xs text-habb-muted">
                      Wird als genehmigte Abwesenheit für diesen Tag erfasst
                      {absenceHalfDay
                        ? " (halber Tag → halbe Soll-Reduktion; Arbeitszeit oben zusätzlich möglich)."
                        : "."}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason">
                Grund der Änderung{" "}
                <span className="text-xs text-habb-muted">(Audit-Pflicht)</span>
              </Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`z. B. "Mitarbeiter hat vergessen auszustempeln"`}
                maxLength={500}
                required
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="rounded-md border border-habb-line bg-habb-paper p-3 text-xs text-habb-muted">
              <strong>Hinweis:</strong> Beim Speichern werden alle bisherigen
              Stempelungen + Pausen dieses Tages gelöscht und durch die
              Blöcke oben ersetzt. Im Audit-Log wird der Vorher-/Nachher-
              Stand mit Grund und deinem Namen gespeichert.
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

const WEEKDAY_LABELS_DE: Record<string, string> = {
  MON: "Montag",
  TUE: "Dienstag",
  WED: "Mittwoch",
  THU: "Donnerstag",
  FRI: "Freitag",
  SAT: "Samstag",
  SUN: "Sonntag",
};

const MONTH_LABELS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function formatDateDe(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const wd = (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const)[idx];
  return `${WEEKDAY_LABELS_DE[wd]}, ${d}. ${MONTH_LABELS_DE[m - 1]} ${y}`;
}
