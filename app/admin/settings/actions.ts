"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { isKnownCountry, isKnownTimezone } from "@/lib/company-locale";

const schema = z.object({
  name: z.string().min(1),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  country: z.string().refine(isKnownCountry, { message: "Unbekanntes Land." }),
  timezone: z.string().refine(isKnownTimezone, { message: "Unbekannte Zeitzone." }),
  defaultWeeklyHours: z.coerce.number().min(0).max(80),
  defaultVacationDaysYear: z.coerce.number().min(0).max(60),
  defaultBreakMinutes: z.coerce.number().int().min(0).max(180),
  roundingMinutes: z.coerce.number().int().min(0).max(60),
  maxDailyHours: z.coerce.number().min(0).max(24),
  maxWeeklyHours: z.coerce.number().min(0).max(168),
  highOvertimeHours: z.coerce.number().min(0).max(500),
  defaultLanguage: z.enum(["de", "en"]),
});

export async function updateCompanySettings(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTH");
  if (!hasPermission(session.user.role, "settings.write")) throw new Error("FORBIDDEN");
  const data = schema.parse(input);

  const before = await prisma.company.findUniqueOrThrow({ where: { id: session.user.companyId } });
  await prisma.company.update({
    where: { id: session.user.companyId },
    data: {
      name: data.name,
      address: data.address || null,
      city: data.city || null,
      country: data.country,
      timezone: data.timezone,
      defaultWeeklyHours: data.defaultWeeklyHours,
      defaultVacationDaysYear: data.defaultVacationDaysYear,
      defaultBreakMinutes: data.defaultBreakMinutes,
      roundingMinutes: data.roundingMinutes,
      maxDailyHours: data.maxDailyHours,
      maxWeeklyHours: data.maxWeeklyHours,
      highOvertimeHours: data.highOvertimeHours,
      defaultLanguage: data.defaultLanguage,
    },
  });
  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    oldValue: { name: before.name, defaultWeeklyHours: before.defaultWeeklyHours },
    newValue: data,
  });
  revalidatePath("/admin/settings");
}

// ─────────────────────────────────────────
// Logo-Upload + -Entfernung
// ─────────────────────────────────────────

const ALLOWED_LOGO_MIMES = ["image/png", "image/jpeg", "image/jpg"] as const;
const MAX_LOGO_BYTES = 1_000_000; // 1 MB — locker für PNG/JPG

/**
 * Logo der Firma setzen. `dataBase64` ist der Bild-Body als Base64
 * (der File-Reader auf der Client-Seite liefert `data:...;base64,XXX`).
 * Wir speichern den raw Bytes-Buffer + MimeType in der Company-Row.
 */
export async function setCompanyLogo(input: {
  mimeType: string;
  dataBase64: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung 'Edit settings'.");
  }

  if (!ALLOWED_LOGO_MIMES.includes(input.mimeType as (typeof ALLOWED_LOGO_MIMES)[number])) {
    throw new Error("Nur PNG oder JPG erlaubt.");
  }
  // Strip data-URL prefix wenn mitgeschickt
  const base64 = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0) throw new Error("Bild-Daten leer.");
  if (buf.length > MAX_LOGO_BYTES) {
    throw new Error(
      `Bild zu groß (${(buf.length / 1024).toFixed(0)} KB) — max. 1 MB.`,
    );
  }

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: {
      logoData: buf,
      logoMimeType: input.mimeType === "image/jpg" ? "image/jpeg" : input.mimeType,
    },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    newValue: { logoSet: true, mimeType: input.mimeType, sizeBytes: buf.length },
    reason: "Firmenlogo hochgeladen",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
}

export async function clearCompanyLogo() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung 'Edit settings'.");
  }

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: { logoData: null, logoMimeType: null },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    reason: "Firmenlogo entfernt",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
}

// ─────────────────────────────────────────
// Kiosk-Passwort setzen / entfernen
// ─────────────────────────────────────────

const kioskPasswordSchema = z.object({
  password: z.string().min(4, "Mindestens 4 Zeichen.").max(100),
});

/** Setzt oder ändert das Kiosk-Passwort der eigenen Firma. */
export async function setKioskPassword(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung 'Edit settings'.");
  }

  const data = kioskPasswordSchema.parse(input);
  const hash = await bcrypt.hash(data.password, 10);

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: { kioskPasswordHash: hash },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    reason: "Kiosk-Passwort gesetzt/geändert",
  });

  revalidatePath("/admin/settings");
}

// ─────────────────────────────────────────
// Kiosk-Lock-Timeout (Auto-Logout) pro Mandant
// ─────────────────────────────────────────

const kioskLockTimeoutSchema = z.object({
  // 0 = nie ablaufen. > 0 = Minuten Inaktivität bis Auto-Logout.
  // Obergrenze: 7 Tage = 10080 min — alles drüber soll explizit „nie"
  // sein, sonst gäbe es keinen klaren Unterschied zum Cookie-Maximum.
  minutes: z.coerce.number().int().min(0).max(10080),
});

/**
 * Setzt die Auto-Logout-Dauer des Kiosk-Lock für die eigene Firma.
 * `0` = niemals ausloggen (Werkstatt-Tablet bleibt dauerhaft gebunden,
 * Default). Werte > 0 = Minuten bis das Tablet zurück auf den
 * Passwort-Screen fällt (Sliding-Window: jede erfolgreiche Stempel-
 * Aktion verlängert wieder).
 */
export async function setKioskLockTimeout(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung 'Edit settings'.");
  }

  const data = kioskLockTimeoutSchema.parse(input);

  const before = await prisma.company.findUniqueOrThrow({
    where: { id: session.user.companyId },
    select: { kioskLockTimeoutMinutes: true },
  });

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: { kioskLockTimeoutMinutes: data.minutes },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    oldValue: { kioskLockTimeoutMinutes: before.kioskLockTimeoutMinutes },
    newValue: { kioskLockTimeoutMinutes: data.minutes },
    reason:
      data.minutes === 0
        ? "Kiosk-Auto-Logout deaktiviert (nie ausloggen)"
        : `Kiosk-Auto-Logout auf ${data.minutes} Minuten gesetzt`,
  });

  revalidatePath("/admin/settings");
}

/** Entfernt das Kiosk-Passwort. Danach ist `/kiosk` wieder offen — nur
 *  sinnvoll wenn die App nicht öffentlich erreichbar ist. */
export async function clearKioskPassword() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung.");
  }

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: { kioskPasswordHash: null },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: session.user.companyId,
    reason: "Kiosk-Passwort entfernt",
  });

  revalidatePath("/admin/settings");
}
