import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { effectiveRole, isSuperAdmin, type ManagedRole } from "@/lib/roles";

/**
 * Permission-Schlüssel, die quer durch die App verwendet werden.
 *
 * Strategie:
 *   - **Statische Defaults** (`STATIC_DEFAULTS` unten) definieren das
 *     Default-Verhalten pro Rolle. Dies ist die "sichere" Baseline,
 *     die ohne Datenbank funktioniert.
 *   - **Runtime-Overrides** liegen in der Tabelle `RolePermission`
 *     (per Company). Der SUPERADMIN bearbeitet sie unter
 *     `/admin/roles`. Eine vorhandene Override-Zeile gewinnt IMMER über
 *     den statischen Default — egal ob sie das Recht erlaubt oder verbietet.
 *   - SUPERADMIN bypasst alle Checks und hat IMMER alles.
 *
 * Backward-compat:
 *   - `hasPermission(role, perm)` bleibt SYNC verfügbar. Sie liest aus
 *     einem Modul-Cache wenn dieser via `loadPermissionMatrix()` (am
 *     Request-Anfang in NextAuth-Session-Callback) befüllt wurde, sonst
 *     fällt sie auf `STATIC_DEFAULTS` zurück.
 *   - Damit funktionieren alle ~127 bestehenden `hasPermission`-Aufrufe
 *     unverändert weiter — sie sehen nach dem Login automatisch die
 *     Override-Werte, weil der Cache vorgewärmt ist.
 */
export type Permission =
  // Personal-Modul
  | "employees.read"
  | "employees.write"
  | "employees.pin.reset"
  | "timeEntries.read"
  | "timeEntries.correct"
  | "absences.read"
  | "absences.write"
  | "absences.approve"
  | "schedule.read"
  | "schedule.write"
  | "schedule.publish"
  | "attendance.read"
  | "settings.read"
  | "settings.write"
  | "audit.read"
  | "reports.export"
  // ERP — CRM
  | "customers.read"
  | "customers.write"
  // ERP — Aufträge
  | "orders.read"
  | "orders.write"
  | "orders.confirm"
  | "orders.cancel"
  // ERP — Offerten
  | "quotes.read"
  | "quotes.write"
  | "quotes.send"
  // ERP — Rechnungen
  | "invoices.read"
  | "invoices.write"
  | "invoices.markPaid"
  // ERP — Maschinen
  | "machines.read"
  | "machines.write"
  // ERP — Parameter (NUR ADMIN per Default)
  | "parameters.read"
  | "parameters.write"
  // ERP — Process-Vorlagen
  | "templates.read"
  | "templates.write"
  // System — nur SUPERADMIN per Default
  | "roles.manage";

/** Gruppen für die Matrix-UI (Reihenfolge = Anzeige-Reihenfolge). */
export interface PermissionDefinition {
  key: Permission;
  group: string; // German group label
  label: string; // German short label
  description?: string;
}

