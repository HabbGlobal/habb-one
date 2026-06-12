# HABB One

Modular ERP for SME workshops — Multi-tenant, production-ready from day one.
Covers CRM, order processing, quotes, invoices with Swiss QR-Bill, workshop
planning with auto-scheduler, staff planning, time tracking (iPad kiosk + admin),
business reports and an industry-aware process recommender (spray workshop).

Employees clock in and out with a 4-digit PIN at the iPad/kiosk; the back-office
sees real-time revenue, orders, utilisation, attendance, balances, vacation days
and warnings. Monthly reports and documents are exportable as CSV, Excel or PDF
(with company logo).

**First reference installation:** Tschannen Spritzwerk AG, Burgdorf.

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL via Prisma 5
- NextAuth v5 (Credentials provider, JWT sessions, bcryptjs)
- Tailwind CSS + Radix UI (shadcn style)
- next-intl (English, cookie-based, single language)
- Vitest for calculation tests
- pdf-lib + xlsx for exports
- date-fns + date-fns-tz with `Europe/Zurich`

## Local Setup

### 1. Prerequisites

- Node.js 20 LTS or newer
- PostgreSQL (local or Supabase). For local: `brew install postgresql && brew services start postgresql`

### 2. Install dependencies

```bash
cd habb-one
pnpm install
```

### 3. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in the values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/habb?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@localhost:5432/habb?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="admin1234"
```

For Supabase, copy `DATABASE_URL` (Pooling, port 6543) and `DIRECT_URL` (Direct, port 5432) from the project dashboard.

### 4. Initialise and seed the database

```bash
npm run db:generate
npm run db:migrate    # creates the initial migration
npm run db:seed       # creates company, admin, 5 employees, holidays and example time punches
```

### 5. Development server

```bash
npm run dev
```

→ http://localhost:3000

## Default Logins (after seeding)

| Role        | Email / Employee No.             | Password / PIN  |
|-------------|----------------------------------|-----------------|
| Admin       | admin@tschannen.ch               | admin1234       |
| Secretary   | sekretariat@tschannen.ch         | sekretariat1234 |
| Hans Müller (001, 100%)          | Employee 001  | PIN 1234 |
| Anna Keller (002, 80%)           | Employee 002  | PIN 2345 |
| Stefan Bachmann (003, 60%)       | Employee 003  | PIN 3456 |
| Maria Schmid (004, hourly)       | Employee 004  | PIN 4567 |
| Luca Rossi (005, 70% individual) | Employee 005  | PIN 5678 |

> **Important:** Change all default passwords and PINs before going live.

## Routes

| URL                   | Role            | Purpose                                                              |
|-----------------------|-----------------|----------------------------------------------------------------------|
| `/`                   | —               | Home page with links to kiosk / admin                                |
| `/kiosk`              | —               | Employee tiles → PIN → clock in/out                                  |
| `/login`              | —               | Admin / secretary login                                              |
| `/admin`              | Admin           | Live overview, attendance, warnings, weekly balances                 |
| `/admin/employees`    | Admin           | Manage employees (CRUD, PIN reset, target hours per weekday)         |
| `/admin/time-entries` | Admin           | View daily punches + manual corrections with audit trail             |
| `/admin/absences`     | Admin/Secretary | Record, approve and reject vacation / absences                       |
| `/admin/holidays`     | Admin           | Manage public holidays (Bern 2026 is seeded)                         |
| `/admin/settings`     | Admin           | Company master data, defaults, rounding, warning thresholds          |
| `/admin/reports`      | Admin           | Monthly reports — download as CSV / Excel / PDF                      |
| `/admin/audit`        | Admin           | Audit log of all mutating actions                                    |
| `/admin/customers`    | Admin           | CRM — customer list and detail                                       |
| `/admin/quotes`       | Admin           | Quotes management                                                    |
| `/admin/orders`       | Admin           | Orders management                                                    |
| `/admin/invoices`     | Admin           | Invoices with Swiss QR-Bill                                          |
| `/admin/scheduler`    | Admin           | Workshop planning / auto-scheduler                                   |
| `/admin/schedule`     | Admin           | Staff schedule (monthly matrix)                                      |
| `/admin/attendance`   | Admin           | Detailed attendance sheet per employee                               |
| `/admin/roles`        | Superadmin      | Role & permission management                                         |
| `/owner`              | Owner           | Multi-tenant owner portal                                            |
| `/pricing`            | —               | Public pricing / marketing page                                      |

## Tests

```bash
npm test
```

Covers the core logic (`lib/time/calc.ts`):

- `getDailyTargetMinutes` (incl. public holiday, half days, absences)
- `computeWorkedTime` (multiple blocks, breaks, open state, live counter)
- `aggregateWeek`, `applyRounding`
- Detectors: `detectMissingClockOut`, `detectLongWorkday`, `detectMissingBreak`
- `calculateVacationBalance`

## Architecture

```
app/                        # Next.js App Router
  (public)/login            # NextAuth Credentials login
  admin/                    # Protected area, layout checks session
  kiosk/                    # PIN-based kiosk flow (own mini-session via signed cookie)
  api/
    auth/[...nextauth]      # NextAuth handler
    kiosk/verify            # PIN validation
    kiosk/punch             # Punch actions
    reports/monthly         # CSV / Excel / PDF export
