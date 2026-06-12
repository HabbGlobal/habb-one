import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import type { NextRequest } from "next/server";

const publicPrefixes = [
  "/login",
  "/register",
  "/pricing",       // Public marketing pricing page — no auth.
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
 * Applies `Cache-Control: no-store` to an existing response —
 * so the browser does NOT put the page in the Back/Forward cache (bfcache).
 * Important for PIN-protected kiosk actions: without this header, a successor
 * on the tablet can navigate forward to the predecessor's page via the browser
 * without the server re-running its auth check.
 */
function noStore(res: NextResponse): NextResponse {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  res.headers.set("Pragma", "no-cache");
  return res;
}

/** Paths whose response must NEVER be placed in the browser cache / bfcache. */
const NO_STORE_PATTERNS: RegExp[] = [
  // PIN-authenticated kiosk actions — each employee has their own page.
  /^\/kiosk\/[^/]+\/actions(?:\/|$)/,
];

export default authMiddleware(async function middleware(req: NextRequest & { auth: unknown }) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") return NextResponse.next();

  // Anti-bfcache paths: regardless of the auth logic below, this sets a
  // `no-store` header early — even if the request is public.
  const mustNotStore = NO_STORE_PATTERNS.some((rx) => rx.test(pathname));

  // The owner portal has a completely separate auth layer (own cookies,
  // own table, own JWT issuer). This middleware (which reads NextAuth
  // tenant auth) has nothing to check there — owner layouts + route
  // handlers enforce auth themselves and respect the feature flag.
  if (pathname.startsWith("/owner") || pathname.startsWith("/api/owner")) {
    return NextResponse.next();
  }

  const isPublic = publicPrefixes.some((p) => pathname.startsWith(p));
  const session = (req as { auth?: { user?: { role?: string } } }).auth;

  // Admin area requires auth
  if (pathname.startsWith("/admin")) {
    // Owner impersonation: if the cookie is set, let through — the actual
    // JWT and DB check happens in lib/auth.ts. The middleware runs in the
    // Edge runtime and cannot use Prisma; so here we only do the weak
    // "cookie present" check. A forged impersonation is cleanly rejected
    // by the auth() wrapper in the layout → redirect.
    const hasImpersonation = req.cookies.has("habb-impersonation");

    if (!session?.user && !hasImpersonation) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // KIOSK_OPERATOR accounts must not enter /admin — bounce them to the
    // kiosk they actually belong to. Only applies for real tenant sessions;
    // under impersonation the target user's role applies.
    if (!hasImpersonation && session?.user?.role === "KIOSK_OPERATOR") {
      const res = NextResponse.redirect(new URL("/kiosk", req.url));
      return mustNotStore ? noStore(res) : res;
    }
  }

  // Public path or allowed /admin request — just pass through,
  // with no-store header if required.
  const res = NextResponse.next();
  if (mustNotStore) return noStore(res);
  if (isPublic) return res;
  return res;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
