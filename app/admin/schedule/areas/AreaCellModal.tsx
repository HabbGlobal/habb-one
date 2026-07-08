"use client";

// Per-cell info-box for the Area × Day matrix.
//
// Shows the list of employees planned in this area on this date with their
// shift details, and lets the secretary add or remove assignments without
// leaving the area view.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateCH } from "@/lib/utils";
import {
  assignEmployeeToAreaOnDate,
  unassignEmployeeFromAreaOnDate,
} from "./actions";
import type { AreaCellEmployee } from "./AreaMatrix";

interface Props {
  areaId: string;
  areaName: string;
  areaColor: string;
  date: string;
  employees: AreaCellEmployee[];
  allEmployees: { id: string; name: string }[];
  onClose: () => void;
}

export function AreaCellModal({
  areaId,
  areaName,
  areaColor,
  date,
  employees,
  allEmployees,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickEmployee, setPickEmployee] = useState<string>("");

  const assignedIds = new Set(employees.map((e) => e.id));
  const candidates = allEmployees.filter((e) => !assignedIds.has(e.id));

  const onAdd = () => {
    if (!pickEmployee) return;
    setError(null);
    start(async () => {
      try {
        await assignEmployeeToAreaOnDate({
          employeeId: pickEmployee,
          areaId,
          date,
        });
        setPickEmployee("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  };

  const onRemove = (employeeId: string) => {
    setError(null);
    start(async () => {
      try {
        await unassignEmployeeFromAreaOnDate({ employeeId, date });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
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
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-md max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: areaColor }}
              />
              {areaName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{formatDateCH(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-accent rounded"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Scheduled ({employees.length})
            </h3>
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No one scheduled.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {employees.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{emp.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {emp.plannedStart && emp.plannedEnd
                          ? `${emp.plannedStart}–${emp.plannedEnd}`
                          : "—"}
                        {emp.plannedBreakMinutes != null && (
                          <span> · Break {emp.plannedBreakMinutes} min.</span>
                        )}
                        {emp.note && (
                          <span className="ml-2 italic">&ldquo;{emp.note}&rdquo;</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRemove(emp.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Remove from this area"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {candidates.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Add employee</h3>
              <div className="flex gap-2">
                <Select
                  value={pickEmployee}
                  onChange={(e) => setPickEmployee(e.target.value)}
                  className="flex-1"
                >
                  <option value="">— select —</option>
                  {candidates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !pickEmployee}
                  onClick={onAdd}
                >
                  <Plus className="h-4 w-4 mr-1" /> Assign
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Default shift 07:30–16:30 (30 min break). Adjust in the normal schedule tab.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </>
  );
}
