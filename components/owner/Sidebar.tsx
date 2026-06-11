import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  Users2,
  Activity,
  CreditCard,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import type { OwnerRole } from "@prisma/client";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Sichtbar nur für mindestens diese Rolle. */
  minRole?: OwnerRole;
}

const NAV_PRIMARY: NavItem[] = [
  { href: "/owner", label: "Dashboard", icon: LayoutDashboard },
  { href: "/owner/tenants", label: "Mandanten", icon: Building2 },
  { href: "/owner/registrations", label: "Registrierungen", icon: Inbox },
  { href: "/owner/audit", label: "Audit-Log", icon: ClipboardList },
  { href: "/owner/diagnostics", label: "Diagnose", icon: ShieldAlert },
  { href: "/owner/system", label: "System", icon: Activity },
];

const NAV_SECONDARY: NavItem[] = [
  { href: "/owner/team", label: "Owner-Team", icon: Users2, minRole: "OWNER_ROOT" },
  { href: "/owner/billing", label: "Billing", icon: CreditCard },
  { href: "/owner/settings", label: "Mein Profil", icon: SettingsIcon },
];

const ROLE_ORDER: Record<OwnerRole, number> = {
  OWNER_SUPPORT: 1,
  OWNER_ADMIN: 2,
  OWNER_ROOT: 3,
};

function visible(item: NavItem, role: OwnerRole): boolean {
  return !item.minRole || ROLE_ORDER[role] >= ROLE_ORDER[item.minRole];
}

export function OwnerSidebar({
  role,
  ownerEmail,
  ownerName,
}: {
  role: OwnerRole;
  ownerEmail: string;
  ownerName: string;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-habb-ink text-white">
      <div className="px-5 pt-6 pb-4">
        <Link href="/owner" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span>habb</span>
          <span className="text-habb-red">.ch</span>
        </Link>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-white/50">
          Owner
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <SidebarSection label="Operativ">
          {NAV_PRIMARY.filter((n) => visible(n, role)).map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </SidebarSection>

        <SidebarSection label="Plattform">
          {NAV_SECONDARY.filter((n) => visible(n, role)).map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </SidebarSection>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-medium uppercase">
            {ownerName.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{ownerName}</p>
            <p className="truncate text-[11px] text-white/50">{ownerEmail}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
          <ShieldCheck className="h-3 w-3" />
          <span>{role}</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/85 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:text-white focus-visible:outline-none motion-reduce:transition-none"
    >
      <Icon className="h-4 w-4 text-white/60" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
