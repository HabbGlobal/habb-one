"use client";

// Form for process templates — add/remove/sort steps.
// Used by /admin/templates/new (mode="create") and /admin/templates/[id]
// (mode="edit").

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MACHINE_TYPES,
  PROCESS_CODES,
  SKILL_CODES,
} from "@/lib/validation/order";
import {
  PROCESS_LABEL,
  PROCESS_GROUP,
  MACHINE_LABEL,
  SKILL_LABEL,
} from "@/lib/order/labels";
import type { MachineType, ProcessCode, SkillCode } from "@prisma/client";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";
import { createTemplate, updateTemplate } from "./actions";

interface StepDraft {
  sequence: number;
  processCode: ProcessCode;
  machineTypeRequired: MachineType | null;
  skillRequired: SkillCode;
  defaultWaitMinutes: number;
  notes: string;
}

export interface TemplateFormInitial {
  templateId: string;
  label: string;
  description: string;
  sortOrder: number;
  steps: StepDraft[];
}

export function TemplateForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: TemplateFormInitial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps?.length
      ? initial.steps
      : [makeEmptyStep(10)],
  );

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addStep = () => {
    const code: ProcessCode = "MASKING";
    const r = PROCESS_RESOURCES[code];
    const seq = steps.length === 0 ? 10 : Math.max(...steps.map((s) => s.sequence)) + 10;
    setSteps((prev) => [
      ...prev,
      {
        sequence: seq,
        processCode: code,
        machineTypeRequired: r.machine,
        skillRequired: r.skill,
        defaultWaitMinutes: r.defaultWaitMinutes,
        notes: "",
      },
    ]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) {
      alert("At least one step is required.");
      return;
    }
    setSteps((prev) =>
      prev.filter((_, i) => i !== idx).map((s, k) => ({ ...s, sequence: (k + 1) * 10 })),
    );
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, k) => ({ ...s, sequence: (k + 1) * 10 }));
    });
  };

  const onProcessCodeChange = (idx: number, code: ProcessCode) => {
    const r = PROCESS_RESOURCES[code];
    updateStep(idx, {
      processCode: code,
      machineTypeRequired: r.machine,
      skillRequired: r.skill,
      defaultWaitMinutes: r.defaultWaitMinutes,
    });
  };

  const submit = () => {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    const payload = {
      label,
      description: description || undefined,
      sortOrder,
      steps: steps.map((s) => ({
        sequence: s.sequence,
        processCode: s.processCode,
        machineTypeRequired: s.machineTypeRequired,
        skillRequired: s.skillRequired,
        defaultWaitMinutes: s.defaultWaitMinutes,
        notes: s.notes || undefined,
      })),
    };
    start(async () => {
      try {
        if (mode === "create") {
          const r = await createTemplate(payload);
          router.push(`/admin/templates/${r.id}`);
        } else if (mode === "edit" && initial) {
          await updateTemplate(initial.templateId, payload);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Stammdaten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label>Label *</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Special pre-treatment aluminium"
          />
        </div>
        <div className="space-y-1">
          <Label>Order (sorting)</Label>
          <Input
            type="number"
            value={sortOrder}
            min={0}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1 md:col-span-3">
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this template used for, when should it be selected?"
          />
        </div>
      </div>

      {/* Schritte */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Process steps ({steps.length})</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4 mr-1" /> Step
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 items-end bg-muted/30 rounded p-2 border"
            >
              <div className="col-span-1 flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveStep(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                  aria-label="Up"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <span className="text-xs tabular-nums font-mono">{s.sequence}</span>
                <button
                  type="button"
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === steps.length - 1}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                  aria-label="Down"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Process step</Label>
                <Select
                  value={s.processCode}
                  onChange={(e) => onProcessCodeChange(idx, e.target.value as ProcessCode)}
                  className="text-xs"
                >
                  {(["Preparation", "Sandblasting", "Wet Painting", "Powder Coating", "Post-processing"] as const).map(
                    (group) => (
                      <optgroup key={group} label={group}>
                        {PROCESS_CODES.filter((c) => PROCESS_GROUP[c] === group).map((c) => (
                          <option key={c} value={c}>
                            {PROCESS_LABEL[c]}
                          </option>
                        ))}
                      </optgroup>
                    ),
                  )}
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Worker</Label>
                <Select
                  value={s.skillRequired}
                  onChange={(e) =>
                    updateStep(idx, { skillRequired: e.target.value as SkillCode })
                  }
                  className="text-xs"
                >
                  {SKILL_CODES.map((sk) => (
                    <option key={sk} value={sk}>
                      {SKILL_LABEL[sk]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Machine</Label>
                <Select
                  value={s.machineTypeRequired ?? ""}
                  onChange={(e) =>
                    updateStep(idx, {
                      machineTypeRequired: (e.target.value as MachineType) || null,
                    })
                  }
                  className="text-xs"
                >
                  <option value="">— none —</option>
                  {MACHINE_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {MACHINE_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Wait time (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={s.defaultWaitMinutes}
                  onChange={(e) =>
                    updateStep(idx, { defaultWaitMinutes: Number(e.target.value) })
                  }
                  className="text-xs"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="p-1 rounded hover:bg-destructive/10 text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="col-span-12">
                <Input
                  value={s.notes}
                  onChange={(e) => updateStep(idx, { notes: e.target.value })}
                  placeholder="Note (optional)"
                  className="text-xs h-8"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !label.trim()}>
          {pending ? "Saving..." : mode === "create" ? "Create template" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function makeEmptyStep(sequence: number): StepDraft {
  const code: ProcessCode = "MASKING";
  const r = PROCESS_RESOURCES[code];
  return {
    sequence,
    processCode: code,
    machineTypeRequired: r.machine,
    skillRequired: r.skill,
    defaultWaitMinutes: r.defaultWaitMinutes,
    notes: "",
  };
}
