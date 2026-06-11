"use server";

// Quote-Server-Actions.
//
// Quote-Items haben ab jetzt explizite ProcessSteps (analog Order). Das
// macht den Convert-to-Order verlustfrei: Steps werden 1:1 kopiert.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  idsSchema,
  quoteFullSchema,
  quoteStatusChangeSchema,
} from "@/lib/validation/quote";
import { generateQuoteNumber } from "@/lib/quote/numbering";
import { generateOrderNumber } from "@/lib/order/numbering";
import {
  suggestProcessSteps,
  type SuggestionInput,
} from "@/lib/order/process-suggestion";
import {
  loadAllParams,
  snapshotKeys,
} from "@/lib/domain/parameters/store";
import {
  calcProcessStepMinutes,
} from "@/lib/domain/calculation";
import { allowedNextQuoteStatuses } from "@/lib/dto/quote";

const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

async function requirePerm(perm: Permission) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, perm)) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return r.data;
}

function explainPrismaError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "Feld";
      if (target.includes("quoteNumber")) {
        return "Diese Offerten-Nummer existiert bereits — bitte erneut versuchen.";
      }
      return `Eindeutigkeits-Konflikt: ${target}`;
    }
    if (err.code === "P2025") return "Datensatz nicht gefunden.";
  }
  return null;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

/**
 * Berechnet pro Item die estimatedMinutes pro Step (× Live-Parameter).
 * Wird beim Speichern verwendet damit die Werte nicht vom Client manipuliert
 * werden können.
 */
function recalcStepMinutes(
  item: {
    surfaceM2: number;
    material: Parameters<typeof calcProcessStepMinutes>[0]["material"];
    complexity: Parameters<typeof calcProcessStepMinutes>[0]["complexity"];
    steps: Array<{ processCode: Parameters<typeof calcProcessStepMinutes>[0]["processCode"] }>;
  },
  params: Parameters<typeof calcProcessStepMinutes>[0]["params"],
): number[] {
  return item.steps.map((s) =>
    calcProcessStepMinutes({
      processCode: s.processCode,
      surfaceM2: item.surfaceM2,
      material: item.material,
      complexity: item.complexity,
      params,
    }),
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────
// Create
// ─────────────────────────────────────────

export async function createQuote(input: unknown) {
  const user = await requirePerm("quotes.write");
  const data = parseOrThrow(quoteFullSchema, input);

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: data.core.customerId, companyId: user.companyId },
    select: { id: true },
  });

  const params = await loadAllParams(prisma, user.companyId);

  const itemsWithCalc = data.items.map((it) => {
    const stepMinutes = recalcStepMinutes(
      {
        surfaceM2: it.surfaceM2,
        material: it.material,
        complexity: it.complexity,
        steps: it.steps,
      },
      params,
    );
    const totalMin = stepMinutes.reduce((s, m) => s + m, 0);
    return {
      ...it,
      stepMinutes,
      estimatedMinutes: totalMin,
      totalPriceCHF: round2(it.unitPriceCHF * it.quantity),
    };
  });

  const totalNetCHF = round2(
    itemsWithCalc.reduce((s, it) => s + it.totalPriceCHF, 0),
  );

  let quoteId = "";
  try {
    quoteId = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const quoteNumber = await generateQuoteNumber(tx, user.companyId, year);

      const created = await tx.quote.create({
        data: {
          companyId: user.companyId,
          quoteNumber,
          customerId: customer.id,
          status: "DRAFT",
          validUntil: data.core.validUntil,
          vatRate: data.core.vatRate,
          totalNetCHF,
          notes: data.core.notes ?? null,
          createdById: user.id,
          items: {
            create: itemsWithCalc.map((it) => ({
              position: it.position,
              description: it.description,
              quantity: it.quantity,
              surfaceM2: it.surfaceM2,
              weightKg: it.weightKg ?? null,
              thicknessMm: it.thicknessMm ?? null,
              material: it.material,
              complexity: it.complexity,
              colorCode: it.colorCode ?? null,
              colorSystem: it.colorSystem ?? null,
              glossLevel: it.glossLevel ?? null,
              applicationArea: it.applicationArea ?? null,
              unitPriceCHF: it.unitPriceCHF,
              totalPriceCHF: it.totalPriceCHF,
              notes: it.notes ?? null,
              templateId: it.templateId ?? null,
              estimatedMinutes: it.estimatedMinutes,
              processSteps: {
                create: it.steps.map((st, sIdx) => ({
                  sequence: st.sequence,
                  processCode: st.processCode,
                  machineTypeRequired: st.machineTypeRequired ?? null,
                  skillRequired: st.skillRequired,
                  estimatedMinutes: it.stepMinutes[sIdx],
                  waitMinutesAfter: st.waitMinutesAfter,
                  notes: st.notes ?? null,
                })),
              },
            })),
          },
        },
      });
      return created.id;
    }, TX_OPTS);
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Quote",
    entityId: quoteId,
    newValue: { customerId: customer.id, totalNetCHF },
  });

  revalidatePath("/admin/quotes");
  return { id: quoteId };
}

