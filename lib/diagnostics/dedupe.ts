/**
 * Finding and email deduplication. Pure and explainable.
 *
 * A dedupeKey identifies an issue consistently across runs using category,
 * ruleId, and an optional scope. The same issue produces the same key, so only
 * lastSeenAt is updated instead of creating another finding. If the issue
 * disappears from a run, the open finding is automatically resolved.
 */

import type { Severity } from "./types";

export function buildDedupeKey(
  category: string,
  ruleId: string,
  scope?: string,
): string {
  return scope ? `${category}:${ruleId}:${scope}` : `${category}:${ruleId}`;
}

/**
 * Returns previously open dedupe keys that no longer appear in the current
 * run and can therefore be considered resolved.
 */
export function findResolvedKeys(
  previouslyOpenKeys: string[],
  currentKeys: string[],
): string[] {
  const current = new Set(currentKeys);
  return previouslyOpenKeys.filter((k) => !current.has(k));
}

/**
 * Email deduplication rule.
 *
 * - Info, low, and medium findings are included only in the hourly digest.
 * - High and critical findings, plus security events from medium upward, are
 *   sent immediately. The same dedupe key is sent again only after the
 *   re-notification interval, which defaults to six hours.
 */
const IMMEDIATE_RE_NOTIFY_HOURS = 6;

export interface EmailDedupeInput {
  severity: Severity;
  isSecurity: boolean;
  /** Most recent immediate email for this dedupe key, or null if never sent. */
  lastNotifiedAt: Date | null;
  now?: Date;
}

export function shouldSendImmediateEmail(input: EmailDedupeInput): boolean {
  const eligible = input.isSecurity
    ? input.severity === "medium" ||
      input.severity === "high" ||
      input.severity === "critical"
    : input.severity === "high" || input.severity === "critical";
  if (!eligible) return false;
  if (!input.lastNotifiedAt) return true;
  const now = input.now ?? new Date();
  const hours =
    (now.getTime() - input.lastNotifiedAt.getTime()) / 3_600_000;
  return hours >= IMMEDIATE_RE_NOTIFY_HOURS;
}
