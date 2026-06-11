/**
 * Finding-Dedupe & E-Mail-Dedupe — rein & nachvollziehbar.
 *
 * dedupeKey identifiziert ein Problem stabil über Läufe hinweg
 * (category + ruleId + optionalem Scope). Gleiches Problem → selber
 * Key → kein neues Finding, nur lastSeenAt-Update. Verschwindet das
 * Problem in einem Lauf, wird das offene Finding auto-resolved.
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
 * Auto-Resolve-Diff: welche zuvor offenen dedupeKeys tauchen im
 * aktuellen Lauf NICHT mehr auf → gelten als behoben.
 */
export function findResolvedKeys(
  previouslyOpenKeys: string[],
  currentKeys: string[],
): string[] {
  const current = new Set(currentKeys);
  return previouslyOpenKeys.filter((k) => !current.has(k));
}

/**
 * E-Mail-Dedupe-Regel.
 *
 * - info/low/medium: NICHT einzeln sofort mailen (nur Hourly Digest).
 * - high/critical & Security ab medium: sofort mailen, aber re-mail
 *   für denselben dedupeKey erst nach `reNotifyHours` (Default 6 h).
 */
const IMMEDIATE_RE_NOTIFY_HOURS = 6;

export interface EmailDedupeInput {
  severity: Severity;
  isSecurity: boolean;
  /** Letzte Sofort-Mail für diesen dedupeKey (null = noch nie). */
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
