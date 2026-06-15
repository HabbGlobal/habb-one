"use client";

// Multi-section order editor (used both for "new" and "edit" of DRAFT
// orders). Layout:
//   1) Header data â€” Customer, addresses, contact person, dates, priority
//   2) Positions â€” per position: master data + process flow (with template)
//
// State is local. On submit we POST the full payload through the server
// action `createOrder` / `updateDraftOrder` â€” no optimistic UI.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  COMPLEXITIES,
  MACHINE_TYPES,
  MATERIALS,
  PRIORITIES,
  PROCESS_CODES,
  SKILL_CODES,
  type OrderItemFormData,
  type OrderCoreFormData,
} from "@/lib/validation/order";
import {
  applyProcessTemplate,
  createOrder,
  recommendOrderProcessSteps,
  updateDraftOrder,
} from "./actions";
import type { MachineType, ProcessCode, SkillCode } from "@prisma/client";
import {
  PROCESS_LABEL,
  PROCESS_GROUP,
  MACHINE_LABEL,
  SKILL_LABEL,
  MATERIAL_LABEL,
  COMPLEXITY_LABEL,
  COLOR_SYSTEM_LABEL,
  GLOSS_LEVEL_LABEL,
} from "@/lib/order/labels";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CustomerOption {
  id: string;
  label: string;
  customerNumber: string;
  defaultDiscount: number;
  contacts: { id: string; label: string; isPrimary: boolean }[];
  addresses: { id: string; label: string; type: "BILLING" | "SHIPPING" | "BOTH" }[];
}

export interface TemplateOption {
  id: string;
  label: string;
  description: string;
}

interface StepDraft {
  sequence: number;
  processCode: ProcessCode;
  machineTypeRequired: MachineType | null;
  skillRequired: SkillCode;
  estimatedMinutes: number;
  waitMinutesAfter: number;
  notes: string;
}

interface ItemDraft {
  /** Stable client-side id for React keying (NOT persisted). */
  cid: string;
  position: number;
  description: string;
  quantity: number;
  surfaceM2: number;
  weightKg: number | null;
  thicknessMm: number | null;
  material: typeof MATERIALS[number];
  complexity: typeof COMPLEXITIES[number];
  colorCode: string;
  colorSystem: "RAL" | "NCS" | "PANTONE" | "CUSTOM" | "";
  glossLevel: "MATT" | "SEMI_GLOSS" | "GLOSSY" | "HIGH_GLOSS" | "";
  applicationArea: "INDOOR" | "OUTDOOR" | "BOTH" | "";
  unitPriceCHF: number | null;
  notes: string;
  steps: StepDraft[];
}

export interface OrderWizardInitial {
  core: OrderCoreFormData & {
    /** Override raw dates as ISO strings for input[type=date]/date-time. */
    receivedAtIso?: string;
    promisedAtIso?: string;
    internalDeadlineIso?: string | null;
  };
  items: OrderItemFormData[];
  orderId: string;
}

