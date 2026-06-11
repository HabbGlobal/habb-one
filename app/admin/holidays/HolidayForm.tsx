"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { createHoliday } from "./actions";

export function HolidayForm() {
  const t = useTranslations("holidays");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    nameDe: "",
    nameEn: "",
    fraction: 1,
  });

  return (
    <form
      className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await createHoliday(form);
          setForm({ ...form, nameDe: "", nameEn: "" });
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label>{tCommon("date")}</Label>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
      </div>
      <div className="space-y-1">
        <Label>DE</Label>
        <Input value={form.nameDe} onChange={(e) => setForm({ ...form, nameDe: e.target.value })} required />
      </div>
      <div className="space-y-1">
        <Label>EN</Label>
        <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required />
      </div>
      <div className="space-y-1">
        <Label>{t("fraction")}</Label>
        <Input
          type="number"
          step={0.5}
          min={0}
          max={1}
          value={form.fraction}
          onChange={(e) => setForm({ ...form, fraction: Number(e.target.value) })}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {tCommon("save")}
      </Button>
    </form>
  );
}
