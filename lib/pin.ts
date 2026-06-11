// PIN verification with rate-limiting. Implements:
//   - 5 failed attempts → temporary lock for 5 minutes
//   - Failed attempts and successful resets are written to AuditLog
//   - PIN is bcrypt-hashed; never compare plaintext

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export class PinError extends Error {
  constructor(public code: "INVALID" | "LOCKED" | "INACTIVE", message: string) {
    super(message);
  }
}

export async function verifyEmployeePin(
  employeeId: string,
  pin: string,
  meta: { ipAddress?: string; userAgent?: string } = {}
): Promise<{ id: string; companyId: string; firstName: string; lastName: string }> {
  if (!/^\d{4}$/.test(pin)) throw new PinError("INVALID", "PIN must be 4 digits.");

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.isActive) {
    throw new PinError("INACTIVE", "Employee inactive or not found.");
  }
  if (employee.pinLockedUntil && employee.pinLockedUntil > new Date()) {
    throw new PinError("LOCKED", "Too many wrong attempts. Try again later.");
  }

  const ok = await bcrypt.compare(pin, employee.pinHash);
  if (!ok) {
    const newAttempts = employee.pinFailedAttempts + 1;
    const lockedUntil =
      newAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000)
        : null;
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        pinFailedAttempts: lockedUntil ? 0 : newAttempts,
        pinLockedUntil: lockedUntil,
      },
    });
    await recordAudit({
      companyId: employee.companyId,
      employeeId: employee.id,
      action: "LOGIN_FAILED",
      entityType: "Employee",
      entityId: employee.id,
      reason: lockedUntil ? "PIN locked after too many attempts" : "Wrong PIN",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    if (lockedUntil) throw new PinError("LOCKED", "Locked.");
    throw new PinError("INVALID", "Invalid PIN.");
  }

  if (employee.pinFailedAttempts > 0 || employee.pinLockedUntil) {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });
  }

  return {
    id: employee.id,
    companyId: employee.companyId,
    firstName: employee.firstName,
    lastName: employee.lastName,
  };
}

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits.");
  return bcrypt.hash(pin, 10);
}

export function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
