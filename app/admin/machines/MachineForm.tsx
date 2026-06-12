"use client";

// Maschinen-Form: erstellen / bearbeiten.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";
import { createMachine, updateMachine, type MachineCoreInput } from "./actions";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "BLAST_CABIN", label: "Sandstrahl-Kabine" },
  { value: "CHEM_BATH", label: "Chemie-Bad" },
  { value: "PAINT_CABIN", label: "Lackier-Kabine" },
  { value: "POWDER_CABIN", label: "Pulver-Kabine" },
  { value: "CURING_OVEN", label: "Aushärte-Ofen" },
  { value: "DRYING_OVEN", label: "Trocken-Ofen" },
];

interface AreaOption {
  id: string;
  name: string;
}

interface Initial {
  name: string;
  type: string;
  workAreaId: string | null;
  maxLengthMm: number | null;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  maxWeightKg: number | null;
  chargeCapacityM2: number | null;
  isActive: boolean;
}

interface Props {
  initial: Initial;
  areas: AreaOption[];
  mode: { kind: "create" } | { kind: "edit"; id: string };
}

export function MachineForm({ initial, areas, mode }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Initial>(initial);

  const update = <K extends keyof Initial>(key: K, value: Initial[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const payload: MachineCoreInput = {
          name: data.name,
          type: data.type as MachineCoreInput["type"],
          workAreaId: data.workAreaId || null,
          maxLengthMm: data.maxLengthMm ?? null,
          maxWidthMm: data.maxWidthMm ?? null,
          maxHeightMm: data.maxHeightMm ?? null,
          maxWeightKg: data.maxWeightKg ?? null,
          chargeCapacityM2: data.chargeCapacityM2 ?? null,
          isActive: data.isActive,
        };
        if (mode.kind === "create") {
          const r = await createMachine(payload);
          router.push(`/admin/machines/${r.id}`);
        } else {
          await updateMachine(mode.id, payload);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  const numOrNull = (s: string): number | null => {
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Master data</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Name *</Label>
            <Input
              value={data.name}
              onChange={(e) => update("name", e.target.value)}
              required
              maxLength={80}
              placeholder="z. B. Sandstrahl-1"
            />
          </div>
          <div className="space-y-1">
            <Label>Typ *</Label>
            <Select
              value={data.type}
              onChange={(e) => update("type", e.target.value)}
              required
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>
              Werkstatt-Bereich{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (für Personalplanung)
              </span>
            </Label>
            <Select
              value={data.workAreaId ?? ""}
              onChange={(e) => update("workAreaId", e.target.value || null)}
            >
              <option value="">— kein Bereich —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <div className="text-xs text-muted-foreground">
              Maschinen ohne Bereich lösen keinen Personal-Bedarf aus.
            </div>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              value={data.isActive ? "1" : "0"}
              onChange={(e) => update("isActive", e.target.value === "1")}
            >
              <option value="1">Active</option>
              <option value="0">Inaktiv (kann nicht eingeplant werden)</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Werkstückgrößen{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (max. mögliche Maße — leer = kein Limit)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label>Länge (mm)</Label>
            <Input
              type="number"
              min={0}
              value={data.maxLengthMm ?? ""}
              onChange={(e) => update("maxLengthMm", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Breite (mm)</Label>
            <Input
              type="number"
              min={0}
              value={data.maxWidthMm ?? ""}
              onChange={(e) => update("maxWidthMm", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Höhe (mm)</Label>
            <Input
              type="number"
              min={0}
              value={data.maxHeightMm ?? ""}
              onChange={(e) => update("maxHeightMm", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Gewicht (kg)</Label>
            <Input
              type="number"
              min={0}
              value={data.maxWeightKg ?? ""}
              onChange={(e) => update("maxWeightKg", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-2">
            <Label>
              Charge-Kapazität (m²){" "}
              <span className="text-xs text-muted-foreground font-normal">
                (für Öfen / Becken)
              </span>
            </Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={data.chargeCapacityM2 ?? ""}
              onChange={(e) =>
                update("chargeCapacityM2", numOrNull(e.target.value))
              }
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/machines">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4 mr-1" />
          {pending
            ? "Saving..."
            : mode.kind === "create"
              ? "Anlegen"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
