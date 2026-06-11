import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { loadPermissionMatrix } from "@/lib/permissions";
import { getActiveImpersonation } from "@/lib/owner/impersonation";
import { verifyLoginOtp } from "@/lib/auth/login-otp";

// Zwei Login-Pfade:
//   1. OTP-Pfad: { otpToken, otp } — der Default für alle Tenant-User.
//      Passwort wurde schon in /api/auth/login-otp/request validiert,
//      Mail-Code muss jetzt eingelöst werden.
//   2. Direct-Pfad: { email, password } — nur für KIOSK_OPERATOR, die
//      keinen Mail-Zugriff am Werkstatt-Tablet haben. authorize() prüft
//      die Rolle UND das Passwort selbst.
const otpLoginSchema = z.object({
  otpToken: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/),
});
const directLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  preferredLanguage: string;
  sessionEpoch: number;
  registrationStatus: string;
}

/**
 * Lifecycle-Check: spiegelt die Pflichten aus dem alten authorize()-Block
 * wider. Beide Login-Pfade nutzen ihn, damit ein gesperrter / suspendierter
 * Account auch dann nicht durchkommt wenn das OTP korrekt eingegeben wurde
 * (z.B. wenn der Owner zwischen Request und Verify den Account gesperrt hat).
 */
async function loadAndCheckUser(userId: string): Promise<AuthorizedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { select: { suspendedAt: true, registrationStatus: true } },
    },
  });
  if (!user || !user.isActive) return null;
  if (user.company.suspendedAt) return null;
  if (user.lockedAt || user.deletedAt) return null;
  if (user.company.registrationStatus === "REJECTED") return null;
  if (user.company.registrationStatus === "PENDING_EMAIL_VERIFICATION") return null;
  if (!user.emailVerifiedAt) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    preferredLanguage: user.preferredLanguage,
    sessionEpoch: user.sessionEpoch,
    registrationStatus: user.company.registrationStatus,
  };
}

/** OTP-Pfad: Token aus DB validieren, Hash matchen, User-Lifecycle prüfen. */
async function authorizeViaOtp(otpToken: string, otp: string): Promise<AuthorizedUser | null> {
  const result = await verifyLoginOtp(otpToken, otp);
  if (!result.ok) return null;
  return loadAndCheckUser(result.userId);
}

/** Direct-Pfad: nur für KIOSK_OPERATOR — Passwort hier verifiziert,
 *  weil die Werkstatt-Tablet-Rolle keinen Mail-Zugriff hat. */
async function authorizeDirectKioskOnly(
  email: string,
  password: string,
): Promise<AuthorizedUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: { select: { suspendedAt: true, registrationStatus: true } } },
  });
  if (!user) return null;
  if (user.role !== "KIOSK_OPERATOR") return null; // andere Rollen MÜSSEN OTP
  if (!user.isActive || user.lockedAt || user.deletedAt) return null;
  if (user.company.suspendedAt) return null;
  if (user.company.registrationStatus === "REJECTED") return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return loadAndCheckUser(user.id);
}

