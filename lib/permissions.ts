import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { effectiveRole, isSuperAdmin, type ManagedRole } from "@/lib/roles";

/**
 * Permission keys used throughout the app.
 *
 * Strategy:
 *   - **Static Defaults** (`STATIC_DEFAULTS` below) define the default
 *     behavior per role. This is the "safe" baseline that works without
 *     a database.
 *   - **Runtime Overrides** live in the `RolePermission` table (per
 *     Company). SUPERADMIN edits them under `/admin/roles`. An existing
 *     override row ALWAYS wins over the static default — whether it
 *     grants or denies the permission.
 *   - SUPERADMIN bypasses all checks and ALWAYS has everything.
 *
 * Backward-compat:
 *   - `hasPermission(role, perm)` remains available as SYNC. It reads
 *     from a module cache if populated via `loadPermissionMatrix()` (at
 *     request start in NextAuth session callback), otherwise falls back
 *     to `STATIC_DEFAULTS`.
 *   - This means all ~127 existing `hasPermission` calls continue to
 *     work unchanged — they automatically see override values after
 *     login because the cache is warmed.
 */
export type Permission =
  // Personnel module
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
  // ERP — Orders
  | "orders.read"
  | "orders.write"
  | "orders.confirm"
  | "orders.cancel"
  // ERP — Quotes
  | "quotes.read"
  | "quotes.write"
  | "quotes.send"
  // ERP — Invoices
  | "invoices.read"
  | "invoices.write"
  | "invoices.markPaid"
  // ERP — Machines
  | "machines.read"
  | "machines.write"
  // ERP — Parameters (ADMIN only by default)
  | "parameters.read"
  | "parameters.write"
  // ERP — Process Templates
  | "templates.read"
  | "templates.write"
  // System — SUPERADMIN only by default
  | "roles.manage";

/** Groups for the matrix UI (order = display order). */
export interface PermissionDefinition {
  key: Permission;
  group: string;
  label: string;
  description?: string;
}

export const PERMISSION_DEFINITIONS: ReadonlyArray<PermissionDefinition> = [
  // Personnel
  { key: "employees.read", group: "Personnel", label: "View employees" },
  { key: "employees.write", group: "Personnel", label: "Edit employees" },
  { key: "employees.pin.reset", group: "Personnel", label: "Reset PIN" },
  { key: "timeEntries.read", group: "Personnel", label: "View time entries" },
  { key: "timeEntries.correct", group: "Personnel", label: "Correct time entries" },
  { key: "absences.read", group: "Personnel", label: "View absences" },
  { key: "absences.write", group: "Personnel", label: "Record absences" },
  { key: "absences.approve", group: "Personnel", label: "Approve absences" },
  { key: "schedule.read", group: "Personnel", label: "View staff schedule" },
  { key: "schedule.write", group: "Personnel", label: "Edit staff schedule" },
  { key: "schedule.publish", group: "Personnel", label: "Publish staff schedule" },
  { key: "attendance.read", group: "Personnel", label: "View attendance overview" },
  // CRM
  { key: "customers.read", group: "CRM", label: "View customers" },
  { key: "customers.write", group: "CRM", label: "Edit customers" },
  // Orders
  { key: "orders.read", group: "Orders", label: "View orders" },
  { key: "orders.write", group: "Orders", label: "Create/edit orders" },
  { key: "orders.confirm", group: "Orders", label: "Confirm orders" },
  { key: "orders.cancel", group: "Orders", label: "Cancel orders" },
  // Quotes
  { key: "quotes.read", group: "Quotes", label: "View quotes" },
  { key: "quotes.write", group: "Quotes", label: "Create/edit quotes" },
  { key: "quotes.send", group: "Quotes", label: "Send quotes" },
  // Invoices
  { key: "invoices.read", group: "Invoices", label: "View invoices" },
  { key: "invoices.write", group: "Invoices", label: "Create/edit invoices" },
  { key: "invoices.markPaid", group: "Invoices", label: "Mark invoice as paid" },
  // Workshop
  { key: "machines.read", group: "Workshop", label: "View machines" },
  { key: "machines.write", group: "Workshop", label: "Edit machines" },
  { key: "templates.read", group: "Workshop", label: "View process templates" },
  { key: "templates.write", group: "Workshop", label: "Edit process templates" },
  // Reports
  { key: "reports.export", group: "Reports", label: "Export reports" },
  // System
  { key: "settings.read", group: "System", label: "View settings" },
  { key: "settings.write", group: "System", label: "Edit settings" },
  { key: "audit.read", group: "System", label: "View audit log" },
  { key: "parameters.read", group: "System", label: "View parameters" },
  { key: "parameters.write", group: "System", label: "Edit parameters" },
  { key: "roles.manage", group: "System", label: "Manage roles & permissions" },
];

