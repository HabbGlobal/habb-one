import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    orderBy: { employeeNumber: "asc" },
  });

  for (const e of employees) {
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: e.id },
      include: { punches: { orderBy: { occurredAt: "asc" } } },
      orderBy: { workDate: "desc" },
    });
    console.log(`\n=== ${e.employeeNumber} ${e.lastName} ${e.firstName} (${e.id.slice(0, 6)}) ===`);
    for (const entry of entries) {
      const date = entry.workDate.toISOString().slice(0, 10);
      const punchSummary = entry.punches
        .map((p) => `${p.type}@${p.occurredAt.toISOString().slice(11, 19)}`)
        .join(" ");
      console.log(`  ${date} workDate=${entry.workDate.toISOString()} status=${entry.status} worked=${entry.workedMinutes}m   punches: ${punchSummary || "(none)"}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
