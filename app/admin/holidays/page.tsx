import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HolidayForm } from "./HolidayForm";
import { HolidayList } from "./HolidayList";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import { lifecycleFilter, parseView, type LifecycleView } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("holidays");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;
  const year = Number(sp.year || new Date().getFullYear());
  const view: LifecycleView = parseView(sp.view);

  const yearWhere = {
    companyId: session.user.companyId,
    date: {
      gte: new Date(`${year}-01-01`),
      lt: new Date(`${year + 1}-01-01`),
    },
  };

  const [holidays, active, archived, deleted] = await Promise.all([
    prisma.holiday.findMany({
      where: { ...yearWhere, ...lifecycleFilter(view) },
      orderBy: { date: "asc" },
    }),
    prisma.holiday.count({ where: { ...yearWhere, ...lifecycleFilter("active") } }),
    prisma.holiday.count({ where: { ...yearWhere, ...lifecycleFilter("archived") } }),
    prisma.holiday.count({ where: { ...yearWhere, ...lifecycleFilter("deleted") } }),
  ]);
  const counts = { active, archived, deleted };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {t("title")} {year}
        </h1>
        <form className="flex items-center gap-2" method="get">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          <input
            type="number"
            name="year"
            defaultValue={year}
            className="h-10 w-24 rounded-md border border-input px-3 text-sm"
          />
          <button className="text-sm hover:underline">{tCommon("filter")}</button>
        </form>
      </div>

      <LifecycleTabs
        baseHref={`/admin/holidays${year !== new Date().getFullYear() ? `?year=${year}` : ""}`}
        current={view}
        counts={counts}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HolidayForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2">
          <HolidayList
            view={view}
            rows={holidays.map((h) => ({
              id: h.id,
              date: h.date,
              nameDe: h.nameDe,
              nameEn: h.nameEn,
              fraction: h.fraction,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
