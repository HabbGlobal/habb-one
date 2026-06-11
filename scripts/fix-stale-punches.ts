// Cleans up punches that landed on the wrong day due to the timezone bug
// in `localMidnightUtc` (now fixed). For every TimeEntry we drop punches
// whose CH-local date doesn't match the entry's CH-local workDate, then
// recompute aggregates and status.
//
// Run with:  npx tsx scripts/fix-stale-punches.ts

import { PrismaClient, type TimeEntryStatus } from "@prisma/client";
import { computeWorkedTime } from "../lib/time/calc";
import { localDateString } from "../lib/time/zone";

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.timeEntry.findMany({
    include: { punches: true, breaks: true, employee: true },
    orderBy: { workDate: "asc" },
  });

  let movedOrDeleted = 0;
  let recomputed = 0;

  for (const entry of entries) {
    const entryDate = localDateString(entry.workDate);
    const stalePunches = entry.punches.filter(
      (p) => localDateString(p.occurredAt) !== entryDate
    );

    for (const punch of stalePunches) {
      console.log(
        `Stale punch: ${entry.employee.lastName} ${entry.employee.firstName} ` +
        `entry=${entryDate} punch=${localDateString(punch.occurredAt)} ` +
        `${punch.type}@${punch.occurredAt.toISOString()} → deleting`
      );
      await prisma.timePunch.delete({ where: { id: punch.id } });
      movedOrDeleted++;
    }

    // Recompute aggregates for every entry just to be safe.
    const fresh = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { punches: true, breaks: true },
    });
    const result = computeWorkedTime({
      punches: fresh.punches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
      breaks: fresh.breaks.map((b) => ({ startedAt: b.startedAt, endedAt: b.endedAt })),
    });
    let status: TimeEntryStatus = "EMPTY";
    if (fresh.punches.length > 0) {
      if (result.isOnBreak) status = "ON_BREAK";
      else if (result.isOpen) status = "OPEN";
      else status = "CLOSED";
    }
    const sorted = [...fresh.punches].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
    );
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status,
        workedMinutes: result.workedMinutes,
        breakMinutes: result.breakMinutes,
        firstIn: sorted.find((p) => p.type === "CLOCK_IN")?.occurredAt ?? null,
        lastOut:
          [...sorted].reverse().find((p) => p.type === "CLOCK_OUT")?.occurredAt ?? null,
      },
    });
    recomputed++;
  }

  console.log(`\n✓ Done. ${movedOrDeleted} stale punches removed, ${recomputed} entries recomputed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
