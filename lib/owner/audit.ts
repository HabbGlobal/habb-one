/**
 * Central audit write function for the owner portal.
 *
 * Every owner action, including read actions on customer data, must go through
 * this helper. That gives us exactly **one** place where we ensure IP/UA/request
 * ID are recorded consistently and no sensitive fields (plaintext passwords,
 * OTP codes) land in the payload.
 *
 * The `OwnerAuditLog` table is append-only: no update, no delete. The app DB
 * user must be strictly restricted with
 * `REVOKE UPDATE, DELETE ON "OwnerAuditLog"` (runbook in
 * docs/owner-portal/architecture.md).
 */

import { prisma } from "@/lib/prisma";
import { Prisma, type OwnerAuditAction } from "@prisma/client";
import { readRequestContext } from "@/lib/owner/auth";

export interface AuditWriteInput {
  ownerAccountId: string;
  ownerEmail: string;
  action: OwnerAuditAction;
  targetCompanyId?: string | null;
  targetUserId?: string | null;
  reason?: string | null;
  ticketRef?: string | null;
  /** Snapshot of the entity before the change (JSON-serialisable). */
  payloadBefore?: Prisma.InputJsonValue;
  /** Snapshot of the entity after the change (JSON-serialisable). */
  payloadAfter?: Prisma.InputJsonValue;
  /** For impersonation-related events: which consent token applies. */
  consentTokenId?: string | null;
  /** Idempotency / correlation across multiple audit rows in one request. */
  requestId?: string | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "pinHash",
  "codeHash",
  "code",
  "otp",
  "token",
  "secret",
  "authenticator",
  "publicKey",
]);

/**
 * Defensive scrubber: ensures sensitive fields never end up in an audit row,
 * even if a caller accidentally passes a raw entity. Replaces values with
 * the literal string "[redacted]".
 */
function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }
  return value;
}

export async function ownerAudit(input: AuditWriteInput): Promise<void> {
  const { ip, ua } = await readRequestContext();

  await prisma.ownerAuditLog.create({
    data: {
      ownerAccountId: input.ownerAccountId,
      ownerEmail: input.ownerEmail,
      action: input.action,
      targetCompanyId: input.targetCompanyId ?? null,
      targetUserId: input.targetUserId ?? null,
      reason: input.reason ?? null,
      ticketRef: input.ticketRef ?? null,
      ipAddress: ip,
      userAgent: ua,
      requestId: input.requestId ?? null,
      payloadBefore:
        input.payloadBefore !== undefined
          ? (scrub(input.payloadBefore) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      payloadAfter:
        input.payloadAfter !== undefined
          ? (scrub(input.payloadAfter) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      consentTokenId: input.consentTokenId ?? null,
    },
  });
}
