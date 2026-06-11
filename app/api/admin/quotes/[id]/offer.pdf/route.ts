import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toQuoteDetailDTO } from "@/lib/dto/quote";
import { quotePdf } from "@/lib/quote/pdf";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "quotes.read")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      company: true,
      customer: { include: { contacts: true, addresses: true } },
      items: { include: { processSteps: true }, orderBy: { position: "asc" } },
    },
  });
  if (!quote) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const dto = toQuoteDetailDTO(quote);

  // Default-Rechnungsadresse holen
  const billing = quote.customer.addresses.find(
    (a) => a.type === "BILLING" || a.type === "BOTH",
  );

  try {
    const buf = await quotePdf({
      company: {
        name: quote.company.name,
        address: quote.company.address,
        city: quote.company.city,
        vatNumber: quote.company.vatNumber,
        logoData: quote.company.logoData,
        logoMimeType: quote.company.logoMimeType,
      },
      quote: dto,
      billingAddress: billing
        ? {
            street: billing.street,
            zip: billing.zip,
            city: billing.city,
            country: billing.country,
          }
        : null,
    });
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Offerte_${dto.quoteNumber}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[offer.pdf] generation failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json(
      { error: "PDF_GENERATION_FAILED", message: msg },
      { status: 500 },
    );
  }
}
