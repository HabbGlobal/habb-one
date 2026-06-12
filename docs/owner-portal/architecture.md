# HABB One — Owner Portal (HABB Global (PVT) LTD Support Console)

Architektur-Notiz zur Owner-Portal-Infrastruktur. Dieses Dokument deckt
**Phase 0 (Foundation)** ab — DB-Schema, Auth-Trennung, Mail-Wrapper, Feature-
Flag. UI, Login-Flow, Impersonation und alles weitere folgt in PR 1 – 4.

## Mission

HABB Global (PVT) LTD betreibt HABB One als Multi-Tenant-SaaS. Das Owner-Portal ist die
**operative Konsole für den SaaS-Betreiber**: Mandanten-Übersicht,
Rechte-/Module-Verwaltung, Passwort-Resets, Rollen-Änderungen und —
unter strenger Consent-Kontrolle — Impersonation für Support.

## Trennung vom Kunden-Produkt

| Schicht | Tenant (Kunde) | Owner (HABB Global (PVT) LTD) |
|---|---|---|
| User-Pool | `User`-Tabelle | `OwnerAccount`-Tabelle (separat) |
| Login-Route | `/login` | `/owner/login` (PR 1) |
| Auth-Library | NextAuth v5 (`lib/auth.ts`) | eigene Library (`lib/owner/auth.ts`, PR 1) |
| JWT-Issuer | NextAuth default | `iss: "habb-owner"` mit eigenem Secret (`OWNER_AUTH_SECRET`) |
| API-Prefix | `/api/*` | `/api/owner/*` (PR 1) |
| 2FA | optional | **Pflicht** (WebAuthn / Passkey) |
| Session-TTL | Sliding | 30 min idle, 8 h absolut, 5 min Sudo |
| Audit-Trail | `AuditLog` (Tenant-scoped) | `OwnerAuditLog` (global, append-only) |

Diese Trennung ist nicht kosmetisch. Sie macht es **strukturell unmöglich**,
dass ein Tenant-User durch Datenmanipulation Owner-Rechte erlangt: es gibt
keinen gemeinsamen Schlüsselraum, keinen geteilten Cookie, keinen Path,
auf dem beide Auths zusammenkommen.

## Tabellen (eingeführt in Phase 0)

```
OwnerAccount                 — Owner-User mit Rolle + Passwort-Hash + WebAuthn-Status
OwnerWebAuthnCredential      — Pro Owner 1..n Passkeys (Public-Key, Counter, Transports)
OwnerSession                 — Aktive Browser-Session, Sudo-Window, Revoke-Marker
OwnerAuditLog                — Append-only Aktions-Log. Schreibt jedes Mutating Endpoint
TenantEntitlement            — Pro (Company, TenantModule) ein Toggle + optionales Limit
ImpersonationConsentToken    — 6-stelliger OTP-Hash + Lebenszyklus pro Anforderung
ImpersonationSession         — Konkrete Impersonations-Session nach erfolgter Verifizierung
```

Vollständige Spalten siehe `prisma/schema.prisma` ab dem
`OWNER PORTAL`-Block. Migration: `20260512140000_owner_portal_foundation`.

## Module (`TenantModule`-Enum)

Aktivierbar/limitierbar pro Mandant über `TenantEntitlement`:

- `CRM` — Kunden-Verwaltung
- `ORDERS_QUOTES` — Aufträge + Offerten
- `INVOICES_QR` — Rechnungen mit Schweizer QR-Bill
- `WORKSHOP_PLAN` — Werkstatt-Belegungsplanung
- `STAFF_PLAN` — Personal-Plan
- `TIME_KIOSK` — Zeiterfassung (Stempel-Kiosk)
- `API_ACCESS` — Öffentliche API (zukünftig)
- `WHITELABEL` — Eigenes Branding (zukünftig)

Fehlende `TenantEntitlement`-Zeile = Default des Codes (typisch: aktiv,
unlimited). Das Portal kann explizit `enabled=false` setzen — das Limit-Feld
ist `monthlyLimit Int?` (NULL = unbeschränkt).

## Owner-Rollen

| Rolle | Typischer Einsatz |
|---|---|
| `OWNER_ROOT` | Geschäftsführung von HABB Global (PVT) LTD — alles, inkl. Owner-Account-Verwaltung und hartem Mandanten-Löschen. |
| `OWNER_ADMIN` | Day-to-day-Support-Admin — Mandanten verwalten, Module togglen, Passwort-Reset, Impersonation (mit OTP). |
| `OWNER_SUPPORT` | First-Level-Support — read-only, Passwort-Reset-Mail auslösen, Read-only-Impersonation (mit OTP). |

