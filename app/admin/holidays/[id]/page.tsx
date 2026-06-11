import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HolidayEditForm } from "./HolidayEditForm";

export default async function HolidayEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("holidays");
  const tCommon = await getTranslations("common");

  const holiday = await prisma.holiday.findUnique({ where: { id } });
  if (!holiday || holiday.companyId !== session.user.companyId) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{tCommon("edit")} — {t("title")}</h1>
        <Link href="/admin/holidays" className="text-sm text-muted-foreground hover:underline">
          ← {tCommon("back")}
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{holiday.nameDe}</CardTitle>
        </CardHeader>
        <CardContent>
          <HolidayEditForm
            id={id}
            initial={{
              date: holiday.date.toISOString().slice(0, 10),
              nameDe: holiday.nameDe,
              nameEn: holiday.nameEn,
              fraction: holiday.fraction,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