// ─────────────────────────────────────────
// Update DRAFT
// ─────────────────────────────────────────

export async function updateDraftQuote(quoteId: string, input: unknown) {
  const user = await requirePerm("quotes.write");
  const data = parseOrThrow(quoteFullSchema, input);

  const before = await prisma.quote.findFirstOrThrow({
    where: { id: quoteId, companyId: user.companyId },
    select: { status: true },
  });
  if (before.status !== "DRAFT") {
    throw new Error("Nur Entwürfe können editiert werden.");
  }

  const params = await loadAllParams(prisma, user.companyId);

  const itemsWithCalc = data.items.map((it) => {
    const stepMinutes = recalcStepMinutes(
      {
        surfaceM2: it.surfaceM2,
        material: it.material,
        complexity: it.complexity,
        steps: it.steps,
      },
      params,
    );
    return {
      ...it,
      stepMinutes,
      estimatedMinutes: stepMinutes.reduce((s, m) => s + m, 0),
      totalPriceCHF: round2(it.unitPriceCHF * it.quantity),
    };
  });
  const totalNetCHF = round2(
    itemsWithCalc.reduce((s, it) => s + it.totalPriceCHF, 0),
  );

  await prisma.$transaction(async (tx) => {
    // Items + Steps komplett neu aufbauen
    await tx.quoteItem.deleteMany({ where: { quoteId } });
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        customerId: data.core.customerId,
        validUntil: data.core.validUntil,
        vatRate: data.core.vatRate,
        notes: data.core.notes ?? null,
        totalNetCHF,
        items: {
          create: itemsWithCalc.map((it) => ({
            position: it.position,
            description: it.description,
            quantity: it.quantity,
            surfaceM2: it.surfaceM2,
            weightKg: it.weightKg ?? null,
            thicknessMm: it.thicknessMm ?? null,
            material: it.material,
            complexity: it.complexity,
            colorCode: it.colorCode ?? null,
            colorSystem: it.colorSystem ?? null,
            glossLevel: it.glossLevel ?? null,
            applicationArea: it.applicationArea ?? null,
            unitPriceCHF: it.unitPriceCHF,
            totalPriceCHF: it.totalPriceCHF,
            notes: it.notes ?? null,
            templateId: it.templateId ?? null,
            estimatedMinutes: it.estimatedMinutes,
            processSteps: {
              create: it.steps.map((st, sIdx) => ({
                sequence: st.sequence,
                processCode: st.processCode,
                machineTypeRequired: st.machineTypeRequired ?? null,
                skillRequired: st.skillRequired,
                estimatedMinutes: it.stepMinutes[sIdx],
                waitMinutesAfter: st.waitMinutesAfter,
                notes: st.notes ?? null,
              })),
            },
          })),
        },
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: quoteId,
    newValue: { totalNetCHF, itemCount: data.items.length },
  });

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
}

// ─────────────────────────────────────────
// Status workflow
// ─────────────────────────────────────────