**Alle drei Rollen brauchen den Consent-OTP des Kunden für jede
Impersonation** — kein Bypass, auch nicht für `OWNER_ROOT`, auch nicht bei
„Notfall".

## Mail-Provider: Resend

`lib/mail/resend.ts` ist ein dünner Wrapper um den Resend-Client.

- **Dev-Fallback**: ohne `RESEND_API_KEY` oder bei `MAIL_DEV_LOG_ONLY=true`
  loggt der Wrapper Mails in die Konsole statt zu versenden. So sind lokale
  OTP-Tests möglich ohne echte Mails zu verbrennen.
- **Prod-Guard**: in `NODE_ENV=production` ist `MAIL_DEV_LOG_ONLY=true`
  explizit verboten — der Wrapper wirft eine Exception. Verhindert, dass
  ein Konfigurationsfehler in Vercel-Env-Vars die Impersonations-Pipeline
  dunkelschaltet.
- **Absender**: aktuell `onboarding@resend.dev` als Test-Sender, bis
  `HABB Global (PVT) LTD`-Domain in Resend verifiziert ist. Dann via `MAIL_FROM` auf
  `support@HABB Global (PVT) LTD` umstellen.

## Feature-Flag

`OWNER_PORTAL_ENABLED` (default: `false`) schaltet das gesamte Portal aus.
Wenn `false`, geben Owner-Routen und -APIs 404 zurück — die Angriffsfläche
ist unsichtbar, nicht nur unzugänglich. Helper: `lib/owner/feature-flag.ts`.

## Was in Phase 0 NICHT enthalten ist

- ❌ Owner-Login-Seite und -Flow (PR 1)
- ❌ WebAuthn-Enrollment- und Sign-in-Flow (PR 1)
- ❌ Owner-Layout / Sidebar / Top-Banner (PR 1)
- ❌ Audit-Helper `lib/owner/audit.ts` (PR 1)
- ❌ Tenant-Liste / -Detail / -Entitlements-UI (PR 2)
- ❌ User-Verwaltung pro Mandant (PR 3)
- ❌ Consent-OTP-Anforderung / Verifizierung / Impersonation-Banner (PR 4)
- ❌ Tests für `lib/owner/impersonation/*` (PR 4)

Phase 0 legt nur die Tabellen, das Mail-Tooling und den Feature-Flag.
Damit kann jeder folgende PR das Inkrement liefern, ohne dass die DB-
Migrationen den Pfad blockieren.

## Bootstrap-Schritte für das erste HABB Global (PVT) LTD-Operations-Team

```bash
# 1. Tabellen + Indexe + Enums anlegen (Phase 0):
pnpm db:migrate:prod

# 2. Ersten Owner-Account anlegen (zukünftig idealerweise per UI durch
#    einen zweiten Owner; beim allerersten Bootstrap aus dem Terminal):
pnpm tsx scripts/create-owner.ts \
  --email marco@HABB Global (PVT) LTD \
  --name "Marco Habermacher" \
  --password "<starkes Passwort mit ≥ 12 Zeichen>" \
  --role OWNER_ROOT

# 3. Owner-Portal aktivieren (env-Variable):
#    Lokal: in .env: OWNER_PORTAL_ENABLED=true
#    Vercel: Settings → Environment Variables → OWNER_PORTAL_ENABLED=true
```

## Geplantes Runbook (Auszüge — voll in PR 4)

- **Owner-Account kompromittiert**: `revokedAt` auf alle aktiven Sessions
  setzen, `isActive=false`, Passwort + alle WebAuthn-Credentials löschen,
  via Postgres-Trigger Mailbenachrichtigung an alle anderen Owner.
- **OTP-Mail-Versand ausgefallen**: Status-Dashboard zeigt `email_delivery_status`-
  Verteilung der letzten 24 h. Bei Häufung Resend-Dashboard prüfen,
  Fallback-Provider noch nicht implementiert (Backlog v2).
- **Verdacht auf Audit-Log-Manipulation**: Postgres-Permission `REVOKE
  UPDATE, DELETE ON "OwnerAuditLog" FROM <app-user>` muss aktiv sein.
  Kontrolle: `\dp "OwnerAuditLog"` in psql.
