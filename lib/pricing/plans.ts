/**
 * Public Pricing-Definition.
 *
 * Single Source of Truth für die Pricing-Seite UND die Owner-Billing-Anzeige.
 * Werte hier ändern, App passt sich automatisch an (MRR-Schätzung, Plan-Karten,
 * Modul-Sichtbarkeit später).
 *
 * Preise sind INKL. MWST (8.1 % CH-Standard, Stand Januar 2024). Wenn du sie
 * exkl. ausweisen willst → `displayInclusiveVat = false`.
 */

import type { TenantModule } from "@prisma/client";

export const PRICING_VAT_RATE = 8.1;

export interface ModuleSpec {
  key: TenantModule;
  label: string;
  /** Kurzbeschreibung in der Modul-Vergleichstabelle. */
  description: string;
  /** Längere Erklärung, kann auf der Pricing-Seite als Tooltip-Inhalt dienen. */
  longDescription: string;
}

export const MODULES: Record<TenantModule, ModuleSpec> = {
  CRM: {
    key: "CRM",
    label: "CRM — Kunden",
    description: "Stammdaten, Kontakte, Adressen, Mehrsprachigkeit",
    longDescription:
      "Pflege Privat- und Geschäftskunden mit Adressen, Kontaktpersonen, Zahlungskonditionen und MwSt-Nummer. Inkl. Dublikatsprüfung beim Anlegen.",
  },
  ORDERS_QUOTES: {
    key: "ORDERS_QUOTES",
    label: "Aufträge + Offerten",
    description: "Process-Templates, Snapshot beim Versand, PDF-Export",
    longDescription:
      "Offerten und Aufträge erstellen mit anpassbaren Prozessvorlagen (Sandstrahlen, Pulver, Nasslack …). Parameter-Snapshot beim Versand friert den Preis ein.",
  },
  INVOICES_QR: {
    key: "INVOICES_QR",
    label: "Rechnungen + Schweizer QR-Bill",
    description: "QR-IBAN-Zahlteil direkt im PDF, Status-Tracking",
    longDescription:
      "Rechnungen mit eingebettetem Schweizer QR-Zahlteil als A4-PDF. Status SENT → OVERDUE läuft automatisch.",
  },
  WORKSHOP_PLAN: {
    key: "WORKSHOP_PLAN",
    label: "Werkstatt-Plan",
    description: "Gantt-Übersicht, Auto-Scheduling, Skill-Matching",
    longDescription:
      "Visueller Werkstatt-Plan mit automatischer Einplanung nach Termin, Skill-Match und Maschinen-Verfügbarkeit. Konflikt-Erkennung integriert.",
  },
  STAFF_PLAN: {
    key: "STAFF_PLAN",
    label: "Personal-Plan + Abrechnung",
    description: "Schichten, Stundensaldo, Lohnauswertung pro Monat",
    longDescription:
      "Personal-Einsatzplan mit Bereichszuteilung. Personalabrechnung pro Monat mit Excel- und PDF-Export inkl. Saldo, Abwesenheiten und Ferienanspruch.",
  },
  TIME_KIOSK: {
    key: "TIME_KIOSK",
    label: "Zeitstempel-Uhr (Tablet)",
    description:
      "Die zentrale Stempeluhr von HABB One: PIN-Login, Echtzeit-Saldo, Pausen, Ferienstand — direkt für die Lohnabrechnung",
    longDescription:
      "Eine der Kernfunktionen von HABB One. Ein einziges Tablet (oder jeder Browser) wird zur Werkstatt-Stempeluhr: Mitarbeitende stempeln mit ihrem persönlichen 4-stelligen PIN ein und aus — kein eigenes Login, keine App-Installation pro Person. Erfasst werden Kommen, Gehen und Pausen mit automatischer Pausenregel. Jede:r sieht sofort den eigenen Tages- und Wochensaldo, Soll-/Ist-Stunden und den aktuellen Ferienstand. Alle Stempelungen sind sauber dem richtigen Unternehmen zugeordnet (mandantengetrennt) und fliessen ohne Nacherfassung direkt in den Personal-Plan und die monatliche Lohnabrechnung.",
  },
  API_ACCESS: {
    key: "API_ACCESS",
    label: "API-Zugang",
    description: "Bexio-, Abacus-, AbaNinja- und Webhook-Integrationen",
    longDescription:
      "REST-API mit Token-Auth. Zwei-Wege-Synchronisierung zu Bexio, Abacus und AbaNinja für Kunden + Rechnungen. Webhooks für Auftrags-Statusänderungen.",
  },
  WHITELABEL: {
    key: "WHITELABEL",
    label: "Whitelabel",
    description: "Eigene Subdomain, Custom-Logo, eigene PDF-Templates",
    longDescription:
      "Branding der App in deinen Farben. Eigene Subdomain (z.B. erp.deinefirma.ch) statt one.habb.ch. Custom PDF-Templates für Offerten/Rechnungen.",
  },
};

export type PlanKey = "TRIAL" | "TIME_ONLY" | "STARTER" | "PRO" | "ENTERPRISE";