interface Props {
  mode: "create" | "edit";
  customers: CustomerOption[];
  templates: TemplateOption[];
  processResources: Record<ProcessCode, {
    skill: SkillCode;
    machine: MachineType | null;
    defaultWaitMinutes: number;
  }>;
  initial?: OrderWizardInitial;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Defaults
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeEmptyItem(position: number): ItemDraft {
  return {
    cid: `c${Math.random().toString(36).slice(2, 9)}`,
    position,
    description: "",
    quantity: 1,
    surfaceM2: 1,
    weightKg: null,
    thicknessMm: null,
    material: "STEEL_S235",
    complexity: "NORMAL",
    colorCode: "",
    colorSystem: "",
    glossLevel: "",
    applicationArea: "",
    unitPriceCHF: null,
    notes: "",
    steps: [],
  };
}

function isoDate(d: Date | undefined | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function OrderWizard({
  mode,
  customers,
  templates,
  processResources,
  initial,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // â”€â”€ core â”€â”€
  const [customerId, setCustomerId] = useState(initial?.core.customerId ?? "");
  const [contactPersonId, setContactPersonId] = useState(initial?.core.contactPersonId ?? "");
  const [shippingAddressId, setShippingAddressId] = useState(
    initial?.core.shippingAddressId ?? "",
  );
  const [billingAddressId, setBillingAddressId] = useState(
    initial?.core.billingAddressId ?? "",
  );
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>(
    initial?.core.priority ?? "NORMAL",
  );
  const [receivedAt, setReceivedAt] = useState<string>(
    initial?.core.receivedAtIso ?? isoDate(new Date()),
  );
  const [promisedAt, setPromisedAt] = useState<string>(
    initial?.core.promisedAtIso ?? todayPlus(14),
  );
  const [internalDeadline, setInternalDeadline] = useState<string>(
    initial?.core.internalDeadlineIso ?? "",
  );
  const [notes, setNotes] = useState(initial?.core.notes ?? "");
  const [customerNotes, setCustomerNotes] = useState(initial?.core.customerNotes ?? "");

  // â”€â”€ items â”€â”€
  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (initial?.items?.length) {
      return initial.items.map((it, i) => ({
        cid: `c${i}-${Math.random().toString(36).slice(2, 6)}`,
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        surfaceM2: it.surfaceM2,
        weightKg: it.weightKg ?? null,
        thicknessMm: it.thicknessMm ?? null,
        material: it.material,
        complexity: it.complexity,
        colorCode: it.colorCode ?? "",
        colorSystem: (it.colorSystem ?? "") as ItemDraft["colorSystem"],
        glossLevel: (it.glossLevel ?? "") as ItemDraft["glossLevel"],
        applicationArea: (it.applicationArea ?? "") as ItemDraft["applicationArea"],
        unitPriceCHF: it.unitPriceCHF ?? null,
        notes: it.notes ?? "",
        steps: it.steps.map((s) => ({
          sequence: s.sequence,
          processCode: s.processCode,
          machineTypeRequired: s.machineTypeRequired ?? null,
          skillRequired: s.skillRequired,
          estimatedMinutes: s.estimatedMinutes,
          waitMinutesAfter: s.waitMinutesAfter,
          notes: s.notes ?? "",
        })),
      }));
    }
    return [makeEmptyItem(10)];
  });

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  // â”€â”€ item helpers â”€â”€
  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    const nextPos = items.length === 0 ? 10 : Math.max(...items.map((i) => i.position)) + 10;
    setItems((prev) => [...prev, makeEmptyItem(nextPos)]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) {
      alert("At least one position required.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // â”€â”€ steps inside an item â”€â”€
  const updateStep = (itemIdx: number, stepIdx: number, patch: Partial<StepDraft>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const steps = it.steps.map((s, j) => (j === stepIdx ? { ...s, ...patch } : s));
        return { ...it, steps };
      }),
    );
  };

