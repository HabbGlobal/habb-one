import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOwnerContext } from "@/lib/owner/auth";
import { PasswordChangeForm } from "@/components/owner/PasswordChangeForm";
import { RevokeOtherSessionsButton } from "@/components/owner/RevokeOtherSessionsButton";
import { TotpRecoveryCard } from "@/components/owner/TotpRecoveryCard";
import { KeySquare, Monitor, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * "My Profile" für den eingeloggten Owner-Account. Zeigt Stammdaten,
 * Passkeys und aktive Sessions. Schreib-Actionen:
 *   - Change password (Self-Service mit Current-PW-Check)
 *   - Alle anderen Sessions abmelden
 *
 * Role/Email ändern macht jemand mit OWNER_ROOT unter /owner/team —
 * Self-Service-Eskalation wäre eine Lücke.
 */
export default async function OwnerSettingsPage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect("/owner/login");

  const [account, passkeys, sessions] = await Promise.all([
    prisma.ownerAccount.findUnique({
      where: { id: ctx.ownerAccountId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        webauthnEnrolledAt: true,
        totpEnrolledAt: true,
        createdAt: true,
      },
    }),
    prisma.ownerWebAuthnCredential.findMany({
      where: { ownerAccountId: ctx.ownerAccountId },
      select: {
        id: true,
        label: true,
        transports: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ownerSession.findMany({
      where: {
        ownerAccountId: ctx.ownerAccountId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!account) redirect("/owner/login");

  const otherSessionCount = sessions.filter((s) => s.id !== ctx.sessionId).length;

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          My Profile
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          Eigene Daten, Anmeldeschlüssel und aktive Sitzungen.
        </p>
      </header>

      {/* Stammdaten — read-only */}
      <section className="rounded-lg border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-semibold text-habb-ink">Account</h2>
          <p className="mt-0.5 text-xs text-habb-muted">
            Name, Email und Role werden vom OWNER_ROOT verwaltet — siehe
            Owner Team.
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
          <FieldRow label="Name" value={account.name} />
          <FieldRow label="Email" value={account.email} />
          <FieldRow label="Role" value={account.role} mono />
          <FieldRow
            label="Letzte Anmeldung"
            value={
              account.lastLoginAt
                ? account.lastLoginAt.toLocaleString("de-CH")
                : "—"
            }
          />
          <FieldRow
            label="Account seit"
            value={account.createdAt.toLocaleDateString("de-CH")}
          />
          <FieldRow
            label="Passkey erstmals registriert"
            value={
              account.webauthnEnrolledAt
                ? account.webauthnEnrolledAt.toLocaleDateString("de-CH")
                : "noch nicht"
            }
          />
        </dl>
      </section>

      {/* Change password */}
      <section className="rounded-lg border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-semibold text-habb-ink">Password</h2>
          <p className="mt-0.5 text-xs text-habb-muted">
            Mindestens 12 Zeichen. WebAuthn-Passkey bleibt parallel als
            Pflicht-Faktor — Passwort allein reicht nicht für den Login.
          </p>
        </div>
        <div className="px-5 py-4">
          <PasswordChangeForm />
        </div>
      </section>

      {/* Passkeys */}
      <section className="rounded-lg border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3 flex items-center gap-2">
          <KeySquare className="h-4 w-4 text-habb-muted" />
          <h2 className="text-sm font-semibold text-habb-ink">
            Anmeldeschlüssel (Passkeys)
          </h2>
        </div>
        {passkeys.length === 0 ? (
          <p className="px-5 py-4 text-sm text-habb-muted">
            Noch kein Passkey hinterlegt — wird beim nächsten Login erzwungen.
          </p>
        ) : (
          <ul className="divide-y divide-habb-line">
            {passkeys.map((k) => (
              <li key={k.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-habb-ink truncate">
                    {k.label || "Unbenannter Passkey"}
                  </div>
                  <div className="text-xs text-habb-muted">
                    {formatTransports(k.transports)} · seit{" "}
                    {k.createdAt.toLocaleDateString("de-CH")}
                    {k.lastUsedAt
                      ? ` · zuletzt ${k.lastUsedAt.toLocaleDateString("de-CH")}`
                      : " · noch nicht benutzt"}
                  </div>
                </div>
                <ShieldCheck className="h-4 w-4 text-habb-success shrink-0" />
              </li>
            ))}
          </ul>
        )}
        <p className="px-5 py-3 text-xs text-habb-muted border-t border-habb-line">
          Passkey-Hinzufügen + Umbenennen folgt in einem späteren Update —
          aktuell wird der erste Passkey beim Erst-Login erzeugt.
        </p>
      </section>

      {/* Notfall-Zugang (TOTP) */}
      <TotpRecoveryCard enrolled={!!account.totpEnrolledAt} />

      {/* Sessions */}
      <section className="rounded-lg border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-habb-muted" />
            <h2 className="text-sm font-semibold text-habb-ink">Aktive Sitzungen</h2>
          </div>
          {otherSessionCount > 0 && (
            <RevokeOtherSessionsButton count={otherSessionCount} />
          )}
        </div>
        <ul className="divide-y divide-habb-line">
          {sessions.map((s) => {
            const isCurrent = s.id === ctx.sessionId;
            return (
              <li key={s.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-habb-ink truncate flex items-center gap-2">
                    {summariseUserAgent(s.userAgent)}
                    {isCurrent && (
                      <span className="rounded-full bg-habb-success/10 text-habb-success px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        diese Sitzung
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-habb-muted">
                    IP {s.ipAddress || "—"} · gestartet{" "}
                    {s.createdAt.toLocaleString("de-CH")} · läuft ab{" "}
                    {s.expiresAt.toLocaleString("de-CH")}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-habb-muted">{label}</dt>
      <dd
        className={
          mono
            ? "mt-0.5 text-sm font-mono text-habb-ink"
            : "mt-0.5 text-sm text-habb-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatTransports(raw: string | null): string {
  if (!raw) return "Passkey";
  try {
    const arr = JSON.parse(raw) as string[];
    if (!Array.isArray(arr) || arr.length === 0) return "Passkey";
    return arr
      .map((t) => {
        if (t === "internal") return "Geräte-Passkey";
        if (t === "usb") return "USB-Sicherheitsschlüssel";
        if (t === "nfc") return "NFC";
        if (t === "ble") return "Bluetooth";
        if (t === "hybrid") return "Hybrid (Phone)";
        return t;
      })
      .join(" + ");
  } catch {
    return "Passkey";
  }
}

function summariseUserAgent(ua: string | null): string {
  if (!ua) return "Unbekanntes Gerät";
  // Sehr leichtgewichtige Heuristik — reicht für die Owner-Konsole.
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) {
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari auf macOS";
    if (/Chrome/i.test(ua)) return "Chrome auf macOS";
    if (/Firefox/i.test(ua)) return "Firefox auf macOS";
    return "Mac";
  }
  if (/Windows/i.test(ua)) {
    if (/Edg/i.test(ua)) return "Edge auf Windows";
    if (/Chrome/i.test(ua)) return "Chrome auf Windows";
    if (/Firefox/i.test(ua)) return "Firefox auf Windows";
    return "Windows-PC";
  }
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}
