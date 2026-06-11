/**
 * Sanierung Tenant-Isolations-Defekt: SystemParameter.updatedById und
 * ParameterChangeLog.changedById zeigen durch die alte Per-Tenant-
 * Migration teils auf User FREMDER Firmen. Dieser Backfill hängt jede
 * solche Zeile auf einen User der EIGENEN companyId um.
 *
 * Ersatz-User pro Firma: höchste Rolle zuerst (SUPERADMIN > ADMIN >
 * Rest), aktive vor gelöschten, dann ältester (= i.d.R. Gründungs-
 * Admin). Idempotent — Zweitlauf findet 0.
 *
 * Run: node_modules/.bin/tsx scripts/backfill-param-updatedby.ts
 */
import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const ROLE_PRIO: Record<string, number> = { SUPERADMIN: 0, ADMIN: 1 };
const prio = (r: UserRole) => ROLE_PRIO[r] ?? 2;

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  let paramsFixed = 0;
  let logsFixed = 0;

  for (const c of companies) {
    const ownUsers = await prisma.user.findMany({
      where: { companyId: c.id },
      select: { id: true, role: true, deletedAt: true, createdAt: true },
    });
    if (ownUsers.length === 0) {
      console.log(`! ${c.name}: KEIN eigener User — übersprungen (manuell prüfen)`);
      continue;
    }
    const ownIds = ownUsers.map((u) => u.id);
    const replacement = [...ownUsers].sort((a, b) => {
      const d = (a.deletedAt ? 1 : 0) - (b.deletedAt ? 1 : 0);
      if (d !== 0) return d;
      const p = prio(a.role) - prio(b.role);
      if (p !== 0) return p;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0].id;

    const p = await prisma.systemParameter.updateMany({
      where: { companyId: c.id, updatedById: { notIn: ownIds } },
      data: { updatedById: replacement },
    });
    const l = await prisma.parameterChangeLog.updateMany({
      where: { parameterCompanyId: c.id, changedById: { notIn: ownIds } },
      data: { changedById: replacement },
    });

    if (p.count || l.count) {
      console.log(
        `✓ ${c.name}: ${p.count} SystemParameter + ${l.count} ChangeLog → eigener User ${replacement}`,
      );
    } else {
      console.log(`· ${c.name}: bereits sauber (0)`);
    }
    paramsFixed += p.count;
    logsFixed += l.count;
  }

  console.log(
    `\nFertig: ${paramsFixed} SystemParameter + ${logsFixed} ParameterChangeLog umgehängt.`,
  );

  // Verifikation: gibt es noch firmenübergreifende Zeiger?
  const allUsers = await prisma.user.findMany({
    select: { id: true, companyId: true },
  });
  const userCompany = new Map(allUsers.map((u) => [u.id, u.companyId]));
  const sp = await prisma.systemParameter.findMany({
    select: { companyId: true, updatedById: true },
  });
  const stillBad = sp.filter(
    (r) => userCompany.get(r.updatedById) !== r.companyId,
  ).length;
  console.log(
    stillBad === 0
      ? "Verifikation OK: kein firmenübergreifender SystemParameter-Zeiger mehr."
      : `WARNUNG: noch ${stillBad} firmenübergreifende SystemParameter-Zeiger (Firmen ohne eigene User?).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
