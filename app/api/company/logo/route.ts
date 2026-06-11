// Public-ish endpoint: liefert das Firmen-Logo der EIGENEN Company als
// Bild-Bytes. „Public-ish" weil:
//   - Authentifizierung über NextAuth-Session erforderlich
//   - Es wird IMMER nur das Logo der Company des Auth-Users geliefert
//   - Logo-Daten sind ohnehin nicht hochsensibel (sind in PDFs ohnehin sichtbar)
//
// Die Route wird genutzt von:
//   - AdminSidebar (zeigt das Logo neben dem Firmennamen)
//   - Settings-Vorschau

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { logoData: true, logoMimeType: true, updatedAt: true },
  });

  if (!company || !company.logoData || !company.logoMimeType) {
    return new NextResponse(null, { status: 404 });
  }

  // ETag aus updatedAt damit der Browser das Bild cachen kann.
  const etag = `"logo-${company.updatedAt.getTime()}"`;
  return new NextResponse(Buffer.from(company.logoData) as unknown as BodyInit, {
    headers: {
      "Content-Type": company.logoMimeType,
      "Cache-Control": "private, max-age=300, must-revalidate",
      ETag: etag,
    },
  });
}
