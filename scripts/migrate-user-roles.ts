// One-shot migration: legacy UserRole values SECRETARY + TEAM_LEAD → PLANNER.
// Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const legacy = await prisma.user.findMany({
    where: { role: { in: ["SECRETARY", "TEAM_LEAD"] } },
    select: { id: true, email: true, role: true },
  });
  console.log(`→ Found ${legacy.length} legacy-role users.`);
  for (const u of legacy) {
    await prisma.user.update({ where: { id: u.id }, data: { role: "PLANNER" } });
    console.log(`  ${u.email}  (was ${u.role}) → PLANNER`);
  }
  console.log("✓ Done.");
}

main().finally(() => prisma.$disconnect());
