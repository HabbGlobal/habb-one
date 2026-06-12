// Role definitions for the UI: Mapping between DB enum and display labels.
// The DB enum values themselves are technical and stable (see
// `prisma/schema.prisma`); the labels here may change without requiring
// a migration.

import type { UserRole } from "@prisma/client";

/**
 * Roles that are displayed in the UI and can be configured by SUPERADMIN.
 *
 * Order: hierarchical from top to bottom.
 * - SUPERADMIN: System administrator (always has all permissions, not editable)
 * - ADMIN:     CEO / Management
 * - PLANNER:   Secretary / Back office
 * - EMPLOYEE:  Production worker
 */
export const MANAGED_ROLES = [
  "SUPERADMIN",
  "ADMIN",
  "PLANNER",
  "EMPLOYEE",
] as const satisfies readonly UserRole[];

export type ManagedRole = (typeof MANAGED_ROLES)[number];

/** Roles whose permissions are configurable via the UI matrix. */
export const CONFIGURABLE_ROLES = ["ADMIN", "PLANNER", "EMPLOYEE"] as const satisfies readonly ManagedRole[];
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export const ROLE_LABELS: Record<ManagedRole, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "CEO / Management",
  PLANNER: "Secretary",
  EMPLOYEE: "Production Worker",
};

export const ROLE_DESCRIPTIONS: Record<ManagedRole, string> = {
  SUPERADMIN:
    "System administrator. ALWAYS has all permissions and is the only role allowed to edit this matrix.",
  ADMIN:
    "Management. By default has full operational access (orders, quotes, invoices, personnel, reports, parameters).",
  PLANNER:
    "Back office / Secretary. By default: create and plan customers, orders, quotes; read invoices; no parameter changes.",
  EMPLOYEE:
    "Workshop employee. By default: can only see own shift and assigned orders; no back-office functions.",
};

/** Returns the display label for a UserRole, with fallback. */
export function roleLabel(role: UserRole | string): string {
  if (role in ROLE_LABELS) return ROLE_LABELS[role as ManagedRole];
  // Legacy values for existing data:
  if (role === "SECRETARY" || role === "TEAM_LEAD") return "Secretary";
  if (role === "CUSTOMER_PORTAL") return "Customer Portal";
  return role;
}

// Keep old export name for backward compatibility
export const ROLE_LABELS_DE = ROLE_LABELS;
export const ROLE_DESCRIPTIONS_DE = ROLE_DESCRIPTIONS;
export const roleLabelDe = roleLabel;

/**
 * Maps legacy roles to the current technical value.
 * (DB still contains old records; we don't change the DB definition
 *  itself so Postgres remains consistent.)
 */
export function effectiveRole(
  role: UserRole,
): ManagedRole | "CUSTOMER_PORTAL" | "KIOSK_OPERATOR" {
  if (role === "SECRETARY" || role === "TEAM_LEAD") return "PLANNER";
  if (
    role === "SUPERADMIN" ||
    role === "ADMIN" ||
    role === "PLANNER" ||
    role === "EMPLOYEE" ||
    role === "CUSTOMER_PORTAL" ||
    role === "KIOSK_OPERATOR"
  ) {
    return role;
  }
  return "EMPLOYEE";
}

export function isSuperAdmin(role: UserRole | string | null | undefined): boolean {
  return role === "SUPERADMIN";
}

export function isKioskOperator(role: UserRole | string | null | undefined): boolean {
  return role === "KIOSK_OPERATOR";
}
