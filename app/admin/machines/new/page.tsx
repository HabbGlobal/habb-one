import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { ChevronLeft } from "lucide-react";
import { MachineForm } from "../MachineForm";

export default async function NewMachinePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "machines.write")) redirect("/admin/machines");

  const areas = await prisma.workArea.findMany({
    where: {
      companyId: session.user.companyId,
      archivedAt: null,
      deletedAt: null,
    },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin/machines"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to list
      </Link>
      <h1 className="text-2xl font-semibold">New Machine</h1>

      <MachineForm
        initial={{
          name: "",
          type: "BLAST_CABIN",
          workAreaId: null,
          maxLengthMm: null,
          maxWidthMm: null,
          maxHeightMm: null,
          maxWeightKg: null,
          chargeCapacityM2: null,
          isActive: true,
        }}
        areas={areas}
        mode={{ kind: "create" }}
      />
    </div>
  );
}
