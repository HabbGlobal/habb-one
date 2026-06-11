"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { AbsenceForm } from "./AbsenceForm";

interface Props {
  employees: { id: string; name: string }[];
  types: { id: string; label: string }[];
}

export function NewAbsenceDialog({ employees, types }: Props) {
  const t = useTranslations("absences");
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t("new")}</Button>;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-lg max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{t("new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AbsenceForm
            employees={employees}
            types={types}
            mode={{ kind: "create" }}
            initial={{
              employeeId: employees[0]?.id ?? "",
              absenceTypeId: types[0]?.id ?? "",
              startDate: new Date().toISOString().slice(0, 10),
              endDate: new Date().toISOString().slice(0, 10),
              startHalfDay: false,
              endHalfDay: false,
              reason: "",
              status: "APPROVED",
            }}
            onDone={() => setOpen(false)}
          />
        </CardContent>
      </Card>
    </>
  );
}
