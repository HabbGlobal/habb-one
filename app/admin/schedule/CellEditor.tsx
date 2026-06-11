"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteScheduleEntry,
  ensureScheduleMonth,
  upsertScheduleEntry,
} from "./actions";
import type { AreaOption, MatrixCellEntry } from "./ScheduleMatrix";

type EntryType =
  | "WORK"
  | "FREE"
  | "VACATION"
  | "SICKNESS"
  | "ABSENCE"
  | "COMPENSATION"
  | "OTHER";

interface Props {
  year: number;
  month: number;
  monthId: string | null;
  employeeId: string;
  employeeName: string;
  date: string;
  entry: MatrixCellEntry | null;
  areas?: AreaOption[];
  onClose: () => void;
}

export function CellEditor({
  year,
  month,
  monthId,
  employeeId,
  employeeName,
  date,
  entry,
  areas = [],
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // HOLIDAY type isn't directly editable here — it comes from the Holiday
  // table. So we cap the editor to the user-managed types.
  const [type, setType] = useState<EntryType>(
    (entry?.type as EntryType) ?? "WORK"
  );
  const [plannedStart, setPlannedStart] = useState(entry?.plannedStart ?? "07:30");
  const [plannedEnd, setPlannedEnd] = useState(entry?.plannedEnd ?? "16:30");
  const [breakMin, setBreakMin] = useState<number>(entry?.plannedBreakMinutes ?? 30);
  const [workAreaId, setWorkAreaId] = useState<string>(entry?.workAreaId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");

  const save = () => {
    setError(null);
    start(async () => {
      try {
        let mId = monthId;
        if (!mId) {
          const m = await ensureScheduleMonth(year, month);
          mId = m.id;
        }
        await upsertScheduleEntry({
          monthId: mId,
          employeeId,
          date,
          type,
          plannedStart: type === "WORK" ? plannedStart : null,
          plannedEnd: type === "WORK" ? plannedEnd : null,
          plannedBreakMinutes: type === "WORK" ? breakMin : null,
          workAreaId: type === "WORK" && workAreaId ? workAreaId : null,
          note: note || null,
        });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  };

  const remove = () => {
    if (!entry) {
      onClose();
      return;
    }
    if (!confirm("Eintrag entfernen?")) return;
    setError(null);
    start(async () => {
      try {
        await deleteScheduleEntry(entry.id);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Löschen");
      }
    });
  };

  // Display-friendly date (the date prop is YYYY-MM-DD)
  const displayDate = (() => {
    const [y, m, d] = date.split("-");
    return `${d}.${m}.${y}`;
  })();

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden
        onClick={onClose}
      />
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-md max-h-[85vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">{employeeName}</CardTitle>
            <p className="text-sm text-muted-foreground">{displayDate}</p>
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending || !entry}
              onClick={remove}
              className="text-destructive hover:text-destructive"
            >
              Eintrag löschen
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="button" onClick={save} disabled={pending}>
                Speichern
              </Button>
            </div>
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
