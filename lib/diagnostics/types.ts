/**
 * Owner-Diagnostics — gemeinsame Typen & Konstanten.
 *
 * Bewusst String-Unions (kein Prisma-Enum): die Wertelisten der Spec
 * sind groß und entwickeln sich; ALTER-TYPE-Migrationen pro Erweiterung
 * wären unnötige Reibung. Validierung passiert App-seitig (TS + Zod).
 */

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_CATEGORIES = [
  "availability",
  "database",
  "auth",
  "storage",
  "api",
  "integration",
  "performance",
  "security",
  "data_quality",
  "configuration",
  "email",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "ignored",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const HEALTH_STATUSES = [
  "healthy",
  "warning",
  "critical",
  "unknown",
] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const SECURITY_SOURCES = [
  "auth",
  "api",
  "database",
  "storage",
  "edge_function",
  "cron",
  "system",
] as const;
export type SecuritySource = (typeof SECURITY_SOURCES)[number];

/** Ein noch-nicht-persistiertes Finding (Engine-Output). */
export interface FindingCandidate {
  category: FindingCategory;
  severity: Severity;
  title: string;
  message: string;
  technicalDetails?: Record<string, unknown>;
  recommendation?: string;
  /** Stabiler Schlüssel für Dedupe & Auto-Resolve (siehe dedupe.ts). */
  dedupeKey: string;
}

/** Ein noch-nicht-persistiertes Security-Event (Detection-Output). */
export interface SecurityEventCandidate {
  eventType: string;
  severity: Severity;
  source: SecuritySource;
  riskScore: number;
  message: string;
  evidence?: Record<string, unknown>;
  actorUserId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
}
