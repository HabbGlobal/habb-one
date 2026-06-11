"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTranslations } from "next-intl";

interface Props {
  defaultYear: number;
  defaultMonth: number;
  employees: { id: string; label: string }[];
}

export function ReportControls({ defaultYear, defaultMonth, employees }: Props) {
  const t = useTranslations("reports");
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [employeeId, setEmployeeId] = useState("");

  const url = (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ year: String(year), month: String(month), format });
    if (employeeId) params.set("employeeId", employeeId);
    return `/api/reports/monthly?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label>Jahr</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Monat</Label>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>{t("selectEmployee")}</Label>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t("allEmployees")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={url("csv")}>{t("downloadCsv")}</a>
        </Button>
        <Button asChild variant="outline">
          <a href={url("xlsx")}>{t("downloadXlsx")}</a>
        </Button>
        <Button asChild variant="outline">
          <a href={url("pdf")}>{t("downloadPdf")}</a>
        </Button>
      </div>
    </div>
  );
}