  const moveStep = (itemIdx: number, stepIdx: number, dir: -1 | 1) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const next = [...it.steps];
        const target = stepIdx + dir;
        if (target < 0 || target >= next.length) return it;
        [next[stepIdx], next[target]] = [next[target], next[stepIdx]];
        // re-sequence in 10 increments
        return { ...it, steps: next.map((s, k) => ({ ...s, sequence: (k + 1) * 10 })) };
      }),
    );
  };

  const addStep = (itemIdx: number) => {
    const code: ProcessCode = "MASKING";
    const r = processResources[code];
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const seq = it.steps.length === 0 ? 10 : Math.max(...it.steps.map((s) => s.sequence)) + 10;
        return {
          ...it,
          steps: [
            ...it.steps,
            {
              sequence: seq,
              processCode: code,
              machineTypeRequired: r.machine,
              skillRequired: r.skill,
              estimatedMinutes: 0,
              waitMinutesAfter: r.defaultWaitMinutes,
              notes: "",
            },
          ],
        };
      }),
    );
  };

  const removeStep = (itemIdx: number, stepIdx: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        return {
          ...it,
          steps: it.steps
            .filter((_, j) => j !== stepIdx)
            .map((s, k) => ({ ...s, sequence: (k + 1) * 10 })),
        };
      }),
    );
  };

  const onProcessCodeChange = (itemIdx: number, stepIdx: number, code: ProcessCode) => {
    const r = processResources[code];
    updateStep(itemIdx, stepIdx, {
      processCode: code,
      machineTypeRequired: r.machine,
      skillRequired: r.skill,
      // Don't reset wait if user has customised it â€” but if it's still the
      // current-default, adopt the new default.
      waitMinutesAfter: r.defaultWaitMinutes,
    });
  };

  const applyTemplate = (itemIdx: number, templateId: string) => {
    if (!templateId) return;
    start(async () => {
      try {
        const skeletons = await applyProcessTemplate({ templateId });
        setItems((prev) =>
          prev.map((it, i) =>
            i === itemIdx
              ? {
                  ...it,
                  steps: skeletons.map((s) => ({
                    sequence: s.sequence,
                    processCode: s.processCode,
                    machineTypeRequired: s.machineTypeRequired,
                    skillRequired: s.skillRequired,
                    estimatedMinutes: 0,
                    waitMinutesAfter: s.waitMinutesAfter,
                    notes: "",
                  })),
                }
              : it,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error applying the template.");
      }
    });
  };

  // Recommender â€” suggests steps, user decides whether to accept.
  const [suggestion, setSuggestion] = useState<{
    itemIdx: number;
    steps: {
      sequence: number;
      processCode: ProcessCode;
      machineTypeRequired: MachineType | null;
      skillRequired: SkillCode;
      waitMinutesAfter: number;
      rationale: string;
    }[];
    warnings: string[];
  } | null>(null);

  const requestSuggestion = (itemIdx: number, mode: "WET_PAINT" | "POWDER") => {
    const it = items[itemIdx];
    if (!it.applicationArea) {
      setError("Select application area (Indoor/Outdoor) for recommendation.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const r = await recommendOrderProcessSteps({
          material: it.material,
          complexity: it.complexity,
          applicationArea: it.applicationArea || null,
          glossLevel: it.glossLevel || null,
          colorSystem: it.colorSystem || null,
          coatingMode: mode,
        });
        setSuggestion({ itemIdx, steps: r.steps, warnings: r.warnings });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error getting suggestion.");
      }
    });
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === suggestion.itemIdx
          ? {
              ...it,
              steps: suggestion.steps.map((s) => ({
                sequence: s.sequence,
                processCode: s.processCode,
                machineTypeRequired: s.machineTypeRequired,
                skillRequired: s.skillRequired,
                estimatedMinutes: 0,
                waitMinutesAfter: s.waitMinutesAfter,
                notes: s.rationale,
              })),
            }
          : it,
      ),
    );
    setSuggestion(null);
  };

  // â”€â”€ submit â”€â”€
  const submit = () => {
    setError(null);
    if (items.some((it) => it.steps.length === 0)) {
      setError("Each position needs at least one process step.");
      return;
    }

    const payload = {
      core: {
        customerId,
        contactPersonId: contactPersonId || undefined,
        shippingAddressId: shippingAddressId || undefined,
        billingAddressId: billingAddressId || undefined,
        priority,
        receivedAt: new Date(receivedAt),
        promisedAt: new Date(promisedAt),
        internalDeadline: internalDeadline ? new Date(internalDeadline) : null,
        notes: notes || undefined,
        customerNotes: customerNotes || undefined,
      },
      items: items.map((it) => ({
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        surfaceM2: it.surfaceM2,
        weightKg: it.weightKg,
        thicknessMm: it.thicknessMm,
        material: it.material,
        complexity: it.complexity,
        colorCode: it.colorCode || undefined,
        colorSystem: it.colorSystem || null,
        glossLevel: it.glossLevel || null,
        applicationArea: it.applicationArea || null,
        unitPriceCHF: it.unitPriceCHF,
        notes: it.notes || undefined,
        steps: it.steps.map((s) => ({
          sequence: s.sequence,
          processCode: s.processCode,
          machineTypeRequired: s.machineTypeRequired,
          skillRequired: s.skillRequired,
          estimatedMinutes: s.estimatedMinutes,
          waitMinutesAfter: s.waitMinutesAfter,
          notes: s.notes || undefined,
        })),
      })),
    };

    start(async () => {
      try {
        if (mode === "create") {
          const r = await createOrder(payload);
          router.push(`/admin/orders/${r.id}`);
        } else if (mode === "edit" && initial) {
          await updateDraftOrder(initial.orderId, payload);
          router.refresh();
          router.push(`/admin/orders/${initial.orderId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Render
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="space-y-6">
      {/* â”€â”€ Step 1: Header â”€â”€ */}
      <section className="space-y-3">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          1. Header
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Customer *</Label>
            <Select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setContactPersonId("");
                setShippingAddressId("");
                setBillingAddressId("");
              }}
            >
              <option value="">â€” Select customer â€”</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerNumber} Â· {c.label}
                </option>
              ))}
            </Select>
          </div>

          {customer && (
            <>
              <div className="space-y-1">
                <Label>Contact person</Label>
                <Select
                  value={contactPersonId}
                  onChange={(e) => setContactPersonId(e.target.value)}
                >
                  <option value="">â€” none â€”</option>
                  {customer.contacts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.label}
                      {ct.isPrimary ? " (primary)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Shipping address</Label>
                <Select
                  value={shippingAddressId}
                  onChange={(e) => setShippingAddressId(e.target.value)}
                >
                  <option value="">â€” keine â€”</option>
                  {customer.addresses
                    .filter((a) => a.type === "SHIPPING" || a.type === "BOTH")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Billing address</Label>
                <Select
                  value={billingAddressId}
                  onChange={(e) => setBillingAddressId(e.target.value)}
                >
                  <option value="">â€” keine â€”</option>
                  {customer.addresses
                    .filter((a) => a.type === "BILLING" || a.type === "BOTH")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Received date *</Label>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Delivery date (external) *</Label>
            <Input
              type="date"
              value={promisedAt}
              onChange={(e) => setPromisedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Internal deadline</Label>
            <Input
              type="date"
              value={internalDeadline}
              onChange={(e) => setInternalDeadline(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof PRIORITIES[number])}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p === "EXPRESS" ? "Express (surcharge!)" : p}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Internal notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for workshop / scheduling"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Customer notes (on order confirmation)</Label>
            <Textarea
              rows={2}
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="e.g. Please deliver with protective film"
            />
          </div>
        </div>
      </section>

      {/* â”€â”€ Step 2: Items â”€â”€ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
            2. Items
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Add position
          </Button>
        </div>

        {items.map((it, idx) => (
          <Card key={it.cid} className="border-l-4 border-l-blue-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">
                Pos. {it.position}
                {it.description && (
                  <span className="ml-2 text-muted-foreground font-normal">
                    â€” {it.description}
                  </span>
                )}
              </CardTitle>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                aria-label="Remove position"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>Pos.-Nr.</Label>
                  <Input
                    type="number"
                    value={it.position}
                    min={1}
                    onChange={(e) =>
                      updateItem(idx, { position: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1 col-span-2 md:col-span-3">
                  <Label>Description *</Label>
                  <Input
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="e.g. Galvanized railing bars"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      updateItem(idx, { quantity: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Surface (mÂ²) *</Label>
                  <Input
                    type="number"
                    step={0.01}
                    min={0.001}
                    value={it.surfaceM2}
                    onChange={(e) =>
                      updateItem(idx, { surfaceM2: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={it.weightKg ?? ""}
                    onChange={(e) =>
                      updateItem(idx, {
                        weightKg: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Thickness (mm)</Label>
                  <Input
                    type="number"
                    step={0.1}
                    value={it.thicknessMm ?? ""}
                    onChange={(e) =>
                      updateItem(idx, {
                        thicknessMm: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Material *</Label>
                  <Select
                    value={it.material}
                    onChange={(e) =>
                      updateItem(idx, { material: e.target.value as ItemDraft["material"] })
                    }
                  >
                    {MATERIALS.map((m) => (
                      <option key={m} value={m}>
                        {MATERIAL_LABEL[m]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Complexity</Label>
                  <Select
                    value={it.complexity}
                    onChange={(e) =>
                      updateItem(idx, { complexity: e.target.value as ItemDraft["complexity"] })
                    }
                  >
                    {COMPLEXITIES.map((c) => (
                      <option key={c} value={c}>
                        {COMPLEXITY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Color system</Label>
                  <Select
                    value={it.colorSystem}
                    onChange={(e) =>
                      updateItem(idx, {
                        colorSystem: e.target.value as ItemDraft["colorSystem"],
                      })
                    }
                  >
                    <option value="">â€”</option>
                    {(Object.keys(COLOR_SYSTEM_LABEL) as Array<keyof typeof COLOR_SYSTEM_LABEL>).map((k) => (
                      <option key={k} value={k}>
                        {COLOR_SYSTEM_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Color code</Label>
                  <Input
                    value={it.colorCode}
                    onChange={(e) => updateItem(idx, { colorCode: e.target.value })}
                    placeholder="RAL 9005"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Gloss level</Label>
                  <Select
                    value={it.glossLevel}
                    onChange={(e) =>
                      updateItem(idx, { glossLevel: e.target.value as ItemDraft["glossLevel"] })
                    }
                  >
                    <option value="">â€”</option>
                    {(Object.keys(GLOSS_LEVEL_LABEL) as Array<keyof typeof GLOSS_LEVEL_LABEL>).map((k) => (
                      <option key={k} value={k}>
                        {GLOSS_LEVEL_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>
                    Application *{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      (Indoor/Outdoor)
                    </span>
                  </Label>
                  <Select
                    value={it.applicationArea}
                    onChange={(e) =>
                      updateItem(idx, {
                        applicationArea: e.target.value as ItemDraft["applicationArea"],
                      })
                    }
                  >
                    <option value="">â€” select â€”</option>
                    <option value="INDOOR">Indoor</option>
                    <option value="OUTDOOR">Outdoor</option>
                    <option value="BOTH">Indoor + Outdoor</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unit price (CHF)</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={it.unitPriceCHF ?? ""}
                    onChange={(e) =>
                      updateItem(idx, {
                        unitPriceCHF:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="optional"
                  />
                </div>
                <div className="space-y-1 col-span-2 md:col-span-4">
                  <Label>Item notes</Label>
                  <Textarea
                    rows={1}
                    value={it.notes}
                    onChange={(e) => updateItem(idx, { notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-habb-ink" />
                    <span className="text-sm font-medium">Process flow</span>
                    <Badge variant="secondary">{it.steps.length} step(s)</Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      defaultValue=""
                      onChange={(e) => {
                        applyTemplate(idx, e.target.value);
                        e.target.value = "";
                      }}
                      className="w-44"
                    >
                      <option value="">â€” Template â€”</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || !it.applicationArea}
                      onClick={() => requestSuggestion(idx, "WET_PAINT")}
                      title={
                        it.applicationArea
                          ? "Paint shop recommendation for wet paint"
                          : "Select application (Indoor/Outdoor) first"
                      }
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Paint recommendation
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || !it.applicationArea}
                      onClick={() => requestSuggestion(idx, "POWDER")}
                      title={
                        it.applicationArea
                          ? "Paint shop recommendation for powder coating"
                          : "Select application (Indoor/Outdoor) first"
                      }
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Powder recommendation
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => addStep(idx)}>
                      <Plus className="h-4 w-4 mr-1" /> Step
                    </Button>
                  </div>
                </div>

                {it.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No steps. Apply a template or add manually.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {it.steps.map((s, sIdx) => (
                      <div
                        key={sIdx}
                        className="grid grid-cols-12 gap-2 items-end bg-card rounded p-2 border"
                      >
                        <div className="col-span-1 flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveStep(idx, sIdx, -1)}
                            disabled={sIdx === 0}
                            className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <span className="text-xs tabular-nums font-mono">
                            {s.sequence}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveStep(idx, sIdx, 1)}
                            disabled={sIdx === it.steps.length - 1}
                            className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="col-span-3">
                          <Label className="text-xs">Process step</Label>
                          <Select
                            value={s.processCode}
                            onChange={(e) =>
                              onProcessCodeChange(idx, sIdx, e.target.value as ProcessCode)
                            }
                            className="text-xs"
                          >
                            {/* Grouped by stage â€” Preparation â†’ Sandblasting â†’ â€¦ */}
                            {(["Preparation", "Sandblasting", "Wet Painting", "Powder Coating", "Post-processing"] as const).map((group) => (
                              <optgroup key={group} label={group}>
                                {PROCESS_CODES.filter((c) => PROCESS_GROUP[c] === group).map((c) => (
                                  <option key={c} value={c}>
                                    {PROCESS_LABEL[c]}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Worker</Label>
                          <Select
                            value={s.skillRequired}
                            onChange={(e) =>
                              updateStep(idx, sIdx, {
                                skillRequired: e.target.value as SkillCode,
                              })
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
                              updateStep(idx, sIdx, {
                                machineTypeRequired:
                                  (e.target.value as MachineType) || null,
                              })
                            }
                            className="text-xs"
                          >
                            <option value="">â€” keine â€”</option>
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
                            value={s.waitMinutesAfter}
                            onChange={(e) =>
                              updateStep(idx, sIdx, {
                                waitMinutesAfter: Number(e.target.value),
                              })
                            }
                            className="text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeStep(idx, sIdx)}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            aria-label="Remove step"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* â”€â”€ Errors + Submit â”€â”€ */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          Time and price calculation happens on save (Status: Draft).
          Snapshot frozen from <strong>Confirmed</strong>.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={pending}
          >Cancel</Button>
          <Button onClick={submit} disabled={pending || !customerId}>
            {pending ? "Saving..." : mode === "create" ? "Create order" : "Save"}
          </Button>
        </div>
      </div>

      {/* Paint shop recommendation â€” Vorschau-Modal */}
      {suggestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSuggestion(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-habb-ink" />
                  Paint shop recommendation
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Suggestion based on material + application + gloss.
                  Applying replaces the current steps â€” editable afterwards.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSuggestion(null)}
                className="p-1 rounded hover:bg-habb-paper text-muted-foreground"
                aria-label="Close"
              >
                âœ•
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {suggestion.warnings.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 space-y-1">
                  {suggestion.warnings.map((w, i) => (
                    <div key={i}>âš  {w}</div>
                  ))}
                </div>
              )}
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Suggested steps ({suggestion.steps.length})
              </div>
              <ol className="space-y-2">
                {suggestion.steps.map((s) => (
                  <li
                    key={s.sequence}
                    className="rounded border bg-habb-paper px-3 py-2 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        Step {s.sequence}
                      </span>
                      <span className="font-medium">
                        {PROCESS_LABEL[s.processCode]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {SKILL_LABEL[s.skillRequired]}
                        {s.machineTypeRequired
                          ? ` Â· ${MACHINE_LABEL[s.machineTypeRequired]}`
                          : ""}
                        {s.waitMinutesAfter > 0
                          ? ` Â· ${s.waitMinutesAfter} Min Wartezeit`
                          : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 italic">
                      {s.rationale}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t bg-habb-paper rounded-b-xl">
              <Button variant="ghost" onClick={() => setSuggestion(null)}>
                Discard
              </Button>
              <Button onClick={acceptSuggestion}>
                {suggestion.steps.length} steps accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