const nextAuthInstance = NextAuth({
  session: { strategy: "jwt" },
  // Hinter Vercel/Reverse-Proxy: dem `Host`-Header trauen, sonst kommt
  // beim Callback "UntrustedHost" und Login schlägt fehl.
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        // Direct-Pfad (nur KIOSK_OPERATOR)
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // OTP-Pfad (alle anderen Rollen)
        otpToken: { label: "OTP Token", type: "text" },
        otp: { label: "OTP Code", type: "text" },
      },
      async authorize(credentials) {
        // ── Pfad 1: OTP-Login (alle Rollen außer KIOSK_OPERATOR) ──
        const otpParsed = otpLoginSchema.safeParse({
          otpToken: credentials?.otpToken,
          otp: credentials?.otp,
        });
        if (otpParsed.success) {
          return authorizeViaOtp(otpParsed.data.otpToken, otpParsed.data.otp);
        }

        // ── Pfad 2: Direct-Login mit Passwort (NUR KIOSK_OPERATOR) ──
        const directParsed = directLoginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (directParsed.success) {
          return authorizeDirectKioskOnly(directParsed.data.email, directParsed.data.password);
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: UserRole }).role;
        token.companyId = (user as { companyId: string }).companyId;
        token.preferredLanguage = (user as { preferredLanguage: string }).preferredLanguage;
        token.sessionEpoch = (user as { sessionEpoch?: number }).sessionEpoch ?? 0;
        (token as { registrationStatus?: string }).registrationStatus =
          (user as { registrationStatus?: string }).registrationStatus ?? "ACTIVE";
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        // Token ist die einzige Source-of-Truth. Liveness-Revocations
        // (Sperren / Soft-Delete / Mandant-Suspend) müssen über
        // sessionEpoch-Bump bzw. Token-Ablauf wirken — nicht über
        // synchrone DB-Lookups in jedem Session-Aufruf. Eine frühere
        // Variante hatte hier eine Live-Prüfung, die in Edge-Cases
        // frische JWTs killte.
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.companyId = token.companyId as string;
        session.user.preferredLanguage = token.preferredLanguage as string;
        // registrationStatus aus dem Token. Wird bei jedem Login frisch
        // gesetzt. Status-Wechsel ACTIVE↔PENDING wirken beim nächsten Login.
        session.user.registrationStatus = ((token as { registrationStatus?: string })
          .registrationStatus ?? "ACTIVE") as typeof session.user.registrationStatus;

        // Permission-Matrix für diesen Tenant in den Modul-Cache laden,
        // damit die SYNC `hasPermission()`-Aufrufe auf den ~127 Call-Sites
        // automatisch die SUPERADMIN-konfigurierten Overrides sehen.
        // ZUSÄTZLICH: Per-User-Overrides dieses Users mitladen, damit
        // additive/subtraktive Per-User-Rechte (UserPermission-Tabelle)
        // ebenfalls greifen — ohne flächige Migration der Call-Sites.
        // Fehler (DB nicht erreichbar) sind nicht-blockend — `loadPermissionMatrix`
        // fängt sie intern ab.
        try {
          await loadPermissionMatrix(session.user.companyId, {
            id: session.user.id,
            role: session.user.role,
          });
        } catch {
          // ignorieren — Fallback auf statische Defaults
        }
      }
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuthInstance;
/**
 * Original NextAuth-auth — wird vom middleware.ts als Wrapper verwendet
 * (`authMiddleware(handler)`). Server-Components/Actions sollten den
 * Default-Export `auth()` aus diesem Modul nutzen, der zusätzlich
 * Owner-Impersonation berücksichtigt.
 */
export const authMiddleware = nextAuthInstance.auth;

/**
 * Tenant-Session-Auflöser mit Impersonation-Override.
 *
 * Wenn der eingeloggte habb.ch-Owner gerade einen `habb-impersonation`-
 * Cookie gesetzt hat (gültiges JWT + offene `ImpersonationSession`-Row),
 * geben wir eine Session-Struktur zurück, die so aussieht, als wäre der
 * Owner als targetUser angemeldet. Damit funktionieren die ~127
 * bestehenden `await auth()`-Aufrufe in der Admin-App unverändert weiter
 * und der Owner kann im Kunden-Kontext klicken.
 *
 * Sonst läuft die normale NextAuth-Session.
 */
export async function auth(): Promise<Session | null> {
  const imp = await getActiveImpersonation();
  if (imp) {
    const user = await prisma.user.findUnique({
      where: { id: imp.targetUserId },
      include: {
        company: { select: { suspendedAt: true, registrationStatus: true } },
      },
    });
    // Defensive: zwischen Session-Start und jetzt könnte der User gelöscht
    // worden sein. In dem Fall fällt der Wrapper auf die NextAuth-Session
    // zurück (also: kein Login → Redirect zu /login). Der Owner sieht das
    // beim nächsten Layout-Render.
    if (user && !user.deletedAt && !user.lockedAt && user.isActive) {
      try {
        await loadPermissionMatrix(user.companyId, {
          id: user.id,
          role: user.role,
        });
      } catch {
        // ignorieren — Fallback auf statische Defaults
      }
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          preferredLanguage: user.preferredLanguage,
          registrationStatus: user.company.registrationStatus,
        },
        expires: imp.expiresAt.toISOString(),
      } satisfies Session;
    }
  }
  return nextAuthInstance.auth();
}
