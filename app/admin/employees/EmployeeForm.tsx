"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Wand2, X, Plus, Trash2 } from "lucide-react";
import { createEmployee, updateEmployee } from "./actions";
import {
  SKILL_CODES,
  SKILL_LEVELS,
  SKILL_LABELS_DE,
  SKILL_LEVEL_LABELS_DE,
  type SkillCodeValue,
  type SkillLevelValue,
} from "@/lib/validation/employee";

// ─────────────────────────────────────────
// Auto-distribution helpers
// ─────────────────────────────────────────

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const DEFAULT_WORKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
type ScheduleDays = Record<(typeof WEEKDAYS)[number], number>;

const roundHrs = (n: number) => Math.round(n * 100) / 100;

const sumDays = (days: ScheduleDays) =>
  WEEKDAYS.reduce((s, d) => s + (days[d] ?? 0), 0);

/** Distribute totalHours across the days that are currently > 0. If nothing
 *  is configured yet, fall back to Mon-Fri. */
function distributeAcrossDays(totalHours: number, days: ScheduleDays): ScheduleDays {
  const active = WEEKDAYS.filter((d) => days[d] > 0);
  const target: readonly (typeof WEEKDAYS)[number][] =
    active.length > 0 ? active : DEFAULT_WORKDAYS;
  const perDay = totalHours / target.length;
  const result: ScheduleDays = {
    MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
  };
  for (const d of target) result[d] = roundHrs(perDay);
  return result;
}

export interface EmployeeSkillEntry {
  skillCode: SkillCodeValue;
  level: SkillLevelValue;
  certifiedUntil: string;
}

export interface EmployeeInitial {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredLanguage: "de" | "en";
  isActive: boolean;
  startDate: string;
  endDate: string;
  /** ── Personalstammdaten (PR 6) — ISO date strings (YYYY-MM-DD) oder "". */
  dateOfBirth: string;
  address: string;
  ahvNumber: string;
  employmentType: "MONTHLY_SALARY" | "HOURLY_WAGE";
  workloadPercent: number | null;
  weeklyTargetHours: number | null;
  defaultBreakMinutes: number;
  annualVacationDays: number;
  initialOvertimeHours: number;
  initialVacationDays: number;
  notes: string;
  scheduleDays: Record<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN", number>;
  workAreaIds: string[];
  skills: EmployeeSkillEntry[];
}

export interface AvailableArea {
  id: string;
  name: string;
  colorHex: string;
}

type Mode = { kind: "create" } | { kind: "edit"; employeeId: string };

interface Props {
  initial: EmployeeInitial;
  mode: Mode;
  submitLabel: string;
  /** Company default — used to convert workload % ↔ weekly hours. */
  companyWeeklyHours?: number;
  /** All currently-active work areas (so the form can show a checkbox list). */
  availableAreas?: AvailableArea[];
}

