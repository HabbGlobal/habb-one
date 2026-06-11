"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { updateHoliday } from "../actions";

export function HolidayEditForm({
  id,
  initial,
}: {
  id: string;
  initial: { date: string; nameDe: string; nameEn: string; fraction: number };
}) {
  const t = useTranslations("holidays");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await updateHoliday(id, data);
            router.push("/admin/holidays");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Fehler beim Speichern");
          }
        });
      }}
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <Field label={tCommon("date")}>
        <Input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value })} required />
      </Field>
      <Field label={t("fraction")}>
        <Input
          type="number"
          step={0.5}
          min={0}
          max={1}
          value={data.fraction}
          onChange={(e) => setData({ ...data, fraction: Number(e.target.value) })}
        />
      </Field>
      <Field label="DE">
        <Input value={data.nameDe} onChange={(e) => setData({ ...data, nameDe: e.target.value })} required />
      </Field>
      <Field label="EN">
        <Input value={data.nameEn} onChange={(e) => setData({ ...data, nameEn: e.target.value })} required />
      </Field>
      {error && <p className="md:col-span-2 text-sm text-destructive">{error}</p>}
      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {tCommon("save")}
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
