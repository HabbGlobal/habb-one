// Type-safe parameter map. Loaded once per server request, then queried by
// pure calculation functions. NEVER hardcode parameter values in code —
// every default lives in `lib/domain/parameters/seeds.ts`, every runtime
// value lives in the `SystemParameter` table.

import type { PrismaClient, SystemParameter } from "@prisma/client";

/**
 * Read-only, dotted-key map of system parameters with strongly-typed
 * accessors. Keys follow the pattern `<category>.<sub>.<field>` exactly as
 * seeded.
 *
 * Example:
 *   const map = await loadAllParams(prisma);
 *   const minPerM2 = map.getNumber("process.BLAST_SA25.minutesPerM2");
 *   const ovenTemp = map.getInteger("curing.polyester-standard.ovenTempC");
 */
export interface SystemParameterMap {
  has(key: string): boolean;
  /** Throws if key is missing. */
  getNumber(key: string): number;
  /** Throws if key is missing or value is not an integer. */
  getInteger(key: string): number;
  /** CHF — same numeric domain as getNumber but documents intent. */
  getCurrency(key: string): number;
  /** 0..100 — percent stored as decimal value. */
  getPercent(key: string): number;
  getBoolean(key: string): boolean;
  getString(key: string): string;
  /** Returns undefined for missing keys. */
  tryGetNumber(key: string): number | undefined;
  /** Plain object form for embedding into Order.parameterSnapshot. */
  serialize(): Record<string, string>;
  /** Iterate all known keys (debug / introspection). */
  keys(): string[];
}

/**
 * Build a parameter map from raw rows (or a snapshot record). Preferred
 * factory for tests — production code uses `loadAllParams(prisma)`.
 */
export function buildParameterMap(rows: Pick<SystemParameter, "key" | "currentValue">[]): SystemParameterMap {
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.key, r.currentValue);
  return wrap(map);
}

/** Build from a serialized snapshot (Order.parameterSnapshot). */
export function buildParameterMapFromSnapshot(snapshot: Record<string, string>): SystemParameterMap {
  return wrap(new Map(Object.entries(snapshot)));
}

/** Production: load all rows of a specific tenant in a single query.
 *  `companyId` ist Pflicht — vorher war die Tabelle global, jetzt hat
 *  jeder Mandant seine eigene Kalibrierung. */
export async function loadAllParams(
  prisma: PrismaClient,
  companyId: string,
): Promise<SystemParameterMap> {
  const rows = await prisma.systemParameter.findMany({
    where: { companyId },
    select: { key: true, currentValue: true },
  });
  return buildParameterMap(rows);
}

function wrap(values: Map<string, string>): SystemParameterMap {
  const required = (key: string): string => {
    const v = values.get(key);
    if (v === undefined) {
      throw new Error(`SystemParameter not found: ${key}`);
    }
    return v;
  };
  const parseNum = (v: string, key: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new Error(`SystemParameter ${key}: not a number (got ${JSON.stringify(v)})`);
    }
    return n;
  };
  return {
    has: (key) => values.has(key),
    getNumber: (key) => parseNum(required(key), key),
    getInteger: (key) => {
      const n = parseNum(required(key), key);
      if (!Number.isInteger(n)) {
        throw new Error(`SystemParameter ${key}: not an integer (got ${n})`);
      }
      return n;
    },
    getCurrency: (key) => parseNum(required(key), key),
    getPercent: (key) => parseNum(required(key), key),
    getBoolean: (key) => required(key) === "true",
    getString: (key) => required(key),
    tryGetNumber: (key) => {
      const v = values.get(key);
      if (v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    },
    serialize: () => Object.fromEntries(values),
    keys: () => Array.from(values.keys()),
  };
}

/**
 * Returns the subset of parameter keys that affect Order/Quote calculations.
 * Used when freezing `parameterSnapshot` on status transitions.
 */
export function snapshotKeys(allKeys: string[]): string[] {
  return allKeys.filter((k) =>
    k.startsWith("process.") ||
    k.startsWith("curing.") ||
    k.startsWith("drying.") ||
    k.startsWith("material.") ||
    k.startsWith("complexity.") ||
    k.startsWith("pricing.") ||
    k.startsWith("tax.")
  );
}
