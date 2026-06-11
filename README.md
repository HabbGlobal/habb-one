# HABB One

Modulares, zweisprachiges (DE/EN) ERP für Schweizer KMU-Werkstätten —
Multi-Tenant, ab Tag 1 produktiv. Deckt CRM, Auftragsabwicklung, Offerten,
Rechnungen mit Schweizer QR-Bill, Werkstatt-Plan mit Auto-Scheduler,
Personal-Plan, Zeiterfassung (iPad-Kiosk + Admin), Geschäfts-Berichte
und einen branchen-aware Prozess-Recommender (Spritzwerk) ab.

Mitarbeitende stempeln sich per 4-stelliger PIN am iPad/Kiosk ein und aus;
das Backoffice sieht in Echtzeit Umsatz, Aufträge, Auslastung, Anwesenheit,
Saldi, Ferien und Warnungen. Monatsreports und Dokumente exportierbar als
CSV, Excel oder PDF (mit Firmenlogo).

**Erste Referenz-Installation:** Tschannen Spritzwerk AG, Burgdorf.

## Tech-Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL via Prisma 5
- NextAuth v5 (Credentials-Provider, JWT-Sessions, bcryptjs)
- Tailwind CSS + Radix UI (shadcn-Stil)
- next-intl (Deutsch / Englisch, Cookie-basiert)
- Vitest für Berechnungs-Tests
- pdf-lib + xlsx für Exporte
- date-fns + date-fns-tz mit `Europe/Zurich`

## Lokales Setup

### 1. Voraussetzungen

- Node.js 20 LTS oder neuer
- PostgreSQL (lokal oder Supabase). Für lokal: `brew install postgresql && brew services start postgresql`

### 2. Abhängigkeiten installieren

```bash
cd ~/Desktop/habb-one
pnpm install
```

### 3. `.env.local` anlegen

```bash
cp .env.example .env.local
```

Werte ausfüllen:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/tschannen?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@localhost:5432/tschannen?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="admin@tschannen.ch"
SEED_ADMIN_PASSWORD="admin1234"
```

Bei Supabase werden `DATABASE_URL` (Pooling, Port 6543) und `DIRECT_URL` (Direct, Port 5432) aus dem Project Dashboard übernommen.

### 4. Datenbank initialisieren und seeden

```bash
npm run db:generate
npm run db:migrate    # erstellt initiale Migration
npm run db:seed       # legt Firma, Admin, 5 Mitarbeitende, Feiertage und Beispiel-Stempelungen an
```

### 5. Entwicklungsserver

```bash
npm run dev
```

→ http://localhost:3000

## Logins (nach Seed)

| Rolle      | E-Mail / Mitarbeiter-Nr | Passwort / PIN |
|------------|--------------------------|----------------|
| Admin      | admin@tschannen.ch       | admin1234      |
| Sekretariat| sekretariat@tschannen.ch | sekretariat1234|
| Hans Müller (001, 100%)      | Mitarbeiter 001 | PIN 1234 |
| Anna Keller (002, 80%)       | Mitarbeiter 002 | PIN 2345 |
| Stefan Bachmann (003, 60%)   | Mitarbeiter 003 | PIN 3456 |
| Maria Schmid (004, Stundenlohn) | Mitarbeiter 004 | PIN 4567 |
| Luca Rossi (005, 70% individuell) | Mitarbeiter 005 | PIN 5678 |

> **Wichtig:** Bei Inbetriebnahme bitte alle Default-Passwörter und PINs ändern.

## Routen

| URL                 | Rolle  | Zweck                                                                    |
|---------------------|--------|--------------------------------------------------------------------------|
| `/`                 | —      | Startseite mit Links Kiosk / Admin                                       |
| `/kiosk`            | —      | Mitarbeiter wählen → PIN → Stempeln                                      |
| `/login`            | —      | Admin-/Sekretariats-Login                                                |
| `/admin`            | Admin  | Live-Übersicht, Anwesenheit, Warnungen, Wochensaldi                      |
| `/admin/employees`  | Admin  | Mitarbeitende verwalten (CRUD, PIN reset, Sollzeiten pro Wochentag)      |
| `/admin/time-entries` | Admin| Tagesbuchungen einsehen + manuelle Korrekturen mit Audit                |
| `/admin/absences`   | Admin/Sekretariat | Ferien/Absenzen erfassen, genehmigen, ablehnen                |
| `/admin/holidays`   | Admin  | Feiertage pflegen (BE 2026 ist geseedet)                                 |
| `/admin/settings`   | Admin  | Firmenstammdaten, Standardwerte, Rundung, Warnschwellen                  |
| `/admin/reports`    | Admin  | Monatsreports — Download als CSV / Excel / PDF                           |
| `/admin/audit`      | Admin  | Audit-Log aller mutierenden Aktionen                                     |

## Tests

```bash
npm test
```

Deckt die Kernlogik ab (`lib/time/calc.ts`):

- `getDailyTargetMinutes` (inkl. Feiertag, halbe Tage, Absenzen)
- `computeWorkedTime` (mehrere Blöcke, Pausen, offener Stand, Live-Counter)
- `aggregateWeek`, `applyRounding`
- Detektoren: `detectMissingClockOut`, `detectLongWorkday`, `detectMissingBreak`
- `calculateVacationBalance`

## Architektur

```
app/                        # Next.js App Router
  (public)/login            # NextAuth Credentials-Login
  admin/                    # Geschützter Bereich, Layout prüft Session
  kiosk/                    # PIN-basierter Kiosk-Flow (eigene Mini-Session via signiertes Cookie)
  api/
    auth/[...nextauth]      # NextAuth-Handler
    kiosk/verify            # PIN-Validierung
    kiosk/punch             # Stempel-Aktionen
    reports/monthly         # CSV / Excel / PDF Export