// The form imports the server actions directly. Importing actions from a
// `"use server"` file into a client component is the supported Next.js 15
// pattern and avoids the fragile "pass an inline closure as onSubmit" model,
// which silently breaks when the closure isn't marked as a server action.
export function EmployeeForm({
  initial,
  mode,
  submitLabel,
  companyWeeklyHours = 42,
  availableAreas = [],
}: Props) {
  const t = useTranslations("employees");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [data, setData] = useState<EmployeeInitial>(initial);
  const [pending, start] = useTransition();
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof EmployeeInitial>(key: K, value: EmployeeInitial[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  // ─── Smart setters: derive related fields automatically ───

  const setWorkload = (pct: number | null) => {
    setData((prev) => {
      if (prev.employmentType === "HOURLY_WAGE" || pct === null) {
        return { ...prev, workloadPercent: pct };
      }
      const newWeekly = roundHrs((companyWeeklyHours * pct) / 100);
      return {
        ...prev,
        workloadPercent: pct,
        weeklyTargetHours: newWeekly,
        scheduleDays: distributeAcrossDays(newWeekly, prev.scheduleDays),
      };
    });
  };

  const setWeeklyHours = (hrs: number | null) => {
    setData((prev) => {
      if (hrs === null) return { ...prev, weeklyTargetHours: null };
      const newWorkload =
        companyWeeklyHours > 0
          ? Math.round((hrs / companyWeeklyHours) * 100)
          : prev.workloadPercent;
      return {
        ...prev,
        weeklyTargetHours: hrs,
        workloadPercent: newWorkload,
        scheduleDays: distributeAcrossDays(hrs, prev.scheduleDays),
      };
    });
  };

  // While typing in a day field, just update the value.
  const setDayValue = (day: (typeof WEEKDAYS)[number], value: number) => {
    setData((prev) => ({
      ...prev,
      scheduleDays: { ...prev.scheduleDays, [day]: value },
    }));
  };

  // On blur: if the field is now 0 (and was a workday), redistribute its
  // hours across the remaining workdays, keeping the weekly total stable.
  // Otherwise, just sync the weekly total to the new sum.
  const finalizeDayValue = (day: (typeof WEEKDAYS)[number]) => {
    setData((prev) => {
      const dayHrs = prev.scheduleDays[day];
      if (dayHrs === 0 && prev.weeklyTargetHours && prev.weeklyTargetHours > 0) {
        const otherActive = WEEKDAYS.filter(
          (d) => d !== day && prev.scheduleDays[d] > 0
        );
        if (otherActive.length === 0) return prev;
        const perDay = roundHrs(prev.weeklyTargetHours / otherActive.length);
        const newDays = { ...prev.scheduleDays };
        for (const d of otherActive) newDays[d] = perDay;
        return { ...prev, scheduleDays: newDays };
      }
      const sum = roundHrs(sumDays(prev.scheduleDays));
      const newWorkload =
        companyWeeklyHours > 0
          ? Math.round((sum / companyWeeklyHours) * 100)
          : prev.workloadPercent;
      return { ...prev, weeklyTargetHours: sum, workloadPercent: newWorkload };
    });
  };

  const removeDay = (day: (typeof WEEKDAYS)[number]) => {
    setDayValue(day, 0);
    // Run the finalize logic synchronously by scheduling it after the state
    // update has applied.
    setTimeout(() => finalizeDayValue(day), 0);
  };

  const redistributeNow = () => {
    setData((prev) => {
      if (!prev.weeklyTargetHours) return prev;
      return {
        ...prev,
        scheduleDays: distributeAcrossDays(prev.weeklyTargetHours, prev.scheduleDays),
      };
    });
  };

  const setEmploymentType = (type: "MONTHLY_SALARY" | "HOURLY_WAGE") => {
    setData((prev) => {
      if (type === "HOURLY_WAGE") {
        return {
          ...prev,
          employmentType: type,
          workloadPercent: null,
          weeklyTargetHours: null,
          scheduleDays: { MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0 },
        };
      }
      // Switching back to monthly salary: sensible defaults (full-time M-F).
      return {
        ...prev,
        employmentType: type,
        workloadPercent: 100,
        weeklyTargetHours: companyWeeklyHours,
        scheduleDays: distributeAcrossDays(companyWeeklyHours, {
          MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
        }),
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        if (mode.kind === "create") {
          const result = await createEmployee(data);
          if (result?.pin) {
            setPin(result.pin);
          } else {
            router.push("/admin/employees");
            router.refresh();
          }
        } else {
          await updateEmployee(mode.employeeId, data);
          router.push("/admin/employees");
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  };

  if (pin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("pin")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            {t("newPinShown", { pin })}
          </p>
          <p className="text-4xl font-mono font-semibold tracking-widest text-center">{pin}</p>
          <Button onClick={() => router.push("/admin/employees")}>{tCommon("close")}</Button>
        </CardContent>
      </Card>
    );
  }

  const days = [
    { key: "MON" as const, label: t("monday") },
    { key: "TUE" as const, label: t("tuesday") },
    { key: "WED" as const, label: t("wednesday") },
    { key: "THU" as const, label: t("thursday") },
    { key: "FRI" as const, label: t("friday") },
    { key: "SAT" as const, label: t("saturday") },
    { key: "SUN" as const, label: t("sunday") },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
          <Field label={t("employeeNumber")}>
            <Input value={data.employeeNumber} onChange={(e) => update("employeeNumber", e.target.value)} required />
          </Field>
          <Field label={tCommon("status")}>
            <Select value={data.isActive ? "1" : "0"} onChange={(e) => update("isActive", e.target.value === "1")}>
              <option value="1">{tCommon("active")}</option>
              <option value="0">{tCommon("inactive")}</option>
            </Select>
          </Field>
          <Field label={t("firstName")}>
            <Input value={data.firstName} onChange={(e) => update("firstName", e.target.value)} required />
          </Field>
          <Field label={t("lastName")}>
            <Input value={data.lastName} onChange={(e) => update("lastName", e.target.value)} required />
          </Field>
          <Field label={tCommon("email")}>
            <Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} />
          </Field>
          <Field label={tCommon("language")}>
            <Select value={data.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value as "de" | "en")}>
              <option value="de">{tCommon("german")}</option>
              <option value="en">{tCommon("english")}</option>
            </Select>
          </Field>
          <Field label={t("startDate")}>
            <Input type="date" value={data.startDate} onChange={(e) => update("startDate", e.target.value)} required />
          </Field>
          <Field label={t("endDate")}>
            <Input type="date" value={data.endDate} onChange={(e) => update("endDate", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personalangaben</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Geburtsdatum">
            <Input
              type="date"
              value={data.dateOfBirth}
              onChange={(e) => update("dateOfBirth", e.target.value)}
            />
          </Field>
          <Field label="AHV-Nr.">
            <Input
              value={data.ahvNumber}
              onChange={(e) => update("ahvNumber", e.target.value)}
              placeholder="756.XXXX.XXXX.XX"
              maxLength={16}
            />
          </Field>
          <Field label="Adresse">
            <Input
              value={data.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Strasse Nr., PLZ Ort"
            />
          </Field>
          <Field label="Telefon">
            <Input
              type="tel"
              value={data.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+41 79 123 45 67"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("employmentType")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("employmentType")}>
            <Select
              value={data.employmentType}
              onChange={(e) =>
                setEmploymentType(e.target.value as "MONTHLY_SALARY" | "HOURLY_WAGE")
              }
            >
              <option value="MONTHLY_SALARY">{t("monthlySalary")}</option>
              <option value="HOURLY_WAGE">{t("hourlyWage")}</option>
            </Select>
          </Field>
          <Field label={t("workload") + " (%)"}>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={data.workloadPercent ?? ""}
              disabled={data.employmentType === "HOURLY_WAGE"}
              onChange={(e) => setWorkload(e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label={t("weeklyHours")}>
            <Input
              type="number"
              min={0}
              max={80}
              step={0.1}
              value={data.weeklyTargetHours ?? ""}
              disabled={data.employmentType === "HOURLY_WAGE"}
              onChange={(e) => setWeeklyHours(e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label={t("annualVacationDays")}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={data.annualVacationDays}
              onChange={(e) => update("annualVacationDays", Number(e.target.value))}
            />
          </Field>
          <Field label="Initial Saldo (h)">
            <Input
              type="number"
              step={0.1}
              value={data.initialOvertimeHours}
              onChange={(e) => update("initialOvertimeHours", Number(e.target.value))}
            />
          </Field>
          <Field label="Übertrag Ferien (Tage)">
            <Input
              type="number"
              step={0.5}
              value={data.initialVacationDays}
              onChange={(e) => update("initialVacationDays", Number(e.target.value))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("scheduleDays")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              data.employmentType === "HOURLY_WAGE" || !data.weeklyTargetHours
            }
            onClick={redistributeNow}
            title="Wochenstunden gleichmässig auf alle Arbeitstage (Tage > 0) verteilen"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Gleichmässig verteilen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            {days.map((d) => (
              <Field key={d.key} label={d.label}>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    step={0.1}
                    value={data.scheduleDays[d.key]}
                    disabled={data.employmentType === "HOURLY_WAGE"}
                    onChange={(e) =>
                      setDayValue(d.key, e.target.value === "" ? 0 : Number(e.target.value))
                    }
                    onBlur={() => finalizeDayValue(d.key)}
                  />
                  {data.scheduleDays[d.key] > 0 && data.employmentType !== "HOURLY_WAGE" && (
                    <button
                      type="button"
                      onClick={() => removeDay(d.key)}
                      title="Tag entfernen — Stunden auf andere Arbeitstage verteilen"
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Field>
            ))}
          </div>
          {data.employmentType !== "HOURLY_WAGE" && (
            <p className="text-xs text-muted-foreground">
              💡 Wochenstunden ändern verteilt automatisch. Setzt Du einen Tag auf 0
              (oder klickst ✕), gehen seine Stunden auf die anderen Arbeitstage.
            </p>
          )}
        </CardContent>
      </Card>

      {availableAreas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bereiche</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableAreas.map((a) => {
                const checked = data.workAreaIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...data.workAreaIds, a.id]
                          : data.workAreaIds.filter((id) => id !== a.id);
                        update("workAreaIds", next);
                      }}
                    />
                    <span
                      className="inline-block w-3 h-3 rounded-full border"
                      style={{ backgroundColor: a.colorHex }}
                    />
                    <span>{a.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Mehrfachauswahl möglich. Verwaltung der Bereiche unter{" "}
              <span className="underline">Bereiche</span>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Kompetenzen</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Erste noch nicht verwendete Kompetenz hinzufügen.
              const taken = new Set(data.skills.map((s) => s.skillCode));
              const next = SKILL_CODES.find((c) => !taken.has(c));
              if (!next) return;
              update("skills", [
                ...data.skills,
                { skillCode: next, level: "BASIC", certifiedUntil: "" },
              ]);
            }}
            disabled={data.skills.length >= SKILL_CODES.length}
          >
            <Plus className="mr-2 h-4 w-4" />
            Hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.skills.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Kompetenzen erfasst. Die automatische Planung verwendet
              diese Angaben, um Mitarbeiter passend zu Auftragsschritten zuzuordnen.
            </p>
          )}
          {data.skills.map((s, idx) => {
            const others = new Set(data.skills.filter((_, i) => i !== idx).map((x) => x.skillCode));
            return (
              <div
                key={`${s.skillCode}-${idx}`}
                className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-[1fr_140px_160px_40px]"
              >
                <Field label="Kompetenz">
                  <Select
                    value={s.skillCode}
                    onChange={(e) => {
                      const next = [...data.skills];
                      next[idx] = { ...next[idx], skillCode: e.target.value as SkillCodeValue };
                      update("skills", next);
                    }}
                  >
                    {SKILL_CODES.map((c) => (
                      <option key={c} value={c} disabled={others.has(c)}>
                        {SKILL_LABELS_DE[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Level">
                  <Select
                    value={s.level}
                    onChange={(e) => {
                      const next = [...data.skills];
                      next[idx] = { ...next[idx], level: e.target.value as SkillLevelValue };
                      update("skills", next);
                    }}
                  >
                    {SKILL_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {SKILL_LEVEL_LABELS_DE[l]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Zertifiziert bis">
                  <Input
                    type="date"
                    value={s.certifiedUntil}
                    onChange={(e) => {
                      const next = [...data.skills];
                      next[idx] = { ...next[idx], certifiedUntil: e.target.value };
                      update("skills", next);
                    }}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      update("skills", data.skills.filter((_, i) => i !== idx))
                    }
                    title="Entfernen"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <Field label={tCommon("notes")}>
            <Textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} rows={3} />
          </Field>
        </CardContent>
      </Card>

      {error && <p className="text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {tCommon("cancel")}
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
