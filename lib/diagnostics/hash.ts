/**
 * Einweg-Hash für IP / User-Agent. NIE Rohdaten speichern (DSG).
 * Salt aus OWNER_AUTH_SECRET abgeleitet — stabil (gleiche IP → gleicher
 * Hash für Gruppierung), aber nicht umkehrbar. Kürzt auf 16 Hex-Zeichen
 * (genug für Gruppierung, minimiert Re-Identifikations-Oberfläche).
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
