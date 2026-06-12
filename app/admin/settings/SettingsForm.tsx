"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { updateCompanySettings } from "./actions";
import { COUNTRY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/company-locale";

export interface CompanyFormData {
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  defaultWeeklyHours: number;
  defaultVacationDaysYear: number;
  defaultBreakMinutes: number;
  roundingMinutes: number;
  maxDailyHours: number;
  maxWeeklyHours: number;
  highOvertimeHours: number;
  defaultLanguage: "de" | "en";
}

export function SettingsForm({ initial }: { initial: CompanyFormData }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof CompanyFormData>(k: K, v: CompanyFormData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          await updateCompanySettings(data);
          setSaved(true);
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t("company")}>
          <Input value={data.name} onChange={(e) => update("name", e.target.value)} required />
        </Field>
        <Field label="Address">
          <Input value={data.address} onChange={(e) => update("address", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={data.city} onChange={(e) => update("city", e.target.value)} />
        </Field>
        <Field label="Country">
          <Select value={data.country} onChange={(e) => update("country", e.target.value)}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} ({c.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={data.timezone} onChange={(e) => update("timezone", e.target.value)}>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.zone} value={tz.zone}>
                {tz.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("defaultLanguage")}>
          <Select value={data.defaultLanguage} onChange={(e) => update("defaultLanguage", e.target.value as "de" | "en")}>
            <option value="de">{tCommon("german")}</option>
            <option value="en">{tCommon("english")}</option>
          </Select>
        </Field>
      </div>

      <h3 className="font-semibold pt-4">{t("defaults")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Weekly target hours">
          <Input type="number" step={0.1} value={data.defaultWeeklyHours} onChange={(e) => update("defaultWeeklyHours", Number(e.target.value))} />
        </Field>
        <Field label="Vacation entitlement (days)">
          <Input type="number" step={0.5} value={data.defaultVacationDaysYear} onChange={(e) => update("defaultVacationDaysYear", Number(e.target.value))} />
        </Field>
        <Field label="Default break (min)">
          <Input type="number" step={5} value={data.defaultBreakMinutes} onChange={(e) => update("defaultBreakMinutes", Number(e.target.value))} />
        </Field>
        <Field label={t("rounding")}>
          <Select value={data.roundingMinutes} onChange={(e) => update("roundingMinutes", Number(e.target.value))}>
            <option value={0}>0 (keine)</option>
            <option value={5}>5</option>
            <option value={15}>15</option>
          </Select>
        </Field>
      </div>

      <h3 className="font-semibold pt-4">{t("warnings")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label={t("maxDailyHours")}>
          <Input type="number" step={0.1} value={data.maxDailyHours} onChange={(e) => update("maxDailyHours", Number(e.target.value))} />
        </Field>
        <Field label={t("maxWeeklyHours")}>
          <Input type="number" step={0.1} value={data.maxWeeklyHours} onChange={(e) => update("maxWeeklyHours", Number(e.target.value))} />
        </Field>
        <Field label={t("highOvertimeHours")}>
          <Input type="number" step={0.5} value={data.highOvertimeHours} onChange={(e) => update("highOvertimeHours", Number(e.target.value))} />
        </Field>
      </div>

      {saved && <p className="text-sm text-green-700">✓ Saved.</p>}

      <Button type="submit" disabled={pending}>{tCommon("save")}</Button>
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