export const PERMISSION_DEFINITIONS: ReadonlyArray<PermissionDefinition> = [
  // Personal
  { key: "employees.read", group: "Personal", label: "Mitarbeitende ansehen" },
  { key: "employees.write", group: "Personal", label: "Mitarbeitende bearbeiten" },
  { key: "employees.pin.reset", group: "Personal", label: "PIN zurücksetzen" },
  { key: "timeEntries.read", group: "Personal", label: "Zeiterfassung ansehen" },
  { key: "timeEntries.correct", group: "Personal", label: "Zeiten korrigieren" },
  { key: "absences.read", group: "Personal", label: "Abwesenheiten ansehen" },
  { key: "absences.write", group: "Personal", label: "Abwesenheiten erfassen" },
  { key: "absences.approve", group: "Personal", label: "Abwesenheiten freigeben" },
  { key: "schedule.read", group: "Personal", label: "Personal-Plan ansehen" },
  { key: "schedule.write", group: "Personal", label: "Personal-Plan bearbeiten" },
  { key: "schedule.publish", group: "Personal", label: "Personal-Plan veröffentlichen" },
  { key: "attendance.read", group: "Personal", label: "Anwesenheits-Übersicht ansehen" },
  // CRM
  { key: "customers.read", group: "CRM", label: "Kunden ansehen" },
  { key: "customers.write", group: "CRM", label: "Kunden bearbeiten" },
  // Aufträge
  { key: "orders.read", group: "Aufträge", label: "Aufträge ansehen" },
  { key: "orders.write", group: "Aufträge", label: "Aufträge erstellen/bearbeiten" },
  { key: "orders.confirm", group: "Aufträge", label: "Aufträge bestätigen" },
  { key: "orders.cancel", group: "Aufträge", label: "Aufträge stornieren" },
  // Offerten
  { key: "quotes.read", group: "Offerten", label: "Offerten ansehen" },
  { key: "quotes.write", group: "Offerten", label: "Offerten erstellen/bearbeiten" },
  { key: "quotes.send", group: "Offerten", label: "Offerten versenden" },
  // Rechnungen
  { key: "invoices.read", group: "Rechnungen", label: "Rechnungen ansehen" },
  { key: "invoices.write", group: "Rechnungen", label: "Rechnungen erstellen/bearbeiten" },
  { key: "invoices.markPaid", group: "Rechnungen", label: "Rechnung als bezahlt markieren" },
  // Maschinen / Vorlagen
  { key: "machines.read", group: "Werkstatt", label: "Maschinen ansehen" },
  { key: "machines.write", group: "Werkstatt", label: "Maschinen bearbeiten" },
  { key: "templates.read", group: "Werkstatt", label: "Process-Vorlagen ansehen" },
  { key: "templates.write", group: "Werkstatt", label: "Process-Vorlagen bearbeiten" },
  // Berichte
  { key: "reports.export", group: "Berichte", label: "Berichte exportieren" },
  // System
  { key: "settings.read", group: "System", label: "Einstellungen ansehen" },
  { key: "settings.write", group: "System", label: "Einstellungen bearbeiten" },
  { key: "audit.read", group: "System", label: "Audit-Log ansehen" },
  { key: "parameters.read", group: "System", label: "Parameter ansehen" },
  { key: "parameters.write", group: "System", label: "Parameter ändern" },
  { key: "roles.manage", group: "System", label: "Rollen & Rechte verwalten" },
];

export const ALL_PERMISSIONS: ReadonlyArray<Permission> = PERMISSION_DEFINITIONS.map(
  (p) => p.key,
);

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isKnownPermission(p: string): p is Permission {
  return PERMISSION_SET.has(p);
}

// ─────────────────────────────────────────────────────────────────
// STATIC DEFAULTS — sichere Baseline ohne DB
// ─────────────────────────────────────────────────────────────────

const STATIC_DEFAULTS: Record<
  ManagedRole | "CUSTOMER_PORTAL" | "KIOSK_OPERATOR",
  Permission[]
> = {
  // Werkstatt-Tablet-Konto. Bewusst leer: dieser User darf nichts in /admin
  // und keine API-Calls außer Kiosk-Routen. Schutz ist additiv zur Middleware,
  // die /admin für diese Rolle ohnehin sperrt.
  KIOSK_OPERATOR: [],
  SUPERADMIN: [...ALL_PERMISSIONS], // hat alles, wird aber sowieso bypasst
  ADMIN: [
    "employees.read",
    "employees.write",
    "employees.pin.reset",
    "timeEntries.read",
    "timeEntries.correct",
    "absences.read",
    "absences.write",
    "absences.approve",
    "schedule.read",
    "schedule.write",
    "schedule.publish",
    "attendance.read",
    "settings.read",
    "settings.write",
    "audit.read",
    "reports.export",
    "customers.read",
    "customers.write",
    "orders.read",
    "orders.write",
    "orders.confirm",
    "orders.cancel",
    "quotes.read",
    "quotes.write",
    "quotes.send",
    "invoices.read",
    "invoices.write",
    "invoices.markPaid",
    "machines.read",
    "machines.write",
    "parameters.read",
    "parameters.write",
    "templates.read",
    "templates.write",
    // KEIN "roles.manage" per Default — nur SUPERADMIN
  ],
  PLANNER: [
    "employees.read",
    "timeEntries.read",
    // PLANNER (Sekretariat) darf Zeiten manuell korrigieren — z. B. wenn
    // Mitarbeiter:in vergessen hat aus-/einzustempeln. Same Tier wie der
    // ADMIN-Default. Owner kann das pro Mandant via Role-Matrix entziehen,
    // wenn der spezifische Kunde es nicht möchte.
    "timeEntries.correct",
    "absences.read",
    "absences.write",
    "schedule.read",
    "schedule.write",
    "schedule.publish",
    "attendance.read",
    "reports.export",
    "customers.read",
    "customers.write",
    "orders.read",
    "orders.write",
    "orders.confirm",
    "quotes.read",
    "quotes.write",
    "quotes.send",
    "invoices.read",
    "machines.read",
    "parameters.read",
    "templates.read",
  ],
  EMPLOYEE: [
    "orders.read",
    "schedule.read",
  ],
  CUSTOMER_PORTAL: [
    // Customer-portal Datentrennung wird separat über
    // `assertCustomerOwnership(customerId, session)` durchgesetzt.
    "orders.read",
    "quotes.read",
    "invoices.read",
  ],
};

