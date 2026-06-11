"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createWorkArea, updateWorkArea } from "./actions";

export interface AreaFormData {
  name: string;
  description: string;
  colorHex: string;
  sortOrder: number;
  minEmployeesPerDay: number | null;
  maxEmployeesPerDay: number | null;
}

export function AreaForm({
  initial,
  mode,
}: {
  initial: AreaFormData;
  mode: { kind: "create" } | { kind: "edit"; areaId: string };
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AreaFormData>(k: K, v: AreaFormData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            if (mode.kind === "create") await createWorkArea(data);
            else await updateWorkArea(mode.areaId, data);
            router.push("/admin/areas");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Fehler");
          }
        });
      }}
      className="space-y-3"
    >
      <Field label="Name">
        <Input value={data.name} onChange={(e) => update("name", e.target.value)} required />
      </Field>
      <Field label="Beschreibung (optional)">
        <Textarea
          rows={2}
          value={data.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Farbe">
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={data.colorHex}
              onChange={(e) => update("colorHex", e.target.value)}
              className="h-10 w-16 p-1"
            />
            <Input
              value={data.colorHex}
              onChange={(e) => update("colorHex", e.target.value)}
              maxLength={7}
              className="flex-1 font-mono"
            />
          </div>
        </Field>
        <Field label="Sortierung (kleiner = oben)">
          <Input
            type="number"
            min={0}
            max={999}
            value={data.sortOrder}
            onChange={(e) => update("sortOrder", Number(e.target.value || 0))}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min. Mitarbeitende pro Tag (leer = keine Vorgabe)">
          <Input
            type="number"
            min={1}
            max={99}
            value={data.minEmployeesPerDay ?? ""}
            onChange={(e) =>
              update("minEmployeesPerDay", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="leer = keine"
          />
        </Field>
        <Field label="Max. Mitarbeitende pro Tag (leer = unbegrenzt)">
          <Input
            type="number"
            min={1}
            max={99}
            value={data.maxEmployeesPerDay ?? ""}
            onChange={(e) =>
              update("maxEmployeesPerDay", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="leer = ∞"
          />
        </Field>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={pending}>Speichern</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Abbrechen
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
