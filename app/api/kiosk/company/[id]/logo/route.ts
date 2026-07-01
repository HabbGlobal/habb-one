// Public company-logo endpoint specifically for the kiosk.
//
// The regular `/api/company/logo` endpoint requires a NextAuth session and
// returns only the authenticated user's company logo. The kiosk has no user
// session and needs the logo of a specific company identified by ID.
//
// Security consideration: a company logo is not sensitive information; it is
// already displayed on invoices, websites, and business cards. This endpoint
// is intentionally public because authentication would add no meaningful
// protection and would make the kiosk experience more fragile.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const company = await prisma.company.findUnique({
    where: { id },
    select: { logoData: true, logoMimeType: true, updatedAt: true },
  });

  if (!company || !company.logoData || !company.logoMimeType) {
    return new NextResponse(null, { status: 404 });
  }

  // Use ETag-based caching so the browser can retain the logo. Changes are
  // signaled through the cache-busting `?v=` URL.
  const etag = `"logo-${company.updatedAt.getTime()}"`;
  return new NextResponse(
    Buffer.from(company.logoData) as unknown as BodyInit,
    {
      headers: {
        "Content-Type": company.logoMimeType,
        "Cache-Control": "public, max-age=300, must-revalidate",
        ETag: etag,
      },
    },
  );
}
