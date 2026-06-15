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
  country: z.string().refine(isKnownCountry, { message: "Unknown country." }),
  timezone: z.string().refine(isKnownTimezone, { message: "Unknown timezone." }),
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
const MAX_LOGO_BYTES = 1_000_000; // 1 MB — generous for PNG/JPG

/**
 * Set the company logo. `dataBase64` is the image body as Base64
 * (the file reader on the client side delivers `data:...;base64,XXX`).
 * We store the raw bytes buffer + MimeType in the Company row.
 */
export async function setCompanyLogo(input: {
  mimeType: string;
  dataBase64: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission 'Edit settings'.");
  }

  if (!ALLOWED_LOGO_MIMES.includes(input.mimeType as (typeof ALLOWED_LOGO_MIMES)[number])) {
    throw new Error("Only PNG or JPG allowed.");
  }
  // Strip data-URL prefix if included
  const base64 = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0) throw new Error("Image data empty.");
  if (buf.length > MAX_LOGO_BYTES) {
    throw new Error(
      `Image too large (${(buf.length / 1024).toFixed(0)} KB) — max. 1 MB.`,
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
    reason: "Company logo uploaded",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
}

export async function clearCompanyLogo() {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission 'Edit settings'.");
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
    reason: "Company logo removed",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
}

// ─────────────────────────────────────────
// Kiosk password set / remove
// ─────────────────────────────────────────

const kioskPasswordSchema = z.object({
  password: z.string().min(4, "At least 4 characters.").max(100),
});

/** Sets or changes the kiosk password of the own company. */
export async function setKioskPassword(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission 'Edit settings'.");
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
    reason: "Kiosk password set/changed",
  });

  revalidatePath("/admin/settings");
}

// ─────────────────────────────────────────
// Kiosk lock timeout (auto-logout) per tenant
// ─────────────────────────────────────────

const kioskLockTimeoutSchema = z.object({
  // 0 = never expire. > 0 = minutes of inactivity until auto-logout.
  // Upper limit: 7 days = 10080 min — anything above should explicitly be "never",
  // otherwise there's no clear distinction from the cookie maximum.
  minutes: z.coerce.number().int().min(0).max(10080),
});

/**
 * Sets the auto-logout duration of the kiosk lock for the own company.
 * `0` = never log out (workshop tablet stays permanently bound,
 * default). Values > 0 = minutes until the tablet falls back to the
 * password screen (sliding window: each successful clock action
 * extends again).
 */
export async function setKioskLockTimeout(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission 'Edit settings'.");
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
        ? "Kiosk auto-logout disabled (never log out)"
        : `Kiosk auto-logout set to ${data.minutes} minutes`,
  });

  revalidatePath("/admin/settings");
}

/** Removes the kiosk password. After that `/kiosk` is open again — only
 *  useful when the app is not publicly accessible. */
export async function clearKioskPassword() {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission.");
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
    reason: "Kiosk password removed",
  });

  revalidatePath("/admin/settings");
}
