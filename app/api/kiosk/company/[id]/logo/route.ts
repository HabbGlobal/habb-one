// Public-Logo-Endpoint speziell für den Kiosk.
//
// Der reguläre `/api/company/logo` verlangt eine NextAuth-Session und
// gibt IMMER nur das Logo der EIGENEN Firma zurück — der Kiosk hat aber
// keine Session und braucht das Logo einer SPEZIFISCHEN Firma (per ID).
//
// Sicherheits-Abwägung: das Firmen-Logo ist nicht sensibel
// (steht auf Rechnungen, der Website, Visitenkarten). Der Kiosk-Endpoint
// ist deshalb bewusst public — Authentication wäre kein realer Schutz
// (alles auf der Kiosk-Seite ist öffentlich erreichbar) und würde nur
// die UX kaputtmachen.

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

  // ETag-basiertes Caching — der Browser kann das Logo lange behalten,
  // Änderungen werden über die `?v=`-Cache-Busting-URL signalisiert.
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
