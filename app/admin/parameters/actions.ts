"use server";

// CEO-only system-parameter editing. Every change is:
//   1. range-validated against the seed's min/max;
//   2. persisted with a `ParameterChangeLog` row carrying the user-supplied
//      `reason` (mandatory — UI enforces it, server double-checks);
//   3. mirrored to the global AuditLog as `PARAMETER_UPDATE`;
//   4. invalidated via `revalidateTag("system-params")` so any
//      consumer pages re-fetch the new values.

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "parameters.write")) {
    throw new Error("Nur ADMIN darf Parameter ändern.");
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

// ─────────────────────────────────────────
// updateParameter
// ─────────────────────────────────────────

const updateSchema = z.object({
  key: z.string().min(1),
  newValue: z.string().min(1),
  reason: z.string().trim().min(3, "Begründung mit mindestens 3 Zeichen ist Pflicht."),
});

export async function updateParameter(input: unknown) {
  const data = parseOrThrow(updateSchema, input);
  const user = await requireAdmin();

  // Composite PK [companyId, key] — verhindert per Design, dass ein
  // Mandant einen Parameter eines anderen Tenants editiert.
  const param = await prisma.systemParameter.findUnique({
    where: { companyId_key: { companyId: user.companyId, key: data.key } },
  });
  if (!param) throw new Error("Parameter nicht gefunden.");

  // Same-value short-circuit (avoids polluting the change-log with no-ops).
  if (param.currentValue === data.newValue) {
    return { changed: false };
  }

  // Range validation — same logic the seed uses, applied to the parsed numeric
  // value. Booleans/strings skip the check since min/max don't apply.
  if (param.minValue || param.maxValue) {
    const n = Number(data.newValue);
    if (!Number.isFinite(n)) {
      throw new Error(`„${param.label}": Wert muss eine Zahl sein.`);
    }
    if (param.minValue && n < Number(param.minValue)) {
      throw new Error(
        `„${param.label}": Minimum ${param.minValue}${param.unit ?? ""}.`,
      );
    }
    if (param.maxValue && n > Number(param.maxValue)) {
      throw new Error(
        `„${param.label}": Maximum ${param.maxValue}${param.unit ?? ""}.`,
      );
    }
  }
  if (param.valueType === "INTEGER") {
    const n = Number(data.newValue);
    if (!Number.isInteger(n)) {
      throw new Error(`„${param.label}": Ganzzahl erforderlich.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.systemParameter.update({
      where: { companyId_key: { companyId: user.companyId, key: data.key } },
      data: { currentValue: data.newValue, updatedById: user.id },
    });
    await tx.parameterChangeLog.create({
      data: {
        parameterCompanyId: user.companyId,
        parameterKey: data.key,
        oldValue: param.currentValue,
        newValue: data.newValue,
        changedById: user.id,
        reason: data.reason,
      },
    });
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "PARAMETER_UPDATE",
    entityType: "SystemParameter",
    entityId: data.key,
    oldValue: { value: param.currentValue },
    newValue: { value: data.newValue },
    reason: data.reason,
  });

  revalidateTag("system-params");
  revalidatePath("/admin/parameters");
  return { changed: true };
}

// ─────────────────────────────────────────
// resetToDefault
// ─────────────────────────────────────────

const resetSchema = z.object({
  key: z.string().min(1),
  reason: z.string().trim().min(3, "Begründung erforderlich."),
});

export async function resetParameterToDefault(input: unknown) {
  const data = parseOrThrow(resetSchema, input);
  const user = await requireAdmin();
  const param = await prisma.systemParameter.findUnique({
    where: { companyId_key: { companyId: user.companyId, key: data.key } },
  });
  if (!param) throw new Error("Parameter nicht gefunden.");
  if (param.currentValue === param.defaultValue) {
    return { changed: false };
  }
  return updateParameter({
    key: data.key,
    newValue: param.defaultValue,
    reason: `[Reset] ${data.reason}`,
  });
}

// ─────────────────────────────────────────
// bulkUpdate (used by Excel-Import)
// ─────────────────────────────────────────

const bulkSchema = z.object({
  reason: z.string().trim().min(3, "Begründung erforderlich."),
  updates: z
    .array(
      z.object({
        key: z.string().min(1),
        newValue: z.string().min(1),
      }),
    )
    .min(1)
    .max(500),
});

export async function bulkUpdateParameters(input: unknown) {
  const data = parseOrThrow(bulkSchema, input);
  await requireAdmin(); // re-authorised inside updateParameter() too — defense-in-depth

  const results: { key: string; changed: boolean; error?: string }[] = [];
  for (const u of data.updates) {
    try {
      const r = await updateParameter({
        key: u.key,
        newValue: u.newValue,
        reason: data.reason,
      });
      results.push({ key: u.key, changed: r.changed });
    } catch (err) {
      results.push({
        key: u.key,
        changed: false,
        error: err instanceof Error ? err.message : "Fehler",
      });
    }
  }
  return { results };
}
