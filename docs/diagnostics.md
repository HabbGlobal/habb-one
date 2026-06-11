# Owner-Diagnostics & Security-Monitoring

Live-Diagnose-, Fehler- und Security-Monitoring für alle Mandanten,
sichtbar ausschließlich im Owner-Portal.

## Zweck

Stündliche, regelbasierte Prüfung jedes aktiven Mandanten auf Fehler,
Konfigurationsprobleme und Security-Anomalien — mit Health-Score,
Findings inkl. Handlungsempfehlung, Security-Events und E-Mail-
Benachrichtigung. **Keine externe KI.**

## Architektur-Adaption (wichtig)

Die ursprüngliche Spezifikation ging von **Supabase Auth + Postgres
RLS + SQL-Policies** aus. Habb One nutzt aber **Prisma + NextAuth v5
(Tenant) / jose-JWT (Owner), ohne RLS**. Um keine Parallel-Architektur
einzuziehen, wurde adaptiert:

| Spec | Umsetzung in Habb One |
|---|---|
| Supabase RLS / `is_platform_owner()` | App-Layer-Autorisierung über `requireOwner()` + Owner-`(authed)`-Layout (`getOwnerContext`) |
| snake_case SQL-Tabellen + Policies | Prisma-Modelle (camelCase, cuid), Migration via `prisma migrate deploy` |
| Owner-Rolle „unklar" | Bereits sauber vorhanden: `OwnerAccount` + `OwnerRole` (OWNER_SUPPORT < OWNER_ADMIN < OWNER_ROOT) |
| Mail-Provider | Bestehende `sendMail()` (Nodemailer/SMTP/Zoho) |
| Cron | Vercel `crons` + `CRON_SECRET` (wie `/api/cron/holidays`) |
| Audit | Bestehendes `ownerAudit()` / `OwnerAuditLog` |

## Datenmodell (Prisma)

- `TenantHealthSnapshot` — aktueller Zustand pro Mandant (1:1, Cascade).
- `DiagnosticRun` — jeder Lauf (cron/manual/system).
- `DiagnosticFinding` — Findings, dedupliziert via
  `@@unique([companyId, dedupeKey])`.
- `SecurityEvent` — point-in-time Anomalien; IP/UA **nur gehasht**.
- `DiagnosticEmailNotification` — Mail-Protokoll + Dedupe.

Alle `companyId`-FKs `onDelete: Cascade` → der bestehende Tenant-
Hard-Delete räumt sie automatisch mit ab.

## Health-Scoring (`lib/diagnostics/scoring.ts`)

Start 100. Abzüge: Finding critical/high/medium/low/info =
30/20/10/3/1; Security critical/high/medium/low = 35/25/12/5; Diagnose
fehlgeschlagen −20; > 2 h keine Prüfung −15. Status: ≥90 healthy,
≥70 warning, <70 critical; nie geprüft / > 24 h → `unknown`. Score
immer in [0, 100].

## Detection-Regeln (`lib/diagnostics/detection.ts`)

Rein schwellwertbasiert, deterministisch, jede Regel mit Evidence
(ohne PII). Implementiert: brute_force, credential_stuffing,
password_reset_flood, session_flood, enumeration, owner_route_
unauthorized, permission_errors_repeated, tenant_isolation_violation,
data_exfiltration, off_hours_bulk, automated_client (IP-Konzentration),
fingerprint_rotation. Schwellwerte zentral in `DETECTION_THRESHOLDS`.

### Grenzen der Angriffserkennung (ehrlich)

Phase 1 leitet Kennzahlen aus dem **`AuditLog`** ab (Mutations-/Login-
Events, 60-Min-Fenster). Signale, die ohne Request-Level-Telemetrie
nicht belastbar ableitbar sind (404/403-Raten pro Tenant, Read-/
Export-Volumen, Owner-Route-Abuse pro Tenant, Cross-Tenant-Zugriff),
stehen bewusst auf `0` statt erfunden zu werden — die Regeln feuern
dann schlicht nicht (keine False Positives). Ausbau, sobald Request-
Telemetrie existiert.

## Cron

`vercel.json`:
```json
{ "path": "/api/cron/diagnostics", "schedule": "0 2 * * *" }
```

> ⚠️ **Interim: täglich (02:00 UTC).** Der Vercel **Hobby-Plan**
> erlaubt nur *tägliche* Crons — ein stündlicher Ausdruck lässt den
> **gesamten** Deploy fehlschlagen. **Sobald Vercel Pro aktiv ist:**
> Schedule in `vercel.json` zurück auf **`"0 * * * *"`** (stündlich,
> ursprüngliche Anforderung) setzen + deployen. Alternativ ohne Pro:
> externer Scheduler (GitHub Actions / cron-job.org) ruft stündlich
> den CRON_SECRET-geschützten Endpoint.

