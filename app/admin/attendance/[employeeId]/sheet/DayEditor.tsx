"use client";

// Full-day editing: multiple work and break blocks
// with start/end times. Saving overwrites ALL punches + breaks for the day
// with the values from the form (replaceTimeEntryDay).
// Reason is required — stored in the audit log.

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
  uid: string; // for UI keying only
  type: "WORK" | "HOME_OFFICE" | "BREAK";
  start: string; // HH:MM
  end: string;   // HH:MM
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

/** Derive initial blocks from the loaded punches + breaks
 *  so the editor starts with the current state. */
function deriveInitialBlocks(day: DayPayload): BlockState[] {
  const out: BlockState[] = [];

  // Work blocks from CLOCK_IN/CLOCK_OUT pairs.
  // Home Office is detected from the CLOCK_IN flag.
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
    // Open work block (should not happen here — editor blocks
    // when live and active — but handled defensively)
    out.push({
      uid: nextUid(),
      type: currentIn.homeOffice ? "HOME_OFFICE" : "WORK",
      start: currentIn.start,
      end: "",
      note: "",
    });
  }

  // Break blocks
  for (const b of day.breaks) {
    out.push({
      uid: nextUid(),
      type: "BREAK",
      start: b.startedAtLocal,
      end: b.endedAtLocal ?? "",
      note: "",
    });
  }

  // Sort by start time
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function DayEditor({ employeeId, day, absenceTypes, open, onClose }: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockState[]>(() => deriveInitialBlocks(day));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Absence state: "" = none. Multi-day absences are read-only
  // (managed via /admin/absences) → fields are locked.
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
    // Same rules as server-side (shared validator): breaks
    // must lie WITHIN work time; only work∩work,
    // break∩break and break-outside-work are invalid.
    const blockError = validateDayBlocks(
      blocks.map((b) => ({ type: b.type, start: b.start, end: b.end })),
    );
    if (blockError) return blockError;
    if (reason.trim().length < 5) {
      return "Reason (min. 5 characters) is required.";
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
          // Do NOT touch multi-day absences from the sheet (undefined =
          // "no change"). Otherwise: selected type or null (= remove).
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
          <CardTitle>Edit Day — {formatDateEn(day.date)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="rounded-md border border-habb-line bg-habb-paper px-3 py-2 text-xs text-habb-muted">
              <strong className="text-habb-ink">How to record:</strong>{" "}
              <em>Work</em> / <em>Home Office</em> = total attendance
              (e.g. 08:00–17:15) — Home Office counts the same as Work.{" "}
              <em>Break</em> lies WITHIN the work time (e.g. lunch
              12:00–12:30) and is deducted as unpaid break. Working time
              = Attendance − Breaks.
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Time Blocks</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addBlock("WORK")}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    <Briefcase className="mr-1 h-3.5 w-3.5" /> Work
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
                    <Coffee className="mr-1 h-3.5 w-3.5" /> Break
                  </Button>
                </div>
              </div>

              {blocks.length === 0 ? (
                <p className="rounded border border-dashed border-habb-line p-3 text-center text-xs text-habb-muted">
                  No blocks. Click &quot;Work&quot;, &quot;Home Office&quot; or &quot;Break&quot; to add one.
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
                        <option value="WORK">Work</option>
                        <option value="HOME_OFFICE">Home Office</option>
                        <option value="BREAK">Break</option>
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
                        placeholder="Comment (optional)"
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

            {/* ── Absence ──────────────────────────────────── */}
            <div className="space-y-2 rounded-md border border-habb-line p-3">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-habb-muted" />
                <Label>Absence</Label>
              </div>

              {multiDayAbsence ? (
                <div className="flex items-start gap-2 rounded-md bg-habb-paper p-3 text-xs text-habb-muted">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    This day is part of a <strong>multi-day absence</strong>
                    {" "}
                    <span
                      className="inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: multiDayAbsence.colorHex }}
                    />{" "}
                    <strong>{multiDayAbsence.labelDe}</strong>. It cannot be
                    changed here — please edit it via{" "}
                    <Link href="/admin/absences" className="underline">
                      Vacations &amp; Absences
                    </Link>
                    . You can still record working hours above.
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
                      <option value="">— No absence —</option>
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
                          Full Day
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
                          Half Day
                        </button>
                      </div>
                    )}
                  </div>
                  {absenceTypeId && (
                    <p className="text-xs text-habb-muted">
                      Will be recorded as an approved absence for this day
                      {absenceHalfDay
                        ? " (half day → half target reduction; working hours above can still be added)."
                        : "."}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason">
                Reason for Change{" "}
                <span className="text-xs text-habb-muted">(required for audit)</span>
              </Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`e.g. "Employee forgot to clock out"`}
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
              <strong>Note:</strong> Saving will delete all existing punches
              and breaks for this day and replace them with the blocks above.
              The audit log will record the before/after state along with the
              reason and your name.
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
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

const WEEKDAY_LABELS_EN: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const MONTH_LABELS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDateEn(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const wd = (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const)[idx];
  return `${WEEKDAY_LABELS_EN[wd]}, ${d} ${MONTH_LABELS_EN[m - 1]} ${y}`;
}