"use server";

// Server-Actions für manuelle Zeit-Korrekturen (Gleitzeit-Anpassungen)
// in der Personalabrechnung. Erfassbar von CEO + Sekretariat
// (`timeEntries.correct`). Signierte Minuten fliessen in den kumulierten
// Saldo des Lohn-Reports ein.
//
// Erwartete Fehler → strukturiertes { ok:false, error } (Production
// maskiert geworfene Fehler sonst zu einer generischen Meldung).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { localMidnightUtc } from "@/lib/time/zone";

export type AdjustmentResult = { ok: true } | { ok: false; error: string };

class AdjustmentError extends Error {}

async function requireCorrector() {
  const session = await auth();
  if (!session?.user) throw new AdjustmentError("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "timeEntries.correct")) {
    throw new AdjustmentError(
      "Keine Berechtigung — die Rolle CEO oder Sekretariat ist erforderlich.",
    );
  }
  return session.user;
}

const createSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt."),
  // Richtung + Stunden getrennt, damit kein Vorzeichen-Wirrwarr entsteht.
  direction: z.enum(["ADD", "SUBTRACT"]),
  hours: z.coerce
    .number()
    .positive("Stunden müssen grösser als 0 sein.")
    .max(2000, "Wert zu gross."),
  reason: z
    .string()
    .min(3, "Bitte einen Grund (mind. 3 Zeichen) angeben.")
    .max(500),
});

export type CreateAdjustmentInput = z.input<typeof createSchema>;

export async function createTimeAdjustment(
  input: CreateAdjustmentInput,
): Promise<AdjustmentResult> {
  try {
    const user = await requireCorrector();
    const data = createSchema.parse(input);

    const emp = await prisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true, firstName: true, lastName: true },
    });
    if (!emp) throw new AdjustmentError("Mitarbeiter nicht gefunden.");
    if (emp.companyId !== user.companyId) {
      throw new AdjustmentError("Mitarbeiter gehört nicht zu deiner Firma.");
    }

    const sign = data.direction === "SUBTRACT" ? -1 : 1;
    const minutes = sign * Math.round(data.hours * 60);

    const created = await prisma.timeAdjustment.create({
      data: {
        companyId: user.companyId,
        employeeId: emp.id,
        effectiveDate: localMidnightUtc(data.date),
        minutes,
        reason: data.reason,
        createdById: user.id,
      },
    });

    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: emp.id,
      action: "CREATE",
      entityType: "TimeAdjustment",
      entityId: created.id,
      newValue: { date: data.date, minutes, reason: data.reason },
      reason: data.reason,
    });

    revalidatePath("/admin/reports/payroll");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdjustmentError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    throw e;
  }
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteTimeAdjustment(
  input: z.input<typeof deleteSchema>,
): Promise<AdjustmentResult> {
  try {
    const user = await requireCorrector();
    const data = deleteSchema.parse(input);

    const adj = await prisma.timeAdjustment.findUnique({
      where: { id: data.id },
      select: { id: true, companyId: true, employeeId: true, minutes: true, reason: true },
    });
    if (!adj) throw new AdjustmentError("Korrektur nicht gefunden.");
    if (adj.companyId !== user.companyId) {
      throw new AdjustmentError("Korrektur gehört nicht zu deiner Firma.");
    }

    await prisma.timeAdjustment.delete({ where: { id: adj.id } });

    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: adj.employeeId,
      action: "DELETE",
      entityType: "TimeAdjustment",
      entityId: adj.id,
      oldValue: { minutes: adj.minutes, reason: adj.reason },
      reason: "Korrektur entfernt",
    });

    revalidatePath("/admin/reports/payroll");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdjustmentError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    throw e;
  }
}