export async function changeQuoteStatus(quoteId: string, input: unknown) {
  const user = await requirePerm("quotes.write");
  const { toStatus, comment } = parseOrThrow(quoteStatusChangeSchema, input);

  const before = await prisma.quote.findFirstOrThrow({
    where: { id: quoteId, companyId: user.companyId },
  });

  if (toStatus === "SENT" && !hasPermission(user.role, "quotes.send")) {
    throw new Error("Keine Berechtigung zum Versenden.");
  }

  if (!allowedNextQuoteStatuses(before.status).includes(toStatus)) {
    throw new Error(`Übergang ${before.status} → ${toStatus} nicht erlaubt.`);
  }

  let snapshot: Record<string, string> | undefined;
  if (before.status === "DRAFT" && toStatus === "SENT") {
    const params = await loadAllParams(prisma, user.companyId);
    const allKeys = params.keys();
    const relevant = snapshotKeys(allKeys);
    const full = params.serialize();
    snapshot = Object.fromEntries(
      relevant.map((k) => [k, full[k]]).filter(([, v]) => v != null),
    ) as Record<string, string>;
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: toStatus,
      ...(snapshot ? { parameterSnapshot: snapshot } : {}),
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: quoteId,
    oldValue: { status: before.status },
    newValue: { status: toStatus, snapshotFrozen: !!snapshot },
    reason: comment ?? null,
  });

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
}

// ─────────────────────────────────────────
// Convert to Order
// ─────────────────────────────────────────

const convertSchema = z.object({
  receivedAt: z.coerce.date().optional(),
  promisedAt: z.coerce.date(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "EXPRESS"]).default("NORMAL"),
});

export async function convertQuoteToOrder(quoteId: string, input: unknown) {
  const user = await requirePerm("orders.write");
  if (!hasPermission(user.role, "quotes.write")) {
    throw new Error("Keine Berechtigung.");
  }

  const data = parseOrThrow(convertSchema, input);

  const quote = await prisma.quote.findFirstOrThrow({
    where: { id: quoteId, companyId: user.companyId },
    include: {
      items: { include: { processSteps: true } },
    },
  });

  if (quote.status !== "ACCEPTED") {
    throw new Error("Nur angenommene Offerten können in einen Auftrag umgewandelt werden.");
  }
  if (quote.convertedToOrderId) {
    throw new Error("Diese Offerte wurde bereits in einen Auftrag umgewandelt.");
  }

  // Quote-Total wird als Auftrags-Preis übernommen — Kunde hat akzeptiert
  const totalNetCHF = Number(quote.totalNetCHF);

  let orderId = "";
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const orderNumber = await generateOrderNumber(tx, user.companyId, year);

      const created = await tx.order.create({
        data: {
          companyId: user.companyId,
          orderNumber,
          customerId: quote.customerId,
          status: "CONFIRMED",
          priority: data.priority,
          receivedAt: data.receivedAt ?? new Date(),
          promisedAt: data.promisedAt,
          notes: quote.notes,
          totalNetCHF,
          parameterSnapshot: quote.parameterSnapshot ?? undefined,
          createdById: user.id,
          items: {
            create: quote.items
              .sort((a, b) => a.position - b.position)
              .map((it) => ({
                position: it.position,
                description: it.description,
                quantity: it.quantity,
                surfaceM2: it.surfaceM2 ?? 1,
                weightKg: it.weightKg ?? null,
                thicknessMm: it.thicknessMm ?? null,
                material: it.material ?? "OTHER",
                complexity: it.complexity ?? "NORMAL",
                colorCode: it.colorCode,
                colorSystem: it.colorSystem,
                glossLevel: it.glossLevel,
                applicationArea: it.applicationArea,
                unitPriceCHF: it.unitPriceCHF,
                notes: it.notes,
                processSteps: {
                  create: [...it.processSteps]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((s) => ({
                      sequence: s.sequence,
                      processCode: s.processCode,
                      machineTypeRequired: s.machineTypeRequired,
                      skillRequired: s.skillRequired,
                      estimatedMinutes: s.estimatedMinutes,
                      waitMinutesAfter: s.waitMinutesAfter,
                      notes: s.notes,
                    })),
                },
              })),
          },
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: "DRAFT",
                changedById: user.id,
                comment: `Erfasst aus Offerte ${quote.quoteNumber}`,
              },
              {
                fromStatus: "DRAFT",
                toStatus: "CONFIRMED",
                changedById: user.id,
                comment: "Direkt bestätigt — Offerte angenommen",
              },
            ],
          },
        },
      });

      await tx.quote.update({
        where: { id: quoteId },
        data: { convertedToOrderId: created.id },
      });

      return created.id;
    }, TX_OPTS);
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Order",
    entityId: orderId,
    newValue: { fromQuote: quoteId, quoteNumber: quote.quoteNumber },
    reason: "Quote converted to Order",
  });

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/orders");
  return { orderId };
}

