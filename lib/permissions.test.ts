import { describe, it, expect } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  getStaticDefaults,
  hasPermission,
  isKnownPermission,
} from "./permissions";
import { effectiveRole, isSuperAdmin } from "./roles";
import type { UserRole } from "@prisma/client";

describe("permissions — registry", () => {
  it("PERMISSION_DEFINITIONS have unique keys", () => {
    const keys = PERMISSION_DEFINITIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ALL_PERMISSIONS matches registry", () => {
    expect(ALL_PERMISSIONS.length).toBe(PERMISSION_DEFINITIONS.length);
  });

  it("isKnownPermission accepts known and rejects unknown", () => {
    expect(isKnownPermission("orders.read")).toBe(true);
    expect(isKnownPermission("totally.bogus")).toBe(false);
  });

  it("every defined permission has a German group + label", () => {
    for (const def of PERMISSION_DEFINITIONS) {
      expect(def.group.length).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
    }
  });
});

describe("permissions — static defaults", () => {
  it("ADMIN has the full operator set incl. parameters.write", () => {
    const perms = getStaticDefaults("ADMIN" as UserRole);
    expect(perms).toContain("orders.write");
    expect(perms).toContain("invoices.write");
    expect(perms).toContain("parameters.write");
    // 'roles.manage' nur SUPERADMIN
    expect(perms).not.toContain("roles.manage");
  });

  it("PLANNER (Sekretärin) can read parameters but not write", () => {
    const perms = getStaticDefaults("PLANNER" as UserRole);
    expect(perms).toContain("parameters.read");
    expect(perms).not.toContain("parameters.write");
  });

  it("EMPLOYEE has only orders.read + schedule.read", () => {
    const perms = getStaticDefaults("EMPLOYEE" as UserRole);
    expect(perms).toEqual(expect.arrayContaining(["orders.read", "schedule.read"]));
    expect(perms).not.toContain("orders.write");
    expect(perms).not.toContain("invoices.read");
  });

  it("legacy SECRETARY/TEAM_LEAD map to PLANNER defaults", () => {
    const sec = getStaticDefaults("SECRETARY" as UserRole);
    const planner = getStaticDefaults("PLANNER" as UserRole);
    expect(sec.sort()).toEqual(planner.sort());
  });
});

describe("permissions — hasPermission", () => {
  it("SUPERADMIN bypasses all checks", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(hasPermission("SUPERADMIN" as UserRole, perm)).toBe(true);
    }
  });

  it("EMPLOYEE cannot write orders by default", () => {
    expect(hasPermission("EMPLOYEE" as UserRole, "orders.read")).toBe(true);
    expect(hasPermission("EMPLOYEE" as UserRole, "orders.write")).toBe(false);
  });

  it("ADMIN can manage invoices but not roles", () => {
    expect(hasPermission("ADMIN" as UserRole, "invoices.write")).toBe(true);
    expect(hasPermission("ADMIN" as UserRole, "roles.manage")).toBe(false);
  });
});

describe("roles — helpers", () => {
  it("isSuperAdmin recognizes SUPERADMIN only", () => {
    expect(isSuperAdmin("SUPERADMIN")).toBe(true);
    expect(isSuperAdmin("ADMIN")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });

  it("effectiveRole maps legacy values", () => {
    expect(effectiveRole("SECRETARY" as UserRole)).toBe("PLANNER");
    expect(effectiveRole("TEAM_LEAD" as UserRole)).toBe("PLANNER");
    expect(effectiveRole("ADMIN" as UserRole)).toBe("ADMIN");
    expect(effectiveRole("SUPERADMIN" as UserRole)).toBe("SUPERADMIN");
    expect(effectiveRole("EMPLOYEE" as UserRole)).toBe("EMPLOYEE");
  });
});
