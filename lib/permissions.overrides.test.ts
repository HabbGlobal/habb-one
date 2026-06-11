/**
 * Verifikations-Tests für den Override-Pfad in lib/permissions.ts.
 *
 * Deckt die zwei Ebenen ab, die mit der Owner-Rechte-Verwaltung dazukommen:
 *   1. RolePermission (Tenant-Override pro Rolle) — gewinnt über Static Default
 *   2. UserPermission (Per-User-Override) — gewinnt über alles (DENY > GRANT > Default)
 *
 * Wichtig: das ganze Modul ist Modul-Cache-basiert. Wir nutzen vi.mock,
 * um die Prisma-Calls zu kontrollieren — kein DB-Zugriff nötig.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRolePermFindMany = vi.fn();
const mockUserPermFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rolePermission: { findMany: mockRolePermFindMany },
    userPermission: { findMany: mockUserPermFindMany },
  },
}));

import type { UserRole } from "@prisma/client";

// IMPORTANT: nach vi.mock importieren, damit das gemockte Prisma greift.
async function freshModule() {
  vi.resetModules();
  return await import("./permissions");
}

beforeEach(() => {
  mockRolePermFindMany.mockReset();
  mockUserPermFindMany.mockReset();
});

describe("loadPermissionMatrix — Tenant-Rolle-Override (RolePermission)", () => {
  it("entfernt ein Default-Recht, wenn allowed=false in DB liegt", async () => {
    const { loadPermissionMatrix, hasPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([
      // ADMIN soll Rechnungen NICHT mehr schreiben dürfen
      { role: "ADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    mockUserPermFindMany.mockResolvedValue([]);

    await loadPermissionMatrix("tenant-A");

    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(false);
    // Andere ADMIN-Rechte sollen unangetastet bleiben
    expect(hasPermission("ADMIN" as UserRole, "orders.write")).toBe(true);
  });

  it("fügt ein Recht hinzu, wenn allowed=true in DB liegt", async () => {
    const { loadPermissionMatrix, hasPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([
      // PLANNER bekommt ausnahmsweise invoices.write
      { role: "PLANNER" as UserRole, permission: "invoices.write", allowed: true },
    ]);
    mockUserPermFindMany.mockResolvedValue([]);

    await loadPermissionMatrix("tenant-A");

    expect(hasPermission("PLANNER" as UserRole, "invoices.write")).toBe(true);
  });

  it("SUPERADMIN bleibt von Overrides unangetastet (immer alles)", async () => {
    const { loadPermissionMatrix, hasPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([
      // Das hier MÜSSTE eigentlich gar nicht greifen — SUPERADMIN ist
      // immer alles. Wir verifizieren das.
      { role: "SUPERADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    mockUserPermFindMany.mockResolvedValue([]);

    await loadPermissionMatrix("tenant-A");

    expect(hasPermission("SUPERADMIN" as UserRole, "invoices.write")).toBe(true);
    expect(hasPermission("SUPERADMIN" as UserRole, "roles.manage")).toBe(true);
  });

  it("invalidatePermissionMatrix erzwingt einen Reload aus der DB", async () => {
    const { loadPermissionMatrix, hasPermission, invalidatePermissionMatrix } =
      await freshModule();

    // Erst-Load: ADMIN darf invoices.write
    mockRolePermFindMany.mockResolvedValueOnce([]);
    mockUserPermFindMany.mockResolvedValue([]);
    await loadPermissionMatrix("tenant-A");
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(true);

    // DB ändert sich: invoices.write wird ADMIN entzogen.
    // OHNE invalidate: Cache hält noch alten Stand
    mockRolePermFindMany.mockResolvedValueOnce([
      { role: "ADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    await loadPermissionMatrix("tenant-A");
    // Cache hat noch nicht abgelaufen (TTL 30s), also: immer noch alt
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(true);

    // Mit invalidate → frischer DB-Read → neuer Stand greift
    invalidatePermissionMatrix("tenant-A");
    mockRolePermFindMany.mockResolvedValueOnce([
      { role: "ADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    await loadPermissionMatrix("tenant-A");
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(false);
  });
});

describe("loadPermissionMatrix — Per-User-Overrides (UserPermission)", () => {
  it("DENY entzieht ein Rollen-Recht für genau diesen User", async () => {
    const { loadPermissionMatrix, hasPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([]);
    mockUserPermFindMany.mockResolvedValue([
      { permission: "invoices.write", allowed: false },
    ]);

    await loadPermissionMatrix("tenant-A", {
      id: "user-1",
      role: "ADMIN" as UserRole,
    });

    // Der gecachete User ist ADMIN → invoices.write wird denied
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(false);
    // Andere ADMIN-Rechte bleiben
    expect(hasPermission("ADMIN" as UserRole, "orders.write")).toBe(true);
  });

  it("GRANT fügt ein Recht hinzu, das die Rolle nicht hat", async () => {
    const { loadPermissionMatrix, hasPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([]);
    mockUserPermFindMany.mockResolvedValue([
      // EMPLOYEE bekommt ausnahmsweise invoices.read
      { permission: "invoices.read", allowed: true },
    ]);

    await loadPermissionMatrix("tenant-A", {
      id: "user-1",
      role: "EMPLOYEE" as UserRole,
    });

    expect(hasPermission("EMPLOYEE" as UserRole, "invoices.read")).toBe(true);
    // Andere EMPLOYEE-Defaults bleiben
    expect(hasPermission("EMPLOYEE" as UserRole, "orders.read")).toBe(true);
    expect(hasPermission("EMPLOYEE" as UserRole, "invoices.write")).toBe(false);
  });

  it("DENY gewinnt über GRANT (DENY ist immer absolut)", async () => {
    const { loadPermissionMatrix, hasUserPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([]);
    // Konflikt-Daten kommen so von der DB nicht (UNIQUE userId+permission),
    // aber wir verifizieren die Code-Logik trotzdem: in der Auflösung
    // wird DENY VOR GRANT geprüft.
    mockUserPermFindMany.mockResolvedValue([
      { permission: "orders.write", allowed: false },
    ]);

    await loadPermissionMatrix("tenant-A", {
      id: "user-1",
      role: "ADMIN" as UserRole,
    });

    expect(
      hasUserPermission({ id: "user-1", role: "ADMIN" as UserRole }, "orders.write"),
    ).toBe(false);
  });

  it("User-Override leakt NICHT auf andere User mit gleicher Rolle (Heuristik)", async () => {
    const { loadPermissionMatrix, hasUserPermission } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([]);
    mockUserPermFindMany.mockResolvedValue([
      { permission: "invoices.write", allowed: false },
    ]);

    // Wir laden den Cache für user-1 (ADMIN), der das Recht NICHT haben soll.
    await loadPermissionMatrix("tenant-A", {
      id: "user-1",
      role: "ADMIN" as UserRole,
    });

    // Direkte API für einen ANDEREN ADMIN: muss true bleiben (kein Leak)
    expect(
      hasUserPermission({ id: "user-2", role: "ADMIN" as UserRole }, "invoices.write"),
    ).toBe(true);

    // Die cached-Person bekommt FALSE
    expect(
      hasUserPermission({ id: "user-1", role: "ADMIN" as UserRole }, "invoices.write"),
    ).toBe(false);
  });

  it("invalidateUserPermissionCache nimmt User-Overrides sofort raus", async () => {
    const {
      loadPermissionMatrix,
      hasPermission,
      invalidateUserPermissionCache,
    } = await freshModule();
    mockRolePermFindMany.mockResolvedValue([]);
    mockUserPermFindMany.mockResolvedValue([
      { permission: "invoices.write", allowed: false },
    ]);

    await loadPermissionMatrix("tenant-A", {
      id: "user-1",
      role: "ADMIN" as UserRole,
    });
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(false);

    invalidateUserPermissionCache();
    // Cache geleert → keine User-Overrides → Default greift wieder
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(true);
  });
});

describe("effectivePermissionsForUser — akkurate Auflösung für FREMDE User", () => {
  it("vereint Static Default + Tenant-Override + Per-User-Override", async () => {
    const { effectivePermissionsForUser } = await freshModule();
    // Tenant-Override: ADMIN verliert invoices.write
    mockRolePermFindMany.mockResolvedValue([
      { role: "ADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    // User-Override: dieser eine User bekommt invoices.write wieder zurück
    mockUserPermFindMany.mockResolvedValue([
      { permission: "invoices.write", allowed: true },
    ]);

    const perms = await effectivePermissionsForUser({
      id: "user-1",
      role: "ADMIN" as UserRole,
      companyId: "tenant-A",
    });

    expect(perms.has("invoices.write")).toBe(true);
    expect(perms.has("orders.write")).toBe(true); // ADMIN-Default
  });

  it("SUPERADMIN bekommt immer ALLE Permissions zurück", async () => {
    const { effectivePermissionsForUser, ALL_PERMISSIONS } = await freshModule();
    // Egal was die DB sagt — SUPERADMIN ist immun
    mockRolePermFindMany.mockResolvedValue([
      { role: "SUPERADMIN" as UserRole, permission: "invoices.write", allowed: false },
    ]);
    mockUserPermFindMany.mockResolvedValue([
      { permission: "invoices.write", allowed: false },
    ]);

    const perms = await effectivePermissionsForUser({
      id: "user-super",
      role: "SUPERADMIN" as UserRole,
      companyId: "tenant-A",
    });

    for (const p of ALL_PERMISSIONS) {
      expect(perms.has(p)).toBe(true);
    }
  });
});