components/                 # UI-Bibliothek (shadcn-Stil) + Layout
lib/
  auth.ts                   # NextAuth-Konfig
  permissions.ts            # Rolle → Permissions Mapping
  prisma.ts                 # Prisma-Singleton
  pin.ts                    # PIN-Hashing + Rate-Limit
  audit.ts                  # AuditLog-Helper
  kiosk-session.ts          # HMAC-signiertes Kiosk-Cookie
  time/
    calc.ts                 # Reine Berechnungslogik (testbar)
    calc.test.ts            # Vitest-Suite
    service.ts              # Prisma + Calc kombiniert
    punch.ts                # Stempel-Mutationen mit Validierung
    zone.ts                 # Europe/Zurich-Helper
  reports/                  # CSV / Excel / PDF Generierung
prisma/
  schema.prisma             # Datenmodell
  seed.ts                   # Beispiel-Daten
messages/de.json, en.json   # i18n
i18n/request.ts             # next-intl Konfiguration
middleware.ts               # Auth-Gate für /admin
```

## Sicherheit

- Admin-Login mit E-Mail + Passwort, bcrypt-gehasht.
- PIN bcrypt-gehasht; Rate-Limit nach 5 Fehlversuchen (5 Min Sperre).
- AuditLog für CREATE/UPDATE/DELETE/PIN_RESET, sowie LOGIN und LOGIN_FAILED.
- Server-Actions prüfen Session und Permission per `requirePermission()`.
- Kiosk-Session ist HMAC-signiert (`NEXTAUTH_SECRET`) und nur 2 Minuten gültig — kein Dauerlogin auf einem geteilten Gerät.
- Mitarbeiterdaten sind im Kiosk-Hauptscreen nicht sichtbar; private Werte erst nach PIN.
- Zod-Validierung an allen Server-Action-Eingängen.

## Wichtige Annahmen und Limitationen (MVP)

1. **Eine Firma**: Multi-Tenant ist im Schema vorbereitet (Spalten `companyId`), aber der Admin-Flow geht von einer Firma aus.
2. **Arbeit über Mitternacht** wird nicht unterstützt (laut Anforderung nicht relevant).
3. **Sekretärin / Planungs-UI**: Datenmodell (`ScheduleMonth`, `ScheduleEntry`, `ScheduleChangeLog`, `ScheduleTemplate`) ist vollständig, eine eigene Planungs-Maske (`/admin/schedule`) sowie die iPad-Anzeige der Wochenplanung folgen in einer zweiten Iteration.
4. **Absenztypen**: Lese-/Listen-Maske ist da; Inline-Edit der Typen kommt im nächsten Schritt — bis dahin werden Standardtypen via Seed gepflegt.
5. **Feiertage**: BE-Feiertage 2026 sind geseedet; Admin kann manuell hinzufügen/löschen. Automatischer Import (z. B. via API) ist nicht enthalten.
6. **Rundung**: Standardmässig keine Rundung. In den Einstellungen 0/5/15 Minuten konfigurierbar; angewendet wird sie in Reports erst, sobald die UI eine "Rundung anwenden"-Option zeigt — die Rohdaten bleiben immer unverfälscht.
7. **PIN-Sicherheit**: 4 Stellen sind kurz. Rate-Limit reduziert das Risiko, aber für höchste Sicherheit empfiehlt sich später ein zusätzlicher Faktor (Badge/QR).
8. **PDF-Layout**: bewusst schlicht (A4, Helvetica). Für ein Briefkopf-Design sollte ein Template (z. B. mit React-PDF) ergänzt werden.
9. **E-Mail/Benachrichtigungen** (z. B. bei vergessener Ausstempelung) sind nicht im MVP.
10. **Zeitsynchronität**: Berechnungen am Server gegen `Europe/Zurich`. Sommer-/Winterzeit-Übergänge sind über `date-fns-tz` korrekt abgebildet.

## Deployment

- Empfohlen: Vercel + Supabase Postgres (analog zum Fleet-Manager-Setup).
- `NEXTAUTH_URL` muss auf den Produktions-Origin zeigen.
- `npm run db:migrate:prod` führt geschriebene Migrationen aus.

## Roadmap (nach MVP)

1. Sekretariats-Modul `/admin/schedule` (Monatsmatrix, Mehrfachauswahl, Vormonat kopieren, Veröffentlichen)
2. iPad-Wochen-/Monatsansicht für Mitarbeitende nach PIN-Eingabe (`/kiosk/[id]/schedule`)
3. Plan-Ist-Vergleich im Admin-Dashboard, Konfliktwarnungen
4. Lohnbuchhaltungs-Export (Stundenlohn-Abrechnung)
5. E-Mail-Benachrichtigungen (Resend) für vergessene Ausstempelung, Ferienanträge
6. Mobile-PWA-Optimierungen, Offline-Stempelpuffer
7. Backup-/Restore-CLI