export function getStaticDefaults(role: UserRole): Permission[] {
  const eff = effectiveRole(role);
  return STATIC_DEFAULTS[eff] ?? [];
}

// ─────────────────────────────────────────────────────────────────
// MATRIX (Default ∪ DB-Overrides) — pro Company gecached
// ─────────────────────────────────────────────────────────────────

export type RoleMatrix = Record<string, Set<Permission>>;

interface CacheEntry {
  matrix: RoleMatrix;
  loadedAt: number;
}

const TTL_MS = 30_000;
/**
 * Modul-Level-Cache. Single-Company-Deployment → eine Map reicht.
 * Bei Multi-Tenant würde man React `cache()` per Request nutzen.
 */
const matrixCache = new Map<string, CacheEntry>();
/**
 * Zuletzt geladener companyId — der sync `hasPermission()`-Helper liest
 * von hier, wenn die Caller-Site den companyId-Kontext nicht durchreichen
 * kann (z. B. Sidebar-Filter). In Single-Tenant-Setups (habb global) ist
 * das genau richtig.
 */
let lastLoadedCompanyId: string | null = null;

/**
 * Per-User-Override-Cache des aktuellen Request-Users. Wird vom
 * NextAuth-Session-Callback gefüllt (siehe `lib/auth.ts`), damit die
 * bestehenden ~127 `hasPermission(session.user.role, perm)`-Aufrufe
 * automatisch die User-Overrides mitbekommen — ohne flächige Migration
 * der Call-Sites. Heuristik: Override wird nur angewendet, wenn die
 * geprüfte Rolle der Rolle des gecacheten Users entspricht (verhindert,
 * dass beim Anzeigen einer Rollen-Default-Übersicht für eine ANDERE
 * Rolle die Overrides des aktuellen Users durchschlagen).
 */
let lastLoadedUserId: string | null = null;
let lastLoadedUserRole: UserRole | null = null;
let lastLoadedUserGrants: Set<Permission> = new Set();
let lastLoadedUserDenies: Set<Permission> = new Set();

function buildMatrix(
  overrides: Array<{ role: UserRole; permission: string; allowed: boolean }>,
): RoleMatrix {
  const out: RoleMatrix = {};

  // Start: statische Defaults pro Rolle.
  const roles: Array<keyof typeof STATIC_DEFAULTS> = [
    "SUPERADMIN",
    "ADMIN",
    "PLANNER",
    "EMPLOYEE",
    "CUSTOMER_PORTAL",
    "KIOSK_OPERATOR",
  ];
  for (const role of roles) {
    out[role] = new Set(STATIC_DEFAULTS[role]);
  }

  // Overlay: Overrides.
  for (const o of overrides) {
    if (!isKnownPermission(o.permission)) continue; // Stale/unbekannt → ignorieren
    const eff = effectiveRole(o.role);
    if (eff === "SUPERADMIN") continue; // SUPERADMIN ist immutable
    const set = out[eff] ?? (out[eff] = new Set());
    if (o.allowed) set.add(o.permission as Permission);
    else set.delete(o.permission as Permission);
  }
  return out;
}

/**
 * Lädt die effektive Permission-Matrix für eine Company aus der DB,
 * mit kleinem Modul-Cache (TTL 30s). Wird vom NextAuth-Session-Callback
 * bei jeder Request-Authentifizierung aufgerufen — danach kann
 * `hasPermission()` synchron darauf zugreifen.
 *
 * Wenn `user` mitgegeben wird, lädt die Funktion zusätzlich die
 * Per-User-Overrides dieses Users in den Modul-Cache (siehe oben).
 * Optional, damit der Aufruf aus dem Session-Callback einfach bleibt;
 * andere Caller (z. B. UI-Detailseiten für FREMDE User) sollten
 * `effectivePermissionsForUser()` benutzen.
 */
