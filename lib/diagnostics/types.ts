/**
 * Shared types and constants for Owner diagnostics.
 *
 * String unions are intentional instead of Prisma enums. The specification's
 * value lists are large and evolving, and ALTER TYPE migrations for every
 * extension would add unnecessary friction. Validation happens in the
 * application through TypeScript and Zod.
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

/** A finding produced by the engine but not yet persisted. */
export interface FindingCandidate {
  category: FindingCategory;
  severity: Severity;
  title: string;
  message: string;
  technicalDetails?: Record<string, unknown>;
  recommendation?: string;
  /** Stable key used for deduplication and automatic resolution. */
  dedupeKey: string;
}

/** A security event produced by detection but not yet persisted. */
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
