"use client";

// Left admin sidebar with logical grouping, active highlight and
// mobile hamburger-drawer variant.
//
// Server-side data (username, company name, translations) are injected
// as props from the parent server component (AdminShell) — we keep
// this client component lean.
//
// Permission filtering: each NavItem can have a `requiredPerm`.
// Items whose permission the user lacks are hidden.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  Receipt,
  CalendarRange,
  Workflow,
  Cog,
  LayoutGrid,
  CalendarDays,
  Clock,
  Plane,
  PartyPopper,
  BarChart3,
  SlidersHorizontal,
  Settings,
  ScrollText,
  ShieldCheck,
  Activity,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/LogoutButton";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Wenn gesetzt, wird der Eintrag nur gezeigt, wenn der User diese Permission hat. */
  requiredPerm?: string;
  /** Wenn gesetzt, nur sichtbar wenn dieses Modul im Plan des Mandanten ist. */
  requiredModule?: string;
  /** Wenn true: nur SUPERADMIN sieht diesen Eintrag. */
  superAdminOnly?: boolean;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Sales",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, requiredPerm: "customers.read", requiredModule: "CRM" },
      { href: "/admin/quotes", label: "Quotes", icon: FileText, requiredPerm: "quotes.read", requiredModule: "ORDERS_QUOTES" },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList, requiredPerm: "orders.read", requiredModule: "ORDERS_QUOTES" },
      { href: "/admin/invoices", label: "Invoices", icon: Receipt, requiredPerm: "invoices.read", requiredModule: "INVOICES_QR" },
    ],
  },
  {
    title: "Workshop",
    items: [
      { href: "/admin/scheduler", label: "Workshop Plan", icon: CalendarRange, requiredPerm: "schedule.read", requiredModule: "WORKSHOP_PLAN" },
      { href: "/admin/machines", label: "Machines", icon: Cog, requiredPerm: "machines.read", requiredModule: "WORKSHOP_PLAN" },
      { href: "/admin/areas", label: "Areas", icon: LayoutGrid, requiredPerm: "settings.read", requiredModule: "WORKSHOP_PLAN" },
      { href: "/admin/templates", label: "Process Templates", icon: Workflow, requiredPerm: "templates.read", requiredModule: "ORDERS_QUOTES" },
    ],
  },
  {
    title: "Staff",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users, requiredPerm: "employees.read" },
      { href: "/admin/attendance", label: "Attendance", icon: Activity, requiredPerm: "attendance.read", requiredModule: "TIME_KIOSK" },
      { href: "/admin/schedule", label: "Staff Plan", icon: CalendarDays, requiredPerm: "schedule.read", requiredModule: "STAFF_PLAN" },
      { href: "/admin/time-entries", label: "Time Entries", icon: Clock, requiredPerm: "timeEntries.read", requiredModule: "TIME_KIOSK" },
      { href: "/admin/absences", label: "Absences", icon: Plane, requiredPerm: "absences.read" },
      { href: "/admin/holidays", label: "Holidays", icon: PartyPopper, requiredPerm: "settings.read" },
    ],
  },
  {
    title: "Reports",
    items: [{ href: "/admin/reports", label: "Reports", icon: BarChart3, requiredPerm: "reports.export" }],
  },
  {
    title: "System",
    items: [
      { href: "/admin/parameters", label: "Parameters", icon: SlidersHorizontal, requiredPerm: "parameters.read" },
      { href: "/admin/settings", label: "Settings", icon: Settings, requiredPerm: "settings.read" },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, requiredPerm: "audit.read" },
      { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
];

interface Props {
  companyLabel: string;
  appName: string;
  /** URL to the company logo (e.g. /api/company/logo?v=…) or null. */
  logoUrl?: string | null;
  userName: string | null;
  userRole: string | null;
  userRoleLabel: string | null;
  /** Effective permissions for the current user (computed server-side). */
  permissions: string[];
  /** Modules included in the tenant's plan (computed server-side). */
  enabledModules: string[];
}

export function AdminSidebar({
  companyLabel,
  appName,
  logoUrl,
  userName,
  userRole,
  userRoleLabel,
  permissions,
  enabledModules,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const permSet = new Set(permissions);
  const moduleSet = new Set(enabledModules);
  const isSuperAdmin = userRole === "SUPERADMIN";

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      // Module gate applies to ALL roles — the plan is tenant-wide;
      // even SUPERADMIN cannot use a module that isn't subscribed.
      if (item.requiredModule && !moduleSet.has(item.requiredModule)) {
        return false;
      }
      if (item.superAdminOnly) return isSuperAdmin;
      if (!item.requiredPerm) return true;
      if (isSuperAdmin) return true;
      return permSet.has(item.requiredPerm);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile header (visible only on < md) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-habb-line px-4 py-2 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2 min-w-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${companyLabel} – ${appName}`}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <span className="font-semibold text-sm truncate text-habb-ink">
              <span className="text-habb-muted text-xs mr-1">{companyLabel}</span>
              {appName}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded text-habb-ink hover:bg-habb-paper"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile-Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — HABB-Dunkel: schwarz mit roten Akzenten, passt zur Login-Seite */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-64 bg-habb-black text-white flex flex-col transition-transform duration-200",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Header */}
        <div className="px-3 py-4 border-b border-white/10 flex items-start justify-between gap-2">
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className="block min-w-0 flex-1"
          >
            {logoUrl ? (
              // Logo contains the company name → we only show the image,
              // large on white background (sidebar itself is dark).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${companyLabel} – ${appName}`}
                className="bg-white rounded-md p-2 w-full max-h-16 object-contain"
              />
            ) : (
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-white/50 truncate">
                  {companyLabel}
                </div>
                <div className="text-base font-semibold truncate">
                  HABB <span className="text-habb-red">One</span>
                </div>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav (scrollable) */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {visibleGroups.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                          active
                            ? "bg-habb-red text-white font-medium shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
                            : "text-white/75 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer: User + Logout */}
        {userName && (
          <div className="px-5 py-3 border-t border-white/10">
            <div className="text-sm font-medium text-white truncate">{userName}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              {userRoleLabel ?? userRole}
            </div>
          </div>
        )}
        <div className="bg-white text-habb-ink border-t border-white/10 px-3 py-3 flex items-center justify-end gap-2">
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}

/**
 * Active match logic: an item is active when the current path starts with it.
 * Dashboard ("/admin") only matches exactly — otherwise it would light up
 * on every sub-path.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
