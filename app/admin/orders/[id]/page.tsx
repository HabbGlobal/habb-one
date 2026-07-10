import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import {
  toOrderDetailDTO,
  allowedNextStatuses,
  statusLabel,
  priorityLabel,
} from "@/lib/dto/order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  QrCode,
  Pencil,
  History as HistoryIcon,
  Lock,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { OrderStatusActions } from "../OrderStatusActions";
import { OrderWizard } from "../OrderWizard";
import { getCompanyLocale } from "@/lib/company-context";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";
import { loadActiveTemplates } from "@/lib/templates/load";
import {
  materialLabel,
  complexityLabel,
  colorSystemLabel,
} from "@/lib/order/labels";
import { StepBillingRow } from "./StepBillingRow";
import { AutoRefresh } from "./AutoRefresh";
import { SchedulingSection, type ScheduledStepDTO } from "./SchedulingSection";
import { processLabel } from "@/lib/order/labels";
import { CreateInvoiceButton } from "./CreateInvoiceButton";

export const dynamic = "force-dynamic";

function fmtMin(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "orders.read")) redirect("/admin");

  const companyLocale = await getCompanyLocale(session.user.companyId);

  const fmtDate = (d: Date | null): string => {
    if (!d) return "—";
    return new Intl.DateTimeFormat(companyLocale.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: companyLocale.timezone,
    }).format(d);
  };

  const fmtDateTime = (d: Date): string => {
    return new Intl.DateTimeFormat(companyLocale.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: companyLocale.timezone,
    }).format(d);
  };

  const fmtCHF = (n: number | null): string => {
    if (n == null) return "—";
    return new Intl.NumberFormat(companyLocale.locale, {
      style: "currency",
      currency: companyLocale.currency,
    }).format(n);
  };

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      customer: { include: { contacts: true, addresses: true } },
      contactPerson: true,
      shippingAddress: true,
      billingAddress: true,
      items: {
        include: { processSteps: true },
        orderBy: { position: "asc" },
      },
      statusHistory: { orderBy: { changedAt: "desc" } },
      scheduleEntries: {
        include: {
          machine: { select: { name: true } },
          processStep: { select: { id: true, sequence: true, processCode: true } },
          conflicts: { where: { resolvedAt: null } },
        },
        orderBy: { plannedStart: "asc" },
      },
      invoices: { select: { id: true } },
    },
  });
  if (!order) notFound();

  // OrderStatusHistory has no Prisma relation to User — fetch names separately.
  const changerIds = Array.from(new Set(order.statusHistory.map((h) => h.changedById)));
  const users = changerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: changerIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNames = new Map(users.map((u) => [u.id, u.name ?? "—"]));

  const dto = toOrderDetailDTO(order, userNames);
  const nextStatuses = allowedNextStatuses(dto.status);
  const canWrite = hasPermission(session.user.role, "orders.write");
  const canConfirm = hasPermission(session.user.role, "orders.confirm");
  const canCancel = hasPermission(session.user.role, "orders.cancel");
  // Only ADMIN may override the billing source per step.
  const canAdminBilling = session.user.role === "ADMIN";

  // Convert schedule entries to DTO (for SchedulingSection)
  const scheduledSteps: ScheduledStepDTO[] = order.scheduleEntries.map((e) => ({
    entryId: e.id,
    stepId: e.processStepId,
    sequence: e.processStep.sequence,
    processLabel: processLabel(e.processStep.processCode),
    machineName: e.machine?.name ?? null,
    plannedStart: e.plannedStart,
    plannedEnd: e.plannedEnd,
    isLocked: e.isLocked,
    conflicts: e.conflicts.map((c) => ({
      type: c.type,
      severity: c.severity,
      message: c.message,
    })),
  }));
  const canScheduleWrite = hasPermission(session.user.role, "schedule.write");

  // Aggregate across all items for the time overview card
  const totalEstimated = dto.items.reduce((s, it) => s + it.totalEstimatedMinutes, 0);
  const totalBilled = dto.items.reduce((s, it) => s + it.totalBilledMinutes, 0);
  const totalActual = dto.items.every((it) => it.totalActualMinutes != null)
    ? dto.items.reduce((s, it) => s + (it.totalActualMinutes ?? 0), 0)
    : null;

  const isLate =
    new Date() > dto.promisedAt &&
    !["COMPLETED", "DELIVERED", "INVOICED", "CANCELLED"].includes(dto.status);

  // Build initial wizard data only when we'll render the editor (DRAFT)
  let editorInitial = null;
  let customerOptions = null;
  let editorTemplates: Array<{ id: string; label: string; description: string }> = [];
  if (dto.status === "DRAFT" && canWrite) {
    editorTemplates = (await loadActiveTemplates(prisma, session.user.companyId)).map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description ?? "",
    }));
    const customers = await prisma.customer.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
        addresses: { orderBy: [{ isDefault: "desc" }] },
      },
    });
    customerOptions = customers.map((c) => ({
      id: c.id,
      label: customerDisplayName(c),
      customerNumber: c.customerNumber,
      defaultDiscount: c.defaultDiscount ? Number(c.defaultDiscount) : 0,
      contacts: c.contacts.map((ct) => ({
        id: ct.id,
        label: `${ct.firstName} ${ct.lastName}${ct.position ? ` · ${ct.position}` : ""}`,
        isPrimary: ct.isPrimary,
      })),
      addresses: c.addresses.map((a) => ({
        id: a.id,
        label: `${a.street}, ${a.zip} ${a.city}`,
        type: a.type,
      })),
    }));
    editorInitial = {
      orderId: dto.id,
      core: {
        customerId: dto.customerId,
        contactPersonId: dto.contactPersonId ?? undefined,
        shippingAddressId: dto.shippingAddressId ?? undefined,
        billingAddressId: dto.billingAddressId ?? undefined,
        priority: dto.priority,
        receivedAt: dto.receivedAt,
        promisedAt: dto.promisedAt,
        internalDeadline: dto.internalDeadline,
        notes: dto.notes ?? undefined,
        customerNotes: dto.customerNotes ?? undefined,
        receivedAtIso: dto.receivedAt.toISOString().slice(0, 10),
        promisedAtIso: dto.promisedAt.toISOString().slice(0, 10),
        internalDeadlineIso: dto.internalDeadline
          ? dto.internalDeadline.toISOString().slice(0, 10)
          : null,
      },
      items: dto.items.map((it) => ({
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        surfaceM2: it.surfaceM2,
        weightKg: it.weightKg,
        thicknessMm: it.thicknessMm,
        material: it.material,
        complexity: it.complexity,
        colorCode: it.colorCode ?? undefined,
        colorSystem: it.colorSystem,
        glossLevel: it.glossLevel,
        unitPriceCHF: it.unitPriceCHF,
        notes: it.notes ?? undefined,
        steps: it.processSteps.map((s) => ({
          sequence: s.sequence,
          processCode: s.processCode,
          machineTypeRequired: s.machineTypeRequired,
          skillRequired: s.skillRequired,
          estimatedMinutes: s.estimatedMinutes,
          waitMinutesAfter: s.waitMinutesAfter,
          notes: s.notes ?? undefined,
        })),
      })),
    };
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold font-mono tabular-nums">
              {dto.orderNumber}
            </h1>
            <Badge>{statusLabel(dto.status)}</Badge>
            {dto.priority !== "NORMAL" && (
              <Badge
                variant={
                  dto.priority === "EXPRESS"
                    ? "destructive"
                    : dto.priority === "HIGH"
                    ? "warning"
                    : "outline"
                }
              >
                {priorityLabel(dto.priority)}
              </Badge>
            )}
            {dto.hasSnapshot && (
              <Badge variant="info" className="gap-1">
                <Lock className="h-3 w-3" /> Snapshot frozen
              </Badge>
            )}
            {isLate && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Customer:{" "}
            <Link
              href={`/admin/customers/${dto.customerId}`}
              className="underline hover:text-foreground"
            >
              {dto.customerDisplayName}
            </Link>
            {dto.contactPersonName && ` · Contact: ${dto.contactPersonName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/orders/${dto.id}/confirmation.pdf`} target="_blank">
              <FileText className="h-4 w-4 mr-1" /> Order confirmation
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/orders/${dto.id}/delivery-note.pdf`} target="_blank">
              <Download className="h-4 w-4 mr-1" /> Delivery note
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/orders/${dto.id}/qr-label.pdf`} target="_blank">
              <QrCode className="h-4 w-4 mr-1" /> QR label
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={`/api/admin/orders/${dto.id}/traveler.pdf`} target="_blank">
              <ClipboardList className="h-4 w-4 mr-1" /> Workshop traveler
            </a>
          </Button>
          {hasPermission(session.user.role, "invoices.write") &&
            ["COMPLETED", "DELIVERED"].includes(dto.status) && (
              <CreateInvoiceButton
                orderId={dto.id}
                hasInvoice={order.invoices.length > 0}
              />
            )}
        </div>
      </div>

      {/* Auto-refresh while the order is live (scans possible) */}
      <AutoRefresh
        enabled={["CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(dto.status)}
      />

      {/* ── Quick facts ── */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Fact label="Received" value={fmtDate(dto.receivedAt)} />
          <Fact
            label="Delivery date"
            value={fmtDate(dto.promisedAt)}
            highlight={isLate}
          />
          <Fact
            label="Internal deadline"
            value={fmtDate(dto.internalDeadline)}
          />
          <Fact label="Tracking ID" value={dto.trackingId} mono />
          <Fact label="Total (net)" value={fmtCHF(dto.totalNetCHF)} bold />
        </CardContent>
      </Card>

      {/* ── Status workflow ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusActions
            orderId={dto.id}
            currentStatus={dto.status}
            allowedNext={nextStatuses}
            canConfirm={canConfirm}
            canCancel={canCancel}
          />
          {dto.status === "DRAFT" && (
            <p className="text-xs text-muted-foreground mt-3">
              On the transition <strong>Draft → Confirmed</strong>, the
              current calculation parameters are frozen — price and
              step durations will no longer change afterward.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Scheduling (only visible for active orders) ── */}
      {["CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(dto.status) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Workshop scheduling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SchedulingSection
              orderId={dto.id}
              steps={scheduledSteps}
              canWrite={canScheduleWrite}
              timezone={companyLocale.timezone}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Edit form (DRAFT only) — otherwise read-only items ── */}
      {dto.status === "DRAFT" && canWrite && editorInitial && customerOptions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderWizard
              mode="edit"
              customers={customerOptions}
              templates={editorTemplates}
              processResources={PROCESS_RESOURCES}
              initial={editorInitial}
              currency={companyLocale.currency}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Time totals card above the line items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Total estimated</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmtMin(totalEstimated)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total actual (scans)</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {totalActual != null ? (
                      fmtMin(totalActual)
                    ) : (
                      <span className="text-base text-muted-foreground italic">
                        incomplete
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Billed (per-step selection)
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-emerald-700">
                    {fmtMin(totalBilled)}
                  </div>
                </div>
              </div>
              {canAdminBilling && (
                <p className="text-xs text-muted-foreground mt-3">
                  Tap the pencil icon on a row to change the billing source
                  (Actual / Estimated / Manual). ADMIN only.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dto.items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-lg border-l-4 border-l-blue-300 border bg-card p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">
                        Item {it.position} — {it.description}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.quantity}× · {it.surfaceM2} m² · {materialLabel(it.material)} · {complexityLabel(it.complexity)}
                        {it.colorCode && ` · ${colorSystemLabel(it.colorSystem)} ${it.colorCode}`.trim()}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground">
                        Estimated: {fmtMin(it.totalEstimatedMinutes)}
                      </div>
                      {it.totalActualMinutes != null && (
                        <div>Actual: {fmtMin(it.totalActualMinutes)}</div>
                      )}
                      <div className="font-semibold text-emerald-700">
                        Billed: {fmtMin(it.totalBilledMinutes)}
                      </div>
                      {it.unitPriceCHF != null && (
                        <div className="text-muted-foreground tabular-nums mt-1">
                          {fmtCHF(it.unitPriceCHF * it.quantity)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Header for step table */}
                  <div className="mt-3 grid grid-cols-12 gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="col-span-1">#</span>
                    <span className="col-span-3">Process</span>
                    <span className="col-span-1">Skill</span>
                    <span className="col-span-1">Machine</span>
                    <span className="col-span-1 text-right">Est.</span>
                    <span className="col-span-1 text-right">Actual</span>
                    <span className="col-span-1 text-right">Billed</span>
                    <span className="col-span-2 text-right">Source</span>
                    <span className="col-span-1 text-right">{canAdminBilling ? "Edit" : "Status"}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {it.processSteps.map((s) => (
                      <StepBillingRow
                        key={s.id}
                        step={s}
                        canEdit={canAdminBilling && dto.status !== "DRAFT"}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Notes ── */}
      {(dto.notes || dto.customerNotes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dto.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Internal notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">
                {dto.notes}
              </CardContent>
            </Card>
          )}
          {dto.customerNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">
                {dto.customerNotes}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Status history ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" /> Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dto.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries.</p>
          ) : (
            <ul className="text-sm divide-y">
              {dto.history.map((h) => (
                <li
                  key={h.id}
                  className="py-2 flex flex-wrap items-baseline gap-x-3"
                >
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDateTime(h.changedAt)}
                  </span>
                  <span className="font-medium">
                    {h.fromStatus
                      ? `${statusLabel(h.fromStatus)} → ${statusLabel(h.toStatus)}`
                      : `Created (${statusLabel(h.toStatus)})`}
                  </span>
                  {h.comment && (
                    <span className="text-xs text-muted-foreground italic">
                      „{h.comment}&ldquo;
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    — {h.changedByName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  highlight,
  bold,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={[
          mono ? "font-mono text-xs" : "",
          bold ? "font-semibold" : "",
          highlight ? "text-destructive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
    </div>
  );
}