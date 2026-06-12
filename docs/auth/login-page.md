# Login-Seite (`/login`)

Markenstarke, fokussierte Anmeldung für **HABB One** — bereitgestellt von HABB Global (PVT) LTD.
Light-only, Schweizer Zurückhaltung: Schwarz/Weiss-Grundlage, Schweizer Rot nur als Akzent (Fokus-Ring, Akzentbalken, „.ch" im Wortmark).

## Scope

Die Login-Seite dient ausschliesslich dem **ERP-Admin-Login** (E-Mail + Passwort
via NextAuth Credentials). Sie ist bewusst kein Multi-Mode-Switch zwischen
Verwaltung und Werkstatt-Zeiterfassung — der Kiosk-Flow läuft auf einer
separaten Route (`/kiosk`) und hat seine eigene Auth-Schicht (Kiosk-Lock +
Mitarbeiter-PIN). Ein dezenter Footer-Link führt von `/login` nach `/kiosk` für
den Fall, dass jemand das Tablet versehentlich auf der falschen Route öffnet.

## Architektur

```
app/(public)/login/page.tsx          Server Component, Layout-Komposition + Metadata
└─ components/auth/
   ├─ BrandPanel.tsx                 Server, linke Spalte: Logo, Wortmark, Features, CH-Kreuz
   ├─ AdminLoginForm.tsx             Client, react-hook-form + zod, signIn("credentials")
   ├─ TrustFooter.tsx                Server, „Hosted in CH · DSG/DSGVO · TLS 1.3"
   └─ AuthLanguagePill.tsx           Client, DE/EN-Switcher (Cookie-basiert)
lib/
├─ auth/schemas.ts                   Zod-Schema für AdminLoginInput
└─ tenant/getTenant.ts               Tenant-Resolver (URL-Param + Subdomain-Stub)
```

### Datenfluss Login

```
User                                              NextAuth
 │  ① E-Mail + Passwort eingeben
 │  ② Submit
 ▼
AdminLoginForm.onSubmit
 │  ③ zodResolver validiert clientseitig
 │  ④ signIn("credentials", { email, password, redirect: false })
 │ ─────────────────────────────────────────────► route handler in lib/auth-handlers.ts
 │                                                ┌─ bcrypt-Compare gegen User-Hash
 │                                                └─ JWT-Cookie setzen
 │ ◄───────────────────────────────────────────── res = { ok: true | false }
 │  ⑤ Erfolg → router.push(callbackUrl ?? "/admin")
 │  ⑥ Fehler → aria-live Fehlerregion + Inline-Hinweis
```

Das bestehende Auth-Backend (NextAuth v5 Credentials + Prisma) wurde **nicht**
angefasst — das Redesign ist rein im Frontend.

## Layout

| Breakpoint | Layout |
|---|---|
| `< 1024 px` (Mobile/Tablet) | Single-Column. Brand-Panel als kompakter Header (Logo + Wortmark + Subline). Feature-Liste, CH-Kreuz, Copyright nur ab `lg` sichtbar. |
| `≥ 1024 px` (Desktop) | Split-Screen 50/50. Links Brand-Panel mit voller Feature-Liste, rechts vertikal zentriertes Formular. |

## Farbsystem

CSS-Variablen in `app/globals.css` (`:root`-Layer), zusätzlich als
Tailwind-Farb-Scale `habb.*` in `tailwind.config.ts`. So nutzbar als:

- `bg-habb-paper`, `text-habb-ink`, `border-habb-line`, `text-habb-red`
- oder `text-[var(--habb-red)]` bei arbitrary-value-Bedarf

| Token | Hex | Einsatz |
|---|---|---|
| `--habb-black` | `#0A0A0A` | Primary-Buttons, Wortmark |
| `--habb-red` | `#DA0E15` | Fokus-Ringe, „.ch", CH-Kreuz, Akzent-Trenner |
| `--habb-paper` | `#FAFAF9` | Brand-Panel-Hintergrund |
| `--habb-line` | `#E7E5E4` | Input-Border, Trennlinien |
| `--habb-muted` | `#6B6B6B` | Sekundärtext |

## Tenant-Awareness

`getTenantFromRequest(searchTenant)` in `lib/tenant/getTenant.ts`:

1. **URL-Parameter** `?tenant=<slug>` (heute genutzt für Bookmarks/QR-Codes).
2. **Subdomain** des Request-Hosts als Fallback (nur produktiv auf `*.HABB Global (PVT) LTD`,
   nicht auf `*.vercel.app` und nicht in lokaler/Preview-Umgebung).
3. Demo-Mapping `habb global → habb global Spritzwerk AG` (hart codiert bis es eine
   echte `Company.slug`-Spalte gibt — TODO im Code markiert).

Erkennt der Resolver einen Mandanten, blendet das `BrandPanel` eine dezente
Zeile „Mandant: …" oberhalb des Wortmarks ein. Ohne Treffer rendert das Panel
ohne diese Zeile (kein Platzhalter).

## Accessibility

- WCAG 2.2 AA Ziel; Lighthouse a11y ≥ 95.
- Echte `<label for>`-Verbindungen zu Inputs.
- Fokus-Ringe sichtbar (2 px rot, 2 px Offset). Browser-Default niemals ohne
  Ersatz entfernt.
- Fehlerregion mit `aria-live="polite"` und `tabIndex={-1}`, fokussiert sich bei
  neuem Fehler automatisch für Screenreader.
- Caps-Lock-Hinweis im Passwortfeld via `getModifierState("CapsLock")`.
- `prefers-reduced-motion` wird respektiert (`motion-reduce:` Tailwind-Variante,
  Spinner versteckt).
- Sprach-Pill ist `<button>`-Paar mit `aria-pressed`, kein versteckter Native-Select.

## Was bewusst nicht hier ist

- ❌ Kiosk- bzw. Zeiterfassungs-PIN-Eingabe (separater Flow auf `/kiosk`).
- ❌ Passwort-Reset-Flow (`/forgot-password` ist nur ein Link, keine Implementation).
- ❌ Self-Sign-Up / Registrierung.
- ❌ Dark-Mode (`color-scheme: light` via `data-auth-light="true"` auf `<html>`
  vorbereitet, aktiv aktuell systemweit über das Default-Theme).
- ❌ Änderungen am Auth-Backend, an `lib/auth.ts` oder am Session-Handling.

## Screenshot

> Vorher-/Nachher-Screenshots im PR-Body.
