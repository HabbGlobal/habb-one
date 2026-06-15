"use client";

// Modal form for creating + editing an absence type.
// Same pattern as NewAbsenceDialog: handwritten backdrop +
// fixed-positioned Card. No Radix dialog (the project doesn't use it).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createAbsenceType, updateAbsenceType } from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  VACATION: "Vacation",
  SICKNESS: "Sickness",
  ACCIDENT: "Accident",
  MILITARY: "Military Service",
  DOCTOR: "Doctor Visit",
  UNPAID: "Unpaid",
  COMPENSATION: "Compensation / overtime reduction",
  OTHER: "Other",
};

export interface AbsenceTypeFormValues {
  id?: string;
  key: string;
  labelDe: string;
  labelEn: string;
  category: keyof typeof CATEGORY_LABELS;
  isPaid: boolean;
  reducesTarget: boolean;
  countsAsWorked: boolean;
  requiresApproval: boolean;
  colorHex: string;
}

const EMPTY: AbsenceTypeFormValues = {
  key: "",
  labelDe: "",
  labelEn: "",
  category: "OTHER",
  isPaid: true,
  reducesTarget: true,
  countsAsWorked: false,
  requiresApproval: false,
  colorHex: "#2563eb",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AbsenceTypeFormValues | null;
}

export function AbsenceTypeForm({ open, onOpenChange, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState<AbsenceTypeFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  // Bei jedem Open mit neuen `initial`-Werten den State neu initialisieren.
  useEffect(() => {
    if (!open) return;
    setData(initial ?? EMPTY);
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        if (isEdit && initial?.id) {
          await updateAbsenceType(initial.id, {
            labelDe: data.labelDe,
            labelEn: data.labelEn,
            category: data.category,
            isPaid: data.isPaid,
            reducesTarget: data.reducesTarget,
            countsAsWorked: data.countsAsWorked,
            requiresApproval: data.requiresApproval,
            colorHex: data.colorHex,
          });
        } else {
          await createAbsenceType(data);
        }
        onOpenChange(false);
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
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <Card className="fixed inset-x-4 top-8 z-50 mx-auto max-w-lg max-h-[88vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>
            {isEdit ? "Edit absence type" : "New Absence Type"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="key">
                Key{" "}
                <span className="text-xs text-muted-foreground">(stable, internal)</span>
              </Label>
              <Input
                id="key"
                value={data.key}
                onChange={(e) =>
                  setData({
                    ...data,
                    key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  })
                }
                disabled={isEdit}
                placeholder="e.g. training"
                maxLength={30}
                required
              />
              <p className="text-xs text-muted-foreground">
                Lowercase, digits, underscore. Cannot be changed after creation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="labelDe">Label (German)</Label>
                <Input
                  id="labelDe"
                  value={data.labelDe}
                  onChange={(e) => setData({ ...data, labelDe: e.target.value })}
                  placeholder="e.g. Weiterbildung"
                  maxLength={60}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="labelEn">Label (English)</Label>
                <Input
                  id="labelEn"
                  value={data.labelEn}
                  onChange={(e) => setData({ ...data, labelEn: e.target.value })}
                  placeholder="e.g. Training"
                  maxLength={60}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                value={data.category}
                onChange={(e) =>
                  setData({
                    ...data,
                    category: e.target.value as AbsenceTypeFormValues["category"],
                  })
                }
              >
                {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map(
                  (k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABELS[k]}
                    </option>
                  ),
                )}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="colorHex">Color (plan display)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="colorHex"
                  type="color"
                  value={data.colorHex}
                  onChange={(e) => setData({ ...data, colorHex: e.target.value })}
                  className="h-9 w-12 rounded border border-habb-line bg-white p-0.5"
                />
                <Input
                  value={data.colorHex}
                  onChange={(e) => setData({ ...data, colorHex: e.target.value })}
                  placeholder="#2563eb"
                  className="w-32 font-mono"
                  maxLength={7}
                />
              </div>
            </div>

            <fieldset className="space-y-2 rounded-md border border-habb-line p-3">
              <legend className="px-1 text-xs uppercase tracking-wider text-habb-muted">
                Behavior
              </legend>

              <CheckboxField
                id="isPaid"
                checked={data.isPaid}
                onChange={(v) => setData({ ...data, isPaid: v })}
                label="Paid"
                hint="Pay continues (e.g. vacation, sickness)."
              />
              <CheckboxField
                id="reducesTarget"
                checked={data.reducesTarget}
                onChange={(v) => setData({ ...data, reducesTarget: v })}
                label="Reduces target hours"
                hint="Absence days do NOT count toward weekly target (typical for vacation/sickness)."
              />
              <CheckboxField
                id="countsAsWorked"
                checked={data.countsAsWorked}
                onChange={(v) => setData({ ...data, countsAsWorked: v })}
                label="Counts as worked"
                hint="Hours are counted as work time (e.g. paid doctor visit during work hours)."
              />
              <CheckboxField
                id="requiresApproval"
                checked={data.requiresApproval}
                onChange={(v) => setData({ ...data, requiresApproval: v })}
                label="Approval required"
                hint="Employee requests the type; CEO/Secretary must approve first (e.g. vacation)."
              />
            </fieldset>

            {error && (
              <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : isEdit ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function CheckboxField({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 rounded-md p-1 text-sm hover:bg-habb-paper"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-habb-line"
      />
      <span>
        <div className="font-medium text-habb-ink">{label}</div>
        {hint && <div className="text-xs text-habb-muted">{hint}</div>}
      </span>
    </label>
  );
}
