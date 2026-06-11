// Rollen-Definitionen für die UI: Mapping zwischen DB-Enum und deutschen
// Anzeige-Labels. Die DB-Enum-Werte selbst sind technisch und stabil
// (siehe `prisma/schema.prisma`); die Labels hier dürfen sich ändern,
// ohne dass eine Migration nötig wird.

import type { UserRole } from "@prisma/client";

/**
 * Rollen, die im UI angezeigt und vom SUPERADMIN konfiguriert werden können.
 *
 * Reihenfolge: hierarchisch von oben nach unten.
 * - SUPERADMIN: System-Administrator (immer alle Rechte, nicht editierbar)
 * - ADMIN:     CEO / Geschäftsleitung
 * - PLANNER:   Sekretärin / Backoffice
 * - EMPLOYEE:  Produktionsmitarbeiter
 */
export const MANAGED_ROLES = [
  "SUPERADMIN",
  "ADMIN",
  "PLANNER",
  "EMPLOYEE",
] as const satisfies readonly UserRole[];

export type ManagedRole = (typeof MANAGED_ROLES)[number];

/** Rollen, deren Permissions per UI-Matrix konfigurierbar sind. */
export const CONFIGURABLE_ROLES = ["ADMIN", "PLANNER", "EMPLOYEE"] as const satisfies readonly ManagedRole[];
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export const ROLE_LABELS_DE: Record<ManagedRole, string> = {
  SUPERADMIN: "Super-Admin",
  ADMIN: "CEO / Geschäftsleitung",
  PLANNER: "Sekretärin",
  EMPLOYEE: "Produktionsmitarbeiter",
};

export const ROLE_DESCRIPTIONS_DE: Record<ManagedRole, string> = {
  SUPERADMIN:
    "System-Administrator. Hat IMMER alle Rechte und ist die einzige Rolle, die diese Matrix bearbeiten darf.",
  ADMIN:
    "Geschäftsleitung. Standardmässig voller operativer Zugriff (Aufträge, Offerten, Rechnungen, Personal, Berichte, Parameter).",
  PLANNER:
    "Backoffice / Sekretariat. Standardmässig: Kunden, Aufträge, Offerten anlegen und planen; Rechnungen lesen; keine Parameter-Änderungen.",
  EMPLOYEE:
    "Werkstatt-Mitarbeiter. Standardmässig: nur eigene Schicht und zugewiesene Aufträge sehen; keine Backoffice-Funktionen.",
};

/** Liefert das deutsche Anzeige-Label für eine UserRole, mit Fallback. */
export function roleLabelDe(role: UserRole | string): string {
  if (role in ROLE_LABELS_DE) return ROLE_LABELS_DE[role as ManagedRole];
  // Legacy-Werte für Bestandsdaten:
  if (role === "SECRETARY" || role === "TEAM_LEAD") return "Sekretärin";
  if (role === "CUSTOMER_PORTAL") return "Kundenportal";
  return role;
}

/**
 * Mappt Legacy-Rollen auf den heutigen technischen Wert.
 * (DB enthält noch alte Datensätze; an der DB-Definition selbst ändern wir
 *  nichts, damit Postgres-konsistent bleibt.)
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
