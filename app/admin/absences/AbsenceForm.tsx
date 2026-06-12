"use client";

// Form for creating or editing an Absence. Used both inside the modal on
// the list page and on the per-absence edit page.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { createAbsence, updateAbsence } from "./actions";

export interface AbsenceFormData {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";
}

interface Props {
  initial: AbsenceFormData;
  employees: { id: string; name: string }[];
  types: { id: string; label: string }[];
  mode: { kind: "create" } | { kind: "edit"; absenceId: string };
  onDone?: () => void;
}

export function AbsenceForm({ initial, employees, types, mode, onDone }: Props) {
  const t = useTranslations("absences");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [data, setData] = useState<AbsenceFormData>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AbsenceFormData>(key: K, value: AbsenceFormData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        if (mode.kind === "create") {
          await createAbsence(data);
        } else {
          await updateAbsence(mode.absenceId, data);
        }
        if (onDone) onDone();
        else {
          router.push("/admin/absences");
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={tCommon("name")}>
        <Select value={data.employeeId} onChange={(e) => update("employeeId", e.target.value)} required>
          <option value="">—</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("type")}>
        <Select value={data.absenceTypeId} onChange={(e) => update("absenceTypeId", e.target.value)} required>
          <option value="">—</option>
          {types.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {tp.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tCommon("from")}>
          <Input type="date" value={data.startDate} onChange={(e) => update("startDate", e.target.value)} required />
        </Field>
        <Field label={tCommon("to")}>
          <Input type="date" value={data.endDate} onChange={(e) => update("endDate", e.target.value)} required />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.startHalfDay}
            onChange={(e) => update("startHalfDay", e.target.checked)}
          />
          {t("halfDayStart")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.endHalfDay}
            onChange={(e) => update("endHalfDay", e.target.checked)}
          />
          {t("halfDayEnd")}
        </label>
      </div>
      <Field label={tCommon("reason")}>
        <Input value={data.reason} onChange={(e) => update("reason", e.target.value)} />
      </Field>
      <Field label={tCommon("status")}>
        <Select
          value={data.status}
          onChange={(e) => update("status", e.target.value as AbsenceFormData["status"])}
        >
          <option value="APPROVED">{tCommon("approved")}</option>
          <option value="REQUESTED">REQUESTED</option>
          <option value="REJECTED">{tCommon("rejected")}</option>
          <option value="CANCELLED">CANCELLED</option>
        </Select>
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {tCommon("cancel")}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
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
