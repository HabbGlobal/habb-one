/**
 * One-way hash for IP addresses and user agents. Never store raw data.
 * The salt is derived from OWNER_AUTH_SECRET, producing a stable hash for
 * grouping identical values without making the source reversible. The result
 * is shortened to 16 hexadecimal characters, which is sufficient for grouping
 * while reducing the re-identification surface.
 */
import { createHash } from "crypto";

function salt(): string {
  return process.env.OWNER_AUTH_SECRET || process.env.AUTH_SECRET || "habb-diag";
}

export function hashSensitive(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(`${salt()}:${value}`)
    .digest("hex")
    .slice(0, 16);
}
