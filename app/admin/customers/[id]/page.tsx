import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  toCustomerDetailDTO,
  customerDisplayName,
} from "@/lib/dto/customer";
import { formatDateTimeLocal } from "@/lib/time/zone";
import { CustomerForm } from "../CustomerForm";
import { CustomerDetailTabs } from "./CustomerDetailTabs";
import { AddressManager } from "./AddressManager";
import { ContactManager } from "./ContactManager";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { PRIVATE: "Private", BUSINESS: "Business" } as const;

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "customers.read")) redirect("/admin");

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      addresses: { orderBy: [{ isDefault: "desc" }] },
      orders: {
        orderBy: { receivedAt: "desc" },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          priority: true,
          receivedAt: true,
          promisedAt: true,
          totalNetCHF: true,
        },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          validUntil: true,
          totalNetCHF: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { issuedAt: "desc" },
        take: 50,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          paidAt: true,
          totalNetCHF: true,
        },
      },
    },
  });

  if (!customer || customer.companyId !== session.user.companyId) notFound();

  const canWrite = hasPermission(session.user.role, "customers.write");
  const dto = toCustomerDetailDTO(customer);

  // Statistics — basic aggregates. Order/invoice queries are bounded to
  // current calendar year for "YTD".
  const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`);
  const stats = {
    totalOrders: customer.orders.length,
    openOrders: customer.orders.filter((o) =>
      ["DRAFT", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(o.status),
    ).length,
    revenueYTD: customer.invoices
      .filter((i) => i.status !== "CANCELLED" && i.issuedAt >= yearStart)
      .reduce((sum, i) => sum + Number(i.totalNetCHF), 0),
    avgOrderValue:
      customer.orders.length > 0
        ? customer.orders.reduce(
            (sum, o) => sum + Number(o.totalNetCHF ?? 0),
            0,
          ) / customer.orders.length
        : 0,
    lastOrderAt: customer.orders[0]?.receivedAt ?? null,
  };

  // Activity (last 50 audit-log entries for this customer / its addresses /
  // its contacts). Schema-wise: AuditLog stores entityType + entityId.
  const activity = await prisma.auditLog.findMany({
    where: {
      companyId: session.user.companyId,
      OR: [
        { entityType: "Customer", entityId: id },
        { entityType: "Address", entityId: { in: customer.addresses.map((a) => a.id) } },
        { entityType: "Contact", entityId: { in: customer.contacts.map((c) => c.id) } },
      ],
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-muted-foreground font-mono">
            {customer.customerNumber}
          </div>
          <h1 className="text-2xl font-semibold">
            {customerDisplayName(customer)}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={customer.type === "BUSINESS" ? "info" : "secondary"}>
              {TYPE_LABEL[customer.type]}
            </Badge>
            <Badge variant={customer.isActive ? "success" : "secondary"}>
              {customer.isActive ? "Active" : "Inactive"}
            </Badge>
            {dto.archivedAt && <Badge variant="warning">Archived</Badge>}
            {dto.deletedAt && <Badge variant="destructive">Trash</Badge>}
          </div>
        </div>
        <Link
          href="/admin/customers"
          className="text-sm text-muted-foreground hover:underline"
        >← Back</Link>
      </div>

      <CustomerDetailTabs
        master={
          <CustomerForm
            mode={{ kind: "edit", customerId: id }}
            initial={{
              type: dto.type,
              companyName: dto.companyName ?? "",
              vatNumber: dto.vatNumber ?? "",
              language: dto.language,
              paymentTerms: dto.paymentTerms,
              defaultDiscount:
                dto.defaultDiscount != null ? String(dto.defaultDiscount) : "",
              creditLimit:
                dto.creditLimit != null ? String(dto.creditLimit) : "",
              notes: dto.notes ?? "",
              isActive: dto.isActive,
            }}
          />
        }
        addresses={
          <AddressManager
            customerId={id}
            addresses={dto.addresses}
            canWrite={canWrite}
          />
        }
        contacts={
          <ContactManager
            customerId={id}
            contacts={dto.contacts}
            canWrite={canWrite}
          />
        }
        orders={
          <Card>
            <CardContent className="p-4">
              {customer.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No orders yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {customer.orders.map((o) => (
                    <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-mono">{o.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          Eingang {o.receivedAt.toLocaleDateString("en-GB")} ·
                          Liefertermin {o.promisedAt.toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={statusVariant(o.status)}>{statusLabel(o.status)}</Badge>
                        <span className="tabular-nums">
                          {o.totalNetCHF != null ? formatCHF(Number(o.totalNetCHF)) : "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        }
        quotes={
          <Card>
            <CardContent className="p-4">
              {customer.quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quotes yet.</p>
              ) : (
                <ul className="divide-y">
                  {customer.quotes.map((q) => (
                    <li key={q.id} className="py-2 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-mono">{q.quoteNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          Created {q.createdAt.toLocaleDateString("en-GB")} · valid until{" "}
                          {q.validUntil.toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{q.status}</Badge>
                        <span className="tabular-nums">
                          {formatCHF(Number(q.totalNetCHF))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        }
        invoices={
          <Card>
            <CardContent className="p-4">
              {customer.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invoices yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {customer.invoices.map((i) => (
                    <li key={i.id} className="py-2 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-mono">{i.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          Ausgestellt {i.issuedAt.toLocaleDateString("en-GB")} ·
                          fällig {i.dueAt.toLocaleDateString("en-GB")}
                          {i.paidAt && ` · bezahlt ${i.paidAt.toLocaleDateString("en-GB")}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={i.status === "PAID" ? "success" : i.status === "OVERDUE" ? "destructive" : "secondary"}>
                          {i.status}
                        </Badge>
                        <span className="tabular-nums">
                          {formatCHF(Number(i.totalNetCHF))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        }
        stats={
          <Card>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total orders" value={String(stats.totalOrders)} />
              <Stat
                label="Open orders"
                value={String(stats.openOrders)}
                tone={stats.openOrders > 0 ? "warning" : "muted"}
              />
              <Stat label="Umsatz YTD" value={formatCHF(stats.revenueYTD)} />
              <Stat
                label="Ø Auftragswert"
                value={formatCHF(stats.avgOrderValue)}
              />
              <Stat
                label="Last order"
                value={
                  stats.lastOrderAt
                    ? stats.lastOrderAt.toLocaleDateString("en-GB")
                    : "—"
                }
              />
              <Stat
                label="Payment terms"
                value={`${customer.paymentTerms} Days`}
              />
              <Stat
                label="Standard discount"
                value={
                  customer.defaultDiscount
                    ? `${Number(customer.defaultDiscount)}%`
                    : "—"
                }
              />
              <Stat
                label="Credit limit"
                value={
                  customer.creditLimit
                    ? formatCHF(Number(customer.creditLimit))
                    : "—"
                }
              />
            </CardContent>
          </Card>
        }
        activity={
          <Card>
            <CardContent className="p-4">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity logged yet.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                        {formatDateTimeLocal(a.createdAt)}
                      </span>
                      <span>
                        <strong>{a.user?.name ?? "System"}</strong>{" "}
                        <span className="text-muted-foreground">
                          {a.action} {a.entityType}
                          {a.reason ? ` — ${a.reason}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "muted" | "warning";
}) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={
          tone === "warning"
            ? "text-2xl font-semibold text-amber-700 tabular-nums"
            : "text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

function statusVariant(s: string): "secondary" | "success" | "warning" | "info" | "destructive" {
  if (s === "DELIVERED" || s === "INVOICED" || s === "COMPLETED") return "success";
  if (s === "ON_HOLD") return "warning";
  if (s === "IN_PROGRESS" || s === "CONFIRMED") return "info";
  if (s === "CANCELLED") return "destructive";
  return "secondary";
}

function statusLabel(s: string): string {
  return {
    DRAFT: "Draft",
    CONFIRMED: "Confirmed",
    IN_PROGRESS: "In Progress",
    ON_HOLD: "On Hold",
    COMPLETED: "Completed",
    DELIVERED: "Delivered",
    INVOICED: "Invoiced",
    CANCELLED: "Cancelled",
  }[s] ?? s;
}
