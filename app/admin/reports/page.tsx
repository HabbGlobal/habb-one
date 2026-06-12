// Reports hub. An overview page with all available reports —
// grouped by Personnel (existing) and ERP (phase 5b).

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
          Reports for personnel, orders, and machines — Excel/PDF export.
        </p>
      </div>

      {/* ── ERP-Reports ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-medium">
          Order &amp; workshop reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ReportCard
            href="/admin/reports/calculation"
            icon={<Calculator className="h-5 w-5" />}
            title="Calculation accuracy"
            description="Estimate vs. actual vs. billed per order — find out where we systematically miscalculate."
          />
          <ReportCard
            href="/admin/reports/machine-utilization"
            icon={<Cog className="h-5 w-5" />}
            title="Machine utilization"
            description="Booked vs. available hours per machine. Shows bottlenecks and idle time."
          />
          <ReportCard
            href="/admin/reports/employee-productivity"
            icon={<Users className="h-5 w-5" />}
            title="Employee productivity"
            description="Scan times per worker, of which billable. Period freely selectable."
          />
        </div>
      </section>

      {/* ── Personnel report (existing monthly report) ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Personnel reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ReportCard
            href="/admin/reports/payroll"
            icon={<Users className="h-5 w-5" />}
            title="Payroll"
            description="Monthly dashboard per employee: master data, hours, absences, vacation balance. Excel + PDF export."
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
