/**
 * Smoke-Test: verifiziert gegen die echte Produktions-DB, dass
 *   1. das UserPermission-Schema korrekt vorhanden ist
 *   2. ein End-to-End Save → Read → Effective-Permissions-Roundtrip
 *      funktioniert (Schreibe Test-Override → lese ihn zurück →
 *      verifiziere effective permissions → räume sauber auf)
 *
 * Nur lesend/aufräumend gegen einen REAL existierenden User; rollt
 * am Ende alles zurück (deleteMany), egal ob Erfolg oder Fehler.
 */

import { prisma } from "@/lib/prisma";
import {
  effectivePermissionsForUser,
  loadPermissionMatrix,
  hasPermission,
  invalidatePermissionMatrix,
  invalidateUserPermissionCache,
} from "@/lib/permissions";

async function main() {
  console.log("──────────────────────────────────────────────");
  console.log("Permissions-Roundtrip — Verifikation");
  console.log("──────────────────────────────────────────────\n");

  // 1) Schema-Check
  console.log("1) Schema-Check");
  const rolePermColumns = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; data_type: string }>
  >(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'RolePermission' AND table_schema = 'public'
     ORDER BY ordinal_position`,
  );
  const userPermColumns = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; data_type: string }>
  >(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'UserPermission' AND table_schema = 'public'
     ORDER BY ordinal_position`,
  );
  console.log(
    `   RolePermission: ${rolePermColumns.map((c) => c.column_name).join(", ")}`,
  );
  console.log(
    `   UserPermission: ${userPermColumns.map((c) => c.column_name).join(", ")}`,
  );
  if (userPermColumns.length === 0) {
    throw new Error("UserPermission-Tabelle existiert nicht!");
  }
  const requiredCols = [
    "id",
    "companyId",
    "userId",
    "permission",
    "allowed",
    "updatedById",
    "updatedByOwnerAccountId",
    "createdAt",
    "updatedAt",
  ];
  for (const col of requiredCols) {
    if (!userPermColumns.find((c) => c.column_name === col)) {
      throw new Error(`UserPermission: Spalte "${col}" fehlt!`);
    }
  }
  console.log("   ✓ Alle erwarteten Spalten vorhanden\n");

  // 2) Test-Mandant + Test-User finden (ein beliebiger aktiver
  //    ADMIN-User, idealerweise nicht SUPERADMIN). NUR Daten lesen,
  //    NICHT verändern.
  console.log("2) Such einen Test-User (ADMIN, nicht SUPERADMIN)");
  const testUser = await prisma.user.findFirst({
    where: {
      role: "ADMIN",
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, email: true, companyId: true, role: true },
  });
  if (!testUser) {
    console.log("   Kein ADMIN-User vorhanden — Test wird übersprungen.\n");
    return;
  }
  console.log(`   ✓ Test-User: ${testUser.email} (companyId=${testUser.companyId})\n`);

  // 3) Vorzustand prüfen
  console.log("3) Vorzustand (vor Test-Schreiben)");
  const beforeOverrides = await prisma.userPermission.count({
    where: { userId: testUser.id },
  });
  console.log(`   Bestehende Overrides für ${testUser.email}: ${beforeOverrides}`);
  if (beforeOverrides > 0) {
    console.log(
      "   ⚠️  User hat bereits echte Overrides — Test übersprungen, um keine echten Daten zu touchen.\n",
    );
    return;
  }
  console.log("   ✓ Keine bestehenden Overrides — sicher zu testen\n");

  // 4) Load Permission Matrix für diesen Mandanten + User
  console.log("4) Initial-Load der Matrix");
  invalidatePermissionMatrix(testUser.companyId);
  invalidateUserPermissionCache();
  await loadPermissionMatrix(testUser.companyId, {
    id: testUser.id,
    role: testUser.role,
  });
  const canBefore = hasPermission(testUser.role, "invoices.write");
  console.log(
    `   hasPermission(ADMIN, invoices.write) = ${canBefore} (erwartet true für Default-ADMIN)`,
  );

  // 5) Test-DENY-Override für invoices.write schreiben (analog Owner-Action)
  console.log("\n5) Test-DENY-Override schreiben (invoices.write)");
  try {
    await prisma.userPermission.create({
      data: {
        companyId: testUser.companyId,
        userId: testUser.id,
        permission: "invoices.write",
        allowed: false,
      },
    });
    console.log("   ✓ Schreib-Operation OK");

    // 6) Cache invalidieren (= das macht die Server-Action auch)
    invalidatePermissionMatrix(testUser.companyId);
    invalidateUserPermissionCache();

    // 7) Neu laden — wie es der nächste Request tun würde
    await loadPermissionMatrix(testUser.companyId, {
      id: testUser.id,
      role: testUser.role,
    });
    const canAfter = hasPermission(testUser.role, "invoices.write");
    console.log(
      `   hasPermission(ADMIN, invoices.write) NACH DENY = ${canAfter} (erwartet false)`,
    );
    if (canAfter !== false) {
      throw new Error("FEHLER: DENY-Override wurde nicht angewendet!");
    }
    console.log("   ✓ DENY wird korrekt angewendet");

    // 8) Verifiziere via effectivePermissionsForUser (akkurat)
    const effective = await effectivePermissionsForUser({
      id: testUser.id,
      role: testUser.role,
      companyId: testUser.companyId,
    });
    const hasInvoicesWrite = effective.has("invoices.write");
    console.log(
      `   effectivePermissionsForUser → invoices.write present = ${hasInvoicesWrite} (erwartet false)`,
    );
    if (hasInvoicesWrite !== false) {
      throw new Error("FEHLER: effectivePermissionsForUser sieht den DENY nicht!");
    }
    console.log("   ✓ effectivePermissionsForUser stimmt überein");

    // 9) Andere ADMIN-Rechte müssen unangetastet bleiben
    const ordersWrite = hasPermission(testUser.role, "orders.write");
    if (ordersWrite !== true) {
      throw new Error(
        "FEHLER: Ein nicht-overridenes Recht wurde fälschlich entzogen!",
      );
    }
    console.log("   ✓ Andere ADMIN-Rechte bleiben unangetastet (orders.write = true)");
  } finally {
    // 10) IMMER aufräumen — auch bei Fehler
    console.log("\n10) Aufräumen — Test-Override löschen");
    await prisma.userPermission.deleteMany({
      where: { userId: testUser.id, permission: "invoices.write" },
    });
    console.log("   ✓ Test-Override entfernt");
  }

  // 11) Final verifizieren, dass nach Cleanup wieder alles normal ist
  invalidatePermissionMatrix(testUser.companyId);
  invalidateUserPermissionCache();
  await loadPermissionMatrix(testUser.companyId, {
    id: testUser.id,
    role: testUser.role,
  });
  const canFinal = hasPermission(testUser.role, "invoices.write");
  console.log(
    `\n11) Endzustand: hasPermission(ADMIN, invoices.write) = ${canFinal} (zurück auf default)`,
  );

  console.log("\n──────────────────────────────────────────────");
  console.log("✓ Alle Roundtrip-Checks bestanden");
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("\n❌ FEHLGESCHLAGEN:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
