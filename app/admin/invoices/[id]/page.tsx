import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import {
  toInvoiceDetailDTO,
  allowedNextInvoiceStatuses,
  invoiceStatusLabel,
} from "@/lib/dto/invoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Pencil, Lock, AlertTriangle } from "lucide-react";
import { formatQrReferenceDisplay } from "@/lib/invoice/qr-reference";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceForm } from "../InvoiceForm";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
function fmtCHF(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "invoices.read")) redirect("/admin");

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      customer: { include: { contacts: true, addresses: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!invoice) notFound();

  const dto = toInvoiceDetailDTO(invoice);
  const nextStatuses = allowedNextInvoiceStatuses(dto.status);
  const canWrite = hasPermission(session.user.role, "invoices.write");
  const canMarkPaid = hasPermission(session.user.role, "invoices.markPaid");
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: session.user.companyId },
    select: { invoiceDefaultVatRate: true, invoicePaymentTerms: true, qrIban: true },
  });

  let editorInitial = null;
  let customerOptions = null;
  if (dto.status === "DRAFT" && canWrite) {
    const customers = await prisma.customer.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [{ companyName: "asc" }, { customerNumber: "desc" }],
    });
    customerOptions = customers.map((c) => ({
      id: c.id,
      label: customerDisplayName(c),
      customerNumber: c.customerNumber,
    }));
    editorInitial = {
      invoiceId: dto.id,
      core: {
        customerId: dto.customerId,
        issuedAtIso: dto.issuedAt.toISOString().slice(0, 10),
        dueAtIso: dto.dueAt.toISOString().slice(0, 10),
        vatRate: dto.vatRate,
        notes: dto.notes ?? undefined,
      },
      items: dto.items.map((it, i) => ({
        cid: `e${i}`,
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPriceCHF: it.unitPriceCHF,
        discountPct: it.discountPct,
      })),
    };
  }

  const STATUS_VARIANT: Record<typeof dto.status, "default" | "secondary" | "outline" | "info" | "success" | "destructive" | "warning"> = {
    DRAFT: "outline",
    SENT: "info",
    PAID: "success",
    OVERDUE: "destructive",
    CANCELLED: "secondary",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold font-mono tabular-nums">
              {dto.invoiceNumber}
            </h1>
            <Badge variant={STATUS_VARIANT[dto.status]}>
              {invoiceStatusLabel(dto.status)}
            </Badge>
            {dto.qrBillReference && (
              <Badge variant="info" className="gap-1">
                <Lock className="h-3 w-3" /> QR-Referenz vergeben
              </Badge>
            )}
            {dto.isOverdue && dto.status !== "OVERDUE" && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />overdue</Badge>
            )}
            {dto.reminderLevel > 0 && (
              <Badge variant="warning">Mahnung Stufe {dto.reminderLevel}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Kunde:{" "}
            <Link
              href={`/admin/customers/${dto.customerId}`}
              className="underline hover:text-foreground"
            >
              {dto.customerDisplayName}
            </Link>
            {dto.orderId && (
              <>
                {" · "}
                <Link
                  href={`/admin/orders/${dto.orderId}`}
                  className="underline hover:text-foreground"
                >
                  Auftrag öffnen
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/invoices/${dto.id}/qr-bill.pdf`} target="_blank">
              <FileText className="h-4 w-4 mr-1" /> Rechnung (PDF)
            </a>
          </Button>
        </div>
      </div>

      {/* Hinweis wenn QR-IBAN fehlt */}
      {!company.qrIban && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              Keine QR-IBAN konfiguriert. Bitte unter{" "}
              <Link href="/admin/settings" className="underline">Settings</Link>{" "}
              eintragen, sonst kann die Rechnung nicht versendet werden.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Facts */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Fact label="Date" value={fmtDate(dto.issuedAt)} />
          <Fact
            label="Fällig am"
            value={fmtDate(dto.dueAt)}
            highlight={dto.isOverdue}
          />
          <Fact label="Bezahlt am" value={fmtDate(dto.paidAt)} />
          <Fact label="MwSt-Satz" value={`${dto.vatRate} %`} />
          <Fact label="Total brutto" value={fmtCHF(dto.totalGrossCHF)} bold />
        </CardContent>
      </Card>

      {/* Status-Workflow */}
      {nextStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status-Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceActions
              invoiceId={dto.id}
              currentStatus={dto.status}
              allowedNext={nextStatuses}
              totalGrossCHF={dto.totalGrossCHF}
              reminderLevel={dto.reminderLevel}
              canMarkPaid={canMarkPaid}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit (DRAFT) oder Read-only Items */}
      {dto.status === "DRAFT" && canWrite && editorInitial && customerOptions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Rechnung bearbeiten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceForm
              mode="edit"
              customers={customerOptions}
              defaults={{
                vatRate: Number(company.invoiceDefaultVatRate),
                paymentTerms: company.invoicePaymentTerms,
              }}
              initial={editorInitial}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positionen</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-2 w-12">Pos.</th>
                  <th className="text-left py-2">Beschreibung</th>
                  <th className="text-right py-2 w-20">Menge</th>
                  <th className="text-right py-2 w-24">Stückpreis</th>
                  <th className="text-right py-2 w-20">Rabatt</th>
                  <th className="text-right py-2 w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {dto.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2 font-mono tabular-nums text-xs text-muted-foreground">
                      {it.position}
                    </td>
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right tabular-nums">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtCHF(it.unitPriceCHF)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {it.discountPct > 0 ? `-${it.discountPct}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {fmtCHF(it.totalCHF)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="py-2 text-right text-muted-foreground">
                    Total netto
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtCHF(dto.totalNetCHF)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="py-1 text-right text-muted-foreground">
                    + MwSt {dto.vatRate}%
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtCHF(dto.vatCHF)}</td>
                </tr>
                <tr className="border-t-2 border-foreground">
                  <td colSpan={5} className="py-2 text-right font-semibold">
                    Total brutto
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-emerald-700">
                    {fmtCHF(dto.totalGrossCHF)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* QR-Referenz Block (nur SENT+) */}
      {dto.qrBillReference && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR-Rechnungs-Referenz</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm tabular-nums select-all">
              {formatQrReferenceDisplay(dto.qrBillReference)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Diese Referenz wird beim Zahlungsabgleich verwendet, um eingehende
              Beträge zu identifizieren.
            </p>
          </CardContent>
        </Card>
      )}

      {dto.notes && dto.status !== "DRAFT" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notizen</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-line">{dto.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={[
          "tabular-nums",
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
