"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { addCorrectionPunch } from "../actions";

export function CorrectionForm({
  timeEntryId,
  employeeId,
  workDate,
}: {
  timeEntryId: string;
  employeeId: string;
  workDate: string;
}) {
  const t = useTranslations("timeEntries");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [type, setType] = useState<"CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END">("CLOCK_IN");
  const [time, setTime] = useState("08:00");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("correctionReason"));
      return;
    }
    start(async () => {
      try {
        await addCorrectionPunch({
          timeEntryId,
          employeeId,
          workDate,
          type,
          time,
          reason,
        });
        router.refresh();
        setReason("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div className="space-y-1">
        <Label>{t("punchType")}</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="CLOCK_IN">{t("in")}</option>
          <option value="CLOCK_OUT">{t("out")}</option>
          <option value="BREAK_START">{t("breakStart")}</option>
          <option value="BREAK_END">{t("breakEnd")}</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{tCommon("time")}</Label>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label>{t("correctionReason")}</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      {error && <p className="md:col-span-4 text-destructive text-sm">{error}</p>}
      <div className="md:col-span-4">
        <Button type="submit" disabled={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
