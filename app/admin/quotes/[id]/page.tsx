import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import {
  toQuoteDetailDTO,
  allowedNextQuoteStatuses,
  quoteStatusLabel,
} from "@/lib/dto/quote";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Pencil, Lock } from "lucide-react";
import {
  materialLabel,
  complexityLabel,
  colorSystemLabel,
  glossLevelLabel,
  processLabel,
  machineLabel,
  skillLabel,
} from "@/lib/order/labels";
import { loadActiveTemplates } from "@/lib/templates/load";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";
import { QuoteActions } from "./QuoteActions";
import { QuoteWizard } from "../QuoteWizard";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(d);
}
function fmtCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}
function fmtMin(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} Min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} Min`;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "quotes.read")) redirect("/admin");

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      customer: { include: { contacts: true, addresses: true } },
      items: {
        include: { processSteps: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!quote) notFound();

  const dto = toQuoteDetailDTO(quote);
  const nextStatuses = allowedNextQuoteStatuses(dto.status);
  const canWrite = hasPermission(session.user.role, "quotes.write");
  const canSend = hasPermission(session.user.role, "quotes.send");
  const canConvert = hasPermission(session.user.role, "orders.write");
  const isConverted = dto.convertedToOrderId !== null;

  // Edit-Form-Daten nur wenn DRAFT
  let editorInitial = null;
  let customerOptions = null;
  let editorTemplates: Array<{ id: string; label: string; description: string }> = [];
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
    editorTemplates = (
      await loadActiveTemplates(prisma, session.user.companyId)
    ).map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description ?? "",
    }));
    editorInitial = {
      quoteId: dto.id,
      core: {
        customerId: dto.customerId,
        validUntilIso: dto.validUntil.toISOString().slice(0, 10),
        vatRate: dto.vatRate,
        notes: dto.notes ?? undefined,
      },
      items: dto.items.map((it, i) => ({
        cid: `e${i}`,
        position: it.position,
        description: it.description,
        quantity: it.quantity,
        surfaceM2: it.surfaceM2 ?? 1,
        weightKg: it.weightKg,
        thicknessMm: it.thicknessMm,
        material: (it.material ?? "STEEL_S235") as "STEEL_S235",
        complexity: (it.complexity ?? "NORMAL") as "NORMAL",
        colorCode: it.colorCode ?? "",
        colorSystem: (it.colorSystem ?? "") as "RAL" | "NCS" | "PANTONE" | "CUSTOM" | "",
        glossLevel: (it.glossLevel ?? "") as "MATT" | "SEMI_GLOSS" | "GLOSSY" | "HIGH_GLOSS" | "",
        applicationArea: (it.applicationArea ?? "") as "INDOOR" | "OUTDOOR" | "BOTH" | "",
        unitPriceCHF: it.unitPriceCHF,
        notes: it.notes ?? "",
        templateId: it.templateId ?? "",
        steps: it.steps.map((s) => ({
          sequence: s.sequence,
          processCode: s.processCode,
          machineTypeRequired: s.machineTypeRequired,
          skillRequired: s.skillRequired,
          waitMinutesAfter: s.waitMinutesAfter,
          notes: s.notes ?? "",
        })),
      })),
    };
  }

  const totalEstimated = dto.items.reduce(
    (s, it) => s + it.totalEstimatedMinutes,
    0,
  );

  const STATUS_VARIANT: Record<typeof dto.status, "default" | "secondary" | "outline" | "info" | "success" | "destructive" | "warning"> = {
    DRAFT: "outline",
    SENT: "info",
    ACCEPTED: "success",
    REJECTED: "destructive",
    EXPIRED: "secondary",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold font-mono tabular-nums">
              {dto.quoteNumber}
            </h1>
            <Badge variant={STATUS_VARIANT[dto.status]}>{quoteStatusLabel(dto.status)}</Badge>
            {dto.hasSnapshot && (
              <Badge variant="info" className="gap-1">
                <Lock className="h-3 w-3" /> Snapshot eingefroren
              </Badge>
            )}
            {isConverted && dto.convertedToOrderId && (
              <Link
                href={`/admin/orders/${dto.convertedToOrderId}`}
                className="text-sm underline"
              >
                → Auftrag öffnen
              </Link>
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
            {" · "}
            Gültig bis: {fmtDate(dto.validUntil)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/quotes/${dto.id}/offer.pdf`} target="_blank">
              <FileText className="h-4 w-4 mr-1" /> Offerte (PDF)
            </a>
          </Button>
        </div>
      </div>

      {/* Quick Facts */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Fact label="Erstellt" value={fmtDate(dto.createdAt)} />
          <Fact label="Gültig bis" value={fmtDate(dto.validUntil)} />
          <Fact label="MwSt-Satz" value={`${dto.vatRate} %`} />
          <Fact label="Total netto" value={fmtCHF(dto.totalNetCHF)} bold />
        </CardContent>
      </Card>

      {/* Status-Workflow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status-Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteActions
            quoteId={dto.id}
            currentStatus={dto.status}
            allowedNext={nextStatuses}
            isConverted={isConverted}
            canSend={canSend}
            canConvert={canConvert}
          />
          {dto.status === "DRAFT" && (
            <p className="text-xs text-muted-foreground mt-3">
              Beim Versand werden die aktuellen Berechnungs-Parameter eingefroren —
              Preise bleiben für den Kunden bis zum Gültigkeits-Datum verbindlich.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit (DRAFT) oder Read-only Items */}
      {dto.status === "DRAFT" && canWrite && editorInitial && customerOptions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Offerte bearbeiten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteWizard
              mode="edit"
              customers={customerOptions}
              templates={editorTemplates}
              processResources={PROCESS_RESOURCES}
              initial={editorInitial}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dto.items.map((it) => (
              <div
                key={it.id}
                className="rounded-lg border-l-4 border-l-blue-300 border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      Pos. {it.position} — {it.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {it.quantity}×
                      {it.surfaceM2 != null && ` · ${it.surfaceM2} m²`}
                      {it.material && ` · ${materialLabel(it.material)}`}
                      {it.complexity && ` · ${complexityLabel(it.complexity)}`}
                      {it.colorCode &&
                        ` · ${colorSystemLabel(it.colorSystem)} ${it.colorCode}`.trim()}
                      {it.glossLevel && ` · ${glossLevelLabel(it.glossLevel)}`}
                    </div>
                    {it.notes && (
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                        {it.notes}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {fmtCHF(it.unitPriceCHF)} × {it.quantity}
                    </div>
                    <div className="font-semibold tabular-nums">
                      {fmtCHF(it.totalPriceCHF)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtMin(it.totalEstimatedMinutes)} Aufwand
                    </div>
                  </div>
                </div>
                {/* Steps read-only */}
                {it.steps.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1 text-xs">
                    {it.steps.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-12 gap-2 items-center px-2 py-1 rounded bg-muted/40"
                      >
                        <span className="col-span-1 font-mono tabular-nums text-muted-foreground">
                          {s.sequence}
                        </span>
                        <span className="col-span-4 font-medium">
                          {processLabel(s.processCode)}
                        </span>
                        <span className="col-span-2 text-muted-foreground">
                          {skillLabel(s.skillRequired)}
                        </span>
                        <span className="col-span-2 text-muted-foreground">
                          {machineLabel(s.machineTypeRequired)}
                        </span>
                        <span className="col-span-3 tabular-nums text-right">
                          {fmtMin(s.estimatedMinutes)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Summen */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Schätzung gesamt</div>
                <div className="font-medium tabular-nums">
                  {totalEstimated > 0 ? fmtMin(totalEstimated) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total netto</div>
                <div className="font-medium tabular-nums">{fmtCHF(dto.totalNetCHF)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">+ MwSt {dto.vatRate}%</div>
                <div className="text-lg font-semibold tabular-nums text-emerald-700">
                  {fmtCHF(
                    Math.round(dto.totalNetCHF * (1 + dto.vatRate / 100) * 100) / 100,
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notizen */}
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

function Fact({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={bold ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</div>
    </div>
  );
}