export interface PlanSpec {
  key: PlanKey;
  label: string;
  /** CHF inkl. MWST pro Monat. `null` = "auf Anfrage" — Enterprise hat
   *  individuelle Verträge, kein fester Listenpreis. */
  priceCHF: number | null;
  /** Wenn gesetzt: alternative Beschreibung der Abrechnung (z.B. "14 Tage gratis"). */
  priceNote?: string;
  /** Kurzer Untertitel auf der Card. */
  tagline: string;
  /** Bullet-Liste mit den wichtigsten Eigenschaften. */
  highlights: string[];
  /** Module die zu diesem Plan gehören. */
  modules: TenantModule[];
  /** Indikative Limits — Anzeige auf der Pricing-Karte. */
  limits: { label: string; value: string }[];
  /** Diese Karte hervorheben ("Beliebt"-Marker). */
  featured?: boolean;
}

/** Echte MRR-relevante Preise — Enterprise (null) zählt nicht mit, weil
 *  individuell. Für Owner-Billing-MRR-Schätzung. */
export function priceForMRR(plan: PlanSpec): number {
  return plan.priceCHF ?? 0;
}

const ALL_MODULES = Object.keys(MODULES) as TenantModule[];

export const PLANS: PlanSpec[] = [
  {
    key: "TRIAL",
    label: "Trial",
    priceCHF: 0,
    priceNote: "14 Tage gratis · keine Kreditkarte nötig",
    tagline: "Volle Funktionalität zum Testen — ohne Risiko.",
    highlights: [
      "Alle Module aktiv",
      "14 Tage gratis, danach Auto-Upgrade auf Starter",
      "1 Mandant · bis 3 Mitarbeitende",
      "Schweizer Hosting (Zürich)",
    ],
    modules: ALL_MODULES,
    limits: [
      { label: "Mitarbeitende", value: "bis 3" },
      { label: "Rechnungen / Monat", value: "bis 20" },
      { label: "Support", value: "E-Mail" },
    ],
  },
  {
    key: "TIME_ONLY",
    label: "Zeiterfassung",
    priceCHF: 29,
    tagline: "Nur Zeiterfassung — die Stempeluhr ohne den ERP-Rest.",
    highlights: [
      "Zeitstempel-Uhr (Tablet/PIN) für die ganze Werkstatt",
      "Live-Anwesenheit + manuelle Zeitkorrektur (SAP-Stil)",
      "Pausen, Home-Office, Soll-/Ist-Saldo, Ferienstand",
      "Abwesenheiten, Feiertage + monatlicher Lohn-Export (PDF/Excel)",
      "Bis 10 Mitarbeitende mit Stempeluhr",
    ],
    modules: ["TIME_KIOSK"],
    limits: [
      { label: "Mitarbeitende", value: "bis 10" },
      { label: "Lohn-Export", value: "PDF + Excel" },
      { label: "Support", value: "E-Mail" },
    ],
  },
  {
    key: "STARTER",
    label: "Starter",
    priceCHF: 49,
    tagline: "Für den Kleinbetrieb mit eigener Faktura.",
    highlights: [
      "CRM + Aufträge + Offerten + Rechnungen",
      "Schweizer QR-Bill im PDF",
      "Zeitstempel-Uhr + Personal-Plan inkl.",
      "Owner-Support via Consent-Impersonation",
      "Bis 6 Mitarbeitende mit Stempeluhr",
    ],
    modules: ["CRM", "ORDERS_QUOTES", "INVOICES_QR", "TIME_KIOSK", "STAFF_PLAN"],
    limits: [
      { label: "Mitarbeitende", value: "bis 6" },
      { label: "Rechnungen / Monat", value: "bis 100" },
      { label: "Support", value: "E-Mail + Owner-Impersonation" },
    ],
  },
  {
    key: "PRO",
    label: "Pro",
    priceCHF: 89,
    tagline: "Werkstatt mit Auto-Plan und Personalabrechnung.",
    highlights: [
      "Alles aus Starter",
      "Werkstatt-Plan mit Auto-Scheduling",
      "Personal-Plan + monatliche Abrechnung",
      "Owner-Support via Consent-Impersonation",
      "Bis 25 Mitarbeitende",
    ],
    modules: [
      "CRM",
      "ORDERS_QUOTES",
      "INVOICES_QR",
      "TIME_KIOSK",
      "WORKSHOP_PLAN",
      "STAFF_PLAN",
    ],
    limits: [
      { label: "Mitarbeitende", value: "bis 25" },
      { label: "Rechnungen / Monat", value: "bis 500" },
      { label: "Support", value: "E-Mail + Tel. + Owner-Impersonation" },
    ],
    featured: true,
  },
  {
    key: "ENTERPRISE",
    label: "Enterprise",
    priceCHF: null,
    priceNote: "Individuelle Verträge — auf Anfrage",
    tagline: "Volle Suite mit Integrationen und SLA.",
    highlights: [
      "Alles aus Pro",
      "API-Zugang (Bexio · Abacus · AbaNinja · Webhooks)",
      "Whitelabel (eigene Subdomain + Branding)",
      "Unbegrenzte Mitarbeitende",
      "SLA + dedizierter Support",
    ],
    modules: ALL_MODULES,
    limits: [
      { label: "Mitarbeitende", value: "unbegrenzt" },
      { label: "Rechnungen / Monat", value: "unbegrenzt" },
      { label: "Support", value: "Priorisiert, mit SLA" },
    ],
  },
];

/** Alle Plan-Keys als nicht-leeres Tupel — Single Source of Truth für
 *  z.enum-Validierungen (Register-Route, Owner-Plan-Route). Neue Pläne in
 *  PLANS erscheinen hier automatisch, ohne irgendwo nachzupflegen. */
export const PLAN_KEYS = PLANS.map((p) => p.key) as [PlanKey, ...PlanKey[]];

export function formatChf(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