components/                 # UI library (shadcn style) + layout
lib/
  auth.ts                   # NextAuth config
  permissions.ts            # Role → permissions mapping
  prisma.ts                 # Prisma singleton
  pin.ts                    # PIN hashing + rate limiting
  audit.ts                  # AuditLog helper
  kiosk-session.ts          # HMAC-signed kiosk cookie
  time/
    calc.ts                 # Pure calculation logic (testable)
    calc.test.ts            # Vitest suite
    service.ts              # Prisma + calc combined
    punch.ts                # Punch mutations with validation
    zone.ts                 # Europe/Zurich helpers
  reports/                  # CSV / Excel / PDF generation
prisma/
  schema.prisma             # Data model
  seed.ts                   # Example data
messages/en.json            # i18n (English only)
i18n/request.ts             # next-intl configuration
middleware.ts               # Auth gate for /admin
```

## Security

- Admin login with email + password, bcrypt-hashed.
- PIN bcrypt-hashed; rate-limited after 5 failed attempts (5 min lockout).
- Audit log for CREATE / UPDATE / DELETE / PIN_RESET, as well as LOGIN and LOGIN_FAILED.
- Server Actions check session and permission via `requirePermission()`.
- Kiosk session is HMAC-signed (`NEXTAUTH_SECRET`) and valid for only 2 minutes — no persistent login on a shared device.
- Employee data is not visible on the kiosk home screen; private values only available after PIN entry.
- Zod validation at all Server Action inputs.

## Known Limitations (MVP)

1. **Single company**: Multi-tenant is prepared in the schema (`companyId` columns) but the admin flow assumes one company.
2. **Work past midnight** is not supported (not relevant per requirements).
3. **Staff planning UI**: The data model (`ScheduleMonth`, `ScheduleEntry`, `ScheduleChangeLog`, `ScheduleTemplate`) is complete; a dedicated planning screen (`/admin/schedule`) and the iPad weekly view follow in the next iteration.
4. **Absence types**: The read/list view is present; inline editing of types is coming next — standard types are seeded in the meantime.
5. **Holidays**: Bern 2026 holidays are seeded; admin can add/delete manually. Automatic import (e.g. via API) is not included.
6. **Rounding**: No rounding by default. Configurable as 0/5/15 minutes in settings; applied in reports once the UI exposes an "apply rounding" option — raw data is always preserved.
7. **PIN security**: 4 digits is short. Rate-limiting reduces risk, but a second factor (badge/QR) is recommended for higher security.
8. **PDF layout**: Intentionally plain (A4, Helvetica). For letterhead design, a template (e.g. with React-PDF) should be added.
9. **Email / notifications** (e.g. for missed clock-out) are not in the MVP.
10. **Time synchronisation**: All calculations run server-side against `Europe/Zurich`. Daylight-saving transitions are handled correctly via `date-fns-tz`.

## Deployment

- Recommended: Vercel + Supabase Postgres.
- `NEXTAUTH_URL` must point to the production origin.
- `npm run db:migrate:prod` runs pending migrations.

## Roadmap (post-MVP)

1. Secretary module `/admin/schedule` (monthly matrix, multi-select, copy previous month, publish)
2. iPad weekly/monthly view for employees after PIN entry (`/kiosk/[id]/schedule`)
3. Plan vs actual comparison in admin dashboard, conflict warnings
4. Payroll export (hourly wage calculation)
5. Email notifications (Resend) for missed clock-out, leave requests
6. Mobile PWA optimisations, offline punch buffer
7. Backup/restore CLI