export async function loadPermissionMatrix(
  companyId: string,
  user?: { id: string; role: UserRole },
): Promise<RoleMatrix> {
  const hit = matrixCache.get(companyId);
  let matrix: RoleMatrix;
  if (hit && Date.now() - hit.loadedAt < TTL_MS) {
    matrix = hit.matrix;
  } else {
    let overrides: Array<{ role: UserRole; permission: string; allowed: boolean }>;
    try {
      overrides = await prisma.rolePermission.findMany({
        where: { companyId },
        select: { role: true, permission: true, allowed: true },
      });
    } catch {
      // DB nicht erreichbar → static defaults
      overrides = [];
    }
    matrix = buildMatrix(overrides);
    matrixCache.set(companyId, { matrix, loadedAt: Date.now() });
  }
  lastLoadedCompanyId = companyId;

  // Per-User-Overrides für den aktuellen Request-User laden, damit
  // die bestehenden `hasPermission(session.user.role, perm)`-Calls
  // sie automatisch beachten. Frisch pro Request, kein TTL — wir wollen
  // sofortige Wirkung beim nächsten Reload nach einer Owner-/Admin-Änderung.
  if (user) {
    try {
      const userOverrides = await prisma.userPermission.findMany({
        where: { userId: user.id },
        select: { permission: true, allowed: true },
      });
      const grants = new Set<Permission>();
      const denies = new Set<Permission>();
      for (const o of userOverrides) {
        if (!isKnownPermission(o.permission)) continue;
        if (o.allowed) grants.add(o.permission as Permission);
        else denies.add(o.permission as Permission);
      }
      lastLoadedUserId = user.id;
      lastLoadedUserRole = user.role;
      lastLoadedUserGrants = grants;
      lastLoadedUserDenies = denies;
    } catch {
      // DB nicht erreichbar → User-Overrides nicht anwenden
      lastLoadedUserId = null;
      lastLoadedUserRole = null;
      lastLoadedUserGrants = new Set();
      lastLoadedUserDenies = new Set();
    }
  } else {
    // Wenn kein User mitgegeben wurde, frühere Overrides verwerfen
    // damit sie nicht auf andere Requests leaken.
    lastLoadedUserId = null;
    lastLoadedUserRole = null;
    lastLoadedUserGrants = new Set();
    lastLoadedUserDenies = new Set();
  }

  return matrix;
}

/** Manuell invalidieren (vom Server-Action nach Override-Update). */
export function invalidatePermissionMatrix(companyId?: string) {
  if (companyId) matrixCache.delete(companyId);
  else matrixCache.clear();
}

/**
 * Per-User-Override-Cache des aktuellen Requests invalidieren. Wird vom
 * Per-User-Editor nach Save aufgerufen, damit der nächste Reload sofort
 * die neuen Werte sieht.
 */