Auth: `Authorization: Bearer ${CRON_SECRET}`. Iteriert aktive
Mandanten (`registrationStatus=ACTIVE`, `suspendedAt=null`), jede
Tenant-Diagnose isoliert (ein Fehler stoppt den Lauf nicht), danach
E-Mail-Versand best-effort. Response nur aggregiert, keine PII.

## E-Mail (`lib/diagnostics/notify.ts`)

- **Empfänger:** `DIAGNOSTICS_EMAIL_TO`, sonst `OWNER_NOTIFY_EMAIL`.
  Kein Empfänger → Versand wird übersprungen.
- **Absender:** bestehende Infra (`MAIL_FROM`). `DIAGNOSTICS_EMAIL_FROM`
  ist dokumentiert/reserviert, wird aktuell nicht injiziert (sendMail
  nutzt `MAIL_FROM`).
- **Hourly Digest:** 1×/Stunde, alle Mandanten, Dedupe über Stunden-
  Bucket (`digest:YYYY-MM-DDTHH`).
- **Immediate:** high/critical Findings + Security ab medium. Re-Notify
  für denselben `dedupeKey` frühestens nach **6 h**
  (`shouldSendImmediateEmail`). info/low/medium erscheinen nur im
  Digest, nicht als Einzelmail → kein Spam.
- Jede Mail wird in `DiagnosticEmailNotification` protokolliert
  (`pending → sent/failed/skipped`). **Keine PII** in Mails (kein IP,
  kein User-Agent, keine Tokens/Secrets, keine Kundendaten) — durch
  Unit-Test abgesichert.

## Security-Modell

- Zugriff auf `/owner/diagnostics` + `/api/owner/diagnostics/*` nur
  über das Owner-`(authed)`-Layout bzw. `requireOwner()`. Mandanten-
  user haben **keinen** Zugang.
- Mutierende APIs: `requireOwner({ minRole: "OWNER_ADMIN" })`, Zod,
  DB-basiertes Rate-Limit (manuelle Diagnose & Test-Mail: 1/60 s),
  `ownerAudit` (`DIAGNOSTICS_RUN_MANUAL`, `DIAGNOSTICS_FINDING_UPDATED`,
  `DIAGNOSTICS_TEST_EMAIL`).
- IP/User-Agent werden nur als gekürzter SHA-256-Hash gespeichert
  (`lib/diagnostics/hash.ts`, Salt aus `OWNER_AUTH_SECRET`).
- Kein Supabase-Service-Role-Key im Client (gibt es im Projekt nicht);
  alle DB-Zugriffe serverseitig via Prisma.

## Owner-UI

- `/owner/diagnostics`: KPI-Cards, Charts (recharts: Status-Pie,
  Findings/Kategorie, Security/Severity), such-/filterbare Mandanten-
  Tabelle mit Sofort-Prüfung, Security- & E-Mail-Listen, 45 s Auto-
  Refresh.
- `/owner/diagnostics/[companyId]`: offene Findings mit Aktionen
  (bestätigen / gelöst / ignorieren+Begründung), Läufe, Security-
  Events, E-Mail-Historie.

## ENV

```
CRON_SECRET=…                 # bestehend, auch für /api/cron/diagnostics
DIAGNOSTICS_EMAIL_TO=…        # leer → Fallback OWNER_NOTIFY_EMAIL
DIAGNOSTICS_EMAIL_FROM=…      # reserviert (aktuell MAIL_FROM)
AI_DIAGNOSTICS_ENABLED=false  # MUSS false bleiben
```

## Warum keine externe KI

Bewusste Entscheidung: Detection ist regelbasiert/heuristisch und
damit **nachvollziehbar & auditierbar**. Es werden **keine** Logs,
Findings oder Userdaten an externe LLMs gesendet. `AI_DIAGNOSTICS_
ENABLED` bleibt `false`; es existiert kein aktiver KI-Codepfad.

## Nächste Schritte

- Request-Level-Telemetrie (Edge-/Middleware-Counter) → schärfere
  Detection (404/403, Reads/Exports, Owner-Route-Abuse pro Tenant).
- Performance-Metriken (Antwortzeiten) für `avgResponseMs`.
- Storage-/Integrations-Checks, sobald entsprechende Signale existieren.
- Optionale Trend-Charts (Score-Verlauf) aus `DiagnosticRun`-Historie.