export const ALL_PERMISSIONS: ReadonlyArray<Permission> = PERMISSION_DEFINITIONS.map(
  (p) => p.key,
);

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isKnownPermission(p: string): p is Permission {
  return PERMISSION_SET.has(p);
}

// ─────────────────────────────────────────────────────────────────
// STATIC DEFAULTS — safe baseline without DB
// ─────────────────────────────────────────────────────────────────

const STATIC_DEFAULTS: Record<
  ManagedRole | "CUSTOMER_PORTAL" | "KIOSK_OPERATOR",
  Permission[]
> = {
  // Workshop tablet account. Intentionally empty: this user may not access
  // /admin or make API calls other than kiosk routes. Protection is additive
  // to the middleware that blocks /admin for this role anyway.
  KIOSK_OPERATOR: [],
  SUPERADMIN: [...ALL_PERMISSIONS], // has everything, but is bypassed anyway
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
    // NO "roles.manage" by default — only SUPERADMIN
  ],
  PLANNER: [
    "employees.read",
    "timeEntries.read",
    // PLANNER (Secretary) may manually correct times — e.g. when an
    // employee forgot to clock in/out. Same tier as ADMIN default.
    // Owner can revoke this per tenant via role matrix if the specific
    // customer does not want it.
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
    // Customer portal data separation is enforced separately via
    // `assertCustomerOwnership(customerId, session)`.
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
// MATRIX (Default ∪ DB Overrides) — cached per company
// ─────────────────────────────────────────────────────────────────

export type RoleMatrix = Record<string, Set<Permission>>;

interface CacheEntry {
  matrix: RoleMatrix;
  loadedAt: number;
}

const TTL_MS = 30_000;
/**
 * Module-level cache. Single-company deployment → one map is sufficient.
 * For multi-tenant you would use React `cache()` per request.
 */
const matrixCache = new Map<string, CacheEntry>();
/**
 * Last loaded companyId — the sync `hasPermission()` helper reads from
 * here when the caller site cannot pass the companyId context (e.g.
 * sidebar filter). In single-tenant setups (habb global) this is exactly
 * right.
 */
let lastLoadedCompanyId: string | null = null;

/**
 * Per-user override cache of the current request user. Populated by the
 * NextAuth session callback (see `lib/auth.ts`) so that the existing ~127
 * `hasPermission(session.user.role, perm)` calls automatically pick up
 * user overrides — without a sweeping migration of call sites.
 * Heuristic: Override is only applied when the checked role matches the
 * role of the cached user (prevents user overrides from leaking when
 * displaying a role default overview for a DIFFERENT role).
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
    if (!isKnownPermission(o.permission)) continue; // Stale/unknown → ignore
    const eff = effectiveRole(o.role);
    if (eff === "SUPERADMIN") continue; // SUPERADMIN is immutable
    const set = out[eff] ?? (out[eff] = new Set());
    if (o.allowed) set.add(o.permission as Permission);
    else set.delete(o.permission as Permission);
  }
  return out;
}

/**
 * Loads the effective permission matrix for a company from the DB,
 * with a small module cache (TTL 30s). Called by the NextAuth session
 * callback on every request authentication — after which
 * `hasPermission()` can access it synchronously.
 *
 * If `user` is provided, the function additionally loads per-user
 * overrides for that user into the module cache (see above).
 * Optional, so the call from the session callback stays simple;
 * other callers (e.g. UI detail pages for OTHER users) should use
 * `effectivePermissionsForUser()`.
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
      // DB unreachable → static defaults
      overrides = [];
    }
    matrix = buildMatrix(overrides);
    matrixCache.set(companyId, { matrix, loadedAt: Date.now() });
  }
  lastLoadedCompanyId = companyId;

  // Load per-user overrides for the current request user so that
  // existing `hasPermission(session.user.role, perm)` calls automatically
  // pick them up. Fresh per request, no TTL — we want immediate effect
  // on next reload after an owner/admin change.
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
      // DB unreachable → do not apply user overrides
      lastLoadedUserId = null;
      lastLoadedUserRole = null;
      lastLoadedUserGrants = new Set();
      lastLoadedUserDenies = new Set();
    }
  } else {
    // If no user was provided, discard earlier overrides
    // so they do not leak to other requests.
    lastLoadedUserId = null;
    lastLoadedUserRole = null;
    lastLoadedUserGrants = new Set();
    lastLoadedUserDenies = new Set();
  }

  return matrix;
}

/** Manually invalidate (from server action after override update). */
export function invalidatePermissionMatrix(companyId?: string) {
  if (companyId) matrixCache.delete(companyId);
  else matrixCache.clear();
}

/**
 * Invalidate the per-user override cache of the current request. Called
 * by the per-user editor after save so that the next reload immediately
 * sees the new values.
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
 * Sync variant for backward compat — reads from cache if available,
 * otherwise from static defaults.
 *
 * SUPERADMIN always bypasses.
 *
 * If the current request user has per-user overrides (loaded from the
 * session callback) AND the checked role matches the role of this user,
 * the user overrides are applied:
 *   - DENY override → false
 *   - GRANT override → true
 * The heuristic "role matches cached user" prevents user overrides from
 * leaking when displaying a role default overview for a DIFFERENT role.
 */
export function hasPermission(role: UserRole, perm: Permission): boolean {
  if (isSuperAdmin(role)) return true;
  const eff = effectiveRole(role);

  // Base: Role default + Tenant override (RolePermission)
  let allowed: boolean;
  if (lastLoadedCompanyId) {
    const entry = matrixCache.get(lastLoadedCompanyId);
    if (entry) {
      allowed = entry.matrix[eff]?.has(perm) ?? false;
    } else {
      allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
    }
  } else {
    // Fallback: static defaults
    allowed = STATIC_DEFAULTS[eff]?.includes(perm) ?? false;
  }

  // Layer: Per-user override of the current request. Only when the checked
  // role matches the cached user (otherwise it's a generic role view and
  // user overrides are irrelevant).
  if (lastLoadedUserId && lastLoadedUserRole === role) {
    if (lastLoadedUserDenies.has(perm)) return false;
    if (lastLoadedUserGrants.has(perm)) return true;
  }

  return allowed;
}

/**
 * Explicit, unambiguous variant with user object. Use this in new code
 * where the user context is clear (safer than `hasPermission` because
 * no role heuristic is needed).
 *
 * For OTHER users (not the current request user): the overrides in the
 * module cache are NOT applied. To resolve permissions for another user,
 * call `effectivePermissionsForUser`.
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

  // Apply user override only if this is REALLY the cached request user.
  if (lastLoadedUserId === user.id) {
    if (lastLoadedUserDenies.has(perm)) return false;
    if (lastLoadedUserGrants.has(perm)) return true;
  }
  return allowed;
}

/**
 * Async variant with explicit companyId context (safer for multi-tenant).
 * Use in new code paths where you are in a server component.
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
 * Async, accurate effective permissions for any user (not just the current
 * request user). Useful for UI detail pages that display another user's
 * permissions.
 *
 * Order: SUPERADMIN bypass → Static default → RolePermission overrides
 * for the tenant → UserPermission overrides for this user.
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
    // ignore — fallback to role defaults
  }
  for (const o of userOverrides) {
    if (!isKnownPermission(o.permission)) continue;
    if (o.allowed) base.add(o.permission as Permission);
    else base.delete(o.permission as Permission);
  }
  return base;
}

/** Returns all effective permissions for a role. Useful for the UI. */
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