// ─────────────────────────────────────────
// Bulk
// ─────────────────────────────────────────

export async function bulkDeleteDraftQuotes(rawIds: unknown) {
  const user = await requirePerm("quotes.write");
  const ids = parseOrThrow(idsSchema, rawIds);
  const owned = await prisma.quote.findMany({
    where: { id: { in: ids }, companyId: user.companyId, status: "DRAFT" },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error(
      "Nur Entwürfe können gelöscht werden. Versendete Offerten lassen sich nicht entfernen.",
    );
  }
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Quote", entityId: id,
      reason: "Bulk delete (DRAFT)",
    });
  }
  await prisma.quote.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId, status: "DRAFT" },
  });
  revalidatePath("/admin/quotes");
}

// ─────────────────────────────────────────
// Apply Process-Template — analog applyProcessTemplate in Order-Action
// ─────────────────────────────────────────

export async function applyQuoteProcessTemplate(args: { templateId: string }) {
  const user = await requirePerm("quotes.write");

  const dbTpl = args.templateId.length > 20
    ? await prisma.processTemplate.findFirst({
        where: { id: args.templateId, companyId: user.companyId, deletedAt: null },
        include: { steps: { orderBy: { sequence: "asc" } } },
      })
    : await prisma.processTemplate.findFirst({
        where: {
          companyId: user.companyId,
          key: args.templateId,
          deletedAt: null,
        },
        include: { steps: { orderBy: { sequence: "asc" } } },
      });

  if (!dbTpl) throw new Error("Vorlage nicht gefunden.");

  return dbTpl.steps.map((s, i) => ({
    sequence: (i + 1) * 10,
    processCode: s.processCode,
    machineTypeRequired: s.machineTypeRequired,
    skillRequired: s.skillRequired,
    waitMinutesAfter: s.defaultWaitMinutes,
  }));
}

// ─────────────────────────────────────────
// Spritzwerk-Recommender — Schritte vorschlagen anhand Material/Anwendung
// ─────────────────────────────────────────

const recommendSchema = z.object({
  material: z.enum([
    "STEEL_S235", "STEEL_HIGH_C", "STAINLESS", "ALUMINIUM",
    "GALVANIZED", "CAST_IRON", "OTHER",
  ]),
  complexity: z.enum(["SIMPLE", "NORMAL", "COMPLEX", "VERY_COMPLEX"]).nullable().optional(),
  applicationArea: z.enum(["INDOOR", "OUTDOOR", "BOTH"]).nullable().optional(),
  glossLevel: z.enum(["MATT", "SEMI_GLOSS", "GLOSSY", "HIGH_GLOSS"]).nullable().optional(),
  colorSystem: z.enum(["RAL", "NCS", "PANTONE", "CUSTOM"]).nullable().optional(),
  coatingMode: z.enum(["WET_PAINT", "POWDER"]).nullable().optional(),
});

/**
 * Spritzwerk-Spezialisten-Vorschlag: schlägt anhand Material + Anwendungs-
 * bereich + Glanz eine sinnvolle Schrittfolge vor (z. B. SA2.5 + 2K-Lack
 * für Outdoor-Stahl). Keine DB — pure Logik. User kann das Resultat 1:1
 * übernehmen oder editieren.
 */
export async function recommendQuoteProcessSteps(input: unknown) {
  await requirePerm("quotes.read");
  const data = recommendSchema.parse(input);
  const result = suggestProcessSteps(data as SuggestionInput);
  return {
    steps: result.steps.map((s) => ({
      sequence: s.sequence,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      waitMinutesAfter: s.waitMinutesAfter,
      rationale: s.rationale,
    })),
    warnings: result.warnings,
  };
}
