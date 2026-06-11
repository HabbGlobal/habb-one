import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import type { NextRequest } from "next/server";

const publicPrefixes = [
  "/login",
  "/register",
  "/pricing",       // Öffentliche Marketing-Pricing-Seite — kein Auth.
  "/forgot-password",
  "/verify-email",
  "/reset-password",
  "/api/auth",
  "/kiosk",
  "/api/kiosk",
  "/owner",         // Owner portal has its own auth — middleware just passes through.
  "/api/owner",     // Same — auth is enforced inside route handlers.
  "/onboarding",    // Tenant-pending landing — own auth check in layout.
  "/api/admin/onboarding", // Tenant-pending edit profile endpoint.
  "/_next",
  "/favicon.ico",
];

/**
 * Wendet `Cache-Control: no-store` auf eine bestehende Response an —
 * sodass Browser die Seite NICHT in den Back/Forward-Cache (bfcache)
 * legen. Wichtig für PIN-geschützte Kiosk-Actions: ohne diesen Header
 * kann ein Nachfolger am Tablet via Browser-Forward auf die Seite des
 * Vorgängers zurückkommen, ohne dass der Server seine Auth-Prüfung
 * erneut laufen lässt.
 */
function noStore(res: NextResponse): NextResponse {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  res.headers.set("Pragma", "no-cache");
  return res;
}

/** Pfade, deren Response NIEMALS in den Browser-Cache / bfcache dürfen. */
const NO_STORE_PATTERNS: RegExp[] = [
  // PIN-authentifizierte Kiosk-Actions — pro Mitarbeiter eigene Seite.
  /^\/kiosk\/[^/]+\/actions(?:\/|$)/,
];

export default authMiddleware(async function middleware(req: NextRequest & { auth: unknown }) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") return NextResponse.next();

  // Anti-bfcache-Pfade: ungeachtet der Auth-Logik unten setzt das einen
  // `no-store`-Header. Greift früh — auch wenn der Request public ist.
  const mustNotStore = NO_STORE_PATTERNS.some((rx) => rx.test(pathname));

  // Owner-Portal hat eine vollständig separate Auth-Schicht (eigene Cookies,
  // eigene Tabelle, eigener JWT-Issuer). Diese Middleware (die NextAuth-
  // Tenant-Auth liest) hat dort nichts zu prüfen — die Owner-Layouts +
  // Route-Handler erzwingen Auth selbst und respektieren das Feature-Flag.
  if (pathname.startsWith("/owner") || pathname.startsWith("/api/owner")) {
    return NextResponse.next();
  }

  const isPublic = publicPrefixes.some((p) => pathname.startsWith(p));
  const session = (req as { auth?: { user?: { role?: string } } }).auth;

  // Admin area requires auth
  if (pathname.startsWith("/admin")) {
    // Owner-Impersonation: wenn der Cookie gesetzt ist, durchlassen — der
    // tatsächliche JWT- und DB-Check passiert in lib/auth.ts. Die Middleware
    // läuft im Edge-Runtime und kann kein Prisma; deshalb hier nur die
    // schwache "Cookie vorhanden"-Prüfung. Eine gefälschte Impersonation
    // wird vom auth()-Wrapper im Layout sauber abgelehnt → Redirect.
    const hasImpersonation = req.cookies.has("habb-impersonation");

    if (!session?.user && !hasImpersonation) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // KIOSK_OPERATOR accounts must not enter /admin — bounce them to the
    // kiosk they actually belong to. Greift nur für echte Tenant-Sessions;
    // unter Impersonation gilt die Rolle des Ziel-Users.
    if (!hasImpersonation && session?.user?.role === "KIOSK_OPERATOR") {
      const res = NextResponse.redirect(new URL("/kiosk", req.url));
      return mustNotStore ? noStore(res) : res;
    }
  }

  // isPublic-Pfad oder /admin-erlaubter Request → einfach durchlassen,
  // mit ggf. no-store-Header.
  const res = NextResponse.next();
  if (mustNotStore) return noStore(res);
  if (isPublic) return res;
  return res;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