export function invalidateUserPermissionCache() {
  lastLoadedUserId = null;
  lastLoadedUserRole = null;
  lastLoadedUserGrants = new Set();
  lastLoadedUserDenies = new Set();
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Sync-Variante für Backward-Compat — liest aus dem Cache wenn vorhanden,
 * sonst aus den statischen Defaults.
 *
 * SUPERADMIN bypasst immer.
 *
 * Wenn der aktuelle Request-User Per-User-Overrides hat (geladen vom
 * Session-Callback) UND die geprüfte Rolle der Rolle dieses Users
 * entspricht, werden die User-Overrides angewendet:
 *   - DENY-Override → false
 *   - GRANT-Override → true
 * Die Heuristik "Rolle passt zum gecacheten User" verhindert, dass beim
 * Anzeigen einer Rollen-Default-Übersicht für eine ANDERE Rolle die
 * Overrides des aktuellen Users durchschlagen.
 */
export function hasPermission(role: UserRole, perm: Permission): boolean {
  if (isSuperAdmin(role)) return true;
  const eff = effectiveRole(role);

  // Basis: Role-Default + Tenant-Override (RolePermission)
  let allowed: boolean;
  if (lastLoadedCompanyId) {
    const entry = matrixCache.get(lastLoadedCompanyId);
    if (entry) {
      allowed = entry.matrix[eff]?.has(perm) ?? false;
    } else {
      allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
    }
  } else {
    // Fallback: statische Defaults
    allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
  }

  // Layer: Per-User-Override des aktuellen Requests. Nur wenn die geprüfte
  // Rolle zum gecacheten User passt (sonst handelt es sich um eine
  // generische Rollen-Ansicht und die User-Overrides sind irrelevant).
  if (lastLoadedUserId && lastLoadedUserRole === role) {
    if (lastLoadedUserDenies.has(perm)) return false;
    if (lastLoadedUserGrants.has(perm)) return true;
  }

  return allowed;
}

/**
 * Explizite, eindeutige Variante mit User-Objekt. Nutze diese in neuem
 * Code, wo der User-Kontext eindeutig ist (sicherer als `hasPermission`,
 * weil keine Rollen-Heuristik nötig ist).
 *
 * Für FREMDE User (nicht der aktuelle Request-User) gilt: die im
 * Modul-Cache liegenden Overrides werden nicht angewendet. Wer Rechte
 * für einen anderen User auflösen will, ruft `effectivePermissionsForUser`.
 */
export function hasUserPermission(
  user: { id: string; role: UserRole },
  perm: Permission,
): boolean {
  if (isSuperAdmin(user.role)) return true;
  const eff = effectiveRole(user.role);

  let allowed: boolean;
  if (lastLoadedCompanyId) {
    const entry = matrixCache.get(lastLoadedCompanyId);
    if (entry) {
      allowed = entry.matrix[eff]?.has(perm) ?? false;
    } else {
      allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
    }
  } else {
    allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
  }

  // User-Override anwenden nur wenn das WIRKLICH der gecacheten Request-User ist.
  if (lastLoadedUserId === user.id) {
    if (lastLoadedUserDenies.has(perm)) return false;
    if (lastLoadedUserGrants.has(perm)) return true;
  }
  return allowed;
}

/**
 * Async-Variante mit explizitem companyId-Kontext (sicherer für
 * Multi-Tenant). Nutze diese in neuen Code-Pfaden, wo du in einem
 * Server-Component bist.
 */
export async function userHasPermission(
  user: { role: UserRole; companyId: string },
  perm: Permission,
): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  const matrix = await loadPermissionMatrix(user.companyId);
  return matrix[effectiveRole(user.role)]?.has(perm) ?? false;
}

export function requirePermission(role: UserRole, perm: Permission) {
  if (!hasPermission(role, perm)) {
    throw new Error(`Forbidden: missing permission ${perm}`);
  }
}

/**
 * Async, akkurate effektive Permissions für einen beliebigen User (nicht
 * nur den aktuellen Request-User). Praktisch für UI-Detailseiten, die
 * die Rechte eines anderen Users anzeigen.
 *
 * Reihenfolge: SUPERADMIN-Bypass → Static-Default → RolePermission-Overrides
 * für den Mandanten → UserPermission-Overrides für diesen User.
 */
export async function effectivePermissionsForUser(user: {
  id: string;
  role: UserRole;
  companyId: string;
}): Promise<Set<Permission>> {
  if (isSuperAdmin(user.role)) return new Set(ALL_PERMISSIONS);
  const matrix = await loadPermissionMatrix(user.companyId);
  const eff = effectiveRole(user.role);
  const base = new Set(matrix[eff] ?? []);

  let userOverrides: Array<{ permission: string; allowed: boolean }> = [];
  try {
    userOverrides = await prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: true, allowed: true },
    });
  } catch {
    // ignorieren — Fallback auf Rollen-Defaults
  }
  for (const o of userOverrides) {
    if (!isKnownPermission(o.permission)) continue;
    if (o.allowed) base.add(o.permission as Permission);
    else base.delete(o.permission as Permission);
  }
  return base;
}

/** Liefert alle effektiven Permissions einer Rolle. Praktisch für die UI. */
export function effectivePermissionsForRole(
  role: UserRole,
  matrix?: RoleMatrix,
): Set<Permission> {
  if (isSuperAdmin(role)) return new Set(ALL_PERMISSIONS);
  const eff = effectiveRole(role);
  if (matrix) return matrix[eff] ?? new Set();
  // Cache or static fallback
  if (lastLoadedCompanyId) {
    const entry = matrixCache.get(lastLoadedCompanyId);
    if (entry) return entry.matrix[eff] ?? new Set();
  }
  return new Set(STATIC_DEFAULTS[eff] ?? []);
}
