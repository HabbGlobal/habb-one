// Reports-Hub. Eine Übersichtsseite mit allen verfügbaren Berichten —
// gruppiert nach Personal (bestehend) und ERP (Phase 5b).

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Calculator,
  Cog,
  Users,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { ReportControls } from "./ReportControls";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("reports");

  const employees = await prisma.employee.findMany({
    where: { companyId: session.user.companyId },
    orderBy: { lastName: "asc" },
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          Auswertungen für Personal, Aufträge und Maschinen — Excel-/PDF-Export.
        </p>
      </div>

      {/* ── ERP-Reports ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-medium">
          Auftrags- &amp; Werkstatt-Auswertungen
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ReportCard
            href="/admin/reports/calculation"
            icon={<Calculator className="h-5 w-5" />}
            title="Kalkulations-Genauigkeit"
            description="Schätzung vs. Ist vs. Verrechnet pro Auftrag — finde heraus wo wir uns systematisch verschätzen."
          />
          <ReportCard
            href="/admin/reports/machine-utilization"
            icon={<Cog className="h-5 w-5" />}
            title="Maschinen-Auslastung"
            description="Gebuchte vs. verfügbare Stunden pro Maschine. Zeigt Engpässe und Leerlauf."
          />
          <ReportCard
            href="/admin/reports/employee-productivity"
            icon={<Users className="h-5 w-5" />}
            title="Mitarbeiter-Produktivität"
            description="Scan-Zeiten pro Mitarbeiter:in, davon billable. Periode frei wählbar."
          />
        </div>
      </section>

      {/* ── Personal-Report (bestehender Monatsrapport) ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Personal-Auswertungen
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ReportCard
            href="/admin/reports/payroll"
            icon={<Users className="h-5 w-5" />}
            title="Personalabrechnung"
            description="Monats-Dashboard pro Mitarbeiter: Stammdaten, Stunden, Abwesenheiten, Ferien-Saldo. Excel + PDF Export."
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("monthly")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportControls
              defaultYear={now.getFullYear()}
              defaultMonth={now.getMonth() + 1}
              employees={employees.map((e) => ({
                id: e.id,
                label: `${e.lastName}, ${e.firstName} (${e.employeeNumber})`,
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReportCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="text-habb-ink">{icon}</div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </Link>
  );
}
