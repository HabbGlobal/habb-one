import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export interface TenantContext {
  slug: string;
  name: string;
}

const DEMO_SLUG_TO_NAME: Record<string, string> = {
  "habb global": "HABB Global (PVT) LTD",
};

/**
 * Resolve the active tenant for the current request, in this order:
 *   1. explicit `?tenant=<slug>` query parameter
 *   2. subdomain of the request host (e.g. `habb global.HABB Global (PVT) LTD` → `habb global`)
 *
 * Returns `null` when no tenant can be identified. The login page renders fine
 * without one — the "Mandant: …" hint simply disappears.
 *
 * TODO(multi-tenant): once Company has a real `slug` column and the SaaS rolls
 * out on `*.HABB Global (PVT) LTD`, replace `DEMO_SLUG_TO_NAME` with a Prisma lookup and add
 * caching. Kept minimal here so the login page can ship without a schema bump.
 */
export async function getTenantFromRequest(
  searchTenant?: string,
): Promise<TenantContext | null> {
  const slug = (searchTenant ?? (await sniffSubdomain()))?.toLowerCase().trim();
  if (!slug) return null;

  const demoName = DEMO_SLUG_TO_NAME[slug];
  if (demoName) return { slug, name: demoName };

  try {
    const company = await prisma.company.findFirst({
      where: { name: { contains: slug, mode: "insensitive" } },
      select: { name: true },
    });
    if (company) return { slug, name: company.name };
  } catch {
    // Prisma may be unavailable in some preview/build contexts — fall through.
  }
  return null;
}

async function sniffSubdomain(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const bare = host.split(":")[0];
  const parts = bare.split(".");
  // Only treat the leftmost label as a tenant when the host actually has a
  // recognisable apex — bail on localhost, vercel preview URLs and IPs.
  if (parts.length < 3) return null;
  if (bare.endsWith(".vercel.app")) return null;
  const sub = parts[0];
  if (!sub || sub === "www" || sub === "app") return null;
  return sub;
}
